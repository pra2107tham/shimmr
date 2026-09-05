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
  const [{ data: profile }, { data: installs }, { data: rollups }, { data: recent }] =
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
        .limit(20),
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
          <p className={styles.eyebrow}>Signed in as</p>
          <h1 className={styles.title}>{profile?.email ?? user.email}</h1>
        </header>

        {installList.length === 0 ? (
          <div className={styles.connectCard}>
            <h2 className={styles.connectTitle}>Connect the CLI</h2>
            <p className={styles.connectCopy}>
              Run this on the machine you want to see here:
            </p>
            <code className={styles.connectCmd}>
              shimmr login --email {profile?.email ?? user.email}
            </code>
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
            initialEvents={(recent ?? []) as RecentEvent[]}
            installs={installList}
          />
        )}
      </div>
    </div>
  );
}
