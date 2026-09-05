import Link from "next/link";
import styles from "./page.module.css";
import { MailIcon, PhoneIcon, LinkedInIcon } from "./icons";
import { contacts } from "./content";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";

const icons = { mail: MailIcon, phone: PhoneIcon, linkedin: LinkedInIcon };

const LOCAL = ["code understanding & indexing", "semantic search", "coverage measurement", "the usage log itself"];
const CONNECTED = ["team sync — usage in one place", "GitHub issues & PRs as context", "scheduled automations", "multi-seat team visibility"];

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
      <SiteNav active="/" />

      <header className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.eyebrow}>THE CONTEXT LAYER</div>
          <h1 className={styles.headline}>Between AI coding agents and everything they run on.</h1>
          <p className={styles.subhead}>
            Shimmr is a local-first tool that gives coding agents real
            understanding of a codebase — plus an account layer and usage
            metering. It runs on your machine, and by default nothing leaves
            it.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/signup" className={styles.cta}>get started</Link>
            <Link href="/login" className={styles.ctaGhost}>sign in</Link>
          </div>
          <div className={styles.statusLine}>
            <span className={styles.statusDot} />
            early · coming soon · actively being built
          </div>
        </div>

        <div className={styles.terminal}>
          <div className={styles.terminalBar}>TWO MINUTES, START TO GATED</div>
          <div className={styles.terminalBody}>
            <div><span className={styles.prompt}>$</span> shimmr signup</div>
            <div className={styles.terminalMuted}>→ browser opens, email confirmed</div>
            <div><span className={styles.prompt}>$</span> shimmr init</div>
            <div className={styles.terminalMuted}>→ 2 config files shown, then applied</div>
            <div><span className={styles.prompt}>$</span> shimmr doctor</div>
            <div className={styles.terminalOk}>→ all checks passed</div>
          </div>
        </div>
      </header>

      <section className={styles.split}>
        <div className={styles.splitCol}>
          <div className={styles.splitLabel}>
            <span className={`${styles.dot} ${styles.dotAccent}`} />
            <span className={styles.splitLabelText}>FREE, FOREVER</span>
          </div>
          <div className={styles.splitHeading}>Everything that runs on your machine.</div>
          <div className={styles.splitList}>
            {LOCAL.map((item) => <div key={item}>{item}</div>)}
          </div>
        </div>
        <div className={`${styles.splitCol} ${styles.splitColRight}`}>
          <div className={styles.splitLabel}>
            <span className={`${styles.dot} ${styles.dotAmber}`} />
            <span className={`${styles.splitLabelText} ${styles.amber}`}>PAID ONLY WHEN CONNECTED</span>
          </div>
          <div className={styles.splitHeading}>You pay once you connect something outside it.</div>
          <div className={styles.splitList}>
            {CONNECTED.map((item) => <div key={item}>{item}</div>)}
          </div>
        </div>
      </section>

      <section className={styles.teasers}>
        {TEASERS.map((t) => (
          <Link href={t.href} key={t.href} className={styles.teaser}>
            <span className={styles.teaserLabel}>{t.num} / {t.label}</span>
            <span className={styles.teaserTitle}>{t.title}</span>
            <span className={styles.teaserCopy}>{t.copy}</span>
          </Link>
        ))}
      </section>

      <section className={styles.contact}>
        <div className={styles.contactCol}>
          <div className={styles.eyebrow}>REACH OUT DIRECTLY</div>
          <div className={styles.contactHeading}>No form, no waitlist. Mail or call and you get a person.</div>
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
