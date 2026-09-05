// POST /functions/v1/cli_claim
//
// Called by the website, not the CLI, once a signed-in person confirms the
// code shown in their terminal. This is the one step in the whole pairing
// flow that checks anything real: the caller must carry a genuine Supabase
// Auth session — a magic link somebody actually clicked — not a stated
// email address. That is what `signup`/`login` have never been able to
// require, and it is why this exists instead of just adding a browser step
// in front of the same trust model.
//
// Creates the install row exactly as signup/login always have: same table,
// same shape, same token_hash. `usage` and `events` keep authenticating it
// exactly as before — nothing about that path changes.

import {
  bearerToken,
  cleanString,
  handler,
  HttpError,
  json,
  readJSON,
  serviceClient,
} from "../_shared/lib.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(handler(async (req) => {
  // Auth before anything else, matching usage/events: a missing or bad
  // token is always a 401, regardless of what the body does or doesn't
  // contain.
  const jwt = bearerToken(req);
  const body = await readJSON(req);
  const code = cleanString(body.code, "code", { max: 32 });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new HttpError(500, "auth is not configured");
  }

  // Verifying the caller's own session, not acting as them — a plain anon
  // client handed their token, which is how a JWT gets checked server-side
  // when the platform's own verify_jwt is off (every function here does
  // its own auth; see config.toml and supabase/README.md).
  const authClient = createClient(url, anonKey);
  const { data: authData, error: authErr } = await authClient.auth.getUser(jwt);
  if (authErr || !authData.user) {
    throw new HttpError(401, "not signed in — sign in and try again");
  }

  const db = serviceClient();

  const { data: person, error: personErr } = await db
    .from("users")
    .select("id, email, team, org_id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (personErr) {
    console.error("cli_claim person lookup:", personErr);
    throw new HttpError(500, "could not look up your account");
  }
  if (!person) {
    throw new HttpError(404, "no Shimmr account for this session");
  }

  // Atomic: flips pending -> claimed only if it is still pending and not
  // expired, in one statement, and returns the row only when it did. Two
  // concurrent confirms of the same code — a double click, a replayed
  // request — cannot both win, so `installs` below is only ever written by
  // whichever request actually claimed it, never by a loser racing in after.
  const { data: claimedRows, error: claimErr } = await db
    .from("cli_pairings")
    .update({
      status: "claimed",
      claimed_by: person.id,
      claimed_at: new Date().toISOString(),
    })
    .eq("code", code)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("install_id, token_hash");

  if (claimErr) {
    console.error("cli_pairings claim update:", claimErr);
    throw new HttpError(500, "could not finish connecting this machine");
  }
  if (!claimedRows || claimedRows.length === 0) {
    throw new HttpError(409, "that code is invalid, already used, or has expired");
  }
  const pairing = claimedRows[0];

  const { error: installErr } = await db.from("installs").upsert(
    {
      id: pairing.install_id,
      user_id: person.id,
      token_hash: pairing.token_hash,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "id" },
  );
  if (installErr) {
    console.error("cli_claim install upsert:", installErr);
    throw new HttpError(500, "could not connect this machine");
  }

  let orgName: string | null = null;
  if (person.org_id) {
    const { data: org } = await db
      .from("orgs")
      .select("name")
      .eq("id", person.org_id)
      .maybeSingle();
    orgName = org?.name ?? null;
  }

  return json({ ok: true, email: person.email, org: orgName, team: person.team ?? null });
}));
