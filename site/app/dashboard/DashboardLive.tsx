"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CallsChart, ToolsChart, type DailyCalls, type ToolCount } from "./charts";
import styles from "./dashboard.module.css";

type Totals = { calls: number; repos: number; files: number; lines: number };

type RecentEvent = {
  id: number;
  tool: string | null;
  kind: "tool_call" | "index";
  ok: boolean;
  occurred_at: string;
};

type Install = {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

// Matches what my_org_totals() returns — see
// supabase/migrations/20260905020000_org_dashboard.sql.
type OrgTotals = {
  org_id: string;
  org_name: string;
  slug: string;
  people: number;
  installs: number;
  calls: number;
  repos: number;
  files: number;
  lines: number;
};

// The shape of a row as Realtime delivers it — snake_case, straight off the
// usage_events table, not the narrower RecentEvent the initial server fetch
// already trimmed down to.
type UsageEventRow = {
  id: number;
  user_id: string;
  tool: string | null;
  kind: "tool_call" | "index";
  ok: boolean;
  occurred_at: string;
};

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardLive({
  userId,
  initialTotals,
  initialReportingLive,
  initialEvents,
  initialDaily,
  initialTools,
  installs,
  org,
  orgTools,
}: {
  userId: string;
  initialTotals: Totals;
  initialReportingLive: boolean;
  initialEvents: RecentEvent[];
  initialDaily: DailyCalls[];
  initialTools: ToolCount[];
  installs: Install[];
  org: OrgTotals | null;
  orgTools: ToolCount[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [daily, setDaily] = useState(initialDaily);
  const [tools, setTools] = useState(initialTools);
  const [live, setLive] = useState(initialReportingLive);
  const [sinceOpened, setSinceOpened] = useState(0);
  // Re-render periodically so "3s ago" keeps advancing without a refresh.
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`usage_events:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "usage_events",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as UsageEventRow;
          if (row.kind !== "tool_call") return;
          setLive(true);
          setSinceOpened((n) => n + 1);
          setEvents((prev) => [
            { id: row.id, tool: row.tool, kind: row.kind, ok: row.ok, occurred_at: row.occurred_at },
            ...prev,
          ].slice(0, 20));

          // Fold the same event into today's chart bucket and the tool
          // breakdown, rather than waiting on a refresh to see it reflected —
          // the feed above already updates live, so a chart that only moves
          // on reload would look like the two disagreed about what "live"
          // means on the same page.
          const key = todayKey();
          setDaily((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.date !== key) return prev; // window rolled past midnight — next load re-buckets
            const updated = { ...last, ok: last.ok + (row.ok ? 1 : 0), failed: last.failed + (row.ok ? 0 : 1) };
            return [...prev.slice(0, -1), updated];
          });
          if (row.tool) {
            setTools((prev) => {
              const idx = prev.findIndex((t) => t.tool === row.tool);
              if (idx === -1) return [...prev, { tool: row.tool as string, calls: 1 }];
              const next = [...prev];
              next[idx] = { ...next[idx], calls: next[idx].calls + 1 };
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className={styles.statusRow}>
        <span className={`${styles.statusDot} ${live ? styles.live : ""}`} />
        {live ? "Reporting live" : "Not connected yet — run a tool call to see it here"}
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statVal}>{initialTotals.calls.toLocaleString()}</div>
          <div className={styles.statLabel}>Calls</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{initialTotals.repos.toLocaleString()}</div>
          <div className={styles.statLabel}>Repos</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{initialTotals.files.toLocaleString()}</div>
          <div className={styles.statLabel}>Files</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{initialTotals.lines.toLocaleString()}</div>
          <div className={styles.statLabel}>Lines</div>
        </div>
      </div>

      <p className={styles.sinceOpened}>
        Since you opened this page: <strong>{sinceOpened}</strong> call
        {sinceOpened === 1 ? "" : "s"}. The tiles above are as of your last
        page load — refresh to fold live activity into them. The charts
        below update live, same as the feed.
      </p>

      <div className={styles.chartGrid}>
        <CallsChart data={daily} />
        <ToolsChart data={tools} />
      </div>

      {org && (
        <>
          <p className={styles.sectionLabel}>
            {org.org_name} · {org.people} {org.people === 1 ? "person" : "people"}
          </p>
          <div className={styles.orgStats}>
            <div className={styles.orgStat}>
              <div className={styles.orgStatVal}>{org.calls.toLocaleString()}</div>
              <div className={styles.statLabel}>Org calls</div>
            </div>
            <div className={styles.orgStat}>
              <div className={styles.orgStatVal}>{org.installs.toLocaleString()}</div>
              <div className={styles.statLabel}>Org machines</div>
            </div>
            <div className={styles.orgStat}>
              <div className={styles.orgStatVal}>{org.files.toLocaleString()}</div>
              <div className={styles.statLabel}>Org files</div>
            </div>
          </div>
          <div className={styles.chartGrid}>
            <ToolsChart data={orgTools} title={`Top tools across ${org.org_name}`} />
          </div>
          <p className={styles.orgNote}>
            Aggregate only — nothing here shows which teammate made which call.
          </p>
        </>
      )}

      <p className={styles.sectionLabel}>Recent activity</p>
      <div className={styles.feed}>
        {events.length === 0 ? (
          <div className={styles.feedEmpty}>
            Nothing yet. This updates the moment your agent makes its first
            call — no refresh needed.
          </div>
        ) : (
          events.map((e) => (
            <div className={styles.feedRow} key={e.id}>
              <span className={`${styles.feedDot} ${e.ok ? "" : styles.fail}`} />
              <span className={styles.feedTool}>{e.tool ?? "—"}</span>
              <span className={styles.feedTime}>{relativeTime(e.occurred_at)}</span>
            </div>
          ))
        )}
      </div>

      <p className={styles.sectionLabel}>Machines</p>
      <div className={styles.machines}>
        {installs.map((i) => (
          <div className={styles.machine} key={i.id}>
            <span className={styles.machineId}>{i.id}</span>
            <span className={styles.machineSeen}>
              {i.revoked_at
                ? "revoked"
                : i.last_seen_at
                  ? `last seen ${relativeTime(i.last_seen_at)}`
                  : "never synced"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
