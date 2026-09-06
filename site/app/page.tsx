import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";
import { MailIcon, PhoneIcon, LinkedInIcon } from "./icons";
import { contacts } from "./content";
import { pageMetadata, SITE_URL } from "./seo";
import { INSTALL_UNIX, INSTALL_WINDOWS } from "./install-commands";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";
import CopyButton from "./CopyButton";
import LinkPending from "./LinkPending";
import TokensSavedCounter from "./TokensSavedCounter";

export const metadata: Metadata = pageMetadata({
  title: "Shimmr — coming soon",
  description:
    "A coding agent's only memory of your system is its context window — so it re-reads your repo to find things, pays for that reading on every turn, loses it when the session runs long, and never sees your other repositories at all. Shimmr keeps the index outside the window: built once, on your machine, across every repo. Works with Claude Code, Cursor and Windsurf.",
  path: "/",
});

// Honest fields only: no aggregateRating or review — this product has
// neither yet, and inventing either is exactly the kind of number that
// falls apart the moment someone checks it (see CLAUDE.md on that).
// "Free, forever" for the local tier is the one claim this schema makes
// about price, and it's the one this whole product is actually built on.
const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Shimmr",
  description:
    "A local-first context layer for AI coding agents. The index of your repositories is built once on your machine and kept outside the model's context window, so it survives a long session and spans every repository you index.",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Everything that runs on your machine is free, forever.",
  },
};

const icons = { mail: MailIcon, phone: PhoneIcon, linkedin: LinkedInIcon };

const LOCAL = ["code understanding & indexing", "semantic search", "coverage measurement", "the usage log itself"];
const CONNECTED = ["team sync — usage in one place", "GitHub issues & PRs as context", "scheduled automations", "multi-seat team visibility"];

// One root cause — the context window is the agent's only memory of your
// system — and the four things that follow from it, in the order a team
// actually feels them. Every line is mechanism, not measurement: none of it
// depends on a number we have not measured. The tokens-saved band is the
// only quantity on this page, and it ships with its method.
const COST = [
  {
    num: "01",
    title: "It reads to find out where things are.",
    copy: "An agent with no map locates code by opening it — list the directory, grep a name, read the file, then read the file that one imports. All of that is spent before the actual work starts.",
  },
  {
    num: "02",
    title: "Every turn re-sends the search.",
    copy: "A model has no memory between turns, so the transcript so far goes back in each time. The files opened on turn three are still in the prompt on turn twenty, charged again on every turn in between.",
  },
  {
    num: "03",
    title: "And then it forgets anyway.",
    copy: "Once the session runs long the history is compacted, and what the agent worked out an hour ago goes with it. So it greps for the same function again — deep in the task, when it has the most context about your intent and the least room left to go looking.",
  },
  {
    num: "04",
    title: "Your system is not one repository.",
    copy: "An agent is rooted in the directory it was started in. When the caller that breaks lives in the service next door, it cannot read it, cannot grep it, and will tell you the function has no callers.",
  },
] as const;

const TEASERS = [
  {
    href: "/how-it-works",
    num: "01",
    label: "HOW IT WORKS",
    title: "One binary, your existing agent, one gate.",
    copy: "The real mechanism, in four steps.",
  },
  {
    href: "/use-it",
    num: "02",
    label: "USE IT",
    title: "Code graph, semantic search, coverage.",
    copy: "What it gives you today, and the three commands.",
  },
  {
    href: "/security",
    num: "03",
    label: "SECURITY",
    title: "No code, content or query text leaves.",
    copy: "Exactly what is recorded — and what never is.",
  },
] as const;

