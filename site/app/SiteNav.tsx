import Link from "next/link";
import styles from "./sitenav.module.css";

const PAGES = [
  { href: "/how-it-works", label: "how it works" },
  { href: "/use-it", label: "use it" },
  { href: "/security", label: "security" },
] as const;

type PageKey = (typeof PAGES)[number]["href"] | "/";

/** The nav bar every marketing page shares — wordmark, page links, sign in,
 * get started. `active` underlines the current page. Not used on the
 * dashboard, which has its own header (signed-in context, not marketing). */
export default function SiteNav({ active }: { active?: PageKey }) {
  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} />
          <span className={styles.wordmark}>shimmr</span>
          <span className={styles.badge}>EARLY</span>
        </Link>

        <div className={styles.links}>
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={styles.link}
              style={{
                color: active === p.href ? "var(--ink)" : undefined,
                borderBottomColor: active === p.href ? "var(--accent)" : "transparent",
              }}
            >
              {p.label}
            </Link>
          ))}
          <Link href="/login" className={styles.signIn}>
            sign in
          </Link>
          <Link href="/signup" className={styles.cta}>
            get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
