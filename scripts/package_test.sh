#!/usr/bin/env bash
#
# package_test.sh — check that packaging assembles a correct archive.
#
# The engine is published as a .tar.gz (unix) or .zip (Windows) with the binary
# inside, and packaging has to download it, verify the archive as downloaded,
# and lift the binary out. That is four things that can each be wrong in a way
# nobody notices until a customer's install has no engine in it.
#
# Real downloads are not used here: the test builds its own synthetic engine
# release and points the manifest at it with file:// URLs, so this runs offline
# and does not depend on a third party being up.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0
fail=0
ok()   { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1"; printf '          want %s\n          got  %s\n' "$3" "$2"; fi; }

if command -v sha256sum >/dev/null 2>&1; then
  sum256() { sha256sum "$1" | cut -d' ' -f1; }
else
  sum256() { shasum -a 256 "$1" | cut -d' ' -f1; }
fi

# --------------------------------------------------------- synthetic release
#
# Flat archives with the binary at the root, which is how the engine publishes
# them, plus one nested archive to prove packaging finds the binary either way.

release="$TMP/release"
mkdir -p "$release/flat" "$release/nested/codebase-memory-mcp-0.0.0"

printf 'unix engine\n'    > "$release/flat/codebase-memory-mcp"
printf 'windows engine\n' > "$release/flat/codebase-memory-mcp.exe"
printf 'nested engine\n'  > "$release/nested/codebase-memory-mcp-0.0.0/codebase-memory-mcp"
chmod +x "$release/flat/codebase-memory-mcp" "$release/flat/codebase-memory-mcp.exe"

# The real archives also carry the engine's LICENSE and the notices for the
# libraries it bundles. Ours is indented, as the engine's own file is, so the
# comparison is exercised on text that differs in whitespace but not in terms.
sed 's/^/  /' LICENSES/engine-MIT.txt > "$release/flat/LICENSE"
printf '# Third-party notices\n\nSomething vendored.\n' > "$release/flat/THIRD_PARTY_NOTICES.md"
cp "$release/flat/LICENSE" "$release/flat/THIRD_PARTY_NOTICES.md" \
   "$release/nested/codebase-memory-mcp-0.0.0/"

tar -czf "$release/unix.tar.gz" -C "$release/flat" \
    codebase-memory-mcp LICENSE THIRD_PARTY_NOTICES.md
tar -czf "$release/nested.tar.gz" -C "$release/nested" codebase-memory-mcp-0.0.0
( cd "$release/flat" && zip -q "$release/windows.zip" \
    codebase-memory-mcp.exe LICENSE THIRD_PARTY_NOTICES.md )
# An archive with everything except the thing we came for.
tar -czf "$release/empty.tar.gz" -C "$release/flat" LICENSE THIRD_PARTY_NOTICES.md

# A relicensed engine, and one whose notices went missing.
mkdir -p "$release/relicensed" "$release/nonotices"
cp "$release/flat/codebase-memory-mcp" "$release/flat/THIRD_PARTY_NOTICES.md" "$release/relicensed/"
printf 'GPL-3.0\n\nCopyright (c) 2025 Somebody Else\n' > "$release/relicensed/LICENSE"
tar -czf "$release/relicensed.tar.gz" -C "$release/relicensed" \
    codebase-memory-mcp LICENSE THIRD_PARTY_NOTICES.md
cp "$release/flat/codebase-memory-mcp" "$release/flat/LICENSE" "$release/nonotices/"
tar -czf "$release/nonotices.tar.gz" -C "$release/nonotices" codebase-memory-mcp LICENSE

manifest() { # manifest <platform> <archive> <sha256>
  cat > "$TMP/engine.json" <<JSON
{
  "version": "test",
  "archive_member": "codebase-memory-mcp",
  "platforms": {
    "$1": { "url": "file://$release/$2", "sha256": "$3" }
  }
}
JSON
}

package() { # package <goos> <goarch>  — quiet unless it fails
  ENGINE_MANIFEST="$TMP/engine.json" OUT="$TMP/dist" VERSION=0.0.0-test \
    bash scripts/package.sh "$1" "$2" > "$TMP/log" 2>&1
}

echo "packaging"

# ------------------------------------------------- a flat .tar.gz, the common case
manifest linux-amd64 unix.tar.gz "$(sum256 "$release/unix.tar.gz")"
if package linux amd64; then
  ok "packages linux/amd64 from a .tar.gz"
  rm -rf "$TMP/x"; mkdir -p "$TMP/x"
  tar -xzf "$TMP/dist/shimmr-linux-amd64.tar.gz" -C "$TMP/x"
  dir=$(find "$TMP/x" -maxdepth 1 -type d -name 'shimmr-*' | head -1)
  check "the engine is in the archive" "$(cat "$dir/shimmr-engine" 2>/dev/null)" "unix engine"
  [ -x "$dir/shimmr-engine" ] && ok "the engine is executable" || bad "the engine is executable"
  [ -x "$dir/shimmr" ] && ok "shimmr is in the archive" || bad "shimmr is in the archive"
  [ -f "$dir/LICENSES/engine-MIT.txt" ] && ok "the engine notice ships" || bad "the engine notice ships"
  check "the engine's own third-party notices ship" \
    "$(cat "$dir/LICENSES/engine-third-party.md" 2>/dev/null)" \
    "$(cat "$release/flat/THIRD_PARTY_NOTICES.md")"
  # Whoever installs must be able to check what they downloaded.
  ( cd "$TMP/dist" && sha256sum -c shimmr-linux-amd64.tar.gz.sha256 >/dev/null 2>&1 ) \
    && ok "the published checksum matches the archive" \
    || bad "the published checksum matches the archive"
else
  bad "packages linux/amd64 from a .tar.gz"; cat "$TMP/log"
fi

# --------------------------------------------------- a .zip, and the .exe suffix
#
# The Windows engine is codebase-memory-mcp.exe inside a zip and must land as
# shimmr-engine.exe. A bare "shimmr-engine" is a file the Windows build can
# never find.
manifest windows-amd64 windows.zip "$(sum256 "$release/windows.zip")"
if package windows amd64; then
  ok "packages windows/amd64 from a .zip"
  rm -rf "$TMP/w"; mkdir -p "$TMP/w"
  unzip -qo "$TMP/dist/shimmr-windows-amd64.zip" -d "$TMP/w"
  dir=$(find "$TMP/w" -maxdepth 1 -type d -name 'shimmr-*' | head -1)
  check "the engine is shimmr-engine.exe" "$(cat "$dir/shimmr-engine.exe" 2>/dev/null)" "windows engine"
  [ -f "$dir/shimmr.exe" ] && ok "shimmr.exe is in the archive" || bad "shimmr.exe is in the archive"
else
  bad "packages windows/amd64 from a .zip"; cat "$TMP/log"
fi

# ------------------------------------------------------------- nested archive
manifest linux-arm64 nested.tar.gz "$(sum256 "$release/nested.tar.gz")"
if package linux arm64; then
  rm -rf "$TMP/n"; mkdir -p "$TMP/n"
  tar -xzf "$TMP/dist/shimmr-linux-arm64.tar.gz" -C "$TMP/n"
  dir=$(find "$TMP/n" -maxdepth 1 -type d -name 'shimmr-*' | head -1)
  check "finds the engine below the archive root" "$(cat "$dir/shimmr-engine" 2>/dev/null)" "nested engine"
else
  bad "finds the engine below the archive root"; cat "$TMP/log"
fi

# ------------------------------------------------------------------ refusals
#
# Each of these must stop the release rather than produce a bundle. A packaging
# step that fails open ships an archive nobody verified.

rm -f "$TMP/dist/shimmr-darwin-amd64.tar.gz"
manifest darwin-amd64 unix.tar.gz "0000000000000000000000000000000000000000000000000000000000000000"
if package darwin amd64; then
  bad "refuses an engine whose checksum is wrong"
else
  ok "refuses an engine whose checksum is wrong"
  [ -f "$TMP/dist/shimmr-darwin-amd64.tar.gz" ] \
    && bad "and packages nothing" || ok "and packages nothing"
  grep -q "checksum mismatch" "$TMP/log" \
    && ok "and says why" || bad "and says why"
fi

rm -f "$TMP/dist/shimmr-darwin-arm64.tar.gz"
manifest darwin-arm64 empty.tar.gz "$(sum256 "$release/empty.tar.gz")"
if package darwin arm64; then
  bad "refuses an archive with no engine in it"
else
  ok "refuses an archive with no engine in it"
  [ -f "$TMP/dist/shimmr-darwin-arm64.tar.gz" ] \
    && bad "and packages nothing either" || ok "and packages nothing either"
fi

cat > "$TMP/engine.json" <<'JSON'
{ "archive_member": "codebase-memory-mcp", "platforms": { "linux-amd64": {} } }
JSON
rm -f "$TMP/dist/shimmr-linux-amd64.tar.gz"
if package linux amd64; then
  bad "refuses to package with the engine unpinned"
else
  ok "refuses to package with the engine unpinned"
fi

rm -f "$TMP/dist/shimmr-linux-amd64.tar.gz"
manifest linux-amd64 relicensed.tar.gz "$(sum256 "$release/relicensed.tar.gz")"
if package linux amd64; then
  bad "refuses an engine whose licence has changed"
else
  ok "refuses an engine whose licence has changed"
  grep -q "no longer matches" "$TMP/log" && ok "and says the notice is stale" \
    || bad "and says the notice is stale"
fi

rm -f "$TMP/dist/shimmr-linux-amd64.tar.gz"
manifest linux-amd64 nonotices.tar.gz "$(sum256 "$release/nonotices.tar.gz")"
if package linux amd64; then
  bad "refuses an engine with no third-party notices"
else
  ok "refuses an engine with no third-party notices"
fi

# ----------------------------------------------------- the real manifest is sane
#
# Not a download — just that every platform we build for is actually pinned, so
# a missing entry is caught here rather than half way through a release.
for p in darwin-arm64 darwin-amd64 linux-amd64 linux-arm64 windows-amd64; do
  goos=${p%-*}; goarch=${p#*-}
  url=$(python3 scripts/engine_manifest.py url "$goos" "$goarch")
  sha=$(python3 scripts/engine_manifest.py sha256 "$goos" "$goarch")
  member=$(python3 scripts/engine_manifest.py archive_member "$goos" "$goarch")
  if [ -n "$url" ] && [ ${#sha} -eq 64 ] && [ -n "$member" ]; then
    ok "$p is pinned"
  else
    bad "$p is pinned"
  fi
done

echo
if [ "$fail" -gt 0 ]; then
  echo "$fail failed, $pass passed"
  exit 1
fi
echo "$pass passed"
