package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Windows was in the build matrix long before anyone tried the packaged layout
// on it. The engine ships as shimmr-engine.exe, and a bare "shimmr-engine"
// stat finds nothing — so the Windows package could never locate its own
// engine.
func TestWindowsLooksForTheExeSuffix(t *testing.T) {
	got := engineCandidates("", "", filepath.FromSlash("C:/Program Files/Shimmr"), "windows")

	var found bool
	for _, c := range got {
		if strings.HasSuffix(c, "shimmr-engine.exe") {
			found = true
		}
	}
	if !found {
		t.Fatalf("no .exe candidate on windows: %v", got)
	}

	// The suffixed form must come first, or a stray extensionless file would win.
	for _, c := range got {
		if strings.Contains(c, "shimmr-engine") {
			if !strings.HasSuffix(c, ".exe") {
				t.Errorf("first engine candidate is %q, want the .exe form first", c)
			}
			break
		}
	}
}

func TestUnixDoesNotLookForExe(t *testing.T) {
	for _, goos := range []string{"linux", "darwin"} {
		for _, c := range engineCandidates("", "", "/usr/local/bin", goos) {
			if strings.HasSuffix(c, ".exe") {
				t.Errorf("%s: unexpected .exe candidate %q", goos, c)
			}
		}
	}
}

// Both install layouts have to be covered: the two binaries side by side (what
// the archive contains) and the unix prefix layout the installer creates.
func TestBothInstallLayoutsAreSearched(t *testing.T) {
	got := engineCandidates("", "", "/usr/local/bin", "linux")
	joined := strings.Join(got, "\n")

	// filepath.Join cleans the "..", so the prefix layout resolves to the path
	// the installer actually creates.
	for _, want := range []string{
		filepath.FromSlash("/usr/local/bin/shimmr-engine"),
		filepath.FromSlash("/usr/local/lib/shimmr/shimmr-engine"),
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing candidate %q in:\n%s", want, joined)
		}
	}
}

// An explicit path is used exactly as given. Someone who names a file means
// that file, and silently probing variants of it would be surprising.
func TestExplicitPathsComeFirstAndAreNotRewritten(t *testing.T) {
	got := engineCandidates("/opt/custom/engine", "/opt/from-env", "/usr/local/bin", "windows")

	if got[0] != "/opt/custom/engine" {
		t.Errorf("configured path should be tried first, got %q", got[0])
	}
	if got[1] != "/opt/from-env" {
		t.Errorf("env path should be second, got %q", got[1])
	}
	for _, c := range got[:2] {
		if strings.HasSuffix(c, ".exe") {
			t.Errorf("an explicit path was rewritten: %q", c)
		}
	}
}

func TestNoExecutableDirStillReturnsExplicitPaths(t *testing.T) {
	got := engineCandidates("/opt/engine", "", "", "linux")
	if len(got) != 2 || got[0] != "/opt/engine" {
		t.Fatalf("got %v, want the explicit paths only", got)
	}
}

// Live reporting is on by default once an endpoint exists, and there are three
// independent ways to turn it off. Each one is a promise to somebody, so each
// one gets a case.
func TestReportsHasThreeOffSwitches(t *testing.T) {
	t.Setenv("SHIMMR_NO_REPORT", "")

	configured := &Config{Endpoint: "https://example.com/functions"}
	if !configured.Reports() {
		t.Error("reporting should be on when an endpoint is configured")
	}

	// 1. A build with no endpoint talks to nobody. This is the guarantee the
	//    whole privacy story rests on.
	offline := &Config{}
	if offline.Reports() {
		t.Error("a build with no endpoint must report nothing")
	}

	// 2. The config flag.
	disabled := &Config{Endpoint: "https://example.com/functions", DisableReport: true}
	if disabled.Reports() {
		t.Error("disable_report in the config must turn reporting off")
	}

	// 3. The environment, for turning it off without editing a file.
	for _, v := range []string{"1", "true", "yes", "anything"} {
		t.Setenv("SHIMMR_NO_REPORT", v)
		if configured.Reports() {
			t.Errorf("SHIMMR_NO_REPORT=%q must turn reporting off", v)
		}
	}
	// And the values that mean "no, leave it on".
	for _, v := range []string{"", "0", "false", "no"} {
		t.Setenv("SHIMMR_NO_REPORT", v)
		if !configured.Reports() {
			t.Errorf("SHIMMR_NO_REPORT=%q should not turn reporting off", v)
		}
	}
}

// A config written before reporting existed has no disable_report field. It
// must come back reporting, not silently opted out of the thing it gained.
func TestAnOlderConfigStillReports(t *testing.T) {
	t.Setenv("SHIMMR_NO_REPORT", "")
	dir := t.TempDir()
	t.Setenv("SHIMMR_HOME", dir)

	old := `{"token":"shm_x","user_id":"u1","email":"a@b.co","org":"Acme",
	         "endpoint":"https://example.com/functions","created_at":"2026-01-01T00:00:00Z"}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !c.Reports() {
		t.Error("an upgraded install was silently opted out of reporting")
	}
}

// An organisation is optional, so a config without one must still load. It was
// once required, and a stale check would lock those people out of their own
// tool.
func TestAnAccountWithNoOrgIsValid(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SHIMMR_HOME", dir)

	c := &Config{Token: "shm_x", UserID: "u1", Email: "solo@example.com"}
	if err := c.Save(); err != nil {
		t.Fatal(err)
	}
	got, err := Load()
	if err != nil {
		t.Fatalf("an account with no org failed to load: %v", err)
	}
	if got.Email != "solo@example.com" || got.Org != "" {
		t.Errorf("round trip lost something: %+v", got)
	}
}
