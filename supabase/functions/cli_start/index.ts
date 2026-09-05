// POST /functions/v1/cli_start
//
// Called by `shimmr login`/`shimmr signup` before opening a browser. The
// CLI has already generated its own install id and token — exactly what
// signup/login have always required — and this just registers a
// short-lived code the website can use to attach them to whoever confirms
// it there.
//
// Deliberately unauthenticated: there is no install yet for a caller to
// authenticate as, the same reasoning `signup` has always had. Nothing
// durable is created here — only cli_claim, gated on a real signed-in
// session, ever writes to `installs`.

import {
  cleanString,
  handler,
  HttpError,
  json,
  randomCode,
  readJSON,
  serviceClient,
  sha256,
} from "../_shared/lib.ts";

const CODE_ATTEMPTS = 5;
const TTL_SECONDS = 10 * 60;

Deno.serve(handler(async (req) => {
  const body = await readJSON(req);

  const installID = cleanString(body.install_id, "install_id", { max: 64 });
  const token = cleanString(body.token, "token", { max: 200 });
  // Display-only — see the migration and cli_poll's comment. Never used for
  // anything but showing the confirm page a friendlier name than the code.
  const machine = cleanString(body.machine, "machine", { max: 120, required: false });

  const db = serviceClient();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  // The code is the primary key, so a collision is a conflict to retry past,
  // not a corruption — the odds are astronomically small, but a retry loop
  // costs nothing and means never trusting one draw from the RNG.
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const { error } = await db.from("cli_pairings").insert({
      code,
      install_id: installID,
      token_hash: tokenHash,
      expires_at: expiresAt,
      machine_label: machine || null,
    });
    if (!error) {
      return json({ code, expires_in: TTL_SECONDS });
    }
    if (error.code !== "23505") { // not unique_violation — a real problem
      console.error("cli_pairings insert:", error);
      throw new HttpError(500, "could not start sign-in");
    }
  }
  throw new HttpError(500, "could not generate a unique code — try again");
}));
