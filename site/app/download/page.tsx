import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";
import CopyButton from "../CopyButton";
import { pageMetadata } from "../seo";
import { INSTALL_UNIX, INSTALL_WINDOWS } from "../install-commands";
import shared from "../marketing.module.css";
import styles from "./download.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Download — Shimmr",
  description: "One binary, no dependencies. Install Shimmr, then shimmr signup creates your account — no separate signup step first.",
  path: "/download",
});

export default function Download() {
  return (
    <div className={shared.page}>
      <SiteNav active="/download" />

      <header className={shared.hero}>
        <span className={shared.eyebrow}>DOWNLOAD</span>
        <h1 className={shared.h1}>Get Shimmr running in about two minutes.</h1>
        <p className={shared.subhead}>
          One binary, no dependencies. Installing it is the first step —
          there&apos;s no separate signup form to fill out before that.{" "}
          <code className={styles.inlineCode}>shimmr signup</code> is what
          creates your account, and it opens a browser back here to confirm
          your email once you run it.
        </p>
      </header>

      <section className={`${shared.wrap} ${styles.osGrid}`}>
        <div className={styles.terminal}>
          <div className={styles.terminalBar}>
            <span>MACOS / LINUX</span>
            <CopyButton text={INSTALL_UNIX} />
          </div>
          <div className={styles.terminalBody}>
            <div>
              <code className={styles.prompt}>$</code> <code>{INSTALL_UNIX}</code>
            </div>
          </div>
        </div>

        <div className={styles.terminal}>
          <div className={styles.terminalBar}>
            <span>WINDOWS (POWERSHELL)</span>
            <CopyButton text={INSTALL_WINDOWS} />
          </div>
          <div className={styles.terminalBody}>
            <div>
              <code className={styles.prompt}>$</code> <code>{INSTALL_WINDOWS}</code>
            </div>
          </div>
        </div>
      </section>

      <section className={shared.section}>
        <span className={shared.sectionLabel}>THEN, EITHER MACHINE</span>
        <div className={styles.terminal}>
          <div className={styles.terminalBody}>
            <div><code className={styles.prompt}>$</code> <code>shimmr signup</code></div>
            <div className={styles.terminalMuted}>→ opens a browser, one click to confirm your email — creates your account</div>
            <div><code className={styles.prompt}>$</code> <code>shimmr init</code></div>
            <div className={styles.terminalMuted}>→ shows every config file it wants to change, then applies it</div>
            <div><code className={styles.prompt}>$</code> <code>shimmr doctor</code></div>
            <div className={styles.terminalOk}>→ confirms the whole setup actually works, end to end</div>
          </div>
        </div>
        <p className={styles.note}>
          Already have an account and just adding a second machine? Run{" "}
          <code className={styles.inlineCode}>shimmr login</code> instead of{" "}
          <code className={styles.inlineCode}>shimmr signup</code> — same
          browser confirmation, attaches to your existing account.
        </p>
      </section>

      <section className={`${shared.section} ${styles.ctaSection}`}>
        <p className={shared.subhead}>
          Already installed and signed in somewhere?{" "}
          <Link href="/login" className={styles.inlineLink}>Sign in</Link> to
          see your dashboard, or read{" "}
          <Link href="/how-it-works" className={styles.inlineLink}>how it works</Link>{" "}
          first.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
