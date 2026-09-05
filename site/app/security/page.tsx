import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import Bloom from "../Bloom";
import { CheckIcon, XIcon } from "../icons";
import shared from "../marketing.module.css";
import styles from "./security.module.css";

export const metadata: Metadata = {
  title: "Security — Shimmr",
  description: "No code, file content, or query text ever leaves your machine. Here's exactly what we do and don't record, and why.",
};

const WE_LOG = [
  "Which tool was called, and how many times",
  "Whether the call succeeded or failed",
  "How long it took",
  "A repository, as a per-machine salted hash — never its name",
];

const WE_NEVER_LOG = [
  "Your source code, in any form",
  "File paths or repository names",
  "Symbol names",
  "Tool arguments or query text",
];

export default function Security() {
  return (
    <div className={shared.page}>
      <Bloom />
      <SiteNav active="/security" />

      <div className={shared.wrap}>
        <header className={shared.hero}>
          <span className={shared.badge}>
            <span className={shared.badgeDot} />
            <span className={shared.badgeLabel}>Security</span>
          </span>
          <h1 className={shared.headline}>Built to be trusted with your code.</h1>
          <p className={shared.subhead}>
            No code, file content, or query text ever leaves your machine.
            That&apos;s not a policy we promise to follow — it&apos;s a
            constraint the usage log has no field to violate.
          </p>
        </header>

        <section className={shared.section}>
          <div className={shared.grid2}>
            <div className={`${styles.column} ${styles.columnYes}`}>
              <span className={styles.columnLabel}>What we ever record</span>
              <ul className={styles.list}>
                {WE_LOG.map((item) => (
                  <li key={item} className={styles.listItem}>
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${styles.column} ${styles.columnNo}`}>
              <span className={styles.columnLabel}>What we never see</span>
              <ul className={styles.list}>
                {WE_NEVER_LOG.map((item) => (
                  <li key={item} className={styles.listItem}>
                    <XIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={shared.section}>
          <div className={shared.sectionLabelRow}>
            <span className={`${shared.sectionLabelLine} ${shared.left}`} />
            <span className={shared.sectionLabel}>What that means in practice</span>
            <span className={`${shared.sectionLabelLine} ${shared.right}`} />
          </div>
          <div className={shared.grid3}>
            <div className={shared.card}>
              <span className={shared.eyebrow}>Local by default</span>
              <h3 className={shared.cardTitle}>Nothing to opt out of</h3>
              <p className={shared.cardCopy}>
                Indexing, search, and the usage log itself run entirely on
                your machine. No account is required for any of it.
              </p>
            </div>
            <div className={shared.card}>
              <span className={shared.eyebrow}>Fails safe</span>
              <h3 className={shared.cardTitle}>Degrades to free, never to broken</h3>
              <p className={shared.cardCopy}>
                A missing config or an account problem never takes away a
                working code tool — it just falls back to the free tier.
              </p>
            </div>
            <div className={shared.card}>
              <span className={shared.eyebrow}>Verifiable, not just stated</span>
              <h3 className={shared.cardTitle}>Every claim above, tested</h3>
              <p className={shared.cardCopy}>
                &quot;Nothing leaves your machine&quot; is backed by a real
                test in this project&apos;s own suite — not left as an
                assertion in a doc no one checks.
              </p>
            </div>
          </div>
        </section>

        <section className={`${shared.section} ${styles.ctaSection}`}>
          <p className={shared.sectionLead}>
            Numbers that reach a sales conversation ship with their method
            visible, too — see it in <code className={styles.codeInline}>shimmr stats --method</code>.
          </p>
          <div className={shared.ctaRow}>
            <a href="/signup" className={shared.cta}>Get started</a>
            <a href="/use-it" className={shared.ctaGhost}>See what you get</a>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
