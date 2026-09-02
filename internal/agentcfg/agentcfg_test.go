package agentcfg

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func readJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// These are the customer's own config files. Losing a key here means breaking
// their other MCP servers, which is the worst possible first impression.
func TestInstallPreservesEverythingElse(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	original := `{
	  "mcpServers": {"other": {"command": "keep-me", "args": ["--flag"]}},
	  "theme": "dark",
	  "nested": {"a": [1, 2, 3]}
	}`
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	tgt := Target{Agent: "Test", Path: path}
	if err := Install(tgt, "/usr/local/bin/shimmr"); err != nil {
		t.Fatal(err)
	}

	doc := readJSON(t, path)
	if doc["theme"] != "dark" {
		t.Error("top-level key 'theme' was lost")
	}
	if _, ok := doc["nested"]; !ok {
		t.Error("top-level key 'nested' was lost")
	}
	servers := doc["mcpServers"].(map[string]any)
	if _, ok := servers["other"]; !ok {
		t.Error("the user's own MCP server was removed")
	}
	shimmr, ok := servers[ServerKey].(map[string]any)
	if !ok {
		t.Fatal("shimmr entry not added")
	}
	if shimmr["command"] != "/usr/local/bin/shimmr" {
		t.Errorf("command = %v", shimmr["command"])
	}

	if _, err := os.Stat(path + ".shimmr.bak"); err != nil {
		t.Error("no backup of the original was written")
	}
}

func TestInstallCreatesFileWhenMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "mcp.json")
	if err := Install(Target{Agent: "Test", Path: path}, "/bin/shimmr"); err != nil {
		t.Fatal(err)
	}
	servers := readJSON(t, path)["mcpServers"].(map[string]any)
	if _, ok := servers[ServerKey]; !ok {
		t.Fatal("shimmr entry missing")
	}
}

func TestInstallIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp.json")
	tgt := Target{Agent: "Test", Path: path}
	for i := 0; i < 3; i++ {
		if err := Install(tgt, "/bin/shimmr"); err != nil {
			t.Fatal(err)
		}
	}
	servers := readJSON(t, path)["mcpServers"].(map[string]any)
	if len(servers) != 1 {
		t.Fatalf("expected exactly one server entry, got %d", len(servers))
	}
}

// Overwriting a config we cannot parse would destroy user data, so we refuse.
func TestInstallRefusesUnparseableConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp.json")
	broken := []byte(`{"mcpServers": {oops`)
	if err := os.WriteFile(path, broken, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Install(Target{Agent: "Test", Path: path}, "/bin/shimmr"); err == nil {
		t.Fatal("expected an error, got nil")
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(broken) {
		t.Fatal("the unparseable file was modified")
	}
}

func TestRemoveLeavesOtherServers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp.json")
	if err := os.WriteFile(path,
		[]byte(`{"mcpServers":{"other":{"command":"x"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	tgt := Target{Agent: "Test", Path: path}
	if err := Install(tgt, "/bin/shimmr"); err != nil {
		t.Fatal(err)
	}
	if err := Remove(tgt); err != nil {
		t.Fatal(err)
	}
	servers := readJSON(t, path)["mcpServers"].(map[string]any)
	if _, ok := servers[ServerKey]; ok {
		t.Error("shimmr entry not removed")
	}
	if _, ok := servers["other"]; !ok {
		t.Error("removing shimmr took the user's server with it")
	}
}

func TestPlanReportsAddVersusUpdate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp.json")
	tgt := Target{Agent: "Test", Path: path}

	p, err := PlanFor(tgt, "/bin/shimmr")
	if err != nil {
		t.Fatal(err)
	}
	if p.Action != "add" || p.Exists {
		t.Fatalf("first plan = %+v, want add on a missing file", p)
	}

	if err := Install(tgt, "/bin/shimmr"); err != nil {
		t.Fatal(err)
	}
	p, err = PlanFor(tgt, "/bin/shimmr")
	if err != nil {
		t.Fatal(err)
	}
	if p.Action != "update" || !p.Exists {
		t.Fatalf("second plan = %+v, want update on an existing entry", p)
	}
}
