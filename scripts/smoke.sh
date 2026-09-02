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

echo
echo "All $pass checks passed."
