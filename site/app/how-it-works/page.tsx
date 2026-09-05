import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import shared from "../marketing.module.css";
import styles from "./how-it-works.module.css";

export const metadata: Metadata = {
  title: "How it works — Shimmr",
  description: "One binary, the protocol your agent already speaks, and a gate on every call. No separate integration per tool, no upload step.",
};

const STEPS = [
  {
    num: "01",
    title: "Install one binary",
    body: "A single install per machine. Nothing per project, nothing per agent, no daemon to babysit.",
  },
  {
    num: "02",
    title: "Point your existing agent at it",
    body: "It speaks the same protocol your agent already uses to call tools, so there is no separate integration to build or maintain for each tool.",
  },
  {
    num: "03",
    title: "Every tool call is gated on an account and metered",
    body: "The gate checks the account, then records the tool name and the outcome. Not the arguments, not the query, not the code.",
  },
  {
    num: "04",
    title: "Nothing leaves the machine unless you connect something",
    body: "The default is fully local. Connecting team sync, GitHub, or automations is an explicit, separate act.",
  },
];

const LOCAL = [
  "Code understanding and indexing",
  "Semantic search",
  "Coverage measurement",
  "The usage log itself",
];

const CONNECTED = [
  "Team-wide usage rolled up in one place",
  "GitHub issues and pull requests as agent context",
  "Scheduled automations",
  "Multi-seat team visibility",
];

export default function HowItWorks() {
  return (
    <div className={shared.page}>
      <SiteNav active="/how-it-works" />

      <header className={shared.hero}>
        <span className={shared.eyebrow}>HOW IT WORKS</span>
        <h1 className={shared.h1}>One binary, the protocol your agent already speaks, and a gate on every call.</h1>
        <p className={shared.subhead}>
          There is no separate integration per tool, and no step where your
          repository is uploaded somewhere.
        </p>
      </header>

      <section className={`${shared.wrap} ${styles.stepsWrap}`}>
        {STEPS.map((s) => (
          <div className={styles.step} key={s.num}>
            <span className={styles.stepNum}>{s.num}</span>
            <span className={styles.stepTitle}>{s.title}</span>
            <span className={styles.stepBody}>{s.body}</span>
          </div>
        ))}
      </section>

      <section className={shared.section}>
        <span className={shared.sectionLabel}>THE BOUNDARY</span>
        <div className={`${shared.grid3} ${styles.boundaryGrid}`}>
          <div className={`${shared.cell} ${shared.cellPanel}`}>
            <span className={styles.boundaryLabel}>YOUR MACHINE</span>
            <span className={styles.boundaryFlow}>agent → shimmr → local index</span>
            <span className={shared.cardCopy}>All understanding is computed and stored here.</span>
          </div>
          <div className={`${shared.cell} ${shared.cellPanel} ${styles.boundaryGate}`}>
            <span className={`${styles.boundaryLabel} ${styles.accent}`}>THE GATE</span>
            <span className={styles.boundaryFlow}>account check + meter</span>
            <span className={shared.cardCopy}>Records the tool name and the outcome. Nothing about the work itself.</span>
          </div>
          <div className={`${shared.cell} ${shared.cellPanel} ${styles.boundaryOff}`}>
            <span className={`${styles.boundaryLabel} ${styles.amber}`}>OFF-MACHINE — OPT IN</span>
            <span className={styles.boundaryFlow}>only what you connect</span>
            <span className={shared.cardCopy}>Silent unless you explicitly connect team sync, GitHub, or automations.</span>
          </div>
        </div>
      </section>

      <section className={`${shared.wrap} ${styles.listsWrap}`}>
        <div className={styles.listCol}>
          <div className={styles.listHead}>
            <span className={`${shared.eyebrow} ${styles.accent}`}>LOCAL &amp; FREE FOREVER</span>
          </div>
          {LOCAL.map((item) => (
            <div className={styles.listRow} key={item}>
              <span>{item}</span>
              <span className={styles.tagFree}>FREE</span>
            </div>
          ))}
        </div>
        <div className={styles.listCol}>
          <div className={styles.listHead}>
            <span className={`${shared.eyebrow} ${styles.amber}`}>OPTIONAL &amp; CONNECTED</span>
          </div>
          {CONNECTED.map((item) => (
            <div className={styles.listRow} key={item}>
              <span>{item}</span>
              <span className={styles.tagOptIn}>OPT IN</span>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
