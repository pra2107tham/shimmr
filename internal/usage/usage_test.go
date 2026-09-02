package usage

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// The privacy rule is the one thing here that cannot be walked back, so it
// gets a test rather than a comment: no Event field may carry code, a path, a
// repo name, a symbol, or a tool argument.
func TestEventCarriesNoIdentifyingFields(t *testing.T) {
	l := &Logger{salt: []byte("test-salt-value-long-enough")}
	e := Event{
		Kind: "index", Tool: "index_repository", Org: "Acme", UserID: "u1",
		Repo:  l.RepoID("/home/someone/private-repo"),
		Files: 10, Lines: 100,
	}
	b, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	got := string(b)
	for _, banned := range []string{"private-repo", "/home/someone", "someone"} {
		if strings.Contains(got, banned) {
			t.Fatalf("event leaked %q: %s", banned, got)
		}
	}
}

func TestRepoIDIsStableAndSalted(t *testing.T) {
	a := &Logger{salt: []byte("salt-aaaaaaaaaaaaaaaaaaaaaaaa")}
	b := &Logger{salt: []byte("salt-bbbbbbbbbbbbbbbbbbbbbbbb")}

	if a.RepoID("/x/y") != a.RepoID("/x/y") {
		t.Fatal("same machine, same path should give the same id")
	}
	if a.RepoID("/x/y/") != a.RepoID("/x/y") {
		t.Fatal("path should be cleaned before hashing")
	}
	if a.RepoID("/x/y") == b.RepoID("/x/y") {
		t.Fatal("two machines indexing the same repo must not collide")
	}
}

// Re-indexing is normal; it must not inflate the coverage number we show
// customers.
func TestCoverageCountsLatestIndexPerRepo(t *testing.T) {
	now := time.Now().UTC()
	events := []Event{
		{TS: now.Add(-2 * time.Hour), Kind: "index", Repo: "r1", Files: 10, Lines: 1000},
		{TS: now.Add(-1 * time.Hour), Kind: "index", Repo: "r1", Files: 12, Lines: 1200},
		{TS: now, Kind: "index", Repo: "r2", Files: 5, Lines: 500},
	}
	s := Summarise(events, time.Time{})
	if s.Repos != 2 {
		t.Fatalf("repos = %d, want 2", s.Repos)
	}
	if s.Files != 17 || s.Lines != 1700 {
		t.Fatalf("coverage = %d files / %d lines, want 17 / 1700", s.Files, s.Lines)
	}
}

func TestSummariseCountsAndOrdersTools(t *testing.T) {
	now := time.Now().UTC()
	events := []Event{
		{TS: now, Kind: "tool_call", Tool: "search_graph", OK: true},
		{TS: now, Kind: "tool_call", Tool: "search_graph", OK: true},
		{TS: now, Kind: "tool_call", Tool: "trace_path", OK: false},
	}
	s := Summarise(events, time.Time{})
	if s.Calls != 3 || s.Failed != 1 {
		t.Fatalf("calls=%d failed=%d, want 3/1", s.Calls, s.Failed)
	}
	if s.ByTool[0].Tool != "search_graph" || s.ByTool[0].Calls != 2 {
		t.Fatalf("busiest tool = %+v, want search_graph x2", s.ByTool[0])
	}
}

func TestSummariseRespectsSince(t *testing.T) {
	now := time.Now().UTC()
	events := []Event{
		{TS: now.AddDate(0, 0, -30), Kind: "tool_call", Tool: "old", OK: true},
		{TS: now, Kind: "tool_call", Tool: "new", OK: true},
	}
	s := Summarise(events, now.AddDate(0, 0, -7))
	if s.Calls != 1 || s.ByTool[0].Tool != "new" {
		t.Fatalf("since filter failed: %+v", s.ByTool)
	}
}

// The savings figure gets published, so its cap has to actually hold.
func TestTokensSavedCapIsHonest(t *testing.T) {
	// 1000 calls unbounded would be 12M, but a 1,000-line codebase caps at 10k.
	if got := EstimateTokensSaved(1000, 1000); got != 10000 {
		t.Fatalf("cap not applied: got %d, want 10000", got)
	}
	// Under the cap, the per-call rate applies.
	if got := EstimateTokensSaved(2, 1_000_000); got != 24000 {
		t.Fatalf("per-call rate wrong: got %d, want 24000", got)
	}
	// With nothing indexed we cannot cap, so we still report the raw estimate.
	if got := EstimateTokensSaved(1, 0); got != 12000 {
		t.Fatalf("uncapped estimate wrong: got %d", got)
	}
}

// A crash mid-write leaves a torn final line. That must cost one row, not the
// whole report.
func TestReadAllSkipsTornLines(t *testing.T) {
	dir := t.TempDir()
	l, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	l.Write(Event{Kind: "tool_call", Tool: "search_graph", OK: true})
	l.Close()

	appendRaw(t, dir, `{"kind":"tool_call","tool":"trunc`)

	events, err := ReadAll(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1 good row and the torn one skipped", len(events))
	}
}

func TestBrokenLogNeverPanics(t *testing.T) {
	var l Logger // zero value: no file, as used when Open fails
	l.Write(Event{Kind: "tool_call", Tool: "x"})
	if err := l.Close(); err != nil {
		t.Fatalf("closing an unopened logger: %v", err)
	}
}

func appendRaw(t *testing.T, dir, s string) {
	t.Helper()
	f, err := os.OpenFile(dir+"/usage.jsonl", os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(s); err != nil {
		t.Fatal(err)
	}
}