export default function Home() {
  return (
    <div className={styles.page}>
      {/* Static, build-time JSON we generate ourselves — nothing here comes
          from user input. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <SiteNav active="/" />

      <header className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.eyebrow}>THE CONTEXT LAYER</div>
          <h1 className={styles.headline}>Your agent re-reads your codebase every session, and still can&apos;t see the repo next door.</h1>
          <p className={styles.subhead}>
            An agent&apos;s only memory of your system is its context window. So
            it finds code by reading it, pays for that reading again on every
            turn, and loses what it found once the session runs long — and the
            other repositories were never in scope at all. Shimmr puts the
            index outside the window: built once, on your machine, still there
            on turn 300, across every repository you have indexed.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/download" className={styles.cta}>get started<LinkPending /></Link>
            <Link href="/login" className={styles.ctaGhost}>sign in<LinkPending /></Link>
          </div>
          <div className={styles.statusLine}>
            <span className={styles.statusDot} />
            early · coming soon · actively being built
          </div>
        </div>

        <div className={styles.terminal}>
          <div className={styles.terminalBar}>TWO MINUTES, START TO GATED</div>
          <div className={styles.terminalBody}>
            <div><span className={styles.prompt}>$</span> <code>shimmr signup</code></div>
            <div className={styles.terminalMuted}>→ browser opens, email confirmed</div>
            <div><span className={styles.prompt}>$</span> <code>shimmr init</code></div>
            <div className={styles.terminalMuted}>→ 2 config files shown, then applied</div>
            <div><span className={styles.prompt}>$</span> <code>shimmr doctor</code></div>
            <div className={styles.terminalOk}>→ all checks passed</div>
          </div>
        </div>
      </header>

      <section className={styles.problem}>
        <div className={styles.eyebrow}>WHY IT GETS EXPENSIVE, AND THEN GETS WORSE</div>
        <div className={styles.problemGrid}>
          {COST.map((c) => (
            <div className={styles.problemCell} key={c.num}>
              <span className={styles.problemNum}>{c.num}</span>
              <h3 className={styles.problemTitle}>{c.title}</h3>
              <p className={styles.problemCopy}>{c.copy}</p>
            </div>
          ))}
        </div>
        <p className={styles.problemNote}>
          Shimmr replaces the reading with a lookup. The index is built once,
          locally, and lives outside the context window — so what the agent
          never read is never re-sent, what it found on turn 3 is still there
          on turn 300, and a question about twelve services is answered like a
          question about one. It works with Claude Code, Cursor and Windsurf.
        </p>
      </section>

      {/* Renders nothing at all — band, padding and rule included — until
          there is a real, non-zero number to show. */}
      <TokensSavedCounter className={styles.savedSection} />

      <section className={styles.downloadSection}>
        <div className={styles.eyebrow}>GET SHIMMR</div>
        <h2 className={styles.splitHeading}>One binary, on your machine, in about two minutes.</h2>
        <div className={styles.downloadGrid}>
          <div className={styles.terminal}>
            <div className={styles.terminalBar}>
              <span>MACOS / LINUX</span>
              <CopyButton text={INSTALL_UNIX} />
            </div>
            <div className={styles.terminalBody}>
              <div><span className={styles.prompt}>$</span> <code>{INSTALL_UNIX}</code></div>
            </div>
          </div>
          <div className={styles.terminal}>
            <div className={styles.terminalBar}>
              <span>WINDOWS (POWERSHELL)</span>
              <CopyButton text={INSTALL_WINDOWS} />
            </div>
            <div className={styles.terminalBody}>
              <div><span className={styles.prompt}>$</span> <code>{INSTALL_WINDOWS}</code></div>
            </div>
          </div>
        </div>
        <p className={styles.downloadNote}>
          Then <code>shimmr signup</code>, <code>shimmr init</code>,{" "}
          <code>shimmr doctor</code>. Full walkthrough, including adding a
          second machine, on the{" "}
          <Link href="/download" className={styles.downloadLink}>download page</Link>.
        </p>
      </section>

      <section className={styles.split}>
        <div className={styles.splitCol}>
          <div className={styles.splitLabel}>
            <span className={`${styles.dot} ${styles.dotAccent}`} />
            <span className={styles.splitLabelText}>FREE, FOREVER</span>
          </div>
          <h2 className={styles.splitHeading}>Everything that runs on your machine.</h2>
          <div className={styles.splitList}>
            {LOCAL.map((item) => <div key={item}>{item}</div>)}
          </div>
        </div>
        <div className={`${styles.splitCol} ${styles.splitColRight}`}>
          <div className={styles.splitLabel}>
            <span className={`${styles.dot} ${styles.dotAmber}`} />
            <span className={`${styles.splitLabelText} ${styles.amber}`}>PAID ONLY WHEN CONNECTED</span>
          </div>
          <h2 className={styles.splitHeading}>You pay once you connect something outside it.</h2>
          <div className={styles.splitList}>
            {CONNECTED.map((item) => <div key={item}>{item}</div>)}
          </div>
        </div>
      </section>

      <section className={styles.teasers}>
        {TEASERS.map((t) => (
          <Link href={t.href} key={t.href} className={styles.teaser}>
            <span className={styles.teaserLabel}>{t.num} / {t.label}</span>
            <h3 className={styles.teaserTitle}>{t.title}</h3>
            <span className={styles.teaserCopy}>{t.copy}</span>
          </Link>
        ))}
      </section>

      <section className={styles.contact}>
        <div className={styles.contactCol}>
          <div className={styles.eyebrow}>REACH OUT DIRECTLY</div>
          <h2 className={styles.contactHeading}>No form, no waitlist. Mail or call and you get a person.</h2>
          <div className={styles.contactList}>
            {contacts.map(({ key, href, label, value, icon, external }) => {
              const Icon = icons[icon];
              return (
                <a
                  key={key}
                  href={href}
                  className={styles.contactRow}
                  {...(external ? { target: "_blank", rel: "noopener" } : {})}
                >
                  <span className={styles.contactKey}>
                    <Icon size={14} /> {label.toLowerCase()}
                  </span>
                  <span className={styles.contactValue}>{value}</span>
                </a>
              );
            })}
          </div>
        </div>
        <div className={styles.plainCard}>
          <div className={styles.eyebrow}>IN PLAIN TERMS</div>
          <p className={styles.plainCopy}>
            Your agent already knows how to call tools. Shimmr is the tool it
            calls to actually understand the repository it&apos;s working in
            — structure, meaning, coverage — with an account attached so
            usage is countable. The understanding is computed locally. The
            account is what makes anything shared possible, later, and only
            if you ask for it.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
