// Package usage records what the agent asked for and how much codebase Shimmr
// covered doing it.
//
// Privacy rule, enforced here rather than by convention: an Event has no field
// that can hold source code, a file path, a repository name, a symbol name, or
// a tool argument. Repositories appear only as a salted hash. If a future
// change needs one of those, it needs a new decision first — a schema that
// collects more cannot be walked back.
package usage

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type Event struct {
	TS     time.Time `json:"ts"`
	Kind   string    `json:"kind"` // "tool_call" or "index"
	UserID string    `json:"user_id"`
	Org    string    `json:"org"`
	Team   string    `json:"team,omitempty"`

	Tool  string `json:"tool,omitempty"`
	OK    bool   `json:"ok"`
	DurMS int64  `json:"dur_ms,omitempty"`

	// Coverage, recorded when a repository is indexed.
	Repo  string `json:"repo,omitempty"` // salted hash, never a name or path
	Files int    `json:"files,omitempty"`
	Lines int    `json:"lines,omitempty"`
	Bytes int64  `json:"bytes,omitempty"`
}

type Logger struct {
	mu     sync.Mutex
	f      *os.File
	salt   []byte
	broken bool // once writing fails we stop trying, but never stop proxying
}

// Open prepares the usage log. A log that cannot be opened is reported and
// then ignored: losing metering must never cost the user a working code tool.
func Open(dir string) (*Logger, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(dir, "usage.jsonl"),
		os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	salt, err := loadOrCreateSalt(dir)
	if err != nil {
		f.Close()
		return nil, err
	}
	return &Logger{f: f, salt: salt}, nil
}

// loadOrCreateSalt keeps the repo hash stable on this machine and useless
// anywhere else, so two customers indexing the same open-source repo do not
// produce a matching identifier.
func loadOrCreateSalt(dir string) ([]byte, error) {
	p := filepath.Join(dir, "salt")
	if b, err := os.ReadFile(p); err == nil && len(b) >= 16 {
		return b, nil
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	if err := os.WriteFile(p, b, 0o600); err != nil {
		return nil, err
	}
	return b, nil
}

// RepoID turns an absolute path into an opaque per-machine identifier. The
// path itself is never stored or transmitted.
func (l *Logger) RepoID(path string) string {
	m := hmac.New(sha256.New, l.salt)
	m.Write([]byte(filepath.Clean(path)))
	return hex.EncodeToString(m.Sum(nil))[:16]
}

func (l *Logger) Write(e Event) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.broken || l.f == nil {
		return
	}
	if e.TS.IsZero() {
		e.TS = time.Now().UTC()
	}
	b, err := json.Marshal(e)
	if err != nil {
		return
	}
	if _, err := l.f.Write(append(b, '\n')); err != nil {
		fmt.Fprintf(os.Stderr, "shimmr: usage log stopped (%v) — still proxying\n", err)
		l.broken = true
	}
}

func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f == nil {
		return nil
	}
	err := l.f.Close()
	l.f = nil
	return err
}

// ---- reading back, for `shimmr stats` and `shimmr sync` ----

type ToolCount struct {
	Tool  string `json:"tool"`
	Calls int    `json:"calls"`
}

type Summary struct {
	Events     []Event
	Calls      int
	Failed     int
	ByTool     []ToolCount
	Repos      int
	Files      int
	Lines      int
	Bytes      int64
	First      time.Time
	Last       time.Time
	TokensSave int64
}

func ReadAll(dir string) ([]Event, error) {
	b, err := os.ReadFile(filepath.Join(dir, "usage.jsonl"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []Event
	for _, line := range splitLines(b) {
		if len(line) == 0 {
			continue
		}
		var e Event
		if err := json.Unmarshal(line, &e); err != nil {
			continue // a torn last line must not break the whole report
		}
		out = append(out, e)
	}
	return out, nil
}

func splitLines(b []byte) [][]byte {
	var out [][]byte
	start := 0
	for i, c := range b {
		if c == '\n' {
			out = append(out, b[start:i])
			start = i + 1
		}
	}
	if start < len(b) {
		out = append(out, b[start:])
	}
	return out
}

// Summarise folds the log into the numbers `shimmr stats` prints. Coverage
// counts the latest index of each repository, so re-indexing does not inflate
// the figure.
func Summarise(events []Event, since time.Time) Summary {
	s := Summary{}
	byTool := map[string]int{}
	latestIndex := map[string]Event{}

	for _, e := range events {
		if !since.IsZero() && e.TS.Before(since) {
			continue
		}
		if s.First.IsZero() || e.TS.Before(s.First) {
			s.First = e.TS
		}
		if e.TS.After(s.Last) {
			s.Last = e.TS
		}
		switch e.Kind {
		case "tool_call":
			s.Calls++
			if !e.OK {
				s.Failed++
			}
			byTool[e.Tool]++
		case "index":
			if prev, ok := latestIndex[e.Repo]; !ok || e.TS.After(prev.TS) {
				latestIndex[e.Repo] = e
			}
		}
		s.Events = append(s.Events, e)
	}

	for _, e := range latestIndex {
		s.Repos++
		s.Files += e.Files
		s.Lines += e.Lines
		s.Bytes += e.Bytes
	}
	for t, n := range byTool {
		s.ByTool = append(s.ByTool, ToolCount{Tool: t, Calls: n})
	}
	sort.Slice(s.ByTool, func(i, j int) bool {
		if s.ByTool[i].Calls != s.ByTool[j].Calls {
			return s.ByTool[i].Calls > s.ByTool[j].Calls
		}
		return s.ByTool[i].Tool < s.ByTool[j].Tool
	})
	s.TokensSave = EstimateTokensSaved(s.Calls, s.Lines)
	return s
}

// EstimateTokensSaved is deliberately conservative and deliberately simple,
// because the number gets published and has to survive the question "how did
// you calculate that?".
//
// Method: a graph-backed answer reads roughly 4 targeted functions instead of
// roughly 25 whole files. We price that difference at 12,000 tokens per call,
// and cap the total at what reading the entire indexed codebase once would
// cost (lines / 10 tokens per line), so the figure can never exceed the size
// of the thing it claims to have saved you from reading.
//
// `shimmr stats --method` prints this paragraph verbatim.
func EstimateTokensSaved(calls, lines int) int64 {
	const perCall = 12000
	raw := int64(calls) * perCall
	if lines > 0 {
		if cap := int64(lines) * 10; raw > cap {
			return cap
		}
	}
	return raw
}

const MethodText = `Tokens saved — how this is calculated

  A question answered from the graph reads roughly 4 targeted functions.
  The same question answered by reading files reads roughly 25 of them.
  We price that difference at 12,000 tokens per answered call.

  The total is then capped at (indexed lines x 10 tokens per line), so the
  figure can never claim to have saved you more than reading your entire
  indexed codebase once would have cost.

  Both constants are deliberately conservative. Nothing here is measured
  against your actual model usage, so treat it as an estimate of order of
  magnitude, not an invoice.`
