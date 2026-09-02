// POST /functions/v1/usage
//
// Called by `shimmr sync`. Authenticated by the install token issued at
// signup, carried as a bearer token.
//
// The payload is cumulative totals, so each row is a snapshot rather than a
// delta — a machine that syncs twice in a day does not double-count.

import {
  bearerToken,
  cleanByTool,
  cleanCount,
  handler,
  HttpError,
  json,
  readJSON,
  serviceClient,
  sha256,
} from "../_shared/lib.ts";

Deno.serve(handler(async (req) => {
  const token = bearerToken(req);
  const body = await readJSON(req);
  const db = serviceClient();

  // The token identifies the machine. Everything else about who this is comes
  // from the database, never from the payload — otherwise any caller could
  // write usage under someone else's org.
  const { data: install, error: lookupErr } = await db
    .from("installs")
    .select("id, user_id, revoked_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();

  if (lookupErr) {
    console.error("install lookup:", lookupErr);
    throw new HttpError(500, "could not verify the token");
  }
  if (!install) throw new HttpError(401, "unknown token");
  if (install.revoked_at) throw new HttpError(403, "this install has been revoked");

  // Deliberately a second query rather than an embedded `users(org_id)` select:
  // PostgREST types an embedded relation as an array even when the foreign key
  // makes it one-to-one, so the embedded form only type-checks behind a cast
  // that would hide real mistakes. One extra round trip, once per sync.
  const { data: owner, error: ownerErr } = await db
    .from("users")
    .select("org_id")
    .eq("id", install.user_id)
    .maybeSingle();

  if (ownerErr) {
    console.error("owner lookup:", ownerErr);
    throw new HttpError(500, "could not verify the token");
  }
  if (!owner) throw new HttpError(500, "install is not attached to an organisation");
  const orgID = owner.org_id;

  const sentAt = typeof body.sent_at === "string" ? new Date(body.sent_at) : new Date();
  if (Number.isNaN(sentAt.getTime())) {
    throw new HttpError(400, "sent_at is not a valid timestamp");
  }

  const snapshot = {
    install_id: install.id,
    user_id: install.user_id,
    org_id: orgID,
    calls: cleanCount(body.calls, "calls"),
    repos: cleanCount(body.repos, "repos"),
    files: cleanCount(body.files, "files"),
    lines: cleanCount(body.lines, "lines"),
    by_tool: cleanByTool(body.by_tool),
    sent_at: sentAt.toISOString(),
  };

  const { error: insertErr } = await db.from("usage_snapshots").insert(snapshot);
  if (insertErr) {
    console.error("usage insert:", insertErr);
    throw new HttpError(500, "could not record usage");
  }

  await db
    .from("installs")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", install.id);

  return json({ ok: true, recorded: snapshot.calls });
}));
