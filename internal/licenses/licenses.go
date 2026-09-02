// Package licenses carries the notices Shimmr must ship.
//
// They are compiled into the binary rather than read from disk. The MIT
// licence of the embedded engine requires its copyright notice to travel with
// every copy of the software, and a notice that lives only in a file beside the
// binary is one `cp` away from being lost. Embedding makes that impossible.
package licenses

import (
	_ "embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
)

//go:embed shimmr.txt
var shimmr string

//go:embed engine-MIT.txt
var engineMIT string

// Notice is one component's licence, as shipped.
type Notice struct {
	Component string
	Text      string
}

// All returns every notice, Shimmr's own first.
func All() []Notice {
	third := []Notice{
		{Component: "Code indexing engine (MIT)", Text: engineMIT},
	}
	sort.Slice(third, func(i, j int) bool { return third[i].Component < third[j].Component })

	return append([]Notice{{Component: "Shimmr", Text: shimmr}}, third...)
}

// Write prints every notice in full. `shimmr licenses` is the command that
// discharges the obligation, so this must never abbreviate.
func Write(w io.Writer) error {
	for i, n := range All() {
		if i > 0 {
			if _, err := fmt.Fprintln(w); err != nil {
				return err
			}
		}
		if _, err := fmt.Fprintf(w, "── %s ──\n\n%s\n", n.Component, n.Text); err != nil {
			return err
		}
	}

	// The engine bundles libraries of its own, and their notices are generated
	// when it is packaged — they cannot be embedded here. They ship as files in
	// the release archive instead, so point at them rather than pretending the
	// embedded notices are the whole obligation.
	extra, err := onDisk()
	if err != nil || len(extra) == 0 {
		return nil
	}
	if _, err := fmt.Fprintf(w, "\nAlso shipped, in %s:\n", filepath.Dir(extra[0])); err != nil {
		return err
	}
	for _, f := range extra {
		if _, err := fmt.Fprintf(w, "  %s\n", filepath.Base(f)); err != nil {
			return err
		}
	}
	return nil
}

// onDisk finds notices that travel as files beside the install: the engine's
// third-party notices, which are generated at packaging time. It looks in the
// two layouts the installers produce — everything in one directory, and the
// unix prefix layout where bin/ and lib/ are siblings.
func onDisk() ([]string, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	dir := filepath.Dir(exe)
	return noticeFiles([]string{
		filepath.Join(dir, "LICENSES"),
		filepath.Join(dir, "..", "lib", "shimmr", "LICENSES"),
	}), nil
}

// noticeFiles returns the notices in the first of dirs that holds any, skipping
// the ones already compiled in — listing those twice would suggest the embedded
// copy is not the real thing.
func noticeFiles(dirs []string) []string {
	embedded := map[string]bool{"shimmr.txt": true, "engine-MIT.txt": true}
	for _, d := range dirs {
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		var found []string
		for _, e := range entries {
			if e.IsDir() || embedded[e.Name()] {
				continue
			}
			found = append(found, filepath.Join(d, e.Name()))
		}
		if len(found) > 0 {
			sort.Strings(found)
			return found
		}
	}
	return nil
}
