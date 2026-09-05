"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GoogleIcon, GitHubIcon } from "./icons";
import styles from "./auth-form.module.css";

type OAuthProvider = "google" | "github";
type Mode = "signup" | "login";

const COPY: Record<Mode, { title: string; sub: string; cta: string; switchText: string; switchHref: string; switchLabel: string }> = {
  signup: {
    title: "Create your account",
    sub: "No password. We email you a link, or you continue with Google or GitHub.",
    cta: "email me a signup link",
    switchText: "Already have an account?",
    switchHref: "/login",
    switchLabel: "sign in instead",
  },
  login: {
    title: "Welcome back",
    sub: "No password. Sign in with an email link, or continue with Google or GitHub.",
    cta: "email me a sign-in link",
    switchText: "New here?",
    switchHref: "/signup",
    switchLabel: "create an account instead",
  },
};

export default function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");
  const copy = COPY[mode];

  // Preserved across every switch to the other mode — the tab row, and the
  // text link below the form — so someone who followed `shimmr login` here
  // and switches to signup still lands back on /cli-auth afterward.
  const withNext = (href: string) => (next ? `${href}?next=${encodeURIComponent(next)}` : href);

  function callbackURL(): URL {
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    return callback;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: mode === "signup",
        emailRedirectTo: callbackURL().toString(),
      },
    });

    if (authError) {
      setStatus("error");
      setError(authError.message);
      return;
    }
    setStatus("sent");
  }

  // Same /auth/callback route as the magic link — it already exchanges
  // whatever PKCE `code` comes back for a session regardless of which
  // provider issued it, so nothing there needed to change for this.
  // Google/GitHub both have to be turned on with their own app credentials
  // in the Supabase dashboard (Authentication → Providers) before either
  // button here does anything but show Supabase's own "provider not
  // enabled" error — that half is outside this repo.
  async function onOAuth(provider: OAuthProvider) {
    setOauthPending(provider);
    setError("");

    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackURL().toString() },
    });

    if (authError) {
      setOauthPending(null);
      setStatus("error");
      setError(authError.message);
    }
    // On success the browser navigates away to the provider immediately —
    // no further local state update needed, or possible, before that happens.
  }

  return (
    <div className={styles.card}>
      <div className={styles.tabs}>
        <Link href={withNext("/signup")} className={`${styles.tab} ${mode === "signup" ? styles.tabActive : ""}`}>
          Sign up
        </Link>
        <Link href={withNext("/login")} className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}>
          Sign in
        </Link>
      </div>

      <div className={styles.body}>
        {status === "sent" ? (
          <>
            <div className={styles.head}>
              <h1 className={styles.title}>Check your email</h1>
              <p className={styles.sub}>
                A link went to {email}. It&apos;s good for a few minutes — if
                it expires, come back here and send another.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className={styles.head}>
              <h1 className={styles.title}>{copy.title}</h1>
              <p className={styles.sub}>{copy.sub}</p>
            </div>

            <form onSubmit={onSubmit} className={styles.form}>
              <input
                className={styles.input}
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "sending" || oauthPending !== null}
              />
              <button
                className={styles.submit}
                type="submit"
                disabled={status === "sending" || oauthPending !== null || !email}
              >
                {status === "sending" ? "sending…" : copy.cta}
              </button>
            </form>

            <div className={styles.divider}>
              <span />
              <span className={styles.dividerLabel}>OR</span>
              <span />
            </div>

            <div className={styles.oauthRow}>
              <button
                type="button"
                className={styles.oauthButton}
                onClick={() => onOAuth("google")}
                disabled={oauthPending !== null}
              >
                <GoogleIcon />
                {oauthPending === "google" ? "redirecting…" : "Google"}
              </button>
              <button
                type="button"
                className={styles.oauthButton}
                onClick={() => onOAuth("github")}
                disabled={oauthPending !== null}
              >
                <GitHubIcon />
                {oauthPending === "github" ? "redirecting…" : "GitHub"}
              </button>
            </div>

            {status === "error" && <p className={styles.error}>{error}</p>}

            <p className={styles.switch}>
              {copy.switchText} <Link href={withNext(copy.switchHref)}>{copy.switchLabel}</Link>
            </p>
          </>
        )}

        <p className={styles.footnote}>
          no password, ever · one account whether you arrive from the CLI or the web
        </p>
      </div>
    </div>
  );
}
