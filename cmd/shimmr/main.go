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
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pra2107tham/shimmr/internal/agentcfg"
	"github.com/pra2107tham/shimmr/internal/config"
	"github.com/pra2107tham/shimmr/internal/proxy"
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
	case "signup", "login":
		err = cmdSignup(os.Args[2:])
	case "init":
		err = cmdInit(os.Args[2:])
	case "serve":
		err = cmdServe(os.Args[2:])
	case "stats":
		err = cmdStats(os.Args[2:])
	case "whoami":
		err = cmdWhoami()
	case "sync":
		err = cmdSync(os.Args[2:])
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

  shimmr signup    create your account and pick your org
  shimmr init      connect shimmr to the agents on this machine
  shimmr stats     what your agents used, and how much code we covered
  shimmr whoami    show the account on this machine
  shimmr sync      send usage counts to your org (only if configured)
  shimmr serve     run the MCP server (your agent runs this, not you)

Start with: shimmr signup
`)
}

// ---- signup ----

func cmdSignup(args []string) error {
	fs := flag.NewFlagSet("signup", flag.ExitOnError)
	email := fs.String("email", "", "your work email")
	org := fs.String("org", "", "your company or organisation")
	team := fs.String("team", "", "your team within the org (optional)")
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

	in := bufio.NewReader(os.Stdin)
	if *email == "" {
		*email = prompt(in, "Work email")
	}
	if *org == "" {
		*org = prompt(in, "Organisation")
	}
	if *team == "" {
		*team = prompt(in, "Team (optional, press enter to skip)")
	}
	if *email == "" || *org == "" {
		return errors.New("email and organisation are both required")
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

	if c.Endpoint != "" {
		if err := register(c); err != nil {
			fmt.Printf("  Could not reach %s (%v)\n", c.Endpoint, err)
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
	fmt.Printf("  Organisation   %s\n", *org)
	if *team != "" {
		fmt.Printf("  Team           %s\n", *team)
	}
	fmt.Printf("  Account        %s\n", filepath.Join(dir, "config.json"))
	fmt.Printf("\nNext: shimmr init\n")
	return nil
}

func prompt(r *bufio.Reader, label string) string {
	fmt.Printf("%s: ", label)
	s, _ := r.ReadString('\n')
	return strings.TrimSpace(s)
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
	if !*yes && !confirm() {
		fmt.Println("Nothing was changed.")
		return nil
	}

	fmt.Println()
	for _, p := range plans {
		if err := agentcfg.Install(p.Target, self); err != nil {
			return fmt.Errorf("configuring %s: %w", p.Agent, err)
		}
		fmt.Printf("  configured  %s\n", p.Agent)
	}

	if _, err := c.ResolveEngine(); err != nil {
		fmt.Printf("\n  Note: %v\n", err)
	}
	fmt.Println("\nRestart your agent, then ask it to index this repository.")
	return nil
}

func confirm() bool {
	fmt.Print("\nContinue? [Y/n] ")
	s, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	s = strings.ToLower(strings.TrimSpace(s))
	return s == "" || s == "y" || s == "yes"
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

	fmt.Fprintf(os.Stderr, "shimmr %s — %s / %s\n", version, c.Org, c.Email)

	p := proxy.New(proxy.Options{
		EnginePath: enginePath,
		Args:       args,
		Log:        log,
		UserID:     c.UserID,
		Org:        c.Org,
		Team:       c.Team,
	})
	return p.Run()
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
	fmt.Printf("  Organisation   %s\n", c.Org)
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
	if c.Endpoint == "" {
		fmt.Printf("  Usage sharing  off (no endpoint configured)\n")
	} else {
		fmt.Printf("  Usage sharing  %s\n", c.Endpoint)
	}
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
		"org":     c.Org,
		"team":    c.Team,
		"calls":   s.Calls,
		"repos":   s.Repos,
		"files":   s.Files,
		"lines":   s.Lines,
		"by_tool": s.ByTool,
		"sent_at": time.Now().UTC(),
	}

	if *show || c.Endpoint == "" {
		b, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println("This is the entire payload. No code, no paths, no repo names:")
		fmt.Println()
		fmt.Println(string(b))
		if c.Endpoint == "" && !*show {
			fmt.Println("\nNo endpoint configured, so nothing was sent.")
		}
		return nil
	}

	if err := post(c, c.Endpoint+"/v1/usage", payload); err != nil {
		return err
	}
	fmt.Println("Sent.")
	return nil
}

func register(c *config.Config) error {
	return post(c, c.Endpoint+"/v1/signup", map[string]any{
		"user_id":    c.UserID,
		"email":      c.Email,
		"org":        c.Org,
		"team":       c.Team,
		"token":      c.Token,
		"created_at": c.CreatedAt,
	})
}

func post(c *config.Config, url string, payload any) error {
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

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("%s returned %s", url, resp.Status)
	}
	return nil
}
