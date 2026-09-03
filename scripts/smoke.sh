#!/usr/bin/env bash
#
# End-to-end smoke test: drives the real binary over stdio against a stand-in
# engine. This covers the things unit tests cannot reach — that the account
# gate actually blocks, that stdout carries only JSON-RPC, that the user's own
# agent config survives, and that no path or query reaches the usage log.
#
# Run locally with: ./scripts/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${SHIMMR_BIN:-$ROOT/bin/shimmr}"

if [ ! -x "$BIN" ]; then
  echo "no binary at $BIN — run 'make build' first" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export SHIMMR_HOME="$WORK/shimmr"
export HOME="$WORK/home"
mkdir -p "$HOME/.cursor"

pass=0
fail() { echo "  FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok — $*"; pass=$((pass + 1)); }

# A stand-in for the engine: newline-delimited JSON-RPC over stdio.
cat > "$WORK/engine.py" <<'PY'
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except Exception:
        continue
    if "id" not in msg:
        continue
    method = msg.get("method", "")
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05",
                  "serverInfo": {"name": "engine", "version": "0"}}
    elif method == "tools/list":
        result = {"tools": [{"name": "search_graph"},
                            {"name": "index_repository"}]}
    elif method == "tools/call":
        result = {"content": [{"type": "text", "text": "ok"}], "isError": False}
    else:
        result = {}
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": result}) + "\n")
    sys.stdout.flush()
PY

printf '#!/bin/sh\nexec python3 %s/engine.py\n' "$WORK" > "$WORK/engine.sh"
chmod +x "$WORK/engine.sh"

echo "1. the account gate blocks before signup"
if echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | "$BIN" serve >/dev/null 2>&1; then
  fail "serve started without an account"
fi
ok "serve refuses to run without an account"

echo "2. signup records who is using this"
"$BIN" signup --email ci@example.com --org "CI Org" --team Platform >/dev/null
grep -q '"email": "ci@example.com"' "$SHIMMR_HOME/config.json" \
  || fail "email not recorded"
grep -q '"org": "CI Org"' "$SHIMMR_HOME/config.json" \
  || fail "org not recorded"
ok "email, org and team captured"

python3 - "$SHIMMR_HOME/config.json" "$WORK/engine.sh" <<'PY'
import json, sys
p, engine = sys.argv[1], sys.argv[2]
c = json.load(open(p))
c["engine_path"] = engine
json.dump(c, open(p, "w"), indent=2)
PY

echo "3. init preserves the user's existing config"
cat > "$HOME/.cursor/mcp.json" <<'JSON'
{"mcpServers":{"theirs":{"command":"do-not-touch"}},"theirKey":42}
JSON
"$BIN" init --yes >/dev/null
python3 - "$HOME/.cursor/mcp.json" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1]))
assert doc.get("theirKey") == 42, "unrelated top-level key was lost"
servers = doc["mcpServers"]
assert "theirs" in servers, "the user's own MCP server was removed"
assert "shimmr" in servers, "shimmr was not registered"
PY
[ -f "$HOME/.cursor/mcp.json.shimmr.bak" ] || fail "no backup written"
ok "other servers, other keys and a backup all intact"

echo "4. proxying, with stdout kept clean"
REPO="$WORK/repo"
mkdir -p "$REPO/src"
printf 'package main\n\nfunc main() {}\n' > "$REPO/src/main.go"
printf 'print(1)\n' > "$REPO/src/tool.py"

cat > "$WORK/in.jsonl" <<JSON
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_graph","arguments":{"query":"UniqueSecretQueryString"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"index_repository","arguments":{"repo_path":"$REPO"}}}
JSON

"$BIN" serve < "$WORK/in.jsonl" > "$WORK/out.jsonl" 2>"$WORK/err.txt"

python3 - "$WORK/out.jsonl" <<'PY'
import json, sys
n = 0
for i, line in enumerate(open(sys.argv[1]), 1):
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)          # raises if anything non-JSON leaked
    assert msg.get("jsonrpc") == "2.0", f"line {i} is not JSON-RPC"
    n += 1
assert n == 3, f"expected 3 responses, got {n}"
PY
ok "stdout carried only valid JSON-RPC, nothing else"

grep -q "shimmr" "$WORK/err.txt" || fail "startup banner did not go to stderr"
ok "our own logging went to stderr"

echo "5. usage was recorded"
LOG="$SHIMMR_HOME/usage.jsonl"
[ -f "$LOG" ] || fail "no usage log written"
grep -q '"tool":"search_graph"' "$LOG" || fail "tool call not recorded"
grep -q '"kind":"index"' "$LOG"        || fail "index not recorded"
grep -q '"files":2' "$LOG"             || fail "file count wrong (expected 2)"
grep -q '"lines":4' "$LOG"             || fail "line count wrong (expected 4)"
ok "tool calls, file count and line count all recorded"

echo "6. the log leaks nothing"
for needle in "$REPO" "UniqueSecretQueryString" "repo_path" "arguments" "main.go"; do
  if grep -qF "$needle" "$LOG"; then
    fail "usage log leaked: $needle"
  fi
