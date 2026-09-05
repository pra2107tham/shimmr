import Link from "next/link";
import NavAuthLinks from "./NavAuthLinks";
import styles from "./sitenav.module.css";

const PAGES = [
  { href: "/how-it-works", label: "how it works" },
  { href: "/use-it", label: "use it" },
  { href: "/security", label: "security" },
] as const;

type PageKey = (typeof PAGES)[number]["href"] | "/" | "/download";

/** The nav bar every marketing page shares — wordmark, page links, and
 * either sign-in/get-started or a dashboard link, whichever this browser's
 * session actually calls for (see NavAuthLinks — checked client-side so
 * this stays a plain Server Component and every page using it stays
 * statically generated). `active` underlines the current page. Not used on
 * the dashboard, which has its own header (signed-in context, not
 * marketing). */
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
          <NavAuthLinks />
        </div>
      </div>
    </nav>
  );
}
