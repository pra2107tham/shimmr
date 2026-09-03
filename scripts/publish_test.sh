#!/usr/bin/env bash
#
# publish_test.sh — check that publishing puts things where the installers look.
#
# The installers resolve URLs by convention, so the object layout is a contract:
# get a path wrong and the release is silently unreachable, which is exactly the
# failure that made the first release uninstallable. This drives the real script
# against a stand-in Storage API and asserts on the requests it makes, so it
# needs no Supabase project and no network.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP=$(mktemp -d)
PORT=${PORT:-8099}
cleanup() {
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

pass=0
fail=0
ok()  { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }
saw() { grep -qxF "$1" "$TMP/requests.txt"; }
want() { if saw "$1"; then ok "$2"; else bad "$2"; fi; }

# ------------------------------------------------------------ stand-in host

cat > "$TMP/host.py" <<'PY'
import http.server, sys, os

LOG = os.environ["REQUEST_LOG"]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        self.rfile.read(length)
        with open(LOG, "a") as f:
            f.write(f"{self.path}\n")
            if self.headers.get("x-upsert"):
                f.write(f"upsert {self.path}\n")
            if not self.headers.get("authorization", "").startswith("Bearer "):
                f.write(f"UNAUTHENTICATED {self.path}\n")
        # A bucket that already exists answers 400, which the script must treat
        # as success. Exercise that path rather than the happy one.
        code = 400 if self.path.endswith("/storage/v1/bucket") else 200
        self.send_response(code)
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *_):
        pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
PY

: > "$TMP/requests.txt"
REQUEST_LOG="$TMP/requests.txt" python3 "$TMP/host.py" "$PORT" &
SRV=$!
for _ in $(seq 1 30); do
  curl -sf -o /dev/null -X POST "http://127.0.0.1:$PORT/ping" 2>/dev/null && break
  sleep 0.2
done
: > "$TMP/requests.txt"   # drop the readiness ping

# ------------------------------------------------------------------ fixture

mkdir -p "$TMP/dist"
for a in shimmr-linux-amd64.tar.gz shimmr-darwin-arm64.tar.gz shimmr-windows-amd64.zip; do
  echo "archive" > "$TMP/dist/$a"
  echo "hash  $a" > "$TMP/dist/$a.sha256"
done

echo "publishing"

# ---------------------------------------------------------------- supabase

if SUPABASE_URL="http://127.0.0.1:$PORT" \
   SUPABASE_SERVICE_ROLE_KEY=test-key \
   ARTIFACT_HOST=supabase \
   bash scripts/publish_artifacts.sh "$TMP/dist" v9.9.9 > "$TMP/out.txt" 2>&1; then
  ok "publishes to Supabase Storage"
else
  bad "publishes to Supabase Storage"; cat "$TMP/out.txt"
fi

want "/storage/v1/bucket" "creates the bucket, and treats 'already exists' as success"

# latest/ is what `curl | sh` resolves, so every asset must be there.
for a in shimmr-linux-amd64.tar.gz shimmr-darwin-arm64.tar.gz shimmr-windows-amd64.zip; do
  want "/storage/v1/object/releases/latest/download/$a" "latest/ has $a"
  want "/storage/v1/object/releases/latest/download/$a.sha256" "latest/ has its checksum"
done

# A link to a version must keep meaning that version.
want "/storage/v1/object/releases/download/v9.9.9/shimmr-linux-amd64.tar.gz" \
  "the versioned path is written too"

# The installer is served beside what it installs.
want "/storage/v1/object/releases/install.sh"  "install.sh is published"
want "/storage/v1/object/releases/install.ps1" "install.ps1 is published"

# Re-publishing a release must overwrite latest/, not fail on a name clash.
if grep -q "^upsert /storage/v1/object/releases/latest/download/" "$TMP/requests.txt"; then
  ok "uploads are upserts, so re-publishing latest/ works"
else
  bad "uploads are upserts, so re-publishing latest/ works"
fi

if grep -q "^UNAUTHENTICATED" "$TMP/requests.txt"; then
  bad "every request carries the service key"
else
  ok "every request carries the service key"
fi

# The version is normalised, so `0.1.0` and `v0.1.0` cannot produce two trees.
: > "$TMP/requests.txt"
SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=test-key \
  ARTIFACT_HOST=supabase bash scripts/publish_artifacts.sh "$TMP/dist" 9.9.9 >/dev/null 2>&1
want "/storage/v1/object/releases/download/v9.9.9/shimmr-linux-amd64.tar.gz" \
  "a version given without its v still lands under v"

# ---------------------------------------------------------------- refusals

if ARTIFACT_HOST=r2 bash scripts/publish_artifacts.sh "$TMP/dist" v9.9.9 > "$TMP/r2.txt" 2>&1; then
  bad "the R2 stub refuses rather than pretending to publish"
else
  ok "the R2 stub refuses rather than pretending to publish"
  grep -q "R2_ACCOUNT_ID" "$TMP/r2.txt" \
    && ok "and says exactly what wiring it up needs" \
    || bad "and says exactly what wiring it up needs"
fi

: > "$TMP/requests.txt"
if ARTIFACT_HOST=none bash scripts/publish_artifacts.sh "$TMP/dist" v9.9.9 >/dev/null 2>&1; then
  if [ -s "$TMP/requests.txt" ]; then
    bad "an unset host publishes nothing"
  else
    ok "an unset host publishes nothing"
  fi
else
  bad "an unset host succeeds without publishing"
fi

if ARTIFACT_HOST=wat bash scripts/publish_artifacts.sh "$TMP/dist" v9.9.9 >/dev/null 2>&1; then
  bad "an unknown host is rejected"
else
  ok "an unknown host is rejected"
fi

if SUPABASE_URL="http://127.0.0.1:$PORT" ARTIFACT_HOST=supabase \
   bash scripts/publish_artifacts.sh "$TMP/dist" v9.9.9 > "$TMP/nokey.txt" 2>&1; then
  bad "publishing without a service key is refused"
else
  ok "publishing without a service key is refused"
fi

echo
if [ "$fail" -gt 0 ]; then
  echo "$fail failed, $pass passed"
  exit 1
fi
echo "$pass passed"
