package proxy

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/pra2107tham/shimmr/internal/usage"
)

func newTestProxy(t *testing.T) (*Proxy, string) {
	t.Helper()
	dir := t.TempDir()
	log, err := usage.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { log.Close() })
	return New(Options{Log: log, UserID: "u1", Org: "Acme"}), dir
}

func events(t *testing.T, dir string) []usage.Event {
	t.Helper()
	e, err := usage.ReadAll(dir)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestToolCallIsRecordedOnResponse(t *testing.T) {
	p, dir := newTestProxy(t)

	p.onRequest([]byte(`{"jsonrpc":"2.0","id":7,"method":"tools/call",
		"params":{"name":"search_graph","arguments":{"q":"secret"}}}`))

	// Nothing is recorded until the engine answers.
	if got := events(t, dir); len(got) != 0 {
		t.Fatalf("recorded %d events before the response", len(got))
	}

	p.onResponse([]byte(`{"jsonrpc":"2.0","id":7,"result":{"content":[]}}`))

	got := events(t, dir)
	if len(got) != 1 {
		t.Fatalf("got %d events, want 1", len(got))
	}
	if got[0].Tool != "search_graph" || !got[0].OK {
		t.Fatalf("event = %+v", got[0])
	}
	if got[0].Org != "Acme" || got[0].UserID != "u1" {
		t.Fatalf("identity not attached: %+v", got[0])
	}
}

func TestFailuresAreRecordedAsFailures(t *testing.T) {
	for _, tc := range []struct {
		name string
		resp string
	}{
		{"jsonrpc error", `{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"boom"}}`},
		{"tool isError", `{"jsonrpc":"2.0","id":1,"result":{"isError":true}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p, dir := newTestProxy(t)
			p.onRequest([]byte(`{"id":1,"method":"tools/call","params":{"name":"trace_path"}}`))
			p.onResponse([]byte(tc.resp))

			got := events(t, dir)
			if len(got) != 1 {
				t.Fatalf("got %d events, want 1", len(got))
			}
			if got[0].OK {
				t.Fatalf("failure recorded as success: %+v", got[0])
			}
		})
	}
}

// Only tools/call is metered. Protocol traffic must pass through uncounted or
// the numbers we show customers are meaningless.
func TestNonToolCallMethodsAreNotMetered(t *testing.T) {
	p, dir := newTestProxy(t)
	for _, req := range []string{
		`{"id":1,"method":"initialize","params":{}}`,
		`{"id":2,"method":"tools/list","params":{}}`,
		`{"method":"notifications/initialized"}`,
	} {
		p.onRequest([]byte(req))
	}
	p.onResponse([]byte(`{"id":1,"result":{}}`))
	p.onResponse([]byte(`{"id":2,"result":{}}`))

	if got := events(t, dir); len(got) != 0 {
		t.Fatalf("metered %d non-tool messages: %+v", len(got), got)
	}
}

func TestUnmatchedAndMalformedMessagesAreIgnored(t *testing.T) {
	p, dir := newTestProxy(t)

	p.onResponse([]byte(`{"jsonrpc":"2.0","id":999,"result":{}}`)) // never requested
	p.onRequest([]byte(`not json at all`))
	p.onResponse([]byte(`{"broken`))
	p.onRequest([]byte(`{"method":"tools/call","params":{"name":"x"}}`)) // no id

	if got := events(t, dir); len(got) != 0 {
		t.Fatalf("recorded %d events from junk input", len(got))
	}
}

// Two calls in flight at once must not swap their tool names.
func TestConcurrentCallsKeepTheirOwnIdentity(t *testing.T) {
	p, dir := newTestProxy(t)

	p.onRequest([]byte(`{"id":1,"method":"tools/call","params":{"name":"alpha"}}`))
	p.onRequest([]byte(`{"id":2,"method":"tools/call","params":{"name":"beta"}}`))
	p.onResponse([]byte(`{"id":2,"result":{}}`))
	p.onResponse([]byte(`{"id":1,"result":{}}`))

	got := events(t, dir)
	if len(got) != 2 {
		t.Fatalf("got %d events, want 2", len(got))
	}
	if got[0].Tool != "beta" || got[1].Tool != "alpha" {
		t.Fatalf("responses were attributed to the wrong calls: %s then %s",
			got[0].Tool, got[1].Tool)
	}
}

func TestExtractRepoPath(t *testing.T) {
	cases := map[string]string{
		`{"repo_path":"/a/b"}`:              "/a/b",
		`{"path":"/c"}`:                     "/c",
		`{"root":"/d"}`:                     "/d",
		`{"mode":"full"}`:                   "",
		`{}`:                                "",
		`{"repo_path":""}`:                  "",
		`{"repo_path":123}`:                 "",
		`not json`:                          "",
		`{"path":"/e","repo_path":"/wins"}`: "/wins",
	}
	for in, want := range cases {
		if got := extractRepoPath(json.RawMessage(in)); got != want {
			t.Errorf("extractRepoPath(%s) = %q, want %q", in, got, want)
		}
	}
	if got := extractRepoPath(nil); got != "" {
		t.Errorf("nil arguments returned %q", got)
	}
}

// The measured path is used to size the repo and then discarded; only its
// hash may reach the log.
func TestIndexCallLogsHashNotPath(t *testing.T) {
	p, dir := newTestProxy(t)

	repo := t.TempDir()
	if err := writeFile(repo+"/main.go", "package main\nfunc main(){}\n"); err != nil {
		t.Fatal(err)
	}

	p.onRequest([]byte(`{"id":1,"method":"tools/call","params":{"name":"index_repository",
		"arguments":{"repo_path":` + quote(repo) + `}}}`))
	p.onResponse([]byte(`{"id":1,"result":{}}`))
	p.wg.Wait()

	var index *usage.Event
	for i := range events(t, dir) {
		e := events(t, dir)[i]
		if e.Kind == "index" {
			index = &e
		}
	}
	if index == nil {
		t.Fatal("no index event recorded")
	}
	if index.Files != 1 || index.Lines != 2 {
		t.Errorf("measured %d files / %d lines, want 1 / 2", index.Files, index.Lines)
	}
	if index.Repo == "" || index.Repo == repo {
		t.Errorf("repo field should be a hash, got %q", index.Repo)
	}
}

func writeFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0o644)
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// The shape here is copied from a real index_repository response produced by
// the engine at the pinned commit, trimmed to the fields we read.
func TestGraphSizeFromRealResponseShape(t *testing.T) {
	line := []byte(`{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text",` +
		`"text":"{\"project\":\"home-user-shimmr\",\"nodes\":314,\"edges\":709,` +
		`\"status\":\"indexed\"}"}],"isError":false}}`)

	nodes, edges := graphSize(line)
	if nodes != 314 || edges != 709 {
		t.Fatalf("graphSize = %d nodes / %d edges, want 314 / 709", nodes, edges)
	}
}

// Absent counts are not an error — plenty of tools report neither.
func TestGraphSizeAbsentOrMalformed(t *testing.T) {
	for name, line := range map[string]string{
		"no counts":     `{"id":1,"result":{"content":[{"text":"{\"status\":\"indexed\"}"}]}}`,
		"not json text": `{"id":1,"result":{"content":[{"text":"indexed 3 files"}]}}`,
		"no content":    `{"id":1,"result":{"isError":false}}`,
		"junk":          `not json`,
	} {
		if n, e := graphSize([]byte(line)); n != 0 || e != 0 {
			t.Errorf("%s: got %d/%d, want 0/0", name, n, e)
		}
	}
}

// A successful index must record the engine's counts alongside our own.
func TestIndexRecordsGraphSize(t *testing.T) {
	p, dir := newTestProxy(t)
	repo := t.TempDir()
	if err := writeFile(repo+"/main.go", "package main\n"); err != nil {
		t.Fatal(err)
	}

	p.onRequest([]byte(`{"id":1,"method":"tools/call","params":{"name":"index_repository",
		"arguments":{"repo_path":` + quote(repo) + `}}}`))
	p.onResponse([]byte(`{"id":1,"result":{"content":[{"type":"text",` +
		`"text":"{\"nodes\":42,\"edges\":99}"}],"isError":false}}`))
	p.wg.Wait()

	for _, e := range events(t, dir) {
		if e.Kind == "index" {
			if e.Nodes != 42 || e.Edges != 99 {
				t.Fatalf("recorded %d nodes / %d edges, want 42 / 99", e.Nodes, e.Edges)
			}
			if e.Files != 1 {
				t.Fatalf("our own measurement was lost: %d files", e.Files)
			}
			return
		}
	}
	t.Fatal("no index event recorded")
}
