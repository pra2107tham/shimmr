// Command shimmr wraps a local code-intelligence engine behind an account, and
// records what the team's agents actually used it for.
//
// Everything printed by every command except `serve` goes to stdout normally.
// `serve` is different: its stdout is an MCP JSON-RPC stream and nothing else
// may be written there.
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/pra2107tham/shimmr/internal/agentcfg"
	"github.com/pra2107tham/shimmr/internal/config"
	"github.com/pra2107tham/shimmr/internal/engine"
	"github.com/pra2107tham/shimmr/internal/licenses"
	"github.com/pra2107tham/shimmr/internal/proxy"
	"github.com/pra2107tham/shimmr/internal/report"
	"github.com/pra2107tham/shimmr/internal/usage"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		usageText()
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "signup":
		err = cmdSignup(os.Args[2:])
	case "login":
		err = cmdLogin(os.Args[2:])
	case "init":
		err = cmdInit(os.Args[2:])
	case "serve":
		err = cmdServe(os.Args[2:])
	case "stats":
		err = cmdStats(os.Args[2:])
	case "doctor":
		err = cmdDoctor(os.Args[2:])
	case "whoami":
		err = cmdWhoami()
	case "sync":
		err = cmdSync(os.Args[2:])
	case "licenses", "license":
		err = licenses.Write(os.Stdout)
	case "version", "--version", "-v":
		fmt.Println("shimmr", version)
	case "help", "--help", "-h":
		usageText()
	default:
		fmt.Fprintf(os.Stderr, "shimmr: unknown command %q\n\n", os.Args[1])
		usageText()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "shimmr:", err)
		os.Exit(1)
	}
}

func usageText() {
	fmt.Fprint(os.Stderr, `shimmr — codebase context for your AI coding agent

  shimmr signup    create your account (an organisation is optional)
  shimmr login     add this machine to an account you already have
  shimmr init      connect shimmr to the agents on this machine
  shimmr doctor    check that everything actually works on this machine
  shimmr stats     what your agents used, and how much code we covered
  shimmr whoami    show the account on this machine
  shimmr sync      send usage totals now (usage also reports as you work)
  shimmr serve     run the MCP server (your agent runs this, not you)
  shimmr licenses  licences of everything shipped with Shimmr

Start with: shimmr signup
`)
}

// ---- signup ----

func cmdSignup(args []string) error {
	fs := flag.NewFlagSet("signup", flag.ExitOnError)
	email := fs.String("email", "", "your work email (skip the browser and use this instead — unverified)")
	org := fs.String("org", "", "your company or organisation (optional, --email only)")
	team := fs.String("team", "", "your team within the org (optional, --email only)")
	endpoint := fs.String("endpoint", "", "Shimmr backend base URL (optional)")
	engine := fs.String("engine", "", "path to the engine binary (optional)")
	force := fs.Bool("force", false, "overwrite an existing account on this machine")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if existing, err := config.Load(); err == nil && !*force {
		return fmt.Errorf("this machine is already signed in as %s (%s).\n"+
			"  Use --force to replace it", existing.Email, existing.Org)
	}

	// No --email: open a browser to a real, verified sign-in instead of
	// asking for an address at this prompt — see ADR 0012. This needs a
	// real backend to pair against; unlike the --email path below, there is
	// no offline version of it.
	if *email == "" {
		if *org != "" || *team != "" {
			fmt.Println("Note: --org/--team only apply with --email. Once you're signed in, join one with:\n" +
				"  shimmr signup --force --email you@company.com --org \"Your Co\"")
		}
		c := &config.Config{Endpoint: *endpoint, EnginePath: *engine}
		target := c.ResolveEndpoint()
		if target == "" {
			return errors.New("this build has no backend configured, so there is nothing to open " +
				"a browser to.\n  For a fully local account instead: shimmr signup --email you@company.com")
		}
		return pairInBrowser(c, target, "signup")
	}
	if !strings.Contains(*email, "@") {
		return fmt.Errorf("%q does not look like an email address", *email)
	}

	token, err := config.NewToken()
	if err != nil {
		return err
	}
	userID, err := config.NewUserID()
	if err != nil {
		return err
	}
	c := &config.Config{
		Token:      token,
		UserID:     userID,
		Email:      *email,
		Org:        *org,
		Team:       *team,
		Endpoint:   *endpoint,
		EnginePath: *engine,
		CreatedAt:  time.Now().UTC(),
	}

	if endpoint := c.ResolveEndpoint(); endpoint != "" {
		if err := register(c, endpoint); err != nil {
			fmt.Printf("  Could not reach %s (%v)\n", endpoint, err)
			fmt.Println("  Saved locally — run `shimmr sync` later to register.")
		} else {
			c.Synced = true
		}
	}
	if err := c.Save(); err != nil {
		return err
	}

	dir, _ := config.Dir()
	fmt.Printf("\nWelcome, %s.\n\n", *email)
	if *org != "" {
		fmt.Printf("  Organisation   %s\n", *org)
	} else {
		fmt.Printf("  Organisation   none — add one later with `shimmr signup --force --org \"Your Co\"`\n")
	}
	if *team != "" {
		fmt.Printf("  Team           %s\n", *team)
	}
	fmt.Printf("  Account        %s\n", filepath.Join(dir, "config.json"))
	fmt.Printf("  Usage sharing  %s\n", reportingState(c))
	fmt.Printf("\nNext: shimmr init\n")
	return nil
}

