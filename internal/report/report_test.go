package report

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pra2107tham/shimmr/internal/usage"
)

// collector is a stand-in backend that records what it was actually sent.
type collector struct {
	mu       sync.Mutex
	batches  [][]usage.Event
	bodies   []string
	tokens   []string
	status   int
	failNext int
}

func (c *collector) handler(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var p payload
	json.Unmarshal(body, &p)

	c.mu.Lock()
	c.tokens = append(c.tokens, r.Header.Get("Authorization"))
	if c.failNext > 0 {
		c.failNext--
		c.mu.Unlock()
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	c.batches = append(c.batches, p.Events)
	c.bodies = append(c.bodies, string(body))
	status := c.status
	c.mu.Unlock()

	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	w.Write([]byte(`{"ok":true}`))
}

func (c *collector) events() []usage.Event {
	c.mu.Lock()
	defer c.mu.Unlock()
	var all []usage.Event
	for _, b := range c.batches {
		all = append(all, b...)
	}
	return all
}

func (c *collector) allBodies() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return strings.Join(c.bodies, "\n")
}

func newTestReporter(t *testing.T, c *collector) (*Reporter, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(c.handler))
	t.Cleanup(srv.Close)
	r := New(Options{
		Endpoint:   srv.URL,
		Token:      "shm_test",
		FlushEvery: 10 * time.Millisecond,
	})
	if r == nil {
		t.Fatal("New returned nil for a configured endpoint")
	}
	return r, srv
}

// A build with no endpoint talks to nobody. That is the guarantee the whole
// privacy story rests on, so it is the first thing tested.
func TestNoEndpointMeansNoReporter(t *testing.T) {
	if r := New(Options{Token: "shm_test"}); r != nil {
		t.Error("a reporter was created with no endpoint")
	}
	if r := New(Options{Endpoint: "https://example.com"}); r != nil {
		t.Error("a reporter was created with no token")
	}
}

// Every method must be safe on a nil reporter, because "no endpoint" is the
// common case and callers should not have to branch around it.
func TestNilReporterIsUsable(t *testing.T) {
	var r *Reporter
	r.Record(usage.Event{Kind: "tool_call", Tool: "search_graph"})
	r.Close(context.Background())
	if sent, dropped, failed := r.Stats(); sent|dropped|failed != 0 {
		t.Errorf("nil reporter reported activity: %d %d %d", sent, dropped, failed)
	}
}

func TestEventsReachTheBackend(t *testing.T) {
	c := &collector{}
	r, _ := newTestReporter(t, c)

	for i := 0; i < 5; i++ {
		r.Record(usage.Event{ID: usage.NewEventID(), Kind: "tool_call", Tool: "search_graph", OK: true})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	r.Close(ctx)

	if got := len(c.events()); got != 5 {
		t.Fatalf("backend received %d events, want 5", got)
	}
	c.mu.Lock()
	token := c.tokens[0]
	c.mu.Unlock()
	if token != "Bearer shm_test" {
		t.Errorf("token header = %q, want the install token as a bearer", token)
	}
}

// The whole point of the id: a failed send is retried, and the same event may
// arrive twice. Both sends must carry the same ids so the server can dedupe.
func TestARetryCarriesTheSameEventIDs(t *testing.T) {
	c := &collector{failNext: 1}
	r, _ := newTestReporter(t, c)

	id := usage.NewEventID()
	r.Record(usage.Event{ID: id, Kind: "tool_call", Tool: "trace_path", OK: true})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// Long enough for the first attempt to fail and the next tick to retry.
	time.Sleep(200 * time.Millisecond)
	r.Close(ctx)

	events := c.events()
	if len(events) == 0 {
		t.Fatal("the event never arrived after a retry")
	}
	for _, e := range events {
		if e.ID != id {
			t.Errorf("retry sent id %q, want the original %q", e.ID, id)
		}
	}
}

// Recording must never block the caller: it sits between an agent and its
// answer. Overflow is dropped and counted, not waited on.
func TestRecordNeverBlocks(t *testing.T) {
	c := &collector{}
	r, _ := newTestReporter(t, c)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < queueDepth*3; i++ {
			r.Record(usage.Event{ID: usage.NewEventID(), Kind: "tool_call", Tool: "search_code"})
		}
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Record blocked — a metric must never stall the proxy")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	r.Close(ctx)

	sent, dropped, _ := r.Stats()
	if sent+dropped == 0 {
		t.Error("nothing was either sent or accounted for as dropped")
	}
}

// A revoked token is permanent. Retrying it forever would be noise, so the
// batch is let go rather than held.
func TestAPermanentRejectionIsNotRetriedForever(t *testing.T) {
	c := &collector{status: http.StatusForbidden}
	r, _ := newTestReporter(t, c)

	r.Record(usage.Event{ID: usage.NewEventID(), Kind: "tool_call", Tool: "search_graph"})
	time.Sleep(150 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	r.Close(ctx)

	c.mu.Lock()
	attempts := len(c.tokens)
	c.mu.Unlock()
	if attempts > 3 {
		t.Errorf("a 403 was retried %d times; it should be given up on", attempts)
	}
}

// The payload may carry tool names and counts, and nothing that could identify
// a repository, a file, or a person's code. This asserts on the bytes actually
// put on the wire rather than on the struct definition.
func TestThePayloadCarriesNothingSensitive(t *testing.T) {
	c := &collector{}
	r, _ := newTestReporter(t, c)

	r.Record(usage.Event{
		ID: usage.NewEventID(), Kind: "index", OK: true,
		Repo:  "9f2c4a1b8e3d7c05", // already a salted hash
		Files: 412, Lines: 58133, Bytes: 2104882, Nodes: 18402, Edges: 51228,
	})
	r.Record(usage.Event{
		ID: usage.NewEventID(), Kind: "tool_call", Tool: "search_graph", OK: true, DurMS: 142,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	r.Close(ctx)

	body := c.allBodies()
	if body == "" {
		t.Fatal("nothing was sent")
	}
	// A path separator in the payload would mean a path got through.
	for _, forbidden := range []string{"/home/", "/Users/", "C:\\", ".go", ".py", "func ", "query"} {
		if strings.Contains(body, forbidden) {
			t.Errorf("payload contains %q, which must never leave the machine:\n%s", forbidden, body)
		}
	}
	// And the fields that are meant to be there, are.
	for _, want := range []string{"search_graph", "9f2c4a1b8e3d7c05", "58133"} {
		if !strings.Contains(body, want) {
			t.Errorf("payload is missing %q", want)
		}
	}
}

// Close must return even when the backend never answers, or `shimmr serve`
// would hang on exit and the agent would notice.
func TestCloseGivesUpOnASlowBackend(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
	}))
	defer srv.Close()

	r := New(Options{Endpoint: srv.URL, Token: "shm_test", FlushEvery: 10 * time.Millisecond})
	r.Record(usage.Event{ID: usage.NewEventID(), Kind: "tool_call", Tool: "search_graph"})

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	start := time.Now()
	r.Close(ctx)
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("Close took %v — it must respect its context", elapsed)
	}
}
