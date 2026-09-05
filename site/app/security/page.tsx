import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import shared from "../marketing.module.css";
import styles from "./security.module.css";

export const metadata: Metadata = {
  title: "Security — Shimmr",
  description: "No code, file content, or query text ever leaves your machine. Here's exactly what we do and don't record, and why.",
};

const RECORDED = [
  "Which tool was called, and how many times",
  "Whether it succeeded or failed",
  "How long it took",
  "A repository, identified only as a per-machine hash — never its name",
];

const NEVER = [
  "Source code, in any form",
  "File paths or repository names",
  "Symbol names",
  "Tool arguments or query text",
];

export default function Security() {
  return (
    <div className={shared.page}>
      <SiteNav active="/security" />

      <header className={shared.hero}>
        <span className={shared.eyebrow}>SECURITY</span>
        <h1 className={shared.h1}>No code, file content, or query text ever leaves the machine.</h1>
        <p className={shared.subhead}>
          That is the whole promise. Below is exactly what is recorded, and
          exactly what never is.
        </p>
      </header>

      <section className={shared.section}>
        <div className={styles.pairGrid}>
          <div className={`${styles.column} ${styles.columnYes}`}>
            <div className={styles.columnHead}>EVER RECORDED</div>
            <div className={styles.columnBody}>
              {RECORDED.map((item) => <div className={styles.row} key={item}>{item}</div>)}
            </div>
          </div>
          <div className={`${styles.column} ${styles.columnNo}`}>
            <div className={`${styles.columnHead} ${styles.columnHeadNo}`}>NEVER RECORDED</div>
            <div className={styles.columnBody}>
              {NEVER.map((item) => <div className={styles.row} key={item}>{item}</div>)}
            </div>
          </div>
        </div>
      </section>

      <section className={shared.section}>
        <span className={shared.sectionLabel}>ONE ACTUAL RECORD, IN FULL</span>
        <div className={styles.record}>
          <div>{"{ "}<span className={styles.recKey}>&quot;tool&quot;</span>: <span className={styles.recVal}>&quot;search.semantic&quot;</span>, <span className={styles.recKey}>&quot;ok&quot;</span>: <span className={styles.recVal}>true</span>, <span className={styles.recKey}>&quot;dur_ms&quot;</span>: <span className={styles.recVal}>142</span>,</div>
          <div className={styles.recIndent}><span className={styles.recKey}>&quot;repo&quot;</span>: <span className={styles.recVal}>&quot;h:9f31c8ad&quot;</span> <span className={styles.recComment}>{"// per-machine hash, never the name"}</span> {"}"}</div>
        </div>
        <p className={styles.recordNote}>That is the entire shape of it — no arguments, no paths, no symbols, no text.</p>
      </section>

      <section className={`${shared.section} ${styles.cardsSection}`}>
        <div className={shared.cardGrid}>
          <div className={shared.cardCell}>
            <span className={shared.label}>FAILS OPEN, NEVER SHUT</span>
            <p className={styles.copy}>A missing config or an account problem degrades to the free tier. It never breaks a working tool.</p>
          </div>
          <div className={shared.cardCell}>
            <span className={shared.label}>TESTED, NOT ASSERTED</span>
            <p className={styles.copy}>That fallback is backed by an automated test in the build, not just a stated policy.</p>
            <span className={styles.testLine}>degrade_to_free_tier · passing</span>
          </div>
          <div className={shared.cardCell}>
            <span className={shared.label}>NUMBERS COME WITH METHOD</span>
            <p className={styles.copy}>Any figure used externally has its measurement method available on request.</p>
          </div>
          <div className={shared.cardCell}>
            <span className={`${shared.label} ${styles.muted}`}>WHAT&apos;S UNDER IT</span>
            <p className={styles.copy}>If you need to know what a given install is running, ask the install:</p>
            <span className={styles.cmd}>$ shimmr licenses</span>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
