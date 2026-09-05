"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CallsChart, ToolsChart, bucketDaily, topTools, type UsageLogEntry } from "./charts";
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
type OrgTool = { tool: string; calls: number };

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

const MAX_LOG = 2000;
const RANGES = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardLive({
  userId,
  email,
  orgName,
  initialTotals,
  initialReportingCount,
  initialEvents,
  initialUsageLog,
  installs,
  org,
  orgTools,
}: {
  userId: string;
  email: string;
  orgName: string | null;
  initialTotals: Totals;
  initialReportingCount: number;
  initialEvents: RecentEvent[];
  initialUsageLog: UsageLogEntry[];
  installs: Install[];
  org: OrgTotals | null;
  orgTools: OrgTool[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [usageLog, setUsageLog] = useState(initialUsageLog);
  const [reportingCount, setReportingCount] = useState(initialReportingCount);
  const [range, setRange] = useState<RangeKey>("30d");
  const [sinceOpened, setSinceOpened] = useState(0);
  // Re-render periodically so relative timestamps keep advancing without a refresh.
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
          setReportingCount((n) => Math.max(n, 1));
          setSinceOpened((n) => n + 1);
          setEvents((prev) => [
            { id: row.id, tool: row.tool, kind: row.kind, ok: row.ok, occurred_at: row.occurred_at },
            ...prev,
          ].slice(0, 20));
          setUsageLog((prev) => [{ occurred_at: row.occurred_at, tool: row.tool, ok: row.ok }, ...prev].slice(0, MAX_LOG));
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

  const rangeDef = RANGES.find((r) => r.key === range) ?? RANGES[1];
  const daily = useMemo(() => bucketDaily(usageLog, rangeDef.days), [usageLog, rangeDef.days]);
  const tools = useMemo(() => topTools(usageLog, 6), [usageLog]);
  const callsToday = daily.find((d) => d.date === todayKey());
  const callsTodayCount = callsToday ? callsToday.ok + callsToday.failed : 0;

  const liveLabel =
    reportingCount === 0 ? "no machine reporting" : reportingCount === 1 ? "1 machine reporting now" : `${reportingCount} machines reporting now`;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>DASHBOARD</span>
          <span className={styles.title}>{email}</span>
          {orgName && <span className={styles.orgLine}>org · {orgName}</span>}
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.livePill} ${reportingCount > 0 ? styles.livePillOn : ""}`}>
            <span className={`${styles.pulseDot} ${reportingCount > 0 ? styles.pulseDotOn : ""}`} />
            {liveLabel}
          </span>
          <Link href="/download" className={styles.download}>+ machine</Link>
          <form action="/auth/signout" method="post">
            <button className={styles.signout} type="submit">sign out</button>
          </form>
        </div>
      </header>

      {installs.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyEyebrow}>NOTHING CONNECTED YET</span>
          <div className={styles.emptyTitle}>No machine is reporting. Run this where your agent runs.</div>
          <code className={styles.emptyCmd}>$ shimmr init</code>
          <p className={styles.emptyNote}>
            Don&apos;t have the binary?{" "}
            <Link href="/download">get the installer</Link> —
            then <code>shimmr doctor</code> to verify.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>TOOL CALLS</span>
              <span className={styles.statVal}>{initialTotals.calls.toLocaleString()}</span>
              <span className={styles.statDelta}>+{callsTodayCount} today</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>REPOS</span>
              <span className={styles.statVal}>{initialTotals.repos.toLocaleString()}</span>
              <span className={styles.statDeltaMuted}>as of last sync</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>FILES</span>
              <span className={styles.statVal}>{initialTotals.files.toLocaleString()}</span>
              <span className={styles.statDeltaMuted}>as of last sync</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>LINES COVERED</span>
              <span className={styles.statVal}>{initialTotals.lines.toLocaleString()}</span>
              <span className={styles.statDeltaMuted}>method on request</span>
            </div>
          </div>

          <p className={styles.sinceOpened}>
            Since you opened this page: <strong>{sinceOpened}</strong> call{sinceOpened === 1 ? "" : "s"}.
          </p>

          <div className={styles.chartGrid}>
            <CallsChart
              data={daily}
              ranges={RANGES.map((r) => ({ label: r.label, active: r.key === range, onSelect: () => setRange(r.key) }))}
              className={styles.gridCell}
            />
            <ToolsChart data={tools} className={styles.gridCell} />
          </div>

          <div className={styles.listGrid}>
            <div className={styles.listPanel}>
              <span className={styles.panelLabel}>MOST RECENT CALLS</span>
              {events.length === 0 ? (
                <div className={styles.feedEmpty}>Nothing yet. This updates the moment your agent makes its first call.</div>
              ) : (
                events.map((e) => (
                  <div className={styles.feedRow} key={e.id}>
                    <span className={`${styles.feedDot} ${e.ok ? "" : styles.feedDotFail}`} />
                    <span className={styles.feedTool}>{e.tool ?? "—"}</span>
                    <span className={e.ok ? styles.feedOk : styles.feedFail}>{e.ok ? "ok" : "failed"}</span>
                    <span className={styles.feedTime}>{relativeTime(e.occurred_at)}</span>
                  </div>
                ))
              )}
            </div>
            <div className={styles.listPanel}>
              <span className={styles.panelLabel}>CONNECTED MACHINES</span>
              {installs.map((i) => (
                <div className={styles.machineRow} key={i.id}>
                  <span className={styles.machineName}>{i.id}</span>
                  <span className={styles.machineMeta}>added {relativeTime(i.created_at)}</span>
                  <span className={styles.machineMeta}>
                    {i.last_seen_at ? `last seen ${relativeTime(i.last_seen_at)}` : "never synced"}
                  </span>
                  <span className={`${styles.machineTag} ${i.revoked_at ? styles.machineTagOff : styles.machineTagOn}`}>
                    {i.revoked_at ? "REVOKED" : "ACTIVE"}
                  </span>
                </div>
              ))}
              <p className={styles.machineNote}>
                revoking a machine stops its reporting immediately; local tools keep working on the free tier.
              </p>
            </div>
          </div>

          {org && (
            <div className={styles.orgPanel}>
              <div className={styles.orgBox}>
                <div className={styles.orgHead}>
                  <span className={styles.orgHeadLabel}>{org.org_name.toUpperCase()} — ORG AGGREGATE</span>
                  <span className={styles.orgHeadNote}>NEVER BROKEN DOWN BY TEAMMATE</span>
                </div>
                <div className={styles.orgBody}>
                  <div className={styles.orgTotals}>
                    <span className={styles.orgTotal}>
                      calls
                      <strong>{org.calls.toLocaleString()}</strong>
                    </span>
                    <span className={styles.orgTotal}>
                      people
                      <strong>{org.people.toLocaleString()}</strong>
                    </span>
                    <span className={styles.orgTotal}>
                      repos
                      <strong>{org.repos.toLocaleString()}</strong>
                    </span>
                  </div>
                  <div className={styles.orgTools}>
                    <ToolsChart data={orgTools} title={`${org.org_name} — top tools`} color="amber" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
