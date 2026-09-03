// POST /functions/v1/signup
//
// Called once by `shimmr signup`. Records the person, the install token this
// machine will authenticate with from now on, and their organisation if they
// named one.
//
// An org is optional on purpose. Somebody trying Shimmr on a personal project
// should not have to invent a company, and making them type one produces junk
// rows rather than information. Name one and you join it; leave it out and you
// are a person with an account, free to join an org later.
//
// The token arrives in the body because the client has just generated it and
// we have never seen it before. We store only its SHA-256.

import {
  cleanEmail,
  cleanString,
  handler,
  HttpError,
  json,
  readJSON,
  serviceClient,
  sha256,
  slugify,
} from "../_shared/lib.ts";

Deno.serve(handler(async (req) => {
  const body = await readJSON(req);

  const installID = cleanString(body.user_id, "user_id", { max: 64 });
  const email = cleanEmail(body.email);
  const orgName = cleanString(body.org, "org", { max: 200, required: false });
  const team = cleanString(body.team, "team", { max: 200, required: false });
  const token = cleanString(body.token, "token", { max: 200 });

  const db = serviceClient();

  // Org: first signup creates it, everyone after joins it. Skipped entirely
  // when none was given.
  let orgID: string | null = null;
  if (orgName) {
    const slug = slugify(orgName);
    if (!slug) throw new HttpError(400, "org name must contain a letter or digit");

    const { data: org, error: orgErr } = await db
      .from("orgs")
      .upsert({ name: orgName, slug }, { onConflict: "slug", ignoreDuplicates: false })
      .select("id")
      .single();
    if (orgErr) {
      console.error("org upsert:", orgErr);
      throw new HttpError(500, "could not record the organisation");
    }
    orgID = org.id;
  }

  // Person: a reinstall or a second machine finds the same row.
  //
  // Signing up again without naming an org must not silently remove someone
  // from the one they are already in, so org_id is only written when we have
  // one to write.
  const patch: Record<string, unknown> = { email, team: team || null };
  if (orgID) patch.org_id = orgID;

  const { data: user, error: userErr } = await db
    .from("users")
    .upsert(patch, { onConflict: "email", ignoreDuplicates: false })
    .select("id")
    .single();
  if (userErr) {
    console.error("user upsert:", userErr);
    throw new HttpError(500, "could not record the user");
  }

  // Install: one per machine, each with its own revocable token.
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

  return json({ ok: true, org: orgName || null, team: team || null });
}));
