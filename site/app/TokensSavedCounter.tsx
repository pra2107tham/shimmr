"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import styles from "./tokens-saved-counter.module.css";

type PublicTotals = { installs: number; calls: number; lines: number; tokens_saved: number };

/** A live number for a signed-out visitor: tokens saved across every
 * Shimmr install, from public.public_totals() (ADR 0014) — the same
 * conservative estimate `shimmr stats` computes for one person, summed
 * with no per-person or per-org breakdown; nobody's individual usage is
 * readable from this. Client-side, like NavAuthLinks, so the homepage
 * stays statically generated. Renders nothing until there's a real,
 * non-zero number, and nothing at all if the query fails — a marketing
 * line that can't load is not a reason to show a broken one. */
export default function TokensSavedCounter() {
  const [totals, setTotals] = useState<PublicTotals | null>(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = supabaseBrowser();
    } catch {
      return;
    }
    supabase
      .rpc("public_totals")
      .single()
      .then(({ data, error }) => {
        if (!error && data) setTotals(data as PublicTotals);
      });
  }, []);

  if (!totals || totals.calls === 0) return null;

  return (
    <p className={styles.counter}>
      <span className={styles.value}>~{totals.tokens_saved.toLocaleString()}</span>{" "}
      tokens saved across every Shimmr install so far — an estimate,{" "}
      <Link href="/security#tokens-saved" className={styles.link}>not a measurement</Link>.
    </p>
  );
}
