"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
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

export default function DashboardLive({
  userId,
  initialTotals,
  initialReportingLive,
  initialEvents,
  installs,
}: {
  userId: string;
  initialTotals: Totals;
  initialReportingLive: boolean;
  initialEvents: RecentEvent[];
  installs: Install[];
}) {
  const [events, setEvents] = useState(initialEvents);
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
        page load — refresh to fold live activity into them.
      </p>

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
