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
	return nil
}
