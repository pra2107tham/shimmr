package repostat

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestMeasureCountsSourceAndSkipsNoise(t *testing.T) {
	root := t.TempDir()

	write(t, filepath.Join(root, "main.go"), "package main\n\nfunc main() {}\n") // 3
	write(t, filepath.Join(root, "app", "server.py"), "import os\nprint(1)\n")   // 2
	write(t, filepath.Join(root, "config.yaml"), "a: 1\n")                       // 1

	// None of these should count.
	// Prose most of all: counting markdown inflated this repo's own "code
	// covered" figure by a third.
	write(t, filepath.Join(root, "README.md"), "# Title\nlots of prose\n")
	write(t, filepath.Join(root, "node_modules", "dep", "index.js"), "var a=1;\n")
	write(t, filepath.Join(root, ".git", "config"), "[core]\n")
	write(t, filepath.Join(root, "vendor", "x.go"), "package x\n")
	write(t, filepath.Join(root, "logo.png"), "\x89PNG\r\n\x1a\n")
	write(t, filepath.Join(root, ".hidden", "s.go"), "package s\n")

	got := Measure(root)
	if got.Files != 3 {
		t.Errorf("files = %d, want 3", got.Files)
	}
	if got.Lines != 6 {
		t.Errorf("lines = %d, want 6", got.Lines)
	}
	if got.Bytes == 0 {
		t.Error("bytes should be non-zero")
	}
}

func TestMeasureCountsFinalLineWithoutNewline(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "a.go"), "one\ntwo\nthree") // no trailing \n
	if got := Measure(root); got.Lines != 3 {
		t.Fatalf("lines = %d, want 3", got.Lines)
	}
}

func TestMeasureSkipsBinaryDisguisedAsSource(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "blob.go"), "\x00\x01\x02binary\x00")
	if got := Measure(root); got.Lines != 0 {
		t.Fatalf("binary content contributed %d lines", got.Lines)
	}
}

func TestMeasureOnMissingPathIsHarmless(t *testing.T) {
	if got := Measure(filepath.Join(t.TempDir(), "nope")); got.Files != 0 {
		t.Fatalf("expected empty stat, got %+v", got)
	}
}

func TestMeasureEmptyFileCountsAsZeroLines(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "empty.go"), "")
	got := Measure(root)
	if got.Files != 1 || got.Lines != 0 {
		t.Fatalf("got %+v, want 1 file / 0 lines", got)
	}
}
