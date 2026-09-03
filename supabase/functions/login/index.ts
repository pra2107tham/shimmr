// POST /functions/v1/login
//
// Attaches another machine to an account that already exists. Signup creates
// the person; login is how their second laptop joins without inventing a
// second identity.
//
// The client has just generated a token for this machine and sends it here,
// exactly as signup does. We store only its SHA-256.
//
// What this is NOT: verified authentication. Anyone who knows an email address
// can attach a machine to it. That is the same trust model signup already has —
// signup upserts on email, so a second signup with someone else's address
// already joins their account — so login adds no new exposure, but neither
// does it close the hole. Email verification is tracked as an open question and
// has to land before anything is charged for or gated per seat.

import {
  cleanEmail,
  cleanString,
  handler,
  HttpError,
  json,
  readJSON,
  serviceClient,
  sha256,
} from "../_shared/lib.ts";

Deno.serve(handler(async (req) => {
  const body = await readJSON(req);

  const installID = cleanString(body.user_id, "user_id", { max: 64 });
  const email = cleanEmail(body.email);
  const token = cleanString(body.token, "token", { max: 200 });

  const db = serviceClient();

  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, team, org_id")
    .eq("email", email)
    .maybeSingle();

  if (userErr) {
    console.error("user lookup:", userErr);
    throw new HttpError(500, "could not look up the account");
  }
  if (!user) {
    throw new HttpError(404, "no account for that email — run `shimmr signup`");
  }

  // The org name is what the CLI displays, so resolve it rather than making the
  // client hold a stale copy. A person with no org is a normal case.
  let orgName: string | null = null;
  if (user.org_id) {
    const { data: org, error: orgErr } = await db
      .from("orgs")
      .select("name")
      .eq("id", user.org_id)
      .maybeSingle();
    if (orgErr) {
      console.error("org lookup:", orgErr);
      throw new HttpError(500, "could not look up the organisation");
    }
    orgName = org?.name ?? null;
  }

  const { error: installErr } = await db
    .from("installs")
    .upsert(
      {
        id: installID,
        user_id: user.id,
        token_hash: await sha256(token),
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "id" },
    );

  if (installErr) {
    console.error("install upsert:", installErr);
    throw new HttpError(500, "could not register this machine");
  }

  return json({ ok: true, email, org: orgName, team: user.team ?? null });
}));
