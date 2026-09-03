// Package report sends usage to the backend while the agent works, instead of
// waiting for somebody to remember `shimmr sync`.
//
// Three properties matter more than completeness here:
//
//   - It must never slow the agent down. Recording an event is a non-blocking
//     send onto a buffered channel; if that channel is full the event is
//     dropped and counted, never waited on. A metric is not worth a stall in
//     somebody's editor.
//   - It must never break the proxy. Every network failure is swallowed and
//     retried later. The local log in ~/.shimmr is the durable record; this is
//     a courier, not the archive.
//   - It must send nothing that isn't already in that local log. The payload is
//     the same Event the log holds, which by construction has no field for
//     code, paths, repository names, symbol names or tool arguments.
//
// Retries are safe because every event carries an id and the server dedupes on
// (install, id). That is what lets this forget what it has sent.
package report

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/pra2107tham/shimmr/internal/usage"
)

const (
	// A batch worth sending. Small enough to stay well inside the server's
	// body limit, large enough that a busy session is a handful of requests
	// rather than hundreds.
	maxBatch = 100

	// How long an event may wait before being sent. Long enough to batch a
	// burst of calls, short enough that a dashboard is not looking at
	// yesterday.
	flushEvery = 30 * time.Second

	// How many events may be waiting to be handed to the sender. Beyond this
	// we drop rather than block the proxy.
	queueDepth = 4096

	// How many events may be held back after a failed send. Past this the
	// oldest are dropped: the local log still has them, and an unbounded
	// buffer in a long-running server is a leak.
	maxHeld = 2000
)

type Options struct {
	Endpoint string // base URL; empty means this build talks to nobody
	Token    string
	Client   *http.Client
	// Now and flush interval are injectable so tests do not have to wait.
	FlushEvery time.Duration
}

type Reporter struct {
	url    string
	token  string
	client *http.Client
	every  time.Duration

	ch   chan usage.Event
	done chan struct{}
	once sync.Once

	mu      sync.Mutex
	dropped int
	sent    int
	failed  int
	// warned keeps a permanent rejection to one line of stderr. It belongs to
	// the reporter rather than the package so two of them cannot silence each
	// other — which is only ever true in tests, but a shared global that is
	// "fine in production" is the kind of thing that stops being fine.
	warned bool
}

// New returns a Reporter, or nil when there is nothing to report to. A nil
// *Reporter is usable: every method is a no-op on it, so callers never need a
// branch around the common "no endpoint configured" case.
func New(opt Options) *Reporter {
	if opt.Endpoint == "" || opt.Token == "" {
		return nil
	}
	client := opt.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	every := opt.FlushEvery
	if every <= 0 {
		every = flushEvery
	}
	r := &Reporter{
		url:    opt.Endpoint + "/v1/events",
		token:  opt.Token,
		client: client,
		every:  every,
		ch:     make(chan usage.Event, queueDepth),
		done:   make(chan struct{}),
	}
	go r.loop()
	return r
}

// Record queues one event. It never blocks and never returns an error: the
// caller is on the path between an agent and its answer.
func (r *Reporter) Record(e usage.Event) {
	if r == nil {
		return
	}
	select {
	case r.ch <- e:
	default:
		r.mu.Lock()
		r.dropped++
		r.mu.Unlock()
	}
}

// Close stops the reporter and makes one last attempt to deliver what is left.
// Anything undelivered stays in the local log, so nothing is lost — it just
// arrives with the next sync or the next session.
func (r *Reporter) Close(ctx context.Context) {
	if r == nil {
		return
	}
	r.once.Do(func() { close(r.ch) })
	select {
	case <-r.done:
	case <-ctx.Done():
	}
}

// Stats reports what happened, for `shimmr serve` to print on the way out.
func (r *Reporter) Stats() (sent, dropped, failed int) {
	if r == nil {
		return 0, 0, 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sent, r.dropped, r.failed
}

func (r *Reporter) loop() {
	defer close(r.done)

	ticker := time.NewTicker(r.every)
	defer ticker.Stop()

	var held []usage.Event
	for {
		select {
		case e, ok := <-r.ch:
			if !ok {
				// Channel closed: send what is left and stop. This runs
				// during shutdown, so it gets one attempt, not a retry loop.
				if len(held) > 0 {
					r.send(held)
				}
				return
			}
			held = append(held, e)
			if len(held) >= maxBatch {
				held = r.flush(held)
			}
		case <-ticker.C:
			if len(held) > 0 {
				held = r.flush(held)
			}
		}
	}
}

// flush sends what it can and returns what is still waiting. A failed send
// keeps its events for the next tick rather than discarding them, up to a
// bound — the local log is the archive, so dropping here loses nothing
// permanently.
func (r *Reporter) flush(held []usage.Event) []usage.Event {
	batch := held
	if len(batch) > maxBatch {
		batch = batch[:maxBatch]
	}
	if r.send(batch) {
		return held[len(batch):]
	}
	if len(held) > maxHeld {
		r.mu.Lock()
		r.dropped += len(held) - maxHeld
		r.mu.Unlock()
		return held[len(held)-maxHeld:]
	}
	return held
}

type payload struct {
	Events []usage.Event `json:"events"`
}

// send posts one batch, reporting whether it was accepted. Every failure is
// non-fatal: the proxy carries on regardless.
func (r *Reporter) send(batch []usage.Event) bool {
	if len(batch) == 0 {
		return true
	}
	body, err := json.Marshal(payload{Events: batch})
	if err != nil {
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.url, bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.token)

	resp, err := r.client.Do(req)
	if err != nil {
		r.noteFailure()
		return false
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))

	// 4xx other than 429 means this batch will never be accepted — a revoked
	// token, an unknown install. Retrying forever would be pointless noise, so
	// treat it as delivered and let the local log keep the record.
	permanent := resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != 429
	ok := resp.StatusCode < 300

	if ok {
		r.mu.Lock()
		r.sent += len(batch)
		r.mu.Unlock()
		return true
	}
	r.noteFailure()
	if permanent {
		// Say it once, on stderr, where `serve` puts everything it says.
		r.warnOnce(fmt.Sprintf("usage reporting rejected (%s) — still proxying", resp.Status))
		return true
	}
	return false
}

func (r *Reporter) noteFailure() {
	r.mu.Lock()
	r.failed++
	r.mu.Unlock()
}

func (r *Reporter) warnOnce(msg string) {
	r.mu.Lock()
	first := !r.warned
	r.warned = true
	r.mu.Unlock()
	if first {
		fmt.Fprintln(os.Stderr, "shimmr:", msg)
	}
}
