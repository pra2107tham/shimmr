package engine

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

// The test binary doubles as a stand-in engine, so these tests need no shell
// script and run identically on Linux, macOS and Windows.
func TestMain(m *testing.M) {
	if mode := os.Getenv("SHIMMR_FAKE_ENGINE"); mode != "" {
		fakeEngine(mode)
		return
	}
	os.Exit(m.Run())
}

// These two messages are copied from the engine's own source at the pinned
// commit (src/daemon/service.c). If the engine ever rewords them, these tests
// keep passing while the real classification silently stops working — so they
// are a guard against our own regressions, not against the engine's wording.
const (
	cacheConflictMsg = "codebase-memory-mcp: CBM could not start because the active account " +
		"daemon uses a different cache directory (active cache abc123; requested cache " +
		"def456). Close all CBM sessions and commands, then retry with one consistent " +
		"CBM_CACHE_DIR."
	versionConflictMsg = "codebase-memory-mcp: CBM could not start because a conflicting CBM " +
		"process is active (version; active version 1.2.0, build aaa; requested version " +
		"1.3.0, build bbb). Close all CBM sessions and commands, then retry."
)

func fakeEngine(mode string) {
	switch mode {
	case "cache-conflict":
		fmt.Fprintln(os.Stderr, cacheConflictMsg)
		os.Exit(1)
	case "version-conflict":
		fmt.Fprintln(os.Stderr, versionConflictMsg)
		os.Exit(1)
	case "crash":
		fmt.Fprintln(os.Stderr, "engine: cannot open database, disk is full")
		os.Exit(3)
	case "hang":
		// A bounded sleep, not select{}: the Go runtime detects a permanent
		// block as a deadlock and kills the process instantly, which would
		// exercise the crash path rather than the timeout path.
		time.Sleep(30 * time.Second)
		os.Exit(0)
	case "garbage":
		fmt.Println("this is not json")
		os.Exit(0)
	}

	// mode "ok": a minimal but correct MCP server.
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		var m struct {
			ID     *int   `json:"id"`
			Method string `json:"method"`
		}
		if json.Unmarshal(sc.Bytes(), &m) != nil || m.ID == nil {
			continue
		}
		var result string
		switch m.Method {
		case "initialize":
			result = `{"protocolVersion":"2024-11-05","serverInfo":{"name":"fake","version":"9.9.9"}}`
		case "tools/list":
			result = `{"tools":[{"name":"search_graph"},{"name":"index_repository"},{"name":"trace_path"}]}`
		default:
			result = `{}`
		}
		fmt.Printf(`{"jsonrpc":"2.0","id":%d,"result":%s}`+"\n", *m.ID, result)
	}
	os.Exit(0)
}

func probeFake(t *testing.T, mode string, timeout time.Duration) Result {
	t.Helper()
	t.Setenv("SHIMMR_FAKE_ENGINE", mode)
	return Probe(context.Background(), os.Args[0], timeout)
}

func TestHealthyEngine(t *testing.T) {
	res := probeFake(t, "ok", 20*time.Second)

	if res.Status != OK {
		t.Fatalf("status = %v (%s), stderr: %s", res.Status, res.Summary(), res.Stderr)
	}
	if !res.Healthy() {
		t.Error("Healthy() should be true")
	}
	if len(res.Tools) != 3 {
		t.Errorf("tools = %v, want 3", res.Tools)
	}
	if res.Version != "9.9.9" || res.Name != "fake" {
		t.Errorf("serverInfo = %q %q, want fake 9.9.9", res.Name, res.Version)
	}
	if res.Remedy() != "" {
		t.Error("a healthy engine should suggest no remedy")
	}
}

// The Q10 scenario: another copy is already running against different storage.
func TestCacheRootConflictIsRecognised(t *testing.T) {
	res := probeFake(t, "cache-conflict", 20*time.Second)

	if res.Status != ConflictCacheRoot {
		t.Fatalf("status = %v (%s), want ConflictCacheRoot", res.Status, res.Summary())
	}
	if res.Healthy() {
		t.Error("a blocked engine is not healthy")
	}
	remedy := res.Remedy()
	if !strings.Contains(remedy, "storage") {
		t.Errorf("remedy does not explain the cause: %q", remedy)
	}
	// The engine's own words are kept for --verbose, not discarded.
	if !strings.Contains(res.Stderr, "different cache directory") {
		t.Errorf("engine output was lost: %q", res.Stderr)
	}
}

func TestVersionConflictIsRecognisedSeparately(t *testing.T) {
	res := probeFake(t, "version-conflict", 20*time.Second)

	if res.Status != ConflictVersion {
		t.Fatalf("status = %v (%s), want ConflictVersion", res.Status, res.Summary())
	}
	if strings.Contains(res.Remedy(), "CBM_CACHE_DIR") {
		t.Error("a version conflict must not advise the cache-root fix, which cannot help")
	}
}

// A failure that is not a conflict must not be mislabelled as one — telling
// someone to close their editors when their disk is full wastes their time.
func TestOtherFailuresAreNotCalledConflicts(t *testing.T) {
	res := probeFake(t, "crash", 20*time.Second)

	if res.Status != Failed {
		t.Fatalf("status = %v (%s), want Failed", res.Status, res.Summary())
	}
	if !strings.Contains(res.Stderr, "disk is full") {
		t.Errorf("the real cause was lost: %q", res.Stderr)
	}
}

func TestHangingEngineTimesOut(t *testing.T) {
	start := time.Now()
	res := probeFake(t, "hang", 2*time.Second)

	if res.Status != Timeout {
		t.Fatalf("status = %v (%s), want Timeout", res.Status, res.Summary())
	}
	if elapsed := time.Since(start); elapsed > 15*time.Second {
		t.Errorf("took %v — the deadline did not stop it", elapsed)
	}
}

func TestNonProtocolOutputIsAFailureNotASuccess(t *testing.T) {
	res := probeFake(t, "garbage", 20*time.Second)
	if res.Status == OK {
		t.Fatal("an engine that speaks no MCP must not be reported as ready")
	}
}

func TestMissingBinary(t *testing.T) {
	for name, path := range map[string]string{
		"empty path":  "",
		"no such fi":  "/definitely/not/a/real/engine/binary",
		"a directory": os.TempDir(),
	} {
		res := Probe(context.Background(), path, 5*time.Second)
		if res.Status != NotFound {
			t.Errorf("%s: status = %v, want NotFound", name, res.Status)
		}
		if res.Remedy() == "" {
			t.Errorf("%s: should tell the user what to do", name)
		}
	}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		want   Status
		is     bool
	}{
		{"cache", cacheConflictMsg, ConflictCacheRoot, true},
		{"version", versionConflictMsg, ConflictVersion, true},
		{"abi", "CBM could not start because a conflicting CBM process is active (store_abi; …)",
			ConflictVersion, true},
		{"empty", "", OK, false},
		{"unrelated", "warning: index is stale", OK, false},
		{"mentions cache but not a refusal", "using cache directory /tmp/x", OK, false},
	}
	for _, tc := range cases {
		got, is := classify(tc.stderr)
		if is != tc.is || (is && got != tc.want) {
			t.Errorf("%s: classify = (%v, %v), want (%v, %v)", tc.name, got, is, tc.want, tc.is)
		}
	}
}
