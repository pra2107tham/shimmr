"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import styles from "./tokens-saved-counter.module.css";

type PublicTotals = {
  installs: number;
  calls: number;
  lines: number;
  tokens_saved: number;
};
type DailyRow = {
  day: string;
  calls: number;
  lines: number;
  tokens_saved: number;
};

/** The window the trend line covers: today and the three days before it.
 * public_daily() clamps whatever it is given, so this is a request, not a
 * promise — the series is authoritative about its own dates. */
const WINDOW_DAYS = 4;

const COUNT_UP_MS = 1500;

/** Ease-out cubic: fast at the start, settling rather than braking. A linear
 * count reads like a loading bar; this reads like a number arriving. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Counts from zero to `target` once `run` turns true, then holds. Honours
 * prefers-reduced-motion by landing on the final value immediately — the
 * number is the point, the animation is not. */
function useCountUp(target: number, run: boolean) {
  // Read once, at first render rather than inside the effect: the answer
  // decides what this hook *returns*, not what it does later, so it has no
  // business being a state update after the fact.
  const [reduced] = useState(prefersReducedMotion);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!run || reduced) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / COUNT_UP_MS, 1);
      setValue(Math.round(target * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, reduced]);

  return reduced ? target : value;
}

/** True once the element has been on screen. The count-up is the whole
 * point of the panel, and it happens below the fold — starting it on mount
 * would mean most people scroll down to a number that has already finished
 * arriving. */
function useOnScreen<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T>(null);
  // Where there is no IntersectionObserver to wait on, start as already
  // seen: the number arriving without its animation is a far better
  // failure than a panel stuck at zero.
  const [seen, setSeen] = useState(
    () => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    // `ready` is what re-runs this once there is something to observe. The
    // panel renders nothing at all until its number has loaded, so on the
    // first pass ref.current is still null — without this the observer
    // would never be attached and the count-up would never start.
    if (!ready || seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ready, seen]);

  return [ref, seen] as const;
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** Formats "2026-09-03" as "3 SEP" without going through Date, which would
 * read the string as UTC midnight and shift the label a day backwards for
 * anyone west of Greenwich. */
function shortDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

/** A small area-and-line chart. Deliberately plain: no axes, no gridlines,
 * no library — four points do not need any of it, and the panel's job is to
 * make one number legible, not to be a dashboard. */
function Sparkline({ rows, animate }: { rows: DailyRow[]; animate: boolean }) {
  const W = 260;
  const H = 84;
  const PAD = 6;

  const values = rows.map((r) => r.tokens_saved);
  const max = Math.max(...values, 1);
  const stepX = rows.length > 1 ? (W - PAD * 2) / (rows.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(PAD + (rows.length - 1) * stepX).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;

  const total = values.reduce((a, b) => a + b, 0);
  const label = `Tokens saved per day over the last ${rows.length} days: ${total.toLocaleString()} in total.`;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="tsFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <line
        x1={PAD}
        y1={H - PAD}
        x2={W - PAD}
        y2={H - PAD}
        className={styles.chartBase}
      />
      <path
        d={area}
        fill="url(#tsFade)"
        className={animate ? styles.chartAreaIn : undefined}
      />
      <path
        d={line}
        pathLength={1}
        className={`${styles.chartLine} ${animate ? styles.chartLineIn : ""}`}
      />

      {points.map(([x, y], i) => (
        <circle
          key={rows[i].day}
          cx={x}
          cy={y}
          r={i === points.length - 1 ? 3.2 : 2}
          className={
            i === points.length - 1 ? styles.chartDotLast : styles.chartDot
          }
        />
      ))}
    </svg>
  );
}

/** A live number for a signed-out visitor: tokens saved across every
 * Shimmr install, from public.public_totals() (ADR 0014) — the same
 * conservative estimate `shimmr stats` computes for one person, summed
 * with no per-person or per-org breakdown; nobody's individual usage is
 * readable from this. Client-side, like NavAuthLinks, so the homepage
 * stays statically generated. Renders nothing until there's a real,
 * non-zero number, and nothing at all if the query fails — a marketing
 * line that can't load is not a reason to show a broken one.
 *
 * The trend line underneath comes from public_daily(), which covers
 * live-reporting installs only and withholds itself entirely below its
 * install floor. So it can be absent while the headline number is present,
 * and it does not sum to that number. Both of those are by design and the
 * panel is labelled accordingly — see the migration comment. When there is
 * no series, the panel simply shows the number: no graph is correct here,
 * an invented one is not. */
export default function TokensSavedCounter({
  className,
}: {
  className?: string;
}) {
  const [totals, setTotals] = useState<PublicTotals | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [panelRef, onScreen] = useOnScreen<HTMLDivElement>(totals !== null);

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

    supabase
      .rpc("public_daily", { days: WINDOW_DAYS })
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) setDaily(data as DailyRow[]);
      });
  }, []);

  const shown = useCountUp(
    totals?.tokens_saved ?? 0,
    onScreen && totals !== null,
  );

  if (!totals || totals.calls === 0) return null;

  const hasChart = daily.length > 1;

  return (
    /* The band wrapper lives in here rather than in the page so that
       "nothing to show" collapses the whole section — an outer element on
       the page would still paint its padding and its rule below an
       component that rendered null. */
    <section className={className}>
      <div className={styles.frame} ref={panelRef}>
        <div className={styles.bar}>
          <span>TOKENS SAVED · ALL INSTALLS</span>
          <span className={styles.live}>
            <span className={styles.liveDot} /> LIVE
          </span>
        </div>

        <div className={`${styles.body} ${hasChart ? "" : styles.bodySolo}`}>
          <div className={styles.figure}>
            {/* The animated digits are decorative until they settle, so the
              real value is what gets announced, once, rather than a
              screen reader counting to it. */}
            <div className={styles.value} aria-hidden="true">
              ~{shown.toLocaleString()}
            </div>
            <span className={styles.srOnly}>
              Approximately {totals.tokens_saved.toLocaleString()} tokens saved
              across every Shimmr install so far.
            </span>
            <p className={styles.caption}>
              tokens saved across every Shimmr install so far — a deliberately
              conservative estimate,{" "}
              <Link href="/security#tokens-saved" className={styles.link}>
                not a measurement
              </Link>
              .
            </p>
          </div>

          {hasChart && (
            <div className={styles.chartCol}>
              <div className={styles.chartLabel}>
                PER DAY · LIVE-REPORTING INSTALLS
              </div>
              <Sparkline rows={daily} animate={onScreen} />
              <div className={styles.chartAxis}>
                <span>{shortDay(daily[0].day)}</span>
                <span>{shortDay(daily[daily.length - 1].day)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
