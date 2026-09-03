// Package proxy is the middleman: the agent speaks to us, we speak to the
// engine, and every tool call is metered on the way through.
//
// Hard rule: stdout carries MCP JSON-RPC and nothing else. One stray write
// corrupts the protocol stream and the agent drops the server. Everything we
// want to say goes to stderr.
package proxy

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/pra2107tham/shimmr/internal/repostat"
	"github.com/pra2107tham/shimmr/internal/usage"
)

// Recorder receives every event the proxy meters. It exists so the proxy can
// hand events to a live reporter without knowing anything about HTTP, and so
// tests can watch what would have been sent.
//
// Implementations must not block: this is called on the path between an agent
// and its answer.
type Recorder interface {
	Record(usage.Event)
}

type Options struct {
	EnginePath string
	Args       []string
	Log        *usage.Logger
	// Report is optional. Nil means this build reports to nobody, which is the
	// default and the guarantee a build with no endpoint makes.
	Report Recorder
	UserID string
	Org    string
	Team   string
}

// pending is one in-flight tool call, waiting for the engine's response so we
// can record whether it worked and how long it took.
type pending struct {
	tool    string
	started time.Time
	// repoPath is set only for index calls, and only long enough to measure
	// the tree. It is never written to the log.
	repoPath string
}

type Proxy struct {
	opt Options

	mu      sync.Mutex
	pending map[string]*pending

	wg sync.WaitGroup
}

func New(opt Options) *Proxy {
	return &Proxy{opt: opt, pending: map[string]*pending{}}
}

// Run wires agent stdin -> engine stdin and engine stdout -> agent stdout,
// metering tool calls in between. It returns the engine's exit error, if any.
func (p *Proxy) Run() error {
	cmd := exec.Command(p.opt.EnginePath, p.opt.Args...)
	cmd.Stderr = os.Stderr

	engineIn, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("engine stdin: %w", err)
	}
	engineOut, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("engine stdout: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting engine: %w", err)
	}

	done := make(chan struct{})

	// agent -> engine
	go func() {
		defer close(done)
		defer engineIn.Close()
		p.pump(os.Stdin, engineIn, p.onRequest)
	}()

	// engine -> agent
	p.pump(engineOut, os.Stdout, p.onResponse)

	<-done
	p.wg.Wait() // let any in-flight measurement finish before we exit
	return cmd.Wait()
}

// pump relays newline-delimited JSON-RPC, calling inspect on each message.
// Unparseable lines are still relayed byte-for-byte: we are a pipe first and
// an observer second, and a message we fail to understand is not ours to drop.
func (p *Proxy) pump(src io.Reader, dst io.Writer, inspect func([]byte)) {
	r := bufio.NewReaderSize(src, 1<<20)
	for {
		line, err := r.ReadBytes('\n')
		if len(line) > 0 {
			if _, werr := dst.Write(line); werr != nil {
				return
			}
			inspect(line)
		}
		if err != nil {
			return
		}
	}
}

type rpcMessage struct {
	ID     json.RawMessage `json:"id"`
	Method string          `json:"method"`
	Params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	} `json:"params"`
	Error  json.RawMessage `json:"error"`
	Result struct {
		IsError bool `json:"isError"`
	} `json:"result"`
}

func (p *Proxy) onRequest(line []byte) {
	var m rpcMessage
	if err := json.Unmarshal(line, &m); err != nil || m.Method != "tools/call" {
		return
	}
	id := string(m.ID)
	if id == "" || m.Params.Name == "" {
		return
	}
	pd := &pending{tool: m.Params.Name, started: time.Now()}
	if isIndexTool(m.Params.Name) {
		pd.repoPath = extractRepoPath(m.Params.Arguments)
	}
	p.mu.Lock()
	p.pending[id] = pd
	p.mu.Unlock()
}

func (p *Proxy) onResponse(line []byte) {
	var m rpcMessage
	if err := json.Unmarshal(line, &m); err != nil {
		return
	}
	id := string(m.ID)
	if id == "" {
		return
	}
	p.mu.Lock()
	pd, ok := p.pending[id]
	if ok {
		delete(p.pending, id)
	}
	p.mu.Unlock()
	if !ok {
		return
	}

	ok2 := len(m.Error) == 0 && !m.Result.IsError
	p.record(usage.Event{
		Kind:   "tool_call",
		UserID: p.opt.UserID,
		Org:    p.opt.Org,
		Team:   p.opt.Team,
		Tool:   pd.tool,
		OK:     ok2,
		DurMS:  time.Since(pd.started).Milliseconds(),
	})

	// A successful index is also a coverage measurement. Do it off the hot
	// path so the agent never waits on our metrics.
	if ok2 && pd.repoPath != "" {
		// Only index responses are re-parsed for their body. A search result
		// can be megabytes, and paying to decode every one of those just to
		// look for fields it never has would be a real cost on every call.
		nodes, edges := graphSize(line)

		p.wg.Add(1)
		go func(path string, nodes, edges int) {
			defer p.wg.Done()
			abs, err := filepath.Abs(path)
			if err != nil {
				return
			}
			st := repostat.Measure(abs)
			if st.Files == 0 {
				return
			}
			p.record(usage.Event{
				Kind:   "index",
				UserID: p.opt.UserID,
				Org:    p.opt.Org,
				Team:   p.opt.Team,
				OK:     true,
				Repo:   p.opt.Log.RepoID(abs),
				Files:  st.Files,
				Lines:  st.Lines,
				Bytes:  st.Bytes,
				Nodes:  nodes,
				Edges:  edges,
			})
		}(pd.repoPath, nodes, edges)
	}
}

// record writes one event to the local log and hands the same completed event
// to the live reporter. The log is written first and unconditionally: it is
// the durable record, and reporting is a courier on top of it.
func (p *Proxy) record(e usage.Event) {
	written := p.opt.Log.Write(e)
	if p.opt.Report != nil {
		p.opt.Report.Record(written)
	}
}

// toolResult is the MCP envelope an index response arrives in. The engine puts
// its own JSON summary inside the text content, so there are two layers to peel.
type toolResult struct {
	Result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	} `json:"result"`
}

// graphSize reads the node and edge counts the engine reports for an index.
// Files and lines are what we measured on disk; these are what the engine
// actually mapped, and the two differ because it applies its own ignore rules.
// Zero means the engine did not say, which is not an error.
func graphSize(line []byte) (nodes, edges int) {
	var env toolResult
	if err := json.Unmarshal(line, &env); err != nil {
		return 0, 0
	}
	for _, c := range env.Result.Content {
		if c.Text == "" {
			continue
		}
		var summary struct {
			Nodes int `json:"nodes"`
			Edges int `json:"edges"`
		}
		if err := json.Unmarshal([]byte(c.Text), &summary); err != nil {
			continue
		}
		if summary.Nodes > 0 || summary.Edges > 0 {
			return summary.Nodes, summary.Edges
		}
	}
	return 0, 0
}

func isIndexTool(name string) bool {
	return name == "index_repository" || name == "index_repo"
}

// extractRepoPath pulls the path out of an index call's arguments so we can
// measure the tree. The path is used and discarded — only its hash is logged.
func extractRepoPath(args json.RawMessage) string {
	if len(args) == 0 {
		return ""
	}
	var m map[string]any
	if err := json.Unmarshal(args, &m); err != nil {
		return ""
	}
	for _, k := range []string{"repo_path", "path", "repository", "root", "dir"} {
		if v, ok := m[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}
