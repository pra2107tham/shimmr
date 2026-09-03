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
  requireInstall,
  serviceClient,
} from "../_shared/lib.ts";

Deno.serve(handler(async (req) => {
  const token = bearerToken(req);
  const body = await readJSON(req);
  const db = serviceClient();

  const { installID, userID, orgID } = await requireInstall(db, token);

  const sentAt = typeof body.sent_at === "string" ? new Date(body.sent_at) : new Date();
  if (Number.isNaN(sentAt.getTime())) {
    throw new HttpError(400, "sent_at is not a valid timestamp");
  }

  const snapshot = {
    install_id: installID,
    user_id: userID,
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
    .eq("id", installID);

  return json({ ok: true, recorded: snapshot.calls });
}));
