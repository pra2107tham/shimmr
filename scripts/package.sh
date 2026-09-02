#!/usr/bin/env bash
#
# package.sh — assemble one platform's release archive.
#
#   scripts/package.sh linux amd64
#
# The archive contains everything a person needs: the Shimmr binary, the
# indexing engine, and the licence notices. One download, one checksum, and
# nothing fetched at install time — an installer that reaches out to a third
# party mid-install is one outage away from a bad first impression.
#
# The engine comes from ENGINE_SRC when set (a local build, for development),
# otherwise from packaging/engine.json for the target platform.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GOOS="${1:?usage: package.sh <goos> <goarch>}"
GOARCH="${2:?usage: package.sh <goos> <goarch>}"
VERSION="${VERSION:-$(sed -n 's/^VERSION := //p' Makefile)}"
ENDPOINT="${ENDPOINT:-}"
OUT="${OUT:-dist}"

NAME="shimmr-${VERSION}-${GOOS}-${GOARCH}"
# The archive name carries no version, so that
# /releases/latest/download/shimmr-<os>-<arch>.tar.gz resolves without the
# installer having to discover which version "latest" is. The version is still
# visible in the extracted directory name and in `shimmr version`.
ASSET="shimmr-${GOOS}-${GOARCH}"
STAGE="$OUT/$NAME"
EXE=""
[ "$GOOS" = "windows" ] && EXE=".exe"

rm -rf "$STAGE"
mkdir -p "$STAGE/LICENSES"

echo "==> $NAME"

# ---------------------------------------------------------------- shimmr
CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" go build \
  -ldflags "-s -w -X github.com/pra2107tham/shimmr/internal/config.DefaultEndpoint=$ENDPOINT" \
  -o "$STAGE/shimmr$EXE" ./cmd/shimmr
echo "    shimmr        $(du -h "$STAGE/shimmr$EXE" | cut -f1)"

# ---------------------------------------------------------------- licences
# Release-blocking: shipping the engine without its copyright notice is a
# licence violation, not a missing nicety.
cp LICENSES/shimmr.txt LICENSES/engine-MIT.txt "$STAGE/LICENSES/"
grep -q "Copyright (c)" "$STAGE/LICENSES/engine-MIT.txt" \
  || { echo "engine notice has no copyright line — refusing to package" >&2; exit 1; }
echo "    LICENSES      $(ls "$STAGE/LICENSES" | wc -l | tr -d ' ') notices"

# ---------------------------------------------------------------- engine
engine_dest="$STAGE/shimmr-engine$EXE"

if [ -n "${ENGINE_SRC:-}" ]; then
  # Development path: bundle a locally built engine. Never used for a release,
  # because a local build has a different build fingerprint than the published
  # artifact and would conflict with a customer's existing install (ADR 0007).
  echo "    engine        from ENGINE_SRC (development only)"
  cp "$ENGINE_SRC" "$engine_dest"
else
  url=$(python3 scripts/engine_manifest.py url "$GOOS" "$GOARCH")
  want=$(python3 scripts/engine_manifest.py sha256 "$GOOS" "$GOARCH")
  if [ -z "$url" ] || [ -z "$want" ]; then
    echo "packaging/engine.json has no entry for $GOOS/$GOARCH." >&2
    echo "Fill in the url and sha256 for the pinned engine release first." >&2
    exit 1
  fi
  echo "    engine        downloading"
  curl -fsSL --retry 3 -o "$engine_dest.dl" "$url"
  got=$(sha256sum "$engine_dest.dl" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    echo "engine checksum mismatch for $GOOS/$GOARCH" >&2
    echo "  expected $want" >&2
    echo "  got      $got" >&2
    exit 1
  fi
  mv "$engine_dest.dl" "$engine_dest"
fi
chmod +x "$engine_dest"
echo "    engine        $(du -h "$engine_dest" | cut -f1)"

# ---------------------------------------------------------------- readme
cat > "$STAGE/README.txt" <<EOF
Shimmr $VERSION ($GOOS/$GOARCH)

  shimmr${EXE}          the command you run
  shimmr-engine${EXE}   the indexing engine it drives
  LICENSES/             licences of everything here, also via 'shimmr licenses'

To install by hand, keep the two binaries next to each other and put them on
your PATH. The installer places them at:

  /usr/local/bin/shimmr
  /usr/local/lib/shimmr/shimmr-engine

Then:

  shimmr signup --email you@company.com --org "Your Co"
  shimmr init
  shimmr doctor

Shimmr never sets CBM_CACHE_DIR. If you already run the engine yourself, leave
that variable alone so both copies share one storage location.
EOF

# ---------------------------------------------------------------- archive
mkdir -p "$OUT"
if [ "$GOOS" = "windows" ]; then
  ( cd "$OUT" && zip -qr "$ASSET.zip" "$NAME" )
  archive="$OUT/$ASSET.zip"
else
  tar -czf "$OUT/$ASSET.tar.gz" -C "$OUT" "$NAME"
  archive="$OUT/$ASSET.tar.gz"
fi
rm -rf "$STAGE"

( cd "$OUT" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256" )
echo "    archive       $(du -h "$archive" | cut -f1)  $(basename "$archive")"