done
ok "no path, query, filename or argument in the log"

echo "7. doctor reports engine health"
"$BIN" doctor >"$WORK/doctor.txt" 2>&1 || fail "doctor exited non-zero with a working engine"
grep -q "Everything checks out" "$WORK/doctor.txt" \
  || fail "doctor did not confirm a healthy setup: $(cat "$WORK/doctor.txt")"
ok "doctor confirms a healthy setup"

# A broken engine must be reported, not glossed over. This is the Q10 path:
# the person finds out from us, not from a cryptic failure inside their editor.
sed -i.bak 's#"engine_path": "[^"]*"#"engine_path": "/definitely/not/an/engine"#' \
  "$SHIMMR_HOME/config.json"
if "$BIN" doctor >"$WORK/doctor-bad.txt" 2>&1; then
  fail "doctor reported success with a missing engine"
fi
grep -qi "not found" "$WORK/doctor-bad.txt" || fail "doctor did not name the problem"
ok "doctor fails loudly when the engine is missing"
mv "$SHIMMR_HOME/config.json.bak" "$SHIMMR_HOME/config.json"

echo "8. stats and payload transparency"
"$BIN" stats | grep -q "2 files" || fail "stats did not report coverage"
"$BIN" stats --method | grep -qi "capped" || fail "stats --method did not explain the cap"
"$BIN" sync --show | grep -q "ci@example.com" || fail "sync --show did not print the payload"
for needle in "$REPO" "UniqueSecretQueryString"; do
  if "$BIN" sync --show | grep -qF "$needle"; then
    fail "sync payload leaked: $needle"
  fi
done
ok "stats reports coverage; sync payload is printable and clean"

echo "9. usage reports live, and reports nothing sensitive"

# A stand-in backend. `serve` posts batches here while the agent works, which
# is the whole point of live reporting — nobody types `shimmr sync`.
cat > "$WORK/backend.py" <<'PY'
import http.server, os, sys

LOG = os.environ["BACKEND_LOG"]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length") or 0))
        with open(LOG, "ab") as f:
            f.write(self.path.encode() + b"\n")
            f.write(self.headers.get("authorization", "none").encode() + b"\n")
            f.write(body + b"\n")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, *_):
        pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
PY

BACKEND_PORT=8123
: > "$WORK/backend.log"
BACKEND_LOG="$WORK/backend.log" python3 "$WORK/backend.py" "$BACKEND_PORT" &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true; rm -rf "$WORK"' EXIT
for _ in $(seq 1 40); do
  curl -sf -o /dev/null -X POST "http://127.0.0.1:$BACKEND_PORT/ping" 2>/dev/null && break
  sleep 0.2
done
: > "$WORK/backend.log"

python3 - "$SHIMMR_HOME/config.json" "http://127.0.0.1:$BACKEND_PORT" <<'PY'
import json, sys
p, endpoint = sys.argv[1], sys.argv[2]
c = json.load(open(p))
c["endpoint"] = endpoint
json.dump(c, open(p, "w"), indent=2)
PY

"$BIN" serve < "$WORK/in.jsonl" > "$WORK/out2.jsonl" 2>"$WORK/err2.txt"

grep -q "usage reporting on" "$WORK/err2.txt" \
  || fail "serve did not say on stderr that it reports usage"
grep -qF "/v1/events" "$WORK/backend.log" \
  || fail "no events reached the backend: $(cat "$WORK/backend.log")"
grep -q "^Bearer shm_" "$WORK/backend.log" \
  || fail "events were sent without the install token"
grep -qF '"tool":"search_graph"' "$WORK/backend.log" \
  || fail "the tool call was not reported"
ok "tool calls reach the backend as they happen, authenticated"

# The same rule as the log, on the wire this time. This is the claim the whole
# pitch rests on, so it is checked against the bytes actually sent.
for needle in "$REPO" "UniqueSecretQueryString" "repo_path" "arguments" "main.go" "tool.py"; do
  if grep -qF "$needle" "$WORK/backend.log"; then
    fail "live report leaked: $needle"
  fi
done
ok "no path, query, filename or argument left the machine"

# Turning it off must actually turn it off. Three switches, and the one a
# person reaches for first is the environment variable.
: > "$WORK/backend.log"
SHIMMR_NO_REPORT=1 "$BIN" serve < "$WORK/in.jsonl" > /dev/null 2>"$WORK/err3.txt"
[ -s "$WORK/backend.log" ] && fail "SHIMMR_NO_REPORT=1 still sent usage"
grep -q "usage reporting off" "$WORK/err3.txt" \
  || fail "serve did not report that sharing was off"
ok "SHIMMR_NO_REPORT=1 sends nothing, and says so"

echo "10. an account without an organisation works"
"$BIN" signup --force --email solo@example.com >/dev/null
"$BIN" whoami | grep -q "Organisation   none" \
  || fail "whoami did not handle an account with no org"
"$BIN" whoami | grep -q "solo@example.com" || fail "whoami lost the email"
ok "signing up with no organisation is a supported state"

echo
echo "All $pass checks passed."
