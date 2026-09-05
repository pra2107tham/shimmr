import Link from "next/link";
import { contacts } from "./content";
import styles from "./sitefooter.module.css";

const email = contacts.find((c) => c.key === "email")!;

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>built by Pratham Shirbhate · © 2026 Shimmr</span>
        <span className={styles.links}>
          <Link href="/how-it-works">how it works</Link>
          <Link href="/use-it">use it</Link>
          <Link href="/security">security</Link>
          <a href={email.href}>{email.value}</a>
        </span>
      </div>
    </footer>
  );
}
