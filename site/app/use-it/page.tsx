import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import Bloom from "../Bloom";
import shared from "../marketing.module.css";
import styles from "./use-it.module.css";

export const metadata: Metadata = {
  title: "Use it — Shimmr",
  description: "A code graph, semantic search, and coverage your agent can trust — behind one command, for whichever agent you already run.",
};

const FEATURES = [
  {
    title: "Code graph",
    copy: "Structural understanding of your codebase, ready before your agent has to ask for it.",
  },
  {
    title: "Semantic search",
    copy: "Find code by what it does, not just what it's named.",
  },
  {
    title: "Coverage, honestly measured",
    copy: "Exactly how much of your codebase is indexed — and the method behind that number, on request.",
  },
  {
    title: "One gate, every agent",
    copy: "Claude Code, Cursor, Windsurf, Copilot — whichever you run, metered the same consistent way.",
  },
  {
    title: "Usage, live",
    copy: "Every call shows up on your dashboard the moment it happens — no sync step to remember.",
  },
  {
    title: "Setup that asks first",
    copy: "Shows you exactly which config files it wants to touch, backs them up, and waits for you to say go.",
  },
];

const AGENTS = ["Claude Code", "Cursor", "Windsurf", "Copilot"];

export default function UseIt() {
  return (
    <div className={shared.page}>
      <Bloom />
      <SiteNav active="/use-it" />

      <div className={shared.wrap}>
        <header className={shared.hero}>
          <span className={shared.badge}>
            <span className={shared.badgeDot} />
            <span className={shared.badgeLabel}>Use it</span>
          </span>
          <h1 className={shared.headline}>Everything your agent needs to actually understand your code.</h1>
          <p className={shared.subhead}>
            Not another dashboard to babysit — the layer that makes your
            agent&apos;s answers better, running the moment it&apos;s installed.
          </p>
        </header>

        <section className={shared.section}>
          <div className={shared.grid3}>
            {FEATURES.map((f) => (
              <div className={shared.card} key={f.title}>
                <h3 className={shared.cardTitle}>{f.title}</h3>
                <p className={shared.cardCopy}>{f.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={shared.section}>
          <div className={shared.sectionLabelRow}>
            <span className={`${shared.sectionLabelLine} ${shared.left}`} />
            <span className={shared.sectionLabel}>Three commands</span>
            <span className={`${shared.sectionLabelLine} ${shared.right}`} />
          </div>
          <h2 className={shared.sectionHeading}>From nothing to indexed.</h2>

          <div className={styles.terminal}>
            <div className={styles.terminalBar}>
              <span className={styles.terminalDot} />
              <span className={styles.terminalDot} />
              <span className={styles.terminalDot} />
            </div>
            <div className={styles.terminalBody}>
              <p className={styles.terminalLine}>
                <span className={styles.prompt}>$</span> shimmr signup
              </p>
              <p className={styles.terminalComment}>opens a browser, one click to confirm your email</p>
              <p className={styles.terminalLine}>
                <span className={styles.prompt}>$</span> shimmr init
              </p>
              <p className={styles.terminalComment}>shows every file it wants to change, then applies it</p>
              <p className={styles.terminalLine}>
                <span className={styles.prompt}>$</span> shimmr doctor
              </p>
              <p className={styles.terminalComment}>confirms the whole setup actually works, end to end</p>
            </div>
          </div>
        </section>

        <section className={`${shared.section} ${styles.agentsSection}`}>
          <p className={shared.sectionLead}>Works with the agent you already run.</p>
          <div className={styles.agentRow}>
            {AGENTS.map((a) => (
              <span className={styles.agentPill} key={a}>{a}</span>
            ))}
          </div>
        </section>

        <section className={`${shared.section} ${styles.ctaSection}`}>
          <div className={shared.ctaRow}>
            <a href="/signup" className={shared.cta}>Get started</a>
            <a href="/how-it-works" className={shared.ctaGhost}>See how it works</a>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
