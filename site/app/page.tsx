import styles from "./page.module.css";
import { MailIcon, PhoneIcon, LinkedInIcon } from "./icons";
import { contacts, targets } from "./content";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";

const icons = {
  mail: MailIcon,
  phone: PhoneIcon,
  linkedin: LinkedInIcon,
};

export default function Home() {
  return (
    <div className={styles.page}>
      <div aria-hidden className={styles.bloom}>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={`${styles.blob} ${styles.blob4}`} />
      </div>
      <div aria-hidden className={styles.wash} />
      <div aria-hidden className={styles.vignette} />

      <SiteNav active="/" />

      <div className={styles.wrap}>
        <header className={styles.hero}>
          <span className={styles.badge}>
            <span className={styles.badgeDot} />
            <span className={styles.badgeLabel}>Coming soon</span>
          </span>
          <h1 className={styles.headline}>
            The context layer between your <em className={styles.headlineEm}>teams</em>, your{" "}
            <em className={styles.headlineEm}>agents</em>, and everything they run on.
          </h1>
          <p className={styles.subhead}>
            Microservices. Infra. Databases. The agents your team is already wiring in. Shimmr is
            one layer that keeps them all speaking the same language — so context doesn&apos;t
            die at the boundary between them.
          </p>
          <div className={styles.heroCtaRow}>
            <a href="/signup" className={styles.heroCta}>
              Get started
            </a>
            <a href="/login" className={styles.heroCtaGhost}>
              Sign in
            </a>
          </div>
        </header>

        <section className={styles.layerSection}>
          <div className={styles.sectionLabelRow}>
            <span className={`${styles.sectionLabelLine} ${styles.left}`} />
            <span className={styles.sectionLabel}>The layer, shown</span>
            <span className={`${styles.sectionLabelLine} ${styles.right}`} />
          </div>

          <div className={styles.diagram}>
            <div className={styles.agentsRow}>
              <div className={styles.agentsCard}>
                <div className={styles.eyebrow}>Talks to Shimmr</div>
                <div className={styles.nodeTitle}>Agents</div>
                <p className={styles.nodeCopy}>
                  A shared, metered surface for the coding agents your team already runs — one
                  gate, not one integration per tool.
                </p>
              </div>
            </div>

            <div className={styles.flowSingle}>
              <span className={styles.flowLineDown} />
              <span className={styles.flowDot} />
              <span className={styles.flowDotSmall} style={{ animationDelay: "1.7s" }} />
            </div>

            <div className={styles.seam}>
              <div aria-hidden className={styles.seamGradient} />
              <div aria-hidden className={styles.seamGrain} />
              <div aria-hidden className={styles.seamSweep} />
              <div className={styles.seamContent}>
                <span className={styles.seamLabel}>One layer</span>
                <span className={styles.seamTitle}>Shimmr</span>
                <span className={styles.seamLabelRight}>Context passes through</span>
              </div>
            </div>

            <div className={styles.flowTriple}>
              {[0.5, 1.4, 2.3].map((delay) => (
                <div key={delay} className={styles.flowTripleCol}>
                  <span className={styles.flowLineDownFade} />
                  <span className={styles.flowDotFade} style={{ animationDelay: `${delay}s` }} />
                </div>
              ))}
            </div>

            <div className={styles.targetsGrid}>
              {targets.map(({ key, title, copy }) => (
                <div key={key} className={styles.targetCard}>
                  <div className={styles.eyebrowFaint}>Shimmr talks to</div>
                  <div className={styles.targetTitle}>{title}</div>
                  <p className={styles.nodeCopy}>{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.contact}>
          <h2 className={styles.contactTitle}>Building this. Want in early?</h2>
          <p className={styles.contactLead}>Reach out directly — no form, no waitlist bot.</p>
          <div className={styles.contactRow}>
            {contacts.map(({ key, href, label, value, icon, external }) => {
              const Icon = icons[icon];
              return (
                <a
                  key={key}
                  href={href}
                  className={styles.contactPill}
                  {...(external ? { target: "_blank", rel: "noopener" } : {})}
                >
                  <span className={styles.contactIcon}>
                    <Icon size={16} />
                  </span>
                  <span className={styles.contactLabelStack}>
                    <span className={styles.contactKey}>{label}</span>
                    <span className={styles.contactValue}>{value}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </section>

      </div>
      <SiteFooter />
    </div>
  );
}
