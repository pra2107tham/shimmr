import SiteNav from "../SiteNav";
import shared from "../loading.module.css";
import formStyles from "../auth-form.module.css";

// SiteNav needs no per-request data (its own auth state is a client-side
// check — see NavAuthLinks.tsx), so it's safe to render here too: the nav
// bar stays put across the transition instead of flickering out while the
// page checks the pairing code server-side.
export default function CliAuthLoading() {
  return (
    <div className={formStyles.page}>
      <SiteNav />
      <div className={formStyles.center}>
        <div className={shared.wrap}>
          <span className={shared.dot} />
          checking your pairing code…
        </div>
      </div>
    </div>
  );
}
