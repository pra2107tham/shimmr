#!/usr/bin/env python3
"""List the tools an engine binary actually exposes.

    engine_tools.py <path-to-engine>          # one name per line
    engine_tools.py <path-to-engine> --count  # just the number

Performs the MCP handshake `shimmr doctor` performs and reads `tools/list`.

This exists because we once published a tool count read from upstream source at
a commit 246 commits ahead of the release we bundle — 17, where the shipped
binary exposes 15. The release job asserts this against packaging/engine.json,
so a future engine bump that changes the surface fails the release instead of
reaching a customer who counts.
"""
import json
import subprocess
import sys

if len(sys.argv) not in (2, 3):
    sys.exit(__doc__)

engine = sys.argv[1]
handshake = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2024-11-05", "capabilities": {},
        "clientInfo": {"name": "shimmr-release-check", "version": "1"}}},
    {"jsonrpc": "2.0", "method": "notifications/initialized"},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
]

proc = subprocess.run(
    [engine],
    input="\n".join(json.dumps(m) for m in handshake) + "\n",
    capture_output=True, text=True, timeout=180,
)

for line in proc.stdout.splitlines():
    try:
        msg = json.loads(line)
    except ValueError:
        continue  # stdout should carry only JSON-RPC, but do not die on noise
    if msg.get("id") == 2 and "result" in msg:
        names = sorted(t["name"] for t in msg["result"].get("tools", []))
        print(len(names) if len(sys.argv) == 3 and sys.argv[2] == "--count"
              else "\n".join(names))
        sys.exit(0)

print("the engine never answered tools/list", file=sys.stderr)
if proc.stderr.strip():
    print("it printed:", proc.stderr.strip()[:500], file=sys.stderr)
sys.exit(1)
