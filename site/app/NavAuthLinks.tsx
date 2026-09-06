"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import LinkPending from "./LinkPending";
import styles from "./sitenav.module.css";

// Client-side on purpose, not a server check: the marketing pages stay
// statically generated (fast, cacheable, good for both Core Web Vitals and
// a crawler with no session anyway) rather than every one of them turning
// dynamic just to read a cookie in the nav. The logged-out state below is
// what a crawler and the first paint both see; a real signed-in visitor
// gets swapped to "dashboard" within one client round trip.
export default function NavAuthLinks() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let supabase;
    try {
      supabase = supabaseBrowser();
    } catch {
      // Missing env vars — degrade to logged-out nav rather than crash the
      // marketing site over it, same posture as everywhere else this client
      // is constructed.
      return;
    }

    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (signedIn) {
    return (
      <Link href="/dashboard" className={styles.cta}>
        dashboard
        <LinkPending />
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className={styles.signIn}>
        sign in
        <LinkPending />
      </Link>
      <Link href="/download" className={styles.cta}>
        get started
        <LinkPending />
      </Link>
    </>
  );
}
