import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SiteNav from "../SiteNav";
import { claimCliCode } from "./actions";
import formStyles from "../auth-form.module.css";
import styles from "./cli-auth.module.css";

export const metadata: Metadata = { title: "Connect a device — Shimmr" };

type PollResult =
  | { status: "expired" }
  | { status: "claimed" }
  | { status: "pending"; machine: string | null; expiresIn: string };

// A direct, unauthenticated read of cli_poll — the same endpoint the CLI
// itself calls in a loop. The code is the only credential this needs
// (see supabase/functions/cli_poll's own comment on why that's enough);
// this page uses it once per render to show something more useful than the
// bare code before someone approves it: a real machine label, and roughly
// how long the code has left, computed once here rather than as a fake
// ticking clock bound to nothing.
async function pollPairing(code: string): Promise<PollResult | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/functions/v1/cli_poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status === "pending") {
      return { status: "pending", machine: body.machine ?? null, expiresIn: relativeExpiry(body.expires_at) };
    }
    if (body.status === "claimed" || body.status === "expired") {
      return { status: body.status };
    }
    return null;
  } catch {
    return null;
  }
}

function relativeExpiry(expiresAt: unknown): string {
  if (typeof expiresAt !== "string") return "a few minutes";
  const ms = new Date(expiresAt).getTime() - Date.now();
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) return "under a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={formStyles.page}>
      <SiteNav />
      <div className={formStyles.center}>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; flow?: string; claimed?: string; error?: string }>;
}) {
  const { code, flow, claimed, error } = await searchParams;

  // Belt and braces, same reasoning as the dashboard: proxy.ts already
  // gates this route, but a page that trusts middleware alone is one
  // refactor away from not being protected at all.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const back = code ? `/cli-auth?code=${encodeURIComponent(code)}${flow ? `&flow=${flow}` : ""}` : "/cli-auth";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  if (!code) {
    return (
      <Shell>
        <div className={styles.head}>
          <span>NO CODE TO CONFIRM</span>
        </div>
        <div className={styles.body}>
          <p className={styles.copy}>
            This page connects a machine that ran{" "}
            <code>shimmr {flow === "signup" ? "signup" : "login"}</code> —
            open the link it printed in your terminal, code included,
            rather than this page on its own.
          </p>
        </div>
      </Shell>
    );
  }

  if (claimed) {
    return (
      <Shell>
        <div className={styles.head}>
          <span className={styles.accent}>CONNECTED</span>
        </div>
        <div className={styles.body}>
          <div className={styles.title}>Close this tab and go back to your terminal — it already knows.</div>
        </div>
      </Shell>
    );
  }

  const poll = await pollPairing(code);

  if (poll?.status === "expired") {
    return (
      <Shell>
        <div className={styles.head}>
          <span className={styles.amber}>CODE EXPIRED</span>
        </div>
        <div className={styles.body}>
          <p className={styles.copy}>
            This code is no longer valid. Run <code>shimmr {flow === "signup" ? "signup" : "login"}</code>{" "}
            again to get a new one.
          </p>
        </div>
      </Shell>
    );
  }

  if (poll?.status === "claimed") {
    return (
      <Shell>
        <div className={styles.head}>
          <span className={styles.accent}>ALREADY CONNECTED</span>
        </div>
        <div className={styles.body}>
          <p className={styles.copy}>This code was already confirmed. The terminal that showed it already knows.</p>
        </div>
      </Shell>
    );
  }

  const machine = poll?.status === "pending" ? poll.machine : null;
  const expiresIn = poll?.status === "pending" ? poll.expiresIn : "a few minutes";

  return (
    <Shell>
      <div className={styles.head}>
        <span>CONFIRM A CLI SESSION</span>
        <span className={styles.waiting}>
          <span className={styles.pulseDot} />COMMAND WAITING
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.title}>A command on a machine is waiting for you to confirm it&apos;s really you.</div>
        <p className={styles.copy}>Check that this code matches what your terminal printed, then approve.</p>

        <div className={styles.codeRow}>
          {code.split("").map((ch, i) => (
            <span className={styles.codeChar} key={i}>{ch}</span>
          ))}
        </div>

        <div className={styles.info}>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>will attach to</span>
            <span className={styles.infoVal}>{user.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>machine</span>
            <span className={styles.infoVal}>{machine ?? "unknown machine"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>expires in</span>
            <span className={styles.infoExpiry}>{expiresIn}</span>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form action={claimCliCode} className={styles.actions}>
          <input type="hidden" name="code" value={code} />
          <button className={styles.confirm} type="submit">approve this machine</button>
          <Link href="/" className={styles.cancel}>cancel</Link>
        </form>

        <p className={styles.footnote}>
          the code is short-lived and only valid while that command is still
          waiting. wrong account?{" "}
          <Link href={`/login?next=${encodeURIComponent(`/cli-auth?code=${code}${flow ? `&flow=${flow}` : ""}`)}`}>
            sign in as someone else
          </Link>
        </p>
      </div>
    </Shell>
  );
}
