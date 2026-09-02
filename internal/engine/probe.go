// Package engine answers one question: will the code engine actually start on
// this machine, right now?
//
// It answers it by starting the engine and speaking MCP to it, rather than by
// hunting the filesystem for other copies. The failure we care about is a
// running daemon refusing a second, differently-configured one — and the only
// honest test of that is to try.
package engine

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

type Status int

const (
	// OK: the engine started and answered.
	OK Status = iota
	// NotFound: no engine binary where we expected one.
	NotFound
	// ConflictCacheRoot: another copy is running against a different storage
	// location. One canonical cache root per account — see ADR 0007.
	ConflictCacheRoot
	// ConflictVersion: another copy is running with a different version, build
	// or ABI. This is the case ADR 0007 left us unable to design around.
	ConflictVersion
	// Timeout: it started but never answered.
	Timeout
	// Failed: it exited for some other reason.
	Failed
)

type Result struct {
	Status  Status
	Path    string
	Name    string // serverInfo.name, as the engine reports itself
	Version string // serverInfo.version
	Tools   []string
	Stderr  string // captured verbatim, shown on request
}

func (r Result) Healthy() bool { return r.Status == OK }

// Summary is the one-line verdict, in our own words rather than the engine's.
func (r Result) Summary() string {
	switch r.Status {
	case OK:
		return fmt.Sprintf("ready — %d tools available", len(r.Tools))
	case NotFound:
		return "not found"
	case ConflictCacheRoot:
		return "blocked by another copy using different storage"
	case ConflictVersion:
		return "blocked by another copy of a different version"
	case Timeout:
		return "started but did not respond"
	default:
		return "failed to start"
	}
}

// Remedy is what the person should actually do about it. Empty when there is
// nothing to fix.
func (r Result) Remedy() string {
	switch r.Status {
	case NotFound:
		return "Reinstall Shimmr, or set engine_path in ~/.shimmr/config.json."
	case ConflictCacheRoot:
		return "Another copy of the code engine is already running on this machine,\n" +
			"  using a different storage directory. Only one storage location can be\n" +
			"  active per user account.\n\n" +
			"  Close every editor and terminal using it, then try again. If you have\n" +
			"  set CBM_CACHE_DIR yourself, unset it — Shimmr deliberately leaves the\n" +
			"  engine's default in place so both copies can share one location."
	case ConflictVersion:
		return "Another copy of the code engine is already running on this machine,\n" +
			"  at a different version. The two cannot run at the same time.\n\n" +
			"  Close every editor and terminal using it, then try again. If you use\n" +
			"  that other copy directly, keep the versions matched."
	case Timeout:
		return "The engine started but never answered. Re-run with --verbose to see\n" +
			"  what it printed."
	case Failed:
		return "Re-run with --verbose to see what the engine printed."
	}
	return ""
}

// Probe starts the engine, completes an MCP handshake, and lists its tools.
// The engine is always terminated before returning.
func Probe(ctx context.Context, path string, timeout time.Duration) Result {
	res := Result{Path: path}

	if path == "" {
		res.Status = NotFound
		return res
	}
	if st, err := os.Stat(path); err != nil || st.IsDir() {
		res.Status = NotFound
		return res
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, path)
	// Kill the whole thing on timeout rather than waiting on a wedged child.
	cmd.WaitDelay = 2 * time.Second

	stdin, err := cmd.StdinPipe()
	if err != nil {
		res.Status, res.Stderr = Failed, err.Error()
		return res
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		res.Status, res.Stderr = Failed, err.Error()
		return res
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		res.Status, res.Stderr = Failed, err.Error()
		return res
	}

	go func() {
		defer stdin.Close()
		for _, msg := range handshake {
			if _, err := io.WriteString(stdin, msg+"\n"); err != nil {
				return
			}
		}
	}()

	done := make(chan struct{})
	go func() {
		defer close(done)
		readResponses(stdout, &res)
	}()

	select {
	case <-done:
	case <-ctx.Done():
	}

	waitErr := cmd.Wait()
	res.Stderr = strings.TrimSpace(stderr.String())

	// A conflict is reported on stderr and by a non-zero exit, so classify
	// before treating anything as a generic failure.
	if status, ok := classify(res.Stderr); ok {
		res.Status = status
		return res
	}
	if len(res.Tools) > 0 {
		res.Status = OK
		return res
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		res.Status = Timeout
		return res
	}
	res.Status = Failed
	if waitErr != nil && res.Stderr == "" {
		res.Stderr = waitErr.Error()
	}
	return res
}

var handshake = []string{
	`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",` +
		`"capabilities":{},"clientInfo":{"name":"shimmr-doctor","version":"1"}}}`,
	`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
	`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
}

type rpcResponse struct {
	ID     int `json:"id"`
	Result struct {
		ServerInfo struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"serverInfo"`
		Tools []struct {
			Name string `json:"name"`
		} `json:"tools"`
	} `json:"result"`
}

func readResponses(r io.Reader, res *Result) {
	br := bufio.NewReaderSize(r, 1<<20)
	for {
		line, err := br.ReadBytes('\n')
		if len(line) > 0 {
			var m rpcResponse
			if json.Unmarshal(line, &m) == nil {
				switch m.ID {
				case 1:
					res.Name = m.Result.ServerInfo.Name
					res.Version = m.Result.ServerInfo.Version
				case 2:
					for _, t := range m.Result.Tools {
						res.Tools = append(res.Tools, t.Name)
					}
					return // the handshake is complete
				}
			}
		}
		if err != nil {
			return
		}
	}
}

// classify reads the engine's own startup refusal. Both messages begin
// "could not start because"; the cache-root case names a cache directory, and
// everything else — version, build, or one of the ABI mismatches — is reported
// as a conflicting process.
func classify(stderr string) (Status, bool) {
	if stderr == "" || !strings.Contains(stderr, "could not start because") {
		return OK, false
	}
	if strings.Contains(stderr, "different cache directory") {
		return ConflictCacheRoot, true
	}
	return ConflictVersion, true
}
