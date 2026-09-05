// Hand-rolled, dependency-free charts — plain divs sized with inline
// percentages rather than a charting library. The whole site ships as one
// static-binary-adjacent Next.js app with no runtime dependency it doesn't
// need; a few flex bars don't earn a new package.

import styles from "./charts.module.css";

export type UsageLogEntry = { occurred_at: string; tool: string | null; ok: boolean };
export type DailyCalls = { date: string; ok: number; failed: number };
export type ToolCount = { tool: string; calls: number };

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Every day in the window, oldest first, zero-filled — a day with no
 * calls is a real, visible zero bar, not a gap that shifts every other
 * bar sideways. */
export function bucketDaily(log: UsageLogEntry[], days: number): DailyCalls[] {
  const buckets = new Map<string, DailyCalls>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const date = d.toISOString().slice(0, 10);
    buckets.set(date, { date, ok: 0, failed: 0 });
  }
  for (const e of log) {
    const bucket = buckets.get(dayKey(e.occurred_at));
    if (!bucket) continue; // outside the window
    if (e.ok) bucket.ok += 1;
    else bucket.failed += 1;
  }
  return Array.from(buckets.values());
}

export function topTools(log: UsageLogEntry[], limit = 6): ToolCount[] {
  const counts = new Map<string, number>();
  for (const e of log) {
    if (!e.tool) continue;
    counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1);
  }
  return Array.from(counts, ([tool, calls]) => ({ tool, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, limit);
}

export function CallsChart({
  data,
  ranges,
  className,
}: {
  data: DailyCalls[];
  ranges?: { label: string; active: boolean; onSelect: () => void }[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.ok + d.failed));
  const total = data.reduce((n, d) => n + d.ok + d.failed, 0);

  return (
    <div className={`${styles.panel} ${className ?? ""}`}>
      <div className={styles.panelHead}>
        <span className={styles.panelLabel}>USAGE OVER TIME</span>
        {ranges && (
          <span className={styles.rangeRow}>
            {ranges.map((r) => (
              <button key={r.label} type="button" className={`${styles.rangeBtn} ${r.active ? styles.rangeBtnActive : ""}`} onClick={r.onSelect}>
                {r.label}
              </button>
            ))}
          </span>
        )}
      </div>
      <div className={styles.bars}>
        {data.map((d) => {
          const okPct = (d.ok / max) * 100;
          const failPct = (d.failed / max) * 100;
          const dayCount = d.ok + d.failed;
          return (
            <div className={styles.barCol} key={d.date} title={`${d.date}: ${dayCount} call${dayCount === 1 ? "" : "s"}`}>
              <div className={styles.barTrack}>
                {d.failed > 0 && <div className={styles.barFail} style={{ height: `${failPct}%` }} />}
                <div className={styles.barOk} style={{ height: `${okPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.panelFoot}>
        <span>{data[0]?.date}</span>
        <span className={styles.panelTotal}>{total.toLocaleString()} calls</span>
      </div>
    </div>
  );
}

export function ToolsChart({
  data,
  title = "WHICH TOOLS, HOW OFTEN",
  color,
  className,
}: {
  data: ToolCount[];
  title?: string;
  color?: "accent" | "amber";
  className?: string;
}) {
  const max = Math.max(1, ...data.map((t) => t.calls));

  return (
    <div className={`${styles.panel} ${className ?? ""}`}>
      <div className={styles.panelHead}>
        <span className={styles.panelLabel}>{title}</span>
      </div>
      {data.length === 0 ? (
        <div className={styles.empty}>Nothing called yet.</div>
      ) : (
        <div className={styles.toolList}>
          {data.map((t) => (
            <div className={styles.toolRow} key={t.tool}>
              <div className={styles.toolLine}>
                <span className={styles.toolName}>{t.tool}</span>
                <span className={styles.toolCount}>{t.calls.toLocaleString()}</span>
              </div>
              <div className={styles.toolTrack}>
                <div className={`${styles.toolFill} ${color === "amber" ? styles.toolFillAmber : ""}`} style={{ width: `${(t.calls / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
