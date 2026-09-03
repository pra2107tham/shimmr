// POST /functions/v1/events
//
// Called by `shimmr serve` while the agent works. Each request carries a batch
// of individual tool calls, so usage exists without anyone remembering to run
// `shimmr sync`.
//
// Authenticated by the install token issued at signup, carried as a bearer
// token. Identity comes from the database keyed by that token, never from the
// body — otherwise any caller could write usage under someone else's org.
//
// Idempotent: each event carries a client-generated id, unique per install, and
// a replayed batch lands once. That is what makes retrying a half-delivered
// flush safe, and it is why the client can retry without keeping a ledger.

import {
  bearerToken,
  cleanEvents,
  handler,
  json,
  readJSON,
  requireInstall,
  serviceClient,
} from "../_shared/lib.ts";

Deno.serve(handler(async (req) => {
  const token = bearerToken(req);
  const body = await readJSON(req);
  const db = serviceClient();

  const { installID, userID, orgID } = await requireInstall(db, token);
  const events = cleanEvents(body.events);

  if (events.length === 0) {
    // Not an error. A client with nothing to say should not have to care.
    return json({ ok: true, accepted: 0 });
  }

  const rows = events.map((e) => ({
    ...e,
    install_id: installID,
    user_id: userID,
    org_id: orgID,
  }));

  // ignoreDuplicates is the whole idempotency story: a replayed event hits the
  // (install_id, event_id) unique index and is skipped rather than counted
  // twice or rejected.
  const { error } = await db
    .from("usage_events")
    .upsert(rows, { onConflict: "install_id,event_id", ignoreDuplicates: true });

  if (error) {
    console.error("event insert:", error);
    throw new Error("could not record usage");
  }

  // Knowing a machine is alive is worth a column; it costs one cheap update.
  const { error: seenErr } = await db
    .from("installs")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", installID);
  if (seenErr) console.error("last_seen update:", seenErr);

  return json({ ok: true, accepted: events.length });
}));