// ---- login ----

// cmdLogin attaches this machine to an account that already exists. Signup
// creates the person; this is how their second laptop joins without becoming a
// second identity.
//
// It is not verified authentication — anyone who knows an address can attach a
// machine to it. That is exactly the trust model signup already had, since
// signup upserts on email, so this adds no new exposure. It does not fix it
// either, which is why the message below says so out loud and why email
// verification is Q11 in docs/04-open-questions.md.
func cmdLogin(args []string) error {
	fs := flag.NewFlagSet("login", flag.ExitOnError)
	email := fs.String("email", "", "the email you signed up with (skip the browser and use this instead — unverified)")
	endpoint := fs.String("endpoint", "", "Shimmr backend base URL (optional)")
	engine := fs.String("engine", "", "path to the engine binary (optional)")
	force := fs.Bool("force", false, "replace the account already on this machine")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if existing, err := config.Load(); err == nil && !*force {
		return fmt.Errorf("this machine is already signed in as %s.\n"+
			"  Use --force to replace it", existing.Email)
	}

	c := &config.Config{Endpoint: *endpoint, EnginePath: *engine}
	target := c.ResolveEndpoint()
	if target == "" {
		return errors.New("this build has no backend configured, so there is no " +
			"account to log in to.\n  Run `shimmr signup` to set this machine up locally")
	}

	// No --email: open a browser to a real, verified sign-in instead of
	// asking for an address at this prompt — see ADR 0012.
	if *email == "" {
		return pairInBrowser(c, target, "login")
	}
	c.Email = strings.TrimSpace(*email)

	// A new machine means a new token: signing in somewhere else must never
	// need the first machine's credential, and revoking one must not touch the
	// other.
	token, err := config.NewToken()
	if err != nil {
		return err
	}
	userID, err := config.NewUserID()
	if err != nil {
		return err
	}
	c.Token, c.UserID, c.CreatedAt = token, userID, time.Now().UTC()

	var reply struct {
		Org  string `json:"org"`
		Team string `json:"team"`
	}
	if err := postJSON(c, target+"/v1/login", map[string]any{
		"user_id": c.UserID,
		"email":   c.Email,
		"token":   c.Token,
	}, &reply); err != nil {
		return err
	}
	c.Org, c.Team, c.Synced = reply.Org, reply.Team, true

	if err := c.Save(); err != nil {
		return err
	}
	dir, _ := config.Dir()
	fmt.Printf("\nSigned in as %s.\n\n", c.Email)
	if c.Org != "" {
		fmt.Printf("  Organisation   %s\n", c.Org)
	}
	if c.Team != "" {
		fmt.Printf("  Team           %s\n", c.Team)
	}
	fmt.Printf("  Account        %s\n", filepath.Join(dir, "config.json"))
	fmt.Printf("  Usage sharing  %s\n", reportingState(c))
	fmt.Printf("\nNext: shimmr init\n")
	return nil
}

