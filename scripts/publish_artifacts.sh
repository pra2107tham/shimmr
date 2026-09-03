#!/usr/bin/env bash
#
# publish_artifacts.sh — put a release where people can actually download it.
#
#   ARTIFACT_HOST=supabase scripts/publish_artifacts.sh dist v0.1.0
#
# The repository is private, so GitHub release assets and raw.githubusercontent
# both 404 for everyone but us. Artifacts therefore live somewhere public, and
# which somewhere is one environment variable:
#
#   ARTIFACT_HOST=supabase   Supabase Storage. Live. Already in our stack.
#   ARTIFACT_HOST=r2         Cloudflare R2. Stubbed — see below.
#   ARTIFACT_HOST=none       Do nothing, successfully. The default.
#
# R2 is where this goes once downloads are worth money: its egress is free,
# where Supabase Storage bills per gigabyte and gives 5 GB a month, which is
# about 120 downloads of one 42 MB archive. Until there are users to serve,
# adding a vendor buys nothing, so the R2 path is a stub that refuses loudly
# rather than a half-configured integration that fails at the worst moment.
#
# The published layout mirrors GitHub's on purpose, so install.sh and
# install.ps1 need no special case for where they are pointed:
#
#   install.sh
#   install.ps1
#   latest/download/shimmr-<os>-<arch>.<ext>          (+ .sha256)
#   download/<version>/shimmr-<os>-<arch>.<ext>       (+ .sha256)
#
# `latest/` is overwritten every release; `download/<version>/` is written once
# and left alone, so a link to a specific version keeps meaning that version.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DIR="${1:-dist}"
VERSION="${2:-${VERSION:-$(sed -n 's/^VERSION := //p' Makefile)}}"
VERSION="v${VERSION#v}"
HOST="${ARTIFACT_HOST:-none}"
BUCKET="${ARTIFACT_BUCKET:-releases}"

die() { echo "publish: $*" >&2; exit 1; }

[ -d "$DIR" ] || die "$DIR does not exist — run \`make package-all\` first"

# What gets published: every archive and checksum in the directory, plus the
# installers from the repository root. Collected first so an empty release is
# an error rather than a silent success.
assets=()
while IFS= read -r f; do assets+=("$f"); done < <(
  find "$DIR" -maxdepth 1 -type f \
    \( -name 'shimmr-*.tar.gz' -o -name 'shimmr-*.zip' -o -name 'shimmr-*.sha256' \) | sort
)
[ ${#assets[@]} -gt 0 ] || die "no archives found in $DIR"

case "$HOST" in
  none | "")
    echo "==> ARTIFACT_HOST is not set, so nothing was published."
    echo "    Set ARTIFACT_HOST=supabase to publish ${#assets[@]} file(s) from $DIR."
    exit 0
    ;;

  # ------------------------------------------------------------------ r2
  r2)
    cat >&2 <<'EOF'
publish: the Cloudflare R2 path is a stub and has not been wired up.

  Everything around it is ready — the layout, the installers, and the release
  job all work the same whichever host is chosen. What is missing is only the
  account and the upload call.

  To finish it:
    1. Create an R2 bucket and enable public access on it.
    2. Add these as repository secrets:
         R2_ACCOUNT_ID
         R2_ACCESS_KEY_ID
         R2_SECRET_ACCESS_KEY
         R2_BUCKET          (or set ARTIFACT_BUCKET)
         R2_PUBLIC_BASE_URL (the pub-<hash>.r2.dev URL, or a custom domain)
    3. Replace this block with an S3-compatible upload against
         https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
       keeping the same object keys the Supabase path writes below, so the
       installers do not change.
    4. Point SHIMMR_BASE_URL / the installer defaults at R2_PUBLIC_BASE_URL.

  Until then use ARTIFACT_HOST=supabase.
EOF
    exit 1
    ;;

  # ------------------------------------------------------------ supabase
  supabase)
    url="${SUPABASE_URL:-}"
    if [ -z "$url" ] && [ -n "${SUPABASE_PROJECT_REF:-}" ]; then
      url="https://${SUPABASE_PROJECT_REF}.supabase.co"
    fi
    [ -n "$url" ] || die "set SUPABASE_URL or SUPABASE_PROJECT_REF"
    key="${SUPABASE_SERVICE_ROLE_KEY:-}"
    [ -n "$key" ] || die "SUPABASE_SERVICE_ROLE_KEY is required to upload to Storage"
    url="${url%/}"
    ;;

  *)
    die "unknown ARTIFACT_HOST '$HOST' (supabase, r2, none)"
    ;;
esac

# ---------------------------------------------------------------- bucket
#
# Created here rather than by hand in a dashboard, so a fresh project can be
# brought up from this repository alone. Already-exists is success.
code=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$url/storage/v1/bucket" \
  -H "Authorization: Bearer $key" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":true}" || echo 000)
case "$code" in
  200 | 201) echo "==> created public bucket '$BUCKET'" ;;
  400 | 409) echo "==> bucket '$BUCKET' already exists" ;;
  000) die "could not reach $url" ;;
  *) die "creating bucket '$BUCKET' returned HTTP $code" ;;
esac

# ---------------------------------------------------------------- upload

upload() { # upload <local file> <object path>
  local src="$1" dest="$2" type="application/octet-stream" code
  case "$src" in
    *.sh | *.ps1) type="text/plain; charset=utf-8" ;;
    *.zip) type="application/zip" ;;
    *.tar.gz) type="application/gzip" ;;
  esac
  code=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$url/storage/v1/object/$BUCKET/$dest" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: $type" \
    -H "x-upsert: true" \
    --data-binary "@$src" || echo 000)
  [ "$code" = "200" ] || die "uploading $dest returned HTTP $code"
  printf '    %-46s %s\n' "$dest" "$(du -h "$src" | cut -f1)"
}

echo "==> publishing $VERSION to $url/storage/v1/object/public/$BUCKET"

for f in "${assets[@]}"; do
  name=$(basename "$f")
  upload "$f" "latest/download/$name"
  upload "$f" "download/$VERSION/$name"
done

# The installers are served from the same place as what they install, so a
# reader can see that the script and the archive come from one host.
for s in install.sh install.ps1; do
  [ -f "$s" ] && upload "$s" "$s"
done

base="$url/storage/v1/object/public/$BUCKET"
echo
echo "    Install with:"
echo "      curl -fsSL $base/install.sh | sh"
