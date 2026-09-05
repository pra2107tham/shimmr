"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import styles from "./auth-form.module.css";

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
  const [error, setError] = useState("");
  const copy = COPY[mode];

  // Preserved across the switch link too: someone who followed `shimmr
  // login` here, then clicks "New here? Create an account", should still
  // land back on /cli-auth after signing up — not lose that on the detour.
  const switchHref = next ? `${copy.switchHref}?next=${encodeURIComponent(next)}` : copy.switchHref;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: mode === "signup",
        emailRedirectTo: callback.toString(),
      },
    });

    if (authError) {
      setStatus("error");
      setError(authError.message);
      return;
    }
    setStatus("sent");
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
              disabled={status === "sending"}
            />
          </div>
          <button className={styles.submit} type="submit" disabled={status === "sending" || !email}>
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {status === "error" && (
            <p className={`${styles.message} ${styles.error}`}>
              {error}
              {mode === "login" && " — new here? Create an account instead."}
            </p>
          )}
        </form>
      )}

      <p className={styles.switch}>
        {copy.switchText} <Link href={switchHref}>{copy.switchLabel}</Link>
      </p>
    </div>
  );
}
