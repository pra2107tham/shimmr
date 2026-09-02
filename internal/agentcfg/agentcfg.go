// Package agentcfg registers Shimmr as an MCP server in the coding agents the
// user already has.
//
// These are the customer's own config files. We name every file before we
// touch it, back it up, and preserve every key we did not put there.
package agentcfg

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

const ServerKey = "shimmr"

type Target struct {
	Agent string // display name
	Path  string // absolute path to the agent's MCP config
}

// Detect returns the config files for agents present on this machine. An agent
// is "present" if its config file or config directory already exists — we do
// not create a config for an agent the user does not use.
func Detect() []Target {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	candidates := []struct {
		agent string
		path  string
		// marker is what proves the agent is installed; when empty, path itself
		// must already exist.
		marker string
	}{
		{"Claude Code", filepath.Join(home, ".claude.json"), ""},
		{"Cursor", filepath.Join(home, ".cursor", "mcp.json"), filepath.Join(home, ".cursor")},
		{"Windsurf", filepath.Join(home, ".codeium", "windsurf", "mcp_config.json"),
			filepath.Join(home, ".codeium", "windsurf")},
	}

	var out []Target
	for _, c := range candidates {
		check := c.marker
		if check == "" {
			check = c.path
		}
		if _, err := os.Stat(check); err == nil {
			out = append(out, Target{Agent: c.agent, Path: c.path})
		}
	}
	return out
}

// Entry is the MCP server block we add.
func Entry(shimmrPath string) map[string]any {
	return map[string]any{
		"command": shimmrPath,
		"args":    []string{"serve"},
	}
}

// Plan describes what Install would do to one file, so the user can see it
// before agreeing to it.
type Plan struct {
	Target
	Exists  bool
	Action  string // "add" or "update"
	Preview string
}

func PlanFor(t Target, shimmrPath string) (Plan, error) {
	p := Plan{Target: t, Action: "add"}
	doc, err := readDoc(t.Path)
	if err != nil {
		return p, err
	}
	p.Exists = doc != nil
	if doc == nil {
		doc = map[string]any{}
	}
	if servers, ok := doc["mcpServers"].(map[string]any); ok {
		if _, found := servers[ServerKey]; found {
			p.Action = "update"
		}
	}
	b, err := json.MarshalIndent(map[string]any{
		"mcpServers": map[string]any{ServerKey: Entry(shimmrPath)},
	}, "  ", "  ")
	if err != nil {
		return p, err
	}
	p.Preview = string(b)
	return p, nil
}

// Install adds or updates the shimmr entry, preserving everything else in the
// file and leaving a .bak of the original.
func Install(t Target, shimmrPath string) error {
	doc, err := readDoc(t.Path)
	if err != nil {
		return err
	}
	if doc == nil {
		doc = map[string]any{}
	} else if err := backup(t.Path); err != nil {
		return err
	}

	servers, _ := doc["mcpServers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}
	servers[ServerKey] = Entry(shimmrPath)
	doc["mcpServers"] = servers

	if err := os.MkdirAll(filepath.Dir(t.Path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	tmp := t.Path + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, t.Path)
}

// Remove takes the shimmr entry back out, leaving the rest untouched.
func Remove(t Target) error {
	doc, err := readDoc(t.Path)
	if err != nil || doc == nil {
		return err
	}
	servers, ok := doc["mcpServers"].(map[string]any)
	if !ok {
		return nil
	}
	if _, found := servers[ServerKey]; !found {
		return nil
	}
	if err := backup(t.Path); err != nil {
		return err
	}
	delete(servers, ServerKey)
	doc["mcpServers"] = servers
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(t.Path, append(b, '\n'), 0o600)
}

// Installed reports which detected agents currently point at shimmr.
func Installed() []string {
	var out []string
	for _, t := range Detect() {
		doc, err := readDoc(t.Path)
		if err != nil || doc == nil {
			continue
		}
		if servers, ok := doc["mcpServers"].(map[string]any); ok {
			if _, found := servers[ServerKey]; found {
				out = append(out, t.Agent)
			}
		}
	}
	sort.Strings(out)
	return out
}

// readDoc returns nil (not an error) when the file does not exist yet.
func readDoc(path string) (map[string]any, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return map[string]any{}, nil
	}
	var doc map[string]any
	if err := json.Unmarshal(b, &doc); err != nil {
		return nil, fmt.Errorf("%s is not valid JSON — fix or move it, "+
			"shimmr will not overwrite a file it cannot parse: %w", path, err)
	}
	return doc, nil
}

func backup(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return os.WriteFile(path+".shimmr.bak", b, 0o600)
}
