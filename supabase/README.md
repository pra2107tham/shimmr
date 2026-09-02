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

CI does this automatically when backend code lands on `main`
(`.github/workflows/deploy.yml`). By hand:

```bash
make deploy          # db push + both functions
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

The deploy job ends by curling both endpoints: a GET must return 405, and a
POST to `usage` without a token must return 401. A deploy that leaves `usage`
answering 200 to an anonymous request fails the run rather than going live.

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
