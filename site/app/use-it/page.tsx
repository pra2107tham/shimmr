import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import { pageMetadata } from "../seo";
import shared from "../marketing.module.css";
import styles from "./use-it.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Use it — Shimmr",
  description: "A code graph, semantic search, and coverage your agent can trust — behind one command, for whichever agent you already run.",
  path: "/use-it",
});

const FEATURES = [
  { label: "CODE GRAPH", title: "Structural understanding", copy: "What calls what, what lives where, across the whole repository." },
  { label: "SEMANTIC SEARCH", title: "Find code by what it does", copy: "Not just by its name. Query stays on the machine." },
  { label: "COVERAGE", title: "Measured, not estimated", copy: "Measurement method available on request." },
  { label: "ONE GATE", title: "Consistent across agents", copy: "The same account and the same meter, whichever agent calls." },
];

const AGENTS = ["Claude Code", "Cursor", "Windsurf", "Copilot"];

const COMMANDS = [
  { cmd: "shimmr signup", what: "Creates your account.", out: "opens a browser → confirms your email → account ready" },
  { cmd: "shimmr init", what: "Wires up your agent, showing every change first.", out: "lists each config file and the exact lines, then waits for y/N" },
  { cmd: "shimmr doctor", what: "Verifies the whole setup actually works.", out: "binary · account · agent config · index · gate — all checks passed" },
];

export default function UseIt() {
  return (
    <div className={shared.page}>
      <SiteNav active="/use-it" />

      <header className={shared.hero}>
        <span className={shared.eyebrow}>USE IT</span>
        <h1 className={shared.h1}>What it gives your agent today.</h1>
      </header>

      <section className={`${shared.wrap} ${styles.featuresWrap}`}>
        <div className={shared.cardGrid}>
          {FEATURES.map((f) => (
            <div className={`${shared.cardCell} ${shared.cardCellPanel}`} key={f.label}>
              <span className={shared.label}>{f.label}</span>
              <h2 className={shared.cardTitle}>{f.title}</h2>
              <p className={shared.cardCopy}>{f.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={shared.section}>
        <h2 className={shared.sectionLabel}>WORKS WITH TODAY</h2>
        <div className={styles.agentRow}>
          {AGENTS.map((a) => <span className={styles.agentPill} key={a}>{a}</span>)}
        </div>
      </section>

      <section className={`${shared.section} ${styles.previewGrid}`}>
        <div className={styles.previewPanel}>
          <div className={styles.previewHead}>
            <h2 className={styles.previewLabel}>SETUP SHOWS EVERY CHANGE FIRST</h2>
            <span className={styles.pendingTag}>PENDING APPROVAL</span>
          </div>
          <div className={styles.diffBody}>
            <div className={styles.diffPath}>~/.config/agent/settings.json</div>
            <div className={styles.diffLine}>+  &quot;tools&quot;: {`{ "shimmr": { "command": "shimmr", "args": ["serve"] } }`}</div>
            <div className={styles.diffPath} style={{ marginTop: 12 }}>~/.shimmr/config.toml</div>
            <div className={styles.diffLine}>+  account = &quot;you@company.com&quot;</div>
            <div className={styles.diffLine}>+  telemetry = &quot;tool-name-and-outcome-only&quot;</div>
            <div className={styles.diffPrompt}>apply these 2 files? <span className={styles.accent}>[y/N]</span></div>
          </div>
        </div>

        <div className={styles.previewPanel}>
          <div className={styles.previewHead}>
            <h2 className={styles.previewLabel}>LIVE USAGE</h2>
            <span className={styles.updatingTag}><span className={styles.pulseDot} />UPDATING</span>
          </div>
          <div className={styles.usageBody}>
            <div className={styles.bars} aria-hidden>
              {[52, 38, 81, 47, 69, 55, 86, 40, 73, 61, 95, 49, 57, 78, 36, 64, 88, 44, 70, 53].map((h, i) => (
                <div key={i} className={styles.bar} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className={styles.usageFoot}>
              <span>last 30 days</span>
              <span className={styles.usageCount}>18,204 calls</span>
            </div>
            <Link href="/dashboard" className={styles.dashLink}>open the dashboard →</Link>
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${styles.commandsSection}`}>
        <h2 className={shared.sectionLabel}>THE WHOLE FLOW — THREE COMMANDS</h2>
        <div className={styles.commandTable}>
          {COMMANDS.map((c) => (
            <div className={styles.commandRow} key={c.cmd}>
              <code className={styles.commandCmd}>{c.cmd}</code>
              <span className={styles.commandDetail}>
                <span className={styles.commandWhat}>{c.what}</span>
                <span className={styles.commandOut}>{c.out}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
