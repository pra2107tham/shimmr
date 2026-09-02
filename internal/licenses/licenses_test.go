package licenses

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The MIT licence of the embedded engine requires its copyright notice to
// travel with every copy. That obligation is the reason this package exists,
// so it gets a test rather than a comment.
func TestEngineCopyrightNoticeShips(t *testing.T) {
	var out strings.Builder
	if err := Write(&out); err != nil {
		t.Fatal(err)
	}
	got := out.String()

	for _, required := range []string{
		"MIT License",
		"Copyright (c) 2025 DeusData",
		"THE SOFTWARE IS PROVIDED \"AS IS\"",
		"without restriction",
	} {
		if !strings.Contains(got, required) {
			t.Errorf("the shipped notice is missing %q — this is a licence violation", required)
		}
	}
}

func TestShimmrNoticeShipsToo(t *testing.T) {
	var out strings.Builder
	if err := Write(&out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Shimmr") {
		t.Error("our own licence is missing")
	}
}

// Nothing may be empty: an embed that silently resolves to an empty file would
// pass a "does it run" check while shipping no notice at all.
func TestNoNoticeIsEmpty(t *testing.T) {
	all := All()
	if len(all) < 2 {
		t.Fatalf("expected Shimmr plus at least one third-party notice, got %d", len(all))
	}
	for _, n := range all {
		if strings.TrimSpace(n.Text) == "" {
			t.Errorf("%s has an empty notice", n.Component)
		}
		if n.Component == "" {
			t.Error("a notice has no component name")
		}
	}
	if all[0].Component != "Shimmr" {
		t.Errorf("first notice = %q, want Shimmr", all[0].Component)
	}
}

// The engine bundles libraries whose notices are generated when it is packaged,
// so they ship as files rather than embedded text. `shimmr licenses` has to
// account for them, or the command understates what is actually installed.
func TestOnDiskNoticesAreListed(t *testing.T) {
	dir := t.TempDir()
	licDir := filepath.Join(dir, "LICENSES")
	if err := os.MkdirAll(licDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Two that are already embedded, one that is not.
	for _, name := range []string{"shimmr.txt", "engine-MIT.txt", "engine-third-party.md"} {
		if err := os.WriteFile(filepath.Join(licDir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	got := noticeFiles([]string{licDir})
	if len(got) != 1 {
		t.Fatalf("noticeFiles = %v, want just the notice that is not embedded", got)
	}
	if filepath.Base(got[0]) != "engine-third-party.md" {
		t.Errorf("got %s, want engine-third-party.md", filepath.Base(got[0]))
	}
}

// The prefix layout puts the notices under lib/, not beside the binary, so the
// second candidate has to be searched when the first does not exist.
func TestOnDiskFallsBackToThePrefixLayout(t *testing.T) {
	dir := t.TempDir()
	libDir := filepath.Join(dir, "lib", "shimmr", "LICENSES")
	if err := os.MkdirAll(libDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(libDir, "engine-third-party.md"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := noticeFiles([]string{filepath.Join(dir, "bin", "LICENSES"), libDir})
	if len(got) != 1 {
		t.Fatalf("noticeFiles = %v, want the notice under lib/", got)
	}
}

// A plain `go build` produces a binary with no LICENSES directory anywhere near
// it. That must print the embedded notices and nothing else — not an error, and
// not a dangling "Also shipped" heading.
func TestNoDirectoryMeansNoExtraSection(t *testing.T) {
	if got := noticeFiles([]string{filepath.Join(t.TempDir(), "nope")}); got != nil {
		t.Errorf("noticeFiles = %v, want nil", got)
	}

	var out strings.Builder
	if err := Write(&out); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "Also shipped") && !strings.Contains(out.String(), ".md") {
		t.Error("printed an 'Also shipped' heading with nothing under it")
	}
}
