import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SiteFooter from "../SiteFooter";
import DashboardLive from "./DashboardLive";
import { pageMetadata } from "../seo";
import styles from "./dashboard.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Dashboard — Shimmr",
  description: "Your Shimmr usage: calls, coverage, connected machines.",
  path: "/dashboard",
  noIndex: true,
});

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
// nothing here says which teammate made which call, by design (ADR 0011,
// ADR 0013).
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

const CHART_EVENT_LIMIT = 1000;

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
  // One usage_events query serves the recent-activity feed and both charts
  // — fetched once at CHART_EVENT_LIMIT rows, sent to the client as-is, and
  // sliced/bucketed there (by range, and as new realtime events arrive)
  // instead of the server precomputing one fixed window.
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
  const reportingCount = rollupRows.filter((r) => r.source === "live").length;
  const installList = (installs ?? []) as Install[];
  const eventRows = (events ?? []) as RecentEvent[];
  const recentEvents = eventRows.slice(0, 20);
  const usageLog = eventRows.map((e) => ({ occurred_at: e.occurred_at, tool: e.tool, ok: e.ok }));

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
      <DashboardLive
        userId={profile?.id ?? ""}
        email={profile?.email ?? user.email ?? ""}
        orgName={org?.org_name ?? null}
        initialTotals={totals}
        initialReportingCount={reportingCount}
        initialEvents={recentEvents}
        initialUsageLog={usageLog}
        installs={installList}
        org={org}
        orgTools={orgTools}
      />
      <SiteFooter />
    </div>
  );
}
