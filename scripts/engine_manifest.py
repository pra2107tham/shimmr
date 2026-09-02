#!/usr/bin/env python3
"""Read one field out of packaging/engine.json.

    engine_manifest.py url            linux amd64
    engine_manifest.py sha256         linux amd64
    engine_manifest.py archive_member linux amd64

Platform entries win over top-level keys, so a field like archive_member can be
stated once and overridden for a single platform if a future engine release
names its binary differently there.

Prints an empty line when unset, so callers can fail with their own message.
Set ENGINE_MANIFEST to read a different file — used by the packaging tests,
which point it at a synthetic release.
"""
import json
import os
import pathlib
import sys

if len(sys.argv) != 4:
    sys.exit(__doc__)

field, goos, goarch = sys.argv[1], sys.argv[2], sys.argv[3]
root = pathlib.Path(__file__).resolve().parent.parent
default = root / "packaging" / "engine.json"
manifest = json.loads(pathlib.Path(os.environ.get("ENGINE_MANIFEST") or default).read_text())
entry = manifest.get("platforms", {}).get(f"{goos}-{goarch}", {})
print(entry.get(field, manifest.get(field, "")))
