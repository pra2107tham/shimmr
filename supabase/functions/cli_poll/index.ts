// POST /functions/v1/cli_poll
//
// The CLI calls this every couple of seconds after cli_start, waiting for
// the person to confirm in their browser. Deliberately unauthenticated,
// same reasoning as cli_start: the code itself is the only credential a
// poll needs. It is short-lived, single-use, and a caller who does not
// already hold it cannot do anything with a guess — this only ever reveals
// the email/org/team belonging to whoever already claimed this exact code,
// never anyone else's.

import {
  cleanString,
  handler,
  HttpError,
  json,
  readJSON,
  serviceClient,
} from "../_shared/lib.ts";

Deno.serve(handler(async (req) => {
  const body = await readJSON(req);
  const code = cleanString(body.code, "code", { max: 32 });

  const db = serviceClient();
  const { data: pairing, error } = await db
    .from("cli_pairings")
    .select("status, claimed_by, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("cli_pairings lookup:", error);
    throw new HttpError(500, "could not check sign-in status");
  }
  if (!pairing || new Date(pairing.expires_at) < new Date()) {
    return json({ status: "expired" });
  }
  if (pairing.status !== "claimed" || !pairing.claimed_by) {
    return json({ status: "pending" });
  }

  const { data: person, error: personErr } = await db
    .from("users")
    .select("email, team, org_id")
    .eq("id", pairing.claimed_by)
    .maybeSingle();
  if (personErr || !person) {
    console.error("cli_poll claimed person lookup:", personErr);
    throw new HttpError(500, "could not look up the account");
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

  return json({
    status: "claimed",
    email: person.email,
    org: orgName,
    team: person.team ?? null,
  });
}));
