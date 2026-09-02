// Package repostat measures how much codebase Shimmr covered: files, lines,
// bytes. It reads sizes and counts newlines and keeps nothing else — no
// content, no names, no paths leave this package.
package repostat

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Stat struct {
	Files int
	Lines int
	Bytes int64
}

// maxFiles stops a pathological monorepo from turning a metrics walk into a
// visible pause. Past this we report what we counted; the number is a coverage
// signal, not an audit.
const maxFiles = 200000

// maxFileBytes skips anything too large to be hand-written source.
const maxFileBytes = 4 << 20

var skipDirs = map[string]bool{
	".git": true, ".hg": true, ".svn": true,
	"node_modules": true, "vendor": true, "target": true,
	"dist": true, "build": true, "out": true,
	".venv": true, "venv": true, "__pycache__": true,
	".next": true, ".nuxt": true, ".cache": true,
	".idea": true, ".vscode": true, ".gradle": true,
	"Pods": true, "DerivedData": true, ".terraform": true,
}

// codeExts is deliberately a allow-list. Counting every file would let images
// and lockfiles inflate a number we intend to put in front of customers.
var codeExts = map[string]bool{
	".go": true, ".py": true, ".js": true, ".jsx": true, ".ts": true, ".tsx": true,
	".java": true, ".kt": true, ".kts": true, ".rb": true, ".rs": true, ".c": true,
	".h": true, ".cc": true, ".cpp": true, ".hpp": true, ".cs": true, ".php": true,
	".swift": true, ".m": true, ".mm": true, ".scala": true, ".clj": true, ".ex": true,
	".exs": true, ".erl": true, ".hs": true, ".lua": true, ".pl": true, ".r": true,
	".dart": true, ".vue": true, ".svelte": true, ".sh": true, ".bash": true,
	".zsh": true, ".ps1": true, ".sql": true, ".graphql": true, ".proto": true,
	".tf": true, ".yaml": true, ".yml": true, ".json": true, ".toml": true,
	".html": true, ".css": true, ".scss": true, ".less": true,
}

// Deliberately absent: .md, .rst, .txt and friends. They are prose, not code.
// Counting them inflated "code covered" by a third on this very repository,
// and a figure that falls apart when a customer checks it damages every other
// number beside it. Config and infra formats stay — the engine indexes
// Dockerfiles, manifests and schemas as graph nodes, so they are fair game.

// Measure walks root and counts source files, lines and bytes. Errors on
// individual entries are skipped rather than propagated: a metrics walk must
// never be the reason a command fails.
func Measure(root string) Stat {
	var s Stat
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if path != root && (skipDirs[name] || strings.HasPrefix(name, ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if s.Files >= maxFiles {
			return filepath.SkipAll
		}
		if !codeExts[strings.ToLower(filepath.Ext(path))] {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > maxFileBytes {
			return nil
		}
		n, err := countLines(path)
		if err != nil {
			return nil
		}
		s.Files++
		s.Lines += n
		s.Bytes += info.Size()
		return nil
	})
	return s
}

func countLines(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	buf := make([]byte, 64*1024)
	count := 0
	lastByte := byte('\n')
	for {
		n, err := f.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			// A NUL in the first chunk means this is not text; don't count it.
			if count == 0 && bytes.IndexByte(chunk, 0) >= 0 {
				return 0, nil
			}
			count += bytes.Count(chunk, []byte{'\n'})
			lastByte = chunk[n-1]
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, err
		}
	}
	// Count a final line that has no trailing newline.
	if lastByte != '\n' {
		count++
	}
	return count, nil
}
