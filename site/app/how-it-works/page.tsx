import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import Bloom from "../Bloom";
import { CheckIcon } from "../icons";
import shared from "../marketing.module.css";
import styles from "./how-it-works.module.css";

export const metadata: Metadata = {
  title: "How it works — Shimmr",
  description: "One command to install, one protocol your agent already speaks, and nothing crosses the network unless you connect it.",
};

const STEPS = [
  {
    n: "1",
    title: "Install",
    copy: "One command. No dependencies, nothing to hand-edit first — the binary is all there is.",
  },
  {
    n: "2",
    title: "Connect your agent",
    copy: "Claude Code, Cursor, Windsurf, Copilot — whichever you already run. Shimmr speaks the same protocol they already speak.",
  },
  {
    n: "3",
    title: "Every call, metered",
    copy: "Tool name and outcome, recorded the moment it happens — never the code, the path, or the argument behind it.",
  },
  {
    n: "4",
    title: "Stays local, or doesn't",
    copy: "Nothing crosses the network on its own. You decide when to connect something — and what.",
  },
];

const LOCAL = [
  "Reading and understanding your codebase",
  "Semantic and structural search",
  "Coverage — files, lines, what's actually indexed",
  "The usage log itself",
];

const CONNECTED = [
  "Your team's usage, rolled up in one place",
  "Pulling in issues and pull requests as context",
  "Scheduled automations across repos",
  "Seats and shared visibility for a whole team",
];

export default function HowItWorks() {
  return (
    <div className={shared.page}>
      <Bloom />
      <SiteNav active="/how-it-works" />

      <div className={shared.wrap}>
        <header className={shared.hero}>
          <span className={shared.badge}>
            <span className={shared.badgeDot} />
            <span className={shared.badgeLabel}>How it works</span>
          </span>
          <h1 className={shared.headline}>Four steps, one of them optional.</h1>
          <p className={shared.subhead}>
            Shimmr sits between your agent and the work it&apos;s already doing —
            gating, metering, and staying out of the way. Here&apos;s the
            whole shape of it.
          </p>
        </header>

        <section className={shared.section}>
          <div className={styles.stepRow}>
            {STEPS.map((s, i) => (
              <div className={styles.step} key={s.n}>
                <div className={styles.stepTop}>
                  <span className={styles.stepNum}>{s.n}</span>
                  {i < STEPS.length - 1 && <span className={styles.stepLine} />}
                </div>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepCopy}>{s.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={shared.section}>
          <div className={shared.sectionLabelRow}>
            <span className={`${shared.sectionLabelLine} ${shared.left}`} />
            <span className={shared.sectionLabel}>What happens where</span>
            <span className={`${shared.sectionLabelLine} ${shared.right}`} />
          </div>
          <h2 className={shared.sectionHeading}>Local by default. Connected by choice.</h2>
          <p className={shared.sectionLead}>
            Everything on the left runs on your machine, permanently, with no
            account required. Everything on the right is something you turn
            on — never something that turns itself on.
          </p>

          <div className={shared.grid2}>
            <div className={`${styles.column} ${styles.columnLocal}`}>
              <span className={styles.columnLabel}>On your machine</span>
              <ul className={styles.list}>
                {LOCAL.map((item) => (
                  <li key={item} className={styles.listItem}>
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${styles.column} ${styles.columnConnected}`}>
              <span className={styles.columnLabel}>Only if you connect it</span>
              <ul className={styles.list}>
                {CONNECTED.map((item) => (
                  <li key={item} className={styles.listItem}>
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={`${shared.section} ${styles.ctaSection}`}>
          <p className={shared.sectionLead}>
            Curious what that actually gets you day to day? See{" "}
            <Link href="/use-it" className={styles.inlineLink}>how you&rsquo;d use it</Link>.
          </p>
          <div className={shared.ctaRow}>
            <a href="/signup" className={shared.cta}>Get started</a>
            <a href="/login" className={shared.ctaGhost}>Sign in</a>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
