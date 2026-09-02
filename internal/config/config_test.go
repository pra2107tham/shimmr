package config

import (
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
