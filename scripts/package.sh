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
# Packaged builds point at the live backend; a plain `make build` stays offline
# so development never reports usage to production.
ENDPOINT="${ENDPOINT:-$(cat packaging/endpoint 2>/dev/null || true)}"
# Same idea, different host: where `shimmr login`/`shimmr signup` open a
# browser for verified sign-in.
SITE_URL="${SITE_URL:-$(cat packaging/site_url 2>/dev/null || true)}"
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

# A failed package must not leave a half-built stage or a 40 MB engine download
# behind. Only the finished archive survives this script.
trap 'rm -rf "$STAGE" "$OUT/.engine-$GOOS-$GOARCH"' EXIT INT TERM

# macOS ships shasum, Linux ships sha256sum, and `make package` has to work on
# a maintainer's laptop as well as on the release runner.
if command -v sha256sum >/dev/null 2>&1; then
  sum256() { sha256sum "$@"; }
elif command -v shasum >/dev/null 2>&1; then
  sum256() { shasum -a 256 "$@"; }
else
  echo "neither sha256sum nor shasum is available — cannot verify anything" >&2
  exit 1
fi

# Windows ships python.exe, not python3, and Git Bash inherits whatever is on
# PATH. The candidate is run rather than merely located, because the Windows
# Store puts a python3 stub on PATH that is not an interpreter.
PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import sys" >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "packaging needs python3 — it reads the engine pins and writes the zip" >&2
  exit 1
fi

echo "==> $NAME"

# ---------------------------------------------------------------- shimmr
CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" go build \
  -ldflags "-s -w -X github.com/pra2107tham/shimmr/internal/config.DefaultEndpoint=$ENDPOINT -X github.com/pra2107tham/shimmr/internal/config.DefaultSiteURL=$SITE_URL" \
  -o "$STAGE/shimmr$EXE" ./cmd/shimmr
echo "    shimmr        $(du -h "$STAGE/shimmr$EXE" | cut -f1)"

# ---------------------------------------------------------------- licences
# Release-blocking: shipping the engine without its copyright notice is a
# licence violation, not a missing nicety. The engine's own notices are added
# below, out of its archive, once that has been verified.
cp LICENSES/shimmr.txt LICENSES/engine-MIT.txt "$STAGE/LICENSES/"
grep -q "Copyright (c)" "$STAGE/LICENSES/engine-MIT.txt" \
  || { echo "engine notice has no copyright line — refusing to package" >&2; exit 1; }

# Whitespace differs between the engine's LICENSE and our copy of it; the terms
# and the copyright holder are what must not.
notice_text() { tr -s '[:space:]' ' ' < "$1" | sed 's/^ //; s/ $//'; }

# ---------------------------------------------------------------- engine
engine_dest="$STAGE/shimmr-engine$EXE"

if [ -n "${ENGINE_SRC:-}" ]; then
  # Development path: bundle a locally built engine. Never used for a release,
  # because a local build has a different build fingerprint than the published
  # artifact and would conflict with a customer's existing install (ADR 0007).
  echo "    engine        from ENGINE_SRC (development only)"
  cp "$ENGINE_SRC" "$engine_dest"
else
  url=$("$PY" scripts/engine_manifest.py url "$GOOS" "$GOARCH")
  want=$("$PY" scripts/engine_manifest.py sha256 "$GOOS" "$GOARCH")
  if [ -z "$url" ] || [ -z "$want" ]; then
    echo "packaging/engine.json has no entry for $GOOS/$GOARCH." >&2
    echo "Fill in the url and sha256 for the pinned engine release first." >&2
    exit 1
  fi
  # The engine is published as an archive, so what gets checksummed is the
  # archive exactly as downloaded — verify first, unpack second. Unpacking
  # before verifying would mean writing out files nobody has vouched for.
  member="$("$PY" scripts/engine_manifest.py archive_member "$GOOS" "$GOARCH")$EXE"
  work="$OUT/.engine-$GOOS-$GOARCH"
  rm -rf "$work"
  mkdir -p "$work/unpacked"

  case "$url" in
    *.zip)            engine_archive="$work/engine.zip" ;;
    *.tar.gz | *.tgz) engine_archive="$work/engine.tar.gz" ;;
    *)
      echo "don't know how to unpack $url" >&2
      echo "packaging/engine.json must point at a .tar.gz or a .zip" >&2
      exit 1
      ;;
  esac

  echo "    engine        downloading"
  curl -fsSL --retry 3 -o "$engine_archive" "$url"

  got=$(sum256 "$engine_archive" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    echo "engine checksum mismatch for $GOOS/$GOARCH" >&2
    echo "  expected $want" >&2
    echo "  got      $got" >&2
    exit 1
  fi

  case "$engine_archive" in
    *.zip) "$PY" scripts/ziptool.py extract "$engine_archive" "$work/unpacked" ;;
    *)     tar -xzf "$engine_archive" -C "$work/unpacked" ;;
  esac

  # The published archives are flat, but searching rather than assuming means a
  # future release that adds a directory level does not silently ship an
  # archive with no engine in it.
  found=$(find "$work/unpacked" -type f -name "$member" | head -1)
  if [ -z "$found" ]; then
    echo "no $member inside the engine archive for $GOOS/$GOARCH" >&2
    echo "contents:" >&2
    find "$work/unpacked" -maxdepth 2 >&2
    exit 1
  fi
  mv "$found" "$engine_dest"

  # The engine archive ships its own LICENSE and a THIRD_PARTY_NOTICES.md for
  # the libraries it bundles. Redistributing the binary without those notices
  # is a licence breach, so they travel in our archive too.
  upstream_license=$(find "$work/unpacked" -type f -name LICENSE | head -1)
  if [ -n "$upstream_license" ]; then
    if [ "$(notice_text "$upstream_license")" != "$(notice_text LICENSES/engine-MIT.txt)" ]; then
      echo "the engine's LICENSE no longer matches LICENSES/engine-MIT.txt." >&2
      echo "Update our copy from the pinned release before packaging — shipping" >&2
      echo "a stale notice is a licence breach, not a formatting difference." >&2
      exit 1
    fi
  else
    echo "the engine archive carries no LICENSE — refusing to package" >&2
    exit 1
  fi

  notices=$(find "$work/unpacked" -type f -name 'THIRD_PARTY_NOTICES.md' | head -1)
  if [ -n "$notices" ]; then
    cp "$notices" "$STAGE/LICENSES/engine-third-party.md"
  else
    echo "the engine archive carries no THIRD_PARTY_NOTICES.md — refusing to package" >&2
    exit 1
  fi

fi
chmod +x "$engine_dest"
echo "    engine        $(du -h "$engine_dest" | cut -f1)"
echo "    LICENSES      $(ls "$STAGE/LICENSES" | wc -l | tr -d ' ') notices"

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
  # Not zip(1): Git Bash on Windows does not ship it, and packaging has to work
  # on the platform it is packaging for.
  "$PY" scripts/ziptool.py create "$OUT/$ASSET.zip" "$STAGE"
  archive="$OUT/$ASSET.zip"
else
  tar -czf "$OUT/$ASSET.tar.gz" -C "$OUT" "$NAME"
  archive="$OUT/$ASSET.tar.gz"
fi
rm -rf "$STAGE"

( cd "$OUT" && sum256 "$(basename "$archive")" > "$(basename "$archive").sha256" )
echo "    archive       $(du -h "$archive" | cut -f1)  $(basename "$archive")"
