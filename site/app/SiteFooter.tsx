import styles from "./sitefooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerRule} />
      <p className={styles.footerText}>Shimmr — built by Pratham Shirbhate. © 2026</p>
    </footer>
  );
}
