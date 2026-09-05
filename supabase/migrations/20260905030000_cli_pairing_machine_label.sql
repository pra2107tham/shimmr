-- A friendly machine label on the pairing confirm page, so "approve this
-- machine?" has an actual machine on it rather than just a code to compare
-- by eye.
--
-- Purely informational: the CLI sends whatever it likes here (hostname and
-- OS, today), nothing downstream trusts it for anything security-relevant.
-- The code itself remains the only thing that actually authorises a claim
-- (see cli_claim) — this column exists so the confirm page can show
-- something more legible than that code while someone decides whether to
-- approve it.

alter table cli_pairings add column if not exists machine_label text;

comment on column cli_pairings.machine_label is
  'Client-supplied, display-only — e.g. "laptop · macOS". Never used for '
  'authorization; the pairing code is what actually proves anything.';