// interactive reports whether stdin is a terminal a person can type into.
func interactive() bool {
	st, err := os.Stdin.Stat()
	return err == nil && st.Mode()&os.ModeCharDevice != 0
}

// ---- browser pairing ----
//
// The default path for both `shimmr login` and `shimmr signup` now: open a
// browser to a short-lived code, let the person confirm it against a real
// signed-in session, and this machine is attached the moment they do. See
// ADR 0012 — this is what closes the CLI half of Q11. --email still exists,
// still doesn't verify anything, and is unaffected by any of this.

const (
	pairPollInterval = 2 * time.Second
	pairDefaultTTL   = 10 * time.Minute
)

// pairInBrowser generates this machine's install credential exactly as the
// --email path always has, registers a pairing code for it, opens a browser
// to confirm it, and waits. flow is "login" or "signup" — cosmetic only,
// forwarded so the website can offer to create an account or not without
// this command needing two versions of the same wait loop.
func pairInBrowser(c *config.Config, target, flow string) error {
	// Checked before anything is generated or sent: a misconfigured build
	// should fail with zero side effects, not after already registering a
	// pairing code on the backend for a browser it can never point at.
	site := strings.TrimRight(config.ResolveSiteURL(), "/")
	if site == "" {
		return errors.New("this build has no website configured for browser sign-in.\n" +
			"  Use --email instead, or build with SITE_URL set (see the Makefile).")
	}

	token, err := config.NewToken()
	if err != nil {
		return err
	}
	userID, err := config.NewUserID()
	if err != nil {
		return err
	}
	c.Token, c.UserID, c.CreatedAt = token, userID, time.Now().UTC()

	var start struct {
		Code      string `json:"code"`
		ExpiresIn int    `json:"expires_in"`
	}
	if err := postJSON(c, target+"/v1/cli_start", map[string]any{
		"install_id": c.UserID,
		"token":      c.Token,
		"machine":    machineLabel(),
	}, &start); err != nil {
		return fmt.Errorf("could not start sign-in: %w", err)
	}

	authURL := fmt.Sprintf("%s/cli-auth?code=%s&flow=%s", site, start.Code, flow)

	fmt.Printf("\nOpening your browser to finish signing in...\n")
	fmt.Printf("If it doesn't open, visit this URL and confirm the code matches:\n\n")
	fmt.Printf("  %s\n\n", authURL)
	fmt.Printf("  Code: %s\n\n", start.Code)
	if err := openBrowser(authURL); err != nil {
		fmt.Println("  (couldn't open a browser automatically — use the link above)")
	}

	ttl := time.Duration(start.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = pairDefaultTTL
	}
	return waitForClaim(c, target, start.Code, ttl)
}

// waitForClaim polls until the code above is confirmed, expires, or the
// person gives up with Ctrl+C. A network hiccup mid-poll is not treated as
// failure — the person is still there, actively completing this in a
// browser, and one bad request should not throw that away.
func waitForClaim(c *config.Config, target, code string, ttl time.Duration) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	deadline := time.Now().Add(ttl)
	fmt.Print("Waiting for confirmation")
	defer fmt.Println()

	for {
		if !time.Now().Before(deadline) {
			return errors.New("sign-in was not confirmed in time — run the command again")
		}
		select {
		case <-ctx.Done():
			return errors.New("cancelled")
		case <-time.After(pairPollInterval):
		}

		var poll struct {
			Status string `json:"status"`
			Email  string `json:"email"`
			Org    string `json:"org"`
			Team   string `json:"team"`
		}
		if err := postJSON(c, target+"/v1/cli_poll", map[string]any{"code": code}, &poll); err != nil {
			fmt.Print(".")
			continue
		}

		switch poll.Status {
		case "claimed":
			c.Email, c.Org, c.Team, c.Synced = poll.Email, poll.Org, poll.Team, true
			if err := c.Save(); err != nil {
				return err
			}
			dir, _ := config.Dir()
			fmt.Printf("\n\nSigned in as %s.\n\n", c.Email)
			if c.Org != "" {
				fmt.Printf("  Organisation   %s\n", c.Org)
			}
			if c.Team != "" {
				fmt.Printf("  Team           %s\n", c.Team)
			}
			fmt.Printf("  Account        %s\n", filepath.Join(dir, "config.json"))
			fmt.Printf("  Usage sharing  %s\n", reportingState(c))
			fmt.Printf("\nNext: shimmr init\n")
			return nil
		case "expired":
			return errors.New("that sign-in link expired — run the command again")
		default: // "pending"
			fmt.Print(".")
		}
	}
}

