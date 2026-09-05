import styles from "./bloom.module.css";

/** The soft, blurred colour field behind glass — the constant across every
 * page on the site. Purely decorative: aria-hidden, no pointer events. */
export default function Bloom() {
  return (
    <>
      <div aria-hidden className={styles.bloom}>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
      </div>
      <div aria-hidden className={styles.wash} />
      <div aria-hidden className={styles.vignette} />
    </>
  );
}
