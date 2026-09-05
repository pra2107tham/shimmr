import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Bloom from "../Bloom";
import { claimCliCode } from "./actions";
import formStyles from "../auth-form.module.css";
import styles from "./cli-auth.module.css";

export const metadata: Metadata = { title: "Connect a device — Shimmr" };

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
      <div className={formStyles.page}>
        <Bloom />
        <div className={formStyles.card}>
          <Link href="/" className={formStyles.wordmark}>
            Shimmr
          </Link>
          <h1 className={formStyles.title}>No code to confirm</h1>
          <p className={formStyles.sub}>
            This page connects a machine that ran{" "}
            <code>shimmr {flow === "signup" ? "signup" : "login"}</code> —
            open the link it printed in your terminal, code included, rather
            than this page on its own.
          </p>
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className={formStyles.page}>
        <Bloom />
        <div className={formStyles.card}>
          <Link href="/" className={formStyles.wordmark}>
            Shimmr
          </Link>
          <h1 className={formStyles.title}>Connected</h1>
          <p className={formStyles.sub}>
            Close this tab and go back to your terminal — it already knows.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={formStyles.page}>
      <Bloom />
      <div className={formStyles.card}>
        <Link href="/" className={formStyles.wordmark}>
          Shimmr
        </Link>
        <h1 className={formStyles.title}>Connect this device?</h1>
        <p className={formStyles.sub}>
          {flow === "signup" ? "Signing up" : "Signing in"} as{" "}
          <strong>{user.email}</strong> from a terminal. Check this matches
          what it printed there before confirming.
        </p>
        <div className={styles.code}>{code}</div>
        {error && <p className={styles.error}>{error}</p>}
        <form action={claimCliCode}>
          <input type="hidden" name="code" value={code} />
          <button className={styles.confirm} type="submit">
            Confirm &amp; connect
          </button>
        </form>
        <p className={styles.cancel}>
          Not you? <Link href="/">Go back</Link> and ignore this.
        </p>
      </div>
    </div>
  );
}
