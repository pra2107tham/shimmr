// Shared helpers for the Shimmr Edge Functions.
//
// Both functions run with verify_jwt disabled, because the Shimmr CLI carries
// its own install token rather than a Supabase JWT. Authentication therefore
// happens here, explicitly, on every request.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Largest body we will read. A sync payload is a few kilobytes at most. */
export const MAX_BODY_BYTES = 64 * 1024;

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

/** SHA-256 hex. Tokens are stored hashed, never raw. */
export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Reads and parses a JSON body, refusing anything oversized or malformed. */
export async function readJSON(req: Request): Promise<Record<string, unknown>> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new HttpError(413, "payload too large");
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new HttpError(413, "payload too large");
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "body must be a JSON object");
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "missing bearer token");
  const token = match[1].trim();
  if (!token) throw new HttpError(401, "empty bearer token");
  return token;
}

/** "Acme  Inc." and "acme inc" are the same company. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function cleanString(
  value: unknown,
  field: string,
  { max = 200, required = true } = {},
): string {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required`);
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${field} is required`);
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long (max ${max})`);
  }
  return trimmed;
}

export function cleanEmail(value: unknown): string {
  const email = cleanString(value, "email", { max: 254 }).toLowerCase();
  // Deliberately loose. Address validity is proved by delivery, not by regex.
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "email does not look like an address");
  }
  return email;
}

export function cleanCount(value: unknown, field: string): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${field} must be a number`);
  }
  const n = Math.floor(value);
  if (n < 0) throw new HttpError(400, `${field} cannot be negative`);
  return n;
}

/**
 * Normalises the by_tool array. Anything that is not a recognisable
 * {tool, calls} pair is dropped rather than stored, so a client bug cannot
 * put arbitrary JSON into our database.
 */
export function cleanByTool(value: unknown): Array<{ tool: string; calls: number }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ tool: string; calls: number }> = [];
  for (const entry of value.slice(0, 100)) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const tool = typeof row.tool === "string" ? row.tool.trim().slice(0, 100) : "";
    const calls = typeof row.calls === "number" && Number.isFinite(row.calls)
      ? Math.max(0, Math.floor(row.calls))
      : 0;
    if (tool) out.push({ tool, calls });
  }
  return out;
}

/** Largest batch of events one request may carry. */
export const MAX_EVENTS = 200;

/**
 * Resolves an install token to the machine, the person, and their org.
 *
 * Every authenticated endpoint needs exactly this, and it matters that they all
 * do it the same way: identity comes from the database keyed by the token, never
 * from the request body. Otherwise any caller could write under someone else's
 * organisation.
 */
export async function requireInstall(db: SupabaseClient, token: string): Promise<{
  installID: string;
  userID: string;
  orgID: string | null;
}> {
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
  // that would hide real mistakes. One extra round trip, once per request.
  const { data: owner, error: ownerErr } = await db
    .from("users")
    .select("org_id")
    .eq("id", install.user_id)
    .maybeSingle();

  if (ownerErr) {
    console.error("owner lookup:", ownerErr);
    throw new HttpError(500, "could not verify the token");
  }
  if (!owner) throw new HttpError(500, "install is not attached to a person");

  // org_id is legitimately null: an individual need not name a company.
  return { installID: install.id, userID: install.user_id, orgID: owner.org_id ?? null };
}

/** One event as the client sends it, already validated. */
export interface CleanEvent {
  event_id: string;
  kind: "tool_call" | "index";
  tool: string | null;
  ok: boolean;
  dur_ms: number | null;
  repo: string | null;
  files: number | null;
  lines: number | null;
  bytes: number | null;
  nodes: number | null;
  edges: number | null;
  occurred_at: string;
}

function optionalCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n < 0 ? null : n;
}

/**
 * Normalises a batch of events, dropping anything malformed rather than
 * storing it. A client bug must not be able to put arbitrary JSON in our
 * database, and must not be able to put a path in it either:
 *
 *   - `repo` is required to look like the salted hash it is meant to be. A
 *     path, a repository name, or anything else with a slash or a dot in it
 *     is discarded. This is the one field a client mistake could turn into a
 *     privacy incident, so it is checked here as well as at the source.
 *   - There is no field for code, arguments, or symbol names, here or in the
 *     table, so there is nothing to filter.
 */
export function cleanEvents(value: unknown): CleanEvent[] {
  if (!Array.isArray(value)) throw new HttpError(400, "events must be an array");
  if (value.length > MAX_EVENTS) {
    throw new HttpError(413, `too many events (max ${MAX_EVENTS})`);
  }

  const out: CleanEvent[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const eventID = typeof row.id === "string" ? row.id.trim().slice(0, 64) : "";
    if (!eventID) continue;

    const kind = row.kind === "tool_call" || row.kind === "index" ? row.kind : null;
    if (!kind) continue;

    const at = typeof row.ts === "string" ? new Date(row.ts) : null;
    if (!at || Number.isNaN(at.getTime())) continue;

    const tool = typeof row.tool === "string" ? row.tool.trim().slice(0, 100) : "";

    // A repo id is a hex hash and nothing else. Anything that is not one is
    // dropped, not stored and not corrected.
    const rawRepo = typeof row.repo === "string" ? row.repo.trim() : "";
    const repo = /^[0-9a-f]{8,64}$/.test(rawRepo) ? rawRepo : null;

    out.push({
      event_id: eventID,
      kind,
      tool: tool || null,
      ok: row.ok !== false,
      dur_ms: optionalCount(row.dur_ms),
      repo,
      files: optionalCount(row.files),
      lines: optionalCount(row.lines),
      bytes: optionalCount(row.bytes),
      nodes: optionalCount(row.nodes),
      edges: optionalCount(row.edges),
      occurred_at: at.toISOString(),
    });
  }
  return out;
}

/** A request handler that turns HttpError into a response and logs the rest. */
export function handler(
  fn: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method !== "POST") return fail(405, "use POST");
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      console.error("unhandled:", err);
      return fail(500, "internal error");
    }
  };
}
