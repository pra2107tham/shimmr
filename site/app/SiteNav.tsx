import Link from "next/link";
import { MailIcon, PhoneIcon, LinkedInIcon } from "./icons";
import { contacts } from "./content";
import styles from "./sitenav.module.css";

const icons = { mail: MailIcon, phone: PhoneIcon, linkedin: LinkedInIcon };

const PAGES = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/use-it", label: "Use it" },
  { href: "/security", label: "Security" },
] as const;

type PageKey = (typeof PAGES)[number]["href"] | "/";

/** The nav bar every page on the site shares — wordmark, page links, contact
 * icons, sign in / get started. `active` underlines the current page so
 * moving between them doesn't lose your place. */
export default function SiteNav({ active }: { active?: PageKey }) {
  return (
    <nav className={styles.nav}>
      <div className={styles.navLeft}>
        <Link href="/" className={styles.wordmark}>
          Shimmr
        </Link>
        <span className={styles.statusPill}>
          <span className={styles.liveDot}>
            <span className={styles.liveDotCore} />
            <span className={styles.liveDotRing} />
          </span>
          <span className={styles.statusLabel}>Building</span>
        </span>
      </div>

      <div className={styles.navPages}>
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className={`${styles.navPage} ${active === p.href ? styles.navPageActive : ""}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className={styles.navLinks}>
        <a href="/login" className={styles.navSignIn}>
          Sign in
        </a>
        {contacts.map(({ key, href, value, icon, external }) => {
          const Icon = icons[icon];
          return (
            <a
              key={key}
              href={href}
              title={value}
              className={styles.iconButton}
              {...(external ? { target: "_blank", rel: "noopener" } : {})}
            >
              <Icon />
            </a>
          );
        })}
        <a href="/signup" className={styles.navCta}>
          Get started
        </a>
      </div>
    </nav>
  );
}
