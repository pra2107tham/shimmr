import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Bloom from "../Bloom";
import DashboardLive from "./DashboardLive";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard — Shimmr" };

// Force dynamic: without this, `next build` still tries to prerender this
// page once to see whether it *can* be static, which means running the
// function body — including supabaseServer(), which throws when the env
// vars aren't set. On a fresh Vercel project (before the two manual steps
// in site/README.md are done), that turned a missing env var into a build
// that never ships at all, marketing page included. This page needs a
// per-request session no matter what, so tell Next.js that up front instead
// of letting it find out by running the page.
export const dynamic = "force-dynamic";

// A rollup row per install, source is 'live' (from usage_events) or 'sync'
// (from the older usage_snapshots path) — see install_rollup in
// supabase/migrations/20260903000000_live_events_and_optional_org.sql.
type Rollup = {
  install_id: string;
  source: "live" | "sync";
  calls: number;
  repos: number;
  files: number;
  lines: number;
  last_seen_at: string | null;
};

type Install = {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

type RecentEvent = {
  id: number;
  tool: string | null;
  kind: "tool_call" | "index";
  ok: boolean;
  occurred_at: string;
};

// What my_org_totals()/my_org_tool_usage() return — see
// supabase/migrations/20260905020000_org_dashboard.sql. Aggregate only:
// nothing here says which teammate made which call, by design (ADR 0011).
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

const DAYS_OF_HISTORY = 14;
const CHART_EVENT_LIMIT = 1000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// Every day in the window, oldest first, zero-filled — a day with no calls
// is a real, visible zero bar, not a gap in the array that shifts every
// other bar sideways.
function emptyDailyBuckets(days: number): Map<string, { ok: number; failed: number }> {
  const buckets = new Map<string, { ok: number; failed: number }>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    buckets.set(d.toISOString().slice(0, 10), { ok: 0, failed: 0 });
  }
  return buckets;
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt and braces — proxy.ts already redirects an unauthenticated request
  // before it gets this far, but a Server Component that trusts middleware
  // alone is one refactor away from not being protected at all.
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // No explicit filters below: RLS on each table already scopes every one
  // of these to this session's own rows (own_row / own_installs / own usage
  // *). What comes back is what this person is allowed to see, full stop —
  // the query doesn't have to repeat that logic to be safe if it's wrong.
  //
  // One usage_events query serves both the recent-activity feed and the
  // two personal charts below — fetched once at CHART_EVENT_LIMIT rows and
  // sliced/aggregated in memory, rather than querying twice.
  const [{ data: profile }, { data: installs }, { data: rollups }, { data: events }] =
    await Promise.all([
      supabase.from("users").select("id, email, team, org_id").maybeSingle(),
      supabase
        .from("installs")
        .select("id, created_at, last_seen_at, revoked_at")
        .order("created_at", { ascending: false }),
      supabase.from("install_rollup").select("*"),
      supabase
        .from("usage_events")
        .select("id, tool, kind, ok, occurred_at")
        .eq("kind", "tool_call")
        .order("occurred_at", { ascending: false })
        .limit(CHART_EVENT_LIMIT),
    ]);

  const rollupRows = (rollups ?? []) as Rollup[];
  const totals = rollupRows.reduce(
    (acc, r) => ({
      calls: acc.calls + (r.calls ?? 0),
      repos: acc.repos + (r.repos ?? 0),
      files: acc.files + (r.files ?? 0),
      lines: acc.lines + (r.lines ?? 0),
    }),
    { calls: 0, repos: 0, files: 0, lines: 0 },
  );
  const reportingLive = rollupRows.some((r) => r.source === "live");
  const installList = (installs ?? []) as Install[];
  const eventRows = (events ?? []) as RecentEvent[];
  const recentEvents = eventRows.slice(0, 20);

  const cutoff = new Date().getTime() - DAYS_OF_HISTORY * 24 * 60 * 60 * 1000;
  const dailyBuckets = emptyDailyBuckets(DAYS_OF_HISTORY);
  const toolCounts = new Map<string, number>();
  for (const e of eventRows) {
    if (!e.tool) continue;
    toolCounts.set(e.tool, (toolCounts.get(e.tool) ?? 0) + 1);
    if (new Date(e.occurred_at).getTime() < cutoff) continue;
    const bucket = dailyBuckets.get(dayKey(e.occurred_at));
    if (!bucket) continue; // outside the window even after the cutoff check (clock skew) — skip rather than guess
    if (e.ok) bucket.ok += 1;
    else bucket.failed += 1;
  }
  const dailyCalls = Array.from(dailyBuckets, ([date, v]) => ({ date, ...v }));
  const toolBreakdown = Array.from(toolCounts, ([tool, calls]) => ({ tool, calls }));

  // Org-wide numbers only when this person belongs to one — both RPCs
  // return zero rows for an org-less caller rather than erroring, but
  // skipping the call entirely when we already know there's no org from
  // `profile` avoids two round trips that can only come back empty.
  let org: OrgTotals | null = null;
  let orgTools: OrgTool[] = [];
  if (profile?.org_id) {
    const [{ data: orgRow }, { data: orgToolRows }] = await Promise.all([
      supabase.rpc("my_org_totals").maybeSingle(),
      supabase.rpc("my_org_tool_usage"),
    ]);
    org = (orgRow as OrgTotals | null) ?? null;
    orgTools = (orgToolRows ?? []) as OrgTool[];
  }

  return (
    <div className={styles.page}>
      <Bloom />
      <div className={styles.wrap}>
        <nav className={styles.nav}>
          <span className={styles.wordmark}>Shimmr</span>
          <form action="/auth/signout" method="post">
            <button className={styles.signout} type="submit">
              Sign out
            </button>
          </form>
        </nav>

        <header className={styles.header}>
          <p className={styles.eyebrow}>
            Signed in as{org ? ` · ${org.org_name}` : ""}
          </p>
          <h1 className={styles.title}>{profile?.email ?? user.email}</h1>
        </header>

        {installList.length === 0 ? (
          <div className={styles.connectCard}>
            <h2 className={styles.connectTitle}>Connect the CLI</h2>
            <p className={styles.connectCopy}>
              Run this on the machine you want to see here:
            </p>
            <code className={styles.connectCmd}>shimmr login</code>
            <p className={styles.connectCopy}>
              It opens a browser back to a page like this one to confirm —
              you&apos;re already signed in, so it&apos;s one click.
              (Scripted or headless machine? <code>shimmr login --email {profile?.email ?? user.email}</code> skips
              the browser, unverified.)
            </p>
            <p className={styles.connectCopy}>
              Don&apos;t have it yet:
            </p>
            <code className={styles.connectCmd}>
              curl -fsSL https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases/install.sh | sh
            </code>
          </div>
        ) : (
          <DashboardLive
            userId={profile?.id ?? ""}
            initialTotals={totals}
            initialReportingLive={reportingLive}
            initialEvents={recentEvents}
            initialDaily={dailyCalls}
            initialTools={toolBreakdown}
            installs={installList}
            org={org}
            orgTools={orgTools}
          />
        )}
      </div>
    </div>
  );
}
