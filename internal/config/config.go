// Package config owns ~/.shimmr — the account identity Shimmr requires before
// it will proxy anything, plus where to find the engine and the backend.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// Config is the whole of ~/.shimmr/config.json. It never holds code, repo
// paths, or anything derived from the customer's source.
type Config struct {
	Token      string    `json:"token"`
	UserID     string    `json:"user_id"`
	Email      string    `json:"email"`
	Org        string    `json:"org"`
	Team       string    `json:"team,omitempty"`
	EnginePath string    `json:"engine_path,omitempty"`
	Endpoint   string    `json:"endpoint,omitempty"`
	Synced     bool      `json:"synced"`
	CreatedAt  time.Time `json:"created_at"`

	// DisableReport turns off live usage reporting for this machine. It is
	// stated the negative way round so that a config written before reporting
	// existed keeps working and reports, rather than silently opting an
	// upgraded install out of the thing it just gained.
	DisableReport bool `json:"disable_report,omitempty"`
}

// ErrNoAccount means nobody has signed up on this machine yet. Every command
// that would use the engine checks for this first.
var ErrNoAccount = errors.New("no Shimmr account on this machine")

// DefaultEndpoint is baked in at build time so a released binary reaches the
// backend without the user passing a flag:
//
//	go build -ldflags "-X github.com/pra2107tham/shimmr/internal/config.DefaultEndpoint=https://<ref>.supabase.co/functions"
//
// Left empty, the build is fully offline: nothing is ever sent anywhere.
var DefaultEndpoint = ""

// DefaultSiteURL is the website `shimmr login`/`shimmr signup` open a
// browser to for the verified sign-in flow — a separate host from
// DefaultEndpoint (Vercel, not Supabase), baked in the same way:
//
//	go build -ldflags "-X github.com/pra2107tham/shimmr/internal/config.DefaultSiteURL=https://your-site.example"
//
// Left empty, that flow has nowhere to send the browser, so it refuses with
// a clear error instead of opening a dead link — `--email` still works.
var DefaultSiteURL = ""

// Dir is ~/.shimmr, overridable for tests via SHIMMR_HOME.
func Dir() (string, error) {
	if d := os.Getenv("SHIMMR_HOME"); d != "" {
		return d, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot locate home directory: %w", err)
	}
	return filepath.Join(home, ".shimmr"), nil
}

func Path() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "config.json"), nil
}

// Load reads the config. A missing file is ErrNoAccount, not a crash — the
// caller decides whether that is fatal.
func Load() (*Config, error) {
	p, err := Path()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNoAccount
	}
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", p, err)
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("%s is not valid JSON: %w", p, err)
	}
	// The token is what makes this an account. An organisation is optional —
	// requiring one here would treat everybody who signed up without a company
	// as having no account at all, and lock them out of their own tool.
	if c.Token == "" {
		return nil, ErrNoAccount
	}
	return &c, nil
}

func (c *Config) Save() error {
	d, err := Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(d, 0o700); err != nil {
		return fmt.Errorf("creating %s: %w", d, err)
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	p := filepath.Join(d, "config.json")
	// Write via a temp file so an interrupted save cannot leave a half-written
	// config that locks the user out of their own tool.
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", tmp, err)
	}
	return os.Rename(tmp, p)
}

// NewToken returns an opaque 32-byte token. It identifies an install, not a
// person; the person is the email recorded alongside it.
func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "shm_" + hex.EncodeToString(b), nil
}

// NewUserID returns a short stable id used to group usage rows.
func NewUserID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ResolveEndpoint prefers what the user configured, then the build-time
// default. Empty means this install talks to nobody.
func (c *Config) ResolveEndpoint() string {
	if c.Endpoint != "" {
		return c.Endpoint
	}
	return DefaultEndpoint
}

// ResolveSiteURL prefers SHIMMR_SITE_URL, then the build-time default — the
// same override shape SHIMMR_ENGINE_PATH already gives the engine location,
// for the same reason: someone pointing this build at a different
// deployment should not have to rebuild it to do so.
func ResolveSiteURL() string {
	if v := os.Getenv("SHIMMR_SITE_URL"); v != "" {
		return v
	}
	return DefaultSiteURL
}

// Reports says whether this machine should send usage as it happens.
//
// Three ways to say no, any one of which is enough: no endpoint (so the build
// talks to nobody at all), the config flag, or SHIMMR_NO_REPORT in the
// environment. The environment variable is there because the person who wants
// this off in one session should not have to edit a file to get it.
func (c *Config) Reports() bool {
	if c.ResolveEndpoint() == "" || c.DisableReport {
		return false
	}
	switch os.Getenv("SHIMMR_NO_REPORT") {
	case "", "0", "false", "no":
		return true
	}
	return false
}

// ResolveEngine finds the engine binary: explicit config, then the env var,
// then next to the shimmr executable, then PATH.
func (c *Config) ResolveEngine() (string, error) {
	exeDir := ""
	if exe, err := os.Executable(); err == nil {
		exeDir = filepath.Dir(exe)
	}
	for _, p := range engineCandidates(
		c.EnginePath, os.Getenv("SHIMMR_ENGINE_PATH"), exeDir, runtime.GOOS) {
		if p == "" {
			continue
		}
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", errors.New(
		"engine binary not found — set engine_path in ~/.shimmr/config.json " +
			"or the SHIMMR_ENGINE_PATH environment variable")
}

// engineCandidates lists where the engine might be, most explicit first: what
// the config says, then the environment, then the two install layouts — beside
// the binary, and the unix prefix layout where bin/ and lib/ are siblings.
//
// On Windows the executable suffix matters. The packaged engine is
// shimmr-engine.exe, and a bare "shimmr-engine" stat finds nothing, so every
// discovered path is tried with the suffix as well. Windows was in the build
// matrix long before this layout was ever exercised on it.
func engineCandidates(configured, env, exeDir, goos string) []string {
	// Explicit paths are used as given: someone who names a file means it.
	out := []string{configured, env}

	if exeDir == "" {
		return out
	}
	discovered := []string{
		filepath.Join(exeDir, "shimmr-engine"),
		filepath.Join(exeDir, "..", "lib", "shimmr", "shimmr-engine"),
	}
	for _, p := range discovered {
		if goos == "windows" {
			out = append(out, p+".exe")
		}
		out = append(out, p)
	}
	return out
}
