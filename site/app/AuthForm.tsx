"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GoogleIcon, GitHubIcon } from "./icons";
import styles from "./auth-form.module.css";

type OAuthProvider = "google" | "github";

type Mode = "signup" | "login";

const COPY: Record<Mode, { title: string; sub: string; switchText: string; switchHref: string; switchLabel: string }> = {
  signup: {
    title: "Create your account",
    sub: "One email, no password. We'll send you a link — click it and you're in.",
    switchText: "Already have an account?",
    switchHref: "/login",
    switchLabel: "Sign in",
  },
  login: {
    title: "Sign in",
    sub: "Enter the email you signed up with. We'll send you a link — no password to remember.",
    switchText: "New here?",
    switchHref: "/signup",
    switchLabel: "Create an account",
  },
};

export default function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");
  const copy = COPY[mode];

  // Preserved across the switch link too: someone who followed `shimmr
  // login` here, then clicks "New here? Create an account", should still
  // land back on /cli-auth after signing up — not lose that on the detour.
  const switchHref = next ? `${copy.switchHref}?next=${encodeURIComponent(next)}` : copy.switchHref;

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
      <Link href="/" className={styles.wordmark}>
        Shimmr
      </Link>
      <h1 className={styles.title}>{copy.title}</h1>
      <p className={styles.sub}>{copy.sub}</p>

      {status === "sent" ? (
        <p className={`${styles.message} ${styles.ok}`}>
          Check {email} for the link. It&apos;s good for a few minutes — if
          it expires, come back here and send another.
        </p>
      ) : (
        <>
          <div className={styles.oauthRow}>
            <button
              type="button"
              className={styles.oauthButton}
              onClick={() => onOAuth("google")}
              disabled={oauthPending !== null}
            >
              <GoogleIcon />
              {oauthPending === "google" ? "Redirecting…" : "Google"}
            </button>
            <button
              type="button"
              className={styles.oauthButton}
              onClick={() => onOAuth("github")}
              disabled={oauthPending !== null}
            >
              <GitHubIcon />
              {oauthPending === "github" ? "Redirecting…" : "GitHub"}
            </button>
          </div>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <form onSubmit={onSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                Email
              </label>
              <input
                id="email"
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
            </div>
            <button
              className={styles.submit}
              type="submit"
              disabled={status === "sending" || oauthPending !== null || !email}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status === "error" && (
              <p className={`${styles.message} ${styles.error}`}>
                {error}
                {mode === "login" && " — new here? Create an account instead."}
              </p>
            )}
          </form>
        </>
      )}

      <p className={styles.switch}>
        {copy.switchText} <Link href={switchHref}>{copy.switchLabel}</Link>
      </p>
    </div>
  );
}