// machineLabel is display-only, sent so the confirm page can show something
// more legible than the bare pairing code — never anything the pairing's
// authorization actually depends on (see cli_claim). Best-effort: a
// hostname lookup failure just means a slightly plainer label, not an
// error worth surfacing.
func machineLabel() string {
	osName := map[string]string{"darwin": "macOS", "linux": "Linux", "windows": "Windows"}[runtime.GOOS]
	if osName == "" {
		osName = runtime.GOOS
	}
	host, err := os.Hostname()
	if err != nil || host == "" {
		return osName
	}
	return host + " · " + osName
}

// openBrowser is best-effort. A machine with no display, an SSH session, or
// simply no browser installed all fail here silently — the URL already
// printed above is what actually matters, this is only a convenience.
func openBrowser(url string) error {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		cmd, args = "open", []string{url}
	case "windows":
		cmd, args = "rundll32", []string{"url.dll,FileProtocolHandler", url}
	default:
		cmd, args = "xdg-open", []string{url}
	}
	return exec.Command(cmd, args...).Start()
}

// ---- init ----

func cmdInit(args []string) error {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	dry := fs.Bool("dry-run", false, "show what would change, change nothing")
	yes := fs.Bool("yes", false, "skip the confirmation prompt")
	if err := fs.Parse(args); err != nil {
		return err
	}

	c, err := config.Load()
	if errors.Is(err, config.ErrNoAccount) {
		return errors.New("no account yet — run `shimmr signup` first")
	} else if err != nil {
		return err
	}

	self, err := os.Executable()
	if err != nil {
		return err
	}

	targets := agentcfg.Detect()
	if len(targets) == 0 {
		return errors.New("no coding agents found on this machine.\n" +
			"  Shimmr supports Claude Code, Cursor and Windsurf")
	}

	fmt.Printf("I'd like to change %d file(s). Here's exactly what:\n\n", len(targets))
	plans := make([]agentcfg.Plan, 0, len(targets))
	for _, t := range targets {
		p, err := agentcfg.PlanFor(t, self)
		if err != nil {
			return err
		}
		plans = append(plans, p)
		verb := "adds"
		if p.Action == "update" {
			verb = "updates"
		}
		fmt.Printf("  %-14s %s\n", p.Agent, p.Path)
		fmt.Printf("  %-14s %s shimmr as an MCP server\n\n", "", verb)
	}
	fmt.Println("  Every other key in those files is left exactly as it is,")
	fmt.Println("  and the original is saved alongside as .shimmr.bak")

	if *dry {
		fmt.Println("\nDry run — nothing was changed.")
		fmt.Printf("\nThe entry that would be added:\n\n%s\n", plans[0].Preview)
		return nil
	}
	if !*yes {
		if !interactive() {
			return errors.New("not a terminal, so there is nobody to confirm with.\n" +
				"  Re-run with --yes to apply, or --dry-run to see the change")
		}
		if !confirm() {
			fmt.Println("Nothing was changed.")
			return nil
		}
	}

	fmt.Println()
	for _, p := range plans {
		if err := agentcfg.Install(p.Target, self); err != nil {
			return fmt.Errorf("configuring %s: %w", p.Agent, err)
		}
		fmt.Printf("  configured  %s\n", p.Agent)
	}

	// Configuring the agents is the easy half. The half that actually fails on
	// other people's machines is whether the engine can start at all, so check
	// it here rather than letting the agent discover it later.
	fmt.Println()
	if res := probeEngine(c); !res.Healthy() {
		reportEngine(res, false)
		return errors.New("shimmr is configured, but the engine cannot start yet — see above")
	} else {
		fmt.Printf("  engine ready  %d tools\n", len(res.Tools))
	}

	fmt.Println("\nRestart your agent, then ask it to index this repository.")
	return nil
}

