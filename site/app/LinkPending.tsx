"use client";

import { useLinkStatus } from "next/link";
import styles from "./link-pending.module.css";

/** A fixed-size dot to drop inside a <Link>, invisible until that specific
 * link's own navigation takes long enough to notice (~100ms) — a fast,
 * prefetched transition never flashes it, so this only ever appears when a
 * click would otherwise look like it did nothing. Most useful on links to a
 * dynamic route with no loading.tsx of its own (currently /login and
 * /signup) — a route that has one gets its own instant fallback instead,
 * which is the better fix; see proxy.ts and dashboard/loading.tsx. */
export default function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`${styles.dot} ${pending ? styles.dotPending : ""}`} />;
}
