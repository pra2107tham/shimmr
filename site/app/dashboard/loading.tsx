import shared from "../loading.module.css";
import styles from "./dashboard.module.css";

// The dashboard's own header needs the signed-in user's data, which isn't
// available yet at this point — so this is a plain loading state rather
// than a fake skeleton of a header we'd just be guessing at.
export default function DashboardLoading() {
  return (
    <div className={styles.page}>
      <div className={shared.wrap}>
        <span className={shared.dot} />
        loading your dashboard…
      </div>
    </div>
  );
}
