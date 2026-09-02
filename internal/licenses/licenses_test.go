package licenses

import (
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
