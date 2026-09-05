# Shimmr backend

Seven Edge Functions and five tables. `shimmr signup`/`shimmr login` register
a person and a machine — now by opening a browser to a verified sign-in by
default (`cli_start`/`cli_poll`/`cli_claim`, ADR 0012), with `--email` kept as
an explicit, unverified fallback; `shimmr sync` and the live event stream
report what that machine's agents used; the website (`site/`) reads a
person's own usage back through Supabase Auth and RLS (ADR 0011).

The CLI already speaks this contract — nothing in the Go client's `usage`/
`events` authentication changes when you deploy this.

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

CI does this automatically when backend code lands on `main`
(`.github/workflows/deploy.yml`). By hand:

```bash
make deploy          # db push + every function
```

### Repository secrets

Three, under **Settings → Secrets and variables → Actions**:

| Secret | What it is | Where to get it |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Your personal CLI token | Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | The `abcdefgh` in `abcdefgh.supabase.co` | Project settings → General |
| `SUPABASE_DB_PASSWORD` | Database password | Project settings → Database |

Repo-level secrets are the right scope here: they are not exposed to pull
requests from forks, and the deploy job is the only thing that reads them.

**`SUPABASE_SERVICE_ROLE_KEY` is deliberately not on that list.** Supabase
injects it into Edge Functions at runtime, along with `SUPABASE_URL`. It never
needs to sit in GitHub, and it should never be pasted into a chat, a commit, or
an issue — it bypasses every row-level security rule in this schema.

The deploy job ends by curling every endpoint: a GET must return 405, and a
POST to an authenticated one (`usage`, `events`, `cli_claim`) without a valid
token must return 401. A deploy that leaves any of them answering 200 to an
anonymous request fails the run rather than going live.

Then build a client that points at it:

```bash
make build ENDPOINT=https://<project-ref>.supabase.co/functions
```

Leaving `ENDPOINT` empty produces a fully offline binary that talks to nobody.
That is the default.

## Working on it locally

Everything is driveable from this repo. No dashboard needed.

```bash
make db-start        # local Postgres + Edge runtime + Studio (needs Docker)
make db-reset        # rebuild from migrations, then apply seed.sql
make db-test         # assert the schema behaves
make db-query        # run every saved query in supabase/queries/
make db-query Q=01   # just that one
make functions-serve # serve the Edge Functions against the local stack
make backend-check   # deno fmt, lint and type check
```

`make db-test` and `make db-query` take a `PGURL`, so they work against any
Postgres:

```bash
make db-test PGURL="postgresql://postgres:postgres@localhost:5432/postgres"
```

### What lives where

| Path | Purpose |
|---|---|
| `migrations/` | The schema. The only way it ever changes. |
| `seed.sql` | Local development data — two orgs, three people, a fortnight of usage. |
| `tests/schema_test.sql` | Assertions on uniqueness, cascades, constraints, both views' maths, and RLS. |
| `queries/` | The things you would otherwise click through the dashboard for. |
| `functions/` | The two endpoints. |

### Changing the schema

Never edit an applied migration. Add a new one:

```bash
supabase migration new add_whatever
# edit the generated file, then:
make db-reset && make db-test
```

CI applies every migration in order to a clean Postgres and runs the schema
tests on every push, so a broken migration fails before it reaches the project.

### On ORMs

There isn't one, deliberately. Nothing in the Go client touches Postgres — it
only speaks to the two Edge Functions, and those use `supabase-js`. An ORM here
would be a layer with no caller. If a dashboard later needs typed queries, that
is the moment to add one, against the tables as they exist then.

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
| `users` | One row per person, keyed by email. A reinstall — or a web sign-in with the same address — finds the same row. `auth_user_id` links it to a Supabase Auth session once one exists (ADR 0011). |
| `installs` | One row per machine, each with its own revocable token. |
| `usage_snapshots` | Cumulative totals as of each sync. Tool names and counts only. |
| `usage_events` | One row per tool call or index, reported live. Same privacy rule as above. |
| `cli_pairings` | Short-lived codes linking a waiting `shimmr login`/`signup` to the browser tab where someone confirms it (ADR 0012). Disposable — nothing here is read again once claimed or expired. |

Views worth knowing: `install_current`/`install_live`/`install_rollup` (a
machine's current picture, from a sync or the live stream, whichever is
newer) and `org_totals`/`tool_usage` (rolled up per company) — the pair a
sales conversation actually needs. Two functions built on those views —
`my_org_totals()`/`my_org_tool_usage()` — let a signed-in member of an org
read that org's own aggregate through the website; see ADR 0013 below.

### Snapshots, not deltas

The client sends all-time totals every sync, so syncing twice in a day does not
double-count. To see current numbers, read `install_current`; to see growth,
read the `usage_snapshots` history.

## Security

**Tokens are stored as SHA-256, never raw.** A dump of `installs` hands nobody a
working credential.

**RLS is on, and the dashboard now has explicit read policies.** The Edge
Functions still do everything they always did with the service role key, which
bypasses RLS entirely — nothing about how `signup`, `login`, `usage` or
`events` work has changed. What changed is `authenticated`: a person signed in
on the website (Supabase Auth — magic link, Google, or GitHub) can now
`select` their own row in `users`, their own `installs`, and their own
`usage_snapshots`/`usage_events` — never anyone else's, and never a direct
read of an org-wide view. `anon` still reaches nothing at all. See [ADR
0011](../docs/decisions/0011-web-auth-and-dashboard.md).

**A member of an org can read that org's aggregate, never a teammate's row.**
`my_org_totals()`/`my_org_tool_usage()` are `SECURITY DEFINER` functions, not
a grant on `org_totals`/`tool_usage` themselves — they resolve the caller's
own `org_id` from `auth.uid()` and hand back only that org's pre-aggregated
rows. `EXECUTE` is revoked from `PUBLIC` (a fresh function grants it by
default, unlike a table) and granted only to `authenticated`. See [ADR
0013](../docs/decisions/0013-org-dashboard-is-aggregate-only.md).

**`verify_jwt` is off** for every function — see `config.toml`. The CLI carries
its own install token, not a Supabase JWT, so the gateway's check would reject
every legitimate request. Each function does its own authentication instead:
`usage` and `events` hash the bearer token and look it up, and take the org
from that row rather than from the payload, so no caller can write usage under
someone else's org. `cli_claim` is the one exception with something to check —
it verifies a real Supabase Auth JWT itself (`authClient.auth.getUser(jwt)`),
because that request *is* a Supabase session, not an install token; see ADR
0012. A function added without a matching entry in `config.toml` is rejected
at the gateway before it runs at all, which is exactly what happened to
`login` and `events` on their first deploy — caught by the smoke test's
GET-must-405 check, not by inspection.

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