func probeEngine(c *config.Config) engine.Result {
	path, err := c.ResolveEngine()
	if err != nil {
		return engine.Result{Status: engine.NotFound}
	}
	return engine.Probe(context.Background(), path, 45*time.Second)
}

// reportEngine prints the verdict in our own words. The engine's own output is
// shown only on request: it is useful when debugging and noise otherwise.
func reportEngine(res engine.Result, verbose bool) {
	mark := "x"
	if res.Healthy() {
		mark = "-"
	}
	fmt.Printf("  %s engine  %s\n", mark, res.Summary())
	if res.Path != "" {
		fmt.Printf("      path  %s\n", res.Path)
	}
	if res.Version != "" {
		fmt.Printf("   version  %s\n", res.Version)
	}
	if remedy := res.Remedy(); remedy != "" {
		fmt.Printf("\n  %s\n", remedy)
	}
	if verbose && res.Stderr != "" {
		fmt.Printf("\n  The engine printed:\n\n    %s\n",
			strings.ReplaceAll(res.Stderr, "\n", "\n    "))
	} else if res.Stderr != "" && !res.Healthy() {
		fmt.Printf("\n  Run `shimmr doctor --verbose` to see what the engine printed.\n")
	}
}

// ---- doctor ----

func cmdDoctor(args []string) error {
	fs := flag.NewFlagSet("doctor", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "show what the engine printed")
	if err := fs.Parse(args); err != nil {
		return err
	}

	c, err := config.Load()
	if errors.Is(err, config.ErrNoAccount) {
		fmt.Println("  x account  none on this machine")
		fmt.Println("\n  Run `shimmr signup` first.")
		return errors.New("not set up yet")
	} else if err != nil {
		return err
	}

	fmt.Printf("  - account  %s / %s\n", c.Email, c.Org)

	agents := agentcfg.Installed()
	if len(agents) > 0 {
		fmt.Printf("  - agents   %s\n", strings.Join(agents, ", "))
	} else {
		fmt.Printf("  x agents   none configured\n")
	}

	res := probeEngine(c)
	reportEngine(res, *verbose)

	// A broken engine is a failure. No agents yet is a normal state between
	// signup and init — but the summary must not contradict a line above it
	// that is marked with an x.
	if !res.Healthy() {
		return errors.New("something needs attention")
	}
	if len(agents) == 0 {
		fmt.Println("\n  The engine works. Run `shimmr init` to connect your editor.")
		return nil
	}
	fmt.Println("\n  Everything checks out.")
	return nil
}

func confirm() bool {
	fmt.Print("\nContinue? [Y/n] ")
	answer, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && answer == "" {
		// No answer is not consent. Anything that reaches here unattended
		// leaves the user's config untouched.
		fmt.Println()
		return false
	}
	answer = strings.ToLower(strings.TrimSpace(answer))
	return answer == "" || answer == "y" || answer == "yes"
}

// ---- serve ----

func cmdServe(args []string) error {
	c, err := config.Load()
	if errors.Is(err, config.ErrNoAccount) {
		// The agent sees this on stderr and reports the server as failed,
		// which is the correct outcome: no account, no proxying.
		return errors.New("no Shimmr account on this machine.\n" +
			"  Run `shimmr signup` in a terminal, then restart your agent")
	} else if err != nil {
		return err
	}

	enginePath, err := c.ResolveEngine()
	if err != nil {
		return err
	}

	dir, err := config.Dir()
	if err != nil {
		return err
	}
	log, err := usage.Open(dir)
	if err != nil {
		// Metering is not worth breaking a working code tool over.
		fmt.Fprintf(os.Stderr, "shimmr: usage log unavailable (%v) — proxying anyway\n", err)
		log = &usage.Logger{}
	}
	defer log.Close()

	// Live reporting, when this build has somewhere to report to and the
	// machine has not opted out. Nil when it does not, and every call on a nil
	// reporter is a no-op, so there is no branch below.
	var reporter *report.Reporter
	if c.Reports() {
		reporter = report.New(report.Options{
			Endpoint: c.ResolveEndpoint(),
			Token:    c.Token,
		})
	}

	fmt.Fprintf(os.Stderr, "shimmr %s — %s\n", version, describe(c))
	fmt.Fprintf(os.Stderr, "shimmr: usage reporting %s\n", reportingState(c))

	p := proxy.New(proxy.Options{
		EnginePath: enginePath,
		Args:       args,
		Log:        log,
		Report:     reporter,
		UserID:     c.UserID,
		Org:        c.Org,
		Team:       c.Team,
	})
	err = p.Run()

	// Give the last events a moment to land, then stop waiting. Anything
	// undelivered is still in the local log and goes with the next session.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	reporter.Close(ctx)
	if sent, dropped, _ := reporter.Stats(); dropped > 0 {
		fmt.Fprintf(os.Stderr, "shimmr: reported %d event(s), dropped %d\n", sent, dropped)
	}
	return err
}

