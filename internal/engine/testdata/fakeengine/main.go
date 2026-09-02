// Command fakeengine is a stand-in for the indexing engine, used by the
// installer job in CI.
//
// What that job tests is the installer and the packaged layout — download,
// checksum, extract, install, and whether the installed binary can find and
// start the engine that shipped beside it. The real engine is 285 MB and adds
// nothing to any of that. This answers the handshake `shimmr doctor` performs
// and nothing else.
//
// It lives under testdata so `go build ./...`, `go vet ./...` and `go test
// ./...` skip it; CI builds it by naming the directory.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	// Stdout carries only JSON-RPC. Anything this program has to say goes to
	// stderr, exactly as the constraint requires of the real engine.
	fmt.Fprintln(os.Stderr, "fakeengine: stand-in for CI, not a code engine")

	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()

	for in.Scan() {
		var req struct {
			ID     *int   `json:"id"`
			Method string `json:"method"`
		}
		if err := json.Unmarshal(in.Bytes(), &req); err != nil || req.ID == nil {
			continue // a notification, or something we do not understand
		}

		var result any
		switch req.Method {
		case "initialize":
			result = map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities":    map[string]any{"tools": map[string]any{}},
				"serverInfo":      map[string]any{"name": "fakeengine", "version": "0.0.0"},
			}
		case "tools/list":
			result = map[string]any{"tools": []map[string]any{
				{"name": "index_codebase", "description": "stand-in"},
				{"name": "search_graph", "description": "stand-in"},
			}}
		default:
			continue
		}

		b, err := json.Marshal(map[string]any{
			"jsonrpc": "2.0", "id": *req.ID, "result": result,
		})
		if err != nil {
			fmt.Fprintln(os.Stderr, "fakeengine:", err)
			return
		}
		out.Write(b)
		out.WriteByte('\n')
		out.Flush()
	}
}
