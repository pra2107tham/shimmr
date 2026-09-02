#!/usr/bin/env python3
"""Read one field out of packaging/engine.json.

    engine_manifest.py url    linux amd64
    engine_manifest.py sha256 linux amd64

Prints an empty line when unset, so callers can fail with their own message.
"""
import json
import pathlib
import sys

if len(sys.argv) != 4:
    sys.exit(__doc__)

field, goos, goarch = sys.argv[1], sys.argv[2], sys.argv[3]
root = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((root / "packaging" / "engine.json").read_text())
entry = manifest.get("platforms", {}).get(f"{goos}-{goarch}", {})
print(entry.get(field, ""))
