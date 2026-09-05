// Hand-rolled, dependency-free charts — plain divs sized with inline
// percentages rather than a charting library. The whole site ships as one
// static-binary-adjacent Next.js app with no runtime dependency it doesn't
// need; a few flex bars don't earn a new package.

import styles from "./charts.module.css";

export type DailyCalls = { date: string; ok: number; failed: number };
export type ToolCount = { tool: string; calls: number };

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short" });

export function CallsChart({ data }: { data: DailyCalls[] }) {
  const max = Math.max(1, ...data.map((d) => d.ok + d.failed));
  const total = data.reduce((n, d) => n + d.ok + d.failed, 0);

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Calls, last {data.length} days</span>
        <span className={styles.cardTotal}>{total.toLocaleString()}</span>
      </div>
      {total === 0 ? (
        <div className={styles.chartEmpty}>Nothing in this window yet.</div>
      ) : (
        <div className={styles.bars}>
          {data.map((d) => {
            const okPct = (d.ok / max) * 100;
            const failPct = (d.failed / max) * 100;
            const dayCount = d.ok + d.failed;
            return (
              <div className={styles.barCol} key={d.date}>
                <div className={styles.barTrack} title={`${d.date}: ${dayCount} call${dayCount === 1 ? "" : "s"}`}>
                  {d.failed > 0 && <div className={styles.barFail} style={{ height: `${failPct}%` }} />}
                  <div className={styles.barOk} style={{ height: `${okPct}%` }} />
                </div>
                <span className={styles.barLabel}>{DAY_LABEL.format(new Date(d.date + "T00:00:00Z"))[0]}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ToolsChart({ data, title = "Top tools" }: { data: ToolCount[]; title?: string }) {
  const top = [...data].sort((a, b) => b.calls - a.calls).slice(0, 6);
  const max = Math.max(1, ...top.map((t) => t.calls));

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{title}</span>
      </div>
      {top.length === 0 ? (
        <div className={styles.chartEmpty}>Nothing called yet.</div>
      ) : (
        <div className={styles.hbars}>
          {top.map((t) => (
            <div className={styles.hbarRow} key={t.tool}>
              <span className={styles.hbarLabel}>{t.tool}</span>
              <div className={styles.hbarTrack}>
                <div className={styles.hbarFill} style={{ width: `${(t.calls / max) * 100}%` }} />
              </div>
              <span className={styles.hbarCount}>{t.calls.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
