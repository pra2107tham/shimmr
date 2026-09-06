// The same formula as internal/usage.EstimateTokensSaved (Go) and
// public.public_totals() (SQL, supabase/migrations/20260906000000_public_
// tokens_saved.sql) — three implementations of one number, because it
// shows up in three different runtimes that can't share code: the CLI
// (offline, has no database to ask), the public homepage counter (has to
// be one cheap aggregate query, not a client-side reduce over every
// install), and this file, used for a signed-in person's own dashboard
// tile. All three have to move together — see ADR 0014.
//
// Deliberately conservative, not measured: a question answered from the
// graph reads roughly 4 targeted functions, the same question answered by
// reading files reads roughly 25 of them. We price that difference at
// 12,000 tokens per answered call, and cap the total at what reading the
// entire indexed codebase once would cost (lines x 10 tokens/line), so
// the figure can never exceed the size of the thing it claims to have
// saved you from reading. `shimmr stats --method` prints the full
// explanation; keep it, this comment, and the two other implementations
// in sync if either constant changes.
const TOKENS_PER_CALL = 12000;
const TOKENS_PER_LINE_CAP = 10;

export function estimateTokensSaved(calls: number, lines: number): number {
  const raw = calls * TOKENS_PER_CALL;
  if (lines > 0) {
    return Math.min(raw, lines * TOKENS_PER_LINE_CAP);
  }
  return raw;
}