// describe names the account in one line: an org when there is one, the email
// alone when there is not. Somebody using Shimmr on their own should not see a
// blank where a company would be.
func describe(c *config.Config) string {
	if c.Org == "" {
		return c.Email
	}
	return c.Org + " / " + c.Email
}

// reportingState says, in one line on stderr, what this server will send. It
// prints every time `serve` starts because a thing that reports usage should
// say so where the person running it can see it.
func reportingState(c *config.Config) string {
	switch {
	case c.ResolveEndpoint() == "":
		return "off (this build has no endpoint — it talks to nobody)"
	case c.DisableReport:
		return "off (disable_report is set in your config)"
	case !c.Reports():
		return "off (SHIMMR_NO_REPORT is set)"
	default:
		return "on — tool names and counts only, to " + c.ResolveEndpoint()
	}
}

// ---- stats ----

func cmdStats(args []string) error {
	fs := flag.NewFlagSet("stats", flag.ExitOnError)
	method := fs.Bool("method", false, "explain how tokens saved is calculated")
	days := fs.Int("days", 7, "how many days to report on (0 for all time)")
	allTime := fs.Bool("all", false, "report on everything, same as --days 0")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *method {
		fmt.Println(usage.MethodText)
		return nil
	}

	c, err := config.Load()
	if errors.Is(err, config.ErrNoAccount) {
		return errors.New("no account yet — run `shimmr signup` first")
	} else if err != nil {
		return err
	}

	dir, err := config.Dir()
	if err != nil {
		return err
	}
	events, err := usage.ReadAll(dir)
	if err != nil {
		return err
	}

	var since time.Time
	label := "All time"
	if !*allTime && *days > 0 {
		since = time.Now().UTC().AddDate(0, 0, -*days)
		label = fmt.Sprintf("Last %d days", *days)
	}
	s := usage.Summarise(events, since)

	fmt.Printf("%s — %s", c.Org, c.Email)
	if c.Team != "" {
		fmt.Printf(" (%s)", c.Team)
	}
	fmt.Printf("\n\n%s\n\n", label)

	if s.Calls == 0 {
		fmt.Println("  No tool calls recorded yet.")
		fmt.Println("  Restart your agent and ask it about this codebase.")
		return nil
	}

	fmt.Printf("  %d questions answered from the map\n\n", s.Calls)
	max := s.ByTool[0].Calls
	for _, t := range s.ByTool {
		fmt.Printf("    %-22s %5d  %s\n", t.Tool, t.Calls, bar(t.Calls, max, 20))
	}

	fmt.Printf("\n  Code covered      %s files, %s lines across %d repo(s)\n",
		commas(int64(s.Files)), commas(int64(s.Lines)), s.Repos)
	if s.Nodes > 0 {
		fmt.Printf("  Graph size        %s nodes, %s edges\n",
			commas(int64(s.Nodes)), commas(int64(s.Edges)))
	}
	fmt.Printf("  Tokens saved      ~%s   (shimmr stats --method)\n", commas(s.TokensSave))
	fmt.Printf("  Left your laptop  0 bytes\n")
	if s.Failed > 0 {
		fmt.Printf("  Failed calls      %d\n", s.Failed)
	}
	return nil
}

