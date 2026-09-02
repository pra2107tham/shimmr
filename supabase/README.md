# Shimmr backend

Two Edge Functions and three tables. `shimmr signup` registers a person and a
machine; `shimmr sync` reports what that machine's agents used.

The CLI already speaks this contract — nothing in the Go client changes when you
deploy this.

## How the URLs line up

The client posts to `{endpoint}/v1/signup` and `{endpoint}/v1/usage`. Supabase
serves functions at `https://<ref>.supabase.co/functions/v1/<name>`. So the
endpoint is:

```
https://<project-ref>.supabase.co/functions
```

No rewrites, no gateway config. The function names `signup` and `usage` do the
work.

## Deploy

```bash
supabase link --project-ref <your-project-ref>
supabase db push                       # creates the tables, views and RLS
supabase functions deploy signup
supabase functions deploy usage
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions
automatically — you do not set them yourself.

Then build a client that points at it:

```bash
make build ENDPOINT=https://<project-ref>.supabase.co/functions
```

Leaving `ENDPOINT` empty produces a fully offline binary that talks to nobody.
That is the default.

## Verify it end to end

```bash
REF=<your-project-ref>
rm -rf ~/.shimmr
./bin/shimmr signup --email you@company.com --org "Your Co" --team Platform \
  --endpoint https://$REF.supabase.co/functions
./bin/shimmr sync
```

Then in the SQL editor:

```sql
select * from org_totals;
select * from install_current;
```

## Schema

| Table | What it holds |
|---|---|
| `orgs` | One row per company. Identified by slug, so "Acme Inc" and "acme inc" are the same org. |
| `users` | One row per person, keyed by email. A reinstall finds the same row. |
| `installs` | One row per machine, each with its own revocable token. |
| `usage_snapshots` | Cumulative totals as of each sync. Tool names and counts only. |

Two views: `install_current` (latest snapshot per machine) and `org_totals`
(people, installs, calls, repos, files and lines per org) — the second is what a
sales conversation actually needs.

### Snapshots, not deltas

The client sends all-time totals every sync, so syncing twice in a day does not
double-count. To see current numbers, read `install_current`; to see growth,
read the `usage_snapshots` history.

## Security

**Tokens are stored as SHA-256, never raw.** A dump of `installs` hands nobody a
working credential.

**RLS is on with no policies**, so `anon` and `authenticated` reach nothing. Only
the Edge Functions, running with the service role key, touch these tables. When
a dashboard arrives it gets explicit read policies; until then, no policy means
no access.

**`verify_jwt` is off** for both functions — see `config.toml`. The CLI carries
its own install token, not a Supabase JWT, so the gateway's check would reject
every legitimate request. Each function does its own authentication instead:
`usage` hashes the bearer token and looks it up, and takes the org from that row
rather than from the payload, so no caller can write usage under someone else's
org.

**Payloads are normalised on the way in.** Counts must be non-negative numbers,
`by_tool` entries that are not `{tool, calls}` pairs are dropped, and bodies over
64 KB are refused. A client bug cannot put arbitrary JSON in the database.

### The one open hole

`signup` is unauthenticated, because the caller has no token yet — that request
is where the token is issued. Someone who finds the URL can create junk orgs.

For a first deployment with design partners that is an acceptable trade, and
Supabase's platform rate limits apply. Before any public launch it wants either
an email round-trip (a real address confirms before the account counts) or a
signup code handed out with the install command. Worth deciding when the volume
justifies it, not before.

### Revoking a machine

```sql
update installs set revoked_at = now() where id = '<install-id>';
```

`usage` returns 403 after that. The local tool keeps working — revoking a token
must never take away a working code tool.