func bar(n, max, width int) string {
	if max <= 0 {
		return ""
	}
	w := n * width / max
	if w < 1 && n > 0 {
		w = 1
	}
	return strings.Repeat("█", w)
}

func commas(n int64) string {
	s := fmt.Sprintf("%d", n)
	if n < 0 {
		return s
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	return string(out)
}

// ---- whoami ----

func cmdWhoami() error {
	c, err := config.Load()
	if errors.Is(err, config.ErrNoAccount) {
		fmt.Println("Not signed in. Run `shimmr signup`.")
		return nil
	} else if err != nil {
		return err
	}
	fmt.Printf("  Email          %s\n", c.Email)
	if c.Org != "" {
		fmt.Printf("  Organisation   %s\n", c.Org)
	} else {
		fmt.Printf("  Organisation   none\n")
	}
	if c.Team != "" {
		fmt.Printf("  Team           %s\n", c.Team)
	}
	fmt.Printf("  User id        %s\n", c.UserID)
	fmt.Printf("  Signed up      %s\n", c.CreatedAt.Format("2 Jan 2006"))
	if agents := agentcfg.Installed(); len(agents) > 0 {
		fmt.Printf("  Connected to   %s\n", strings.Join(agents, ", "))
	} else {
		fmt.Printf("  Connected to   nothing yet — run `shimmr init`\n")
	}
	fmt.Printf("  Usage sharing  %s\n", reportingState(c))
	if c.Reports() {
		fmt.Printf("                 turn it off with SHIMMR_NO_REPORT=1, or\n")
		fmt.Printf("                 \"disable_report\": true in config.json\n")
	}
	fmt.Printf("\n  See exactly what would be sent:  shimmr sync --show\n")
	return nil
}

// ---- sync ----

func cmdSync(args []string) error {
	fs := flag.NewFlagSet("sync", flag.ExitOnError)
	show := fs.Bool("show", false, "print the exact payload and send nothing")
	if err := fs.Parse(args); err != nil {
		return err
	}
	c, err := config.Load()
	if errors.Is(err, config.ErrNoAccount) {
		return errors.New("no account yet — run `shimmr signup` first")
	} else if err != nil {
		return err
	}

	dir, err := config.Dir()
	if err != nil {
		return err
	}
	events, err := usage.ReadAll(dir)
	if err != nil {
		return err
	}
	s := usage.Summarise(events, time.Time{})

	payload := map[string]any{
		"user_id": c.UserID,
		"email":   c.Email,
		"org":     c.Org, // may be empty: an organisation is optional
		"team":    c.Team,
		"calls":   s.Calls,
		"repos":   s.Repos,
		"files":   s.Files,
		"lines":   s.Lines,
		"by_tool": s.ByTool,
		"sent_at": time.Now().UTC(),
	}

	endpoint := c.ResolveEndpoint()
	if *show || endpoint == "" {
		b, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println("This is the entire payload. No code, no paths, no repo names:")
		fmt.Println()
		fmt.Println(string(b))
		if endpoint == "" && !*show {
			fmt.Println("\nNo endpoint configured, so nothing was sent.")
		}
		return nil
	}

	if err := post(c, endpoint+"/v1/usage", payload); err != nil {
		return err
	}
	fmt.Println("Sent.")
	return nil
}

func register(c *config.Config, endpoint string) error {
	return post(c, endpoint+"/v1/signup", map[string]any{
		"user_id":    c.UserID,
		"email":      c.Email,
		"org":        c.Org,
		"team":       c.Team,
		"token":      c.Token,
		"created_at": c.CreatedAt,
	})
}

func post(c *config.Config, url string, payload any) error {
	return postJSON(c, url, payload, nil)
}

// postJSON sends payload and, when out is non-nil, decodes the reply into it.
// The server's message is included in an error rather than only its status
// code: "no account for that email" is the thing the person needs to read.
func postJSON(c *config.Config, url string, payload, out any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(body, &e) == nil && e.Error != "" {
			return fmt.Errorf("%s", e.Error)
		}
		return fmt.Errorf("%s returned %s", url, resp.Status)
	}
	if out != nil && len(body) > 0 {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("could not read the reply from %s: %w", url, err)
		}
	}
	return nil
}
