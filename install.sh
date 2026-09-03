#!/usr/bin/env sh
#
# Shimmr installer.
#
#   curl -fsSL https://shimmr.dev/install | sh
#
# Downloads one archive, checks it against its published checksum, and puts two
# binaries on your machine. It asks before touching anything outside the
# install prefix, and it never edits your editor config — `shimmr init` does
# that, after showing you what it intends to change.
set -eu

VERSION="${SHIMMR_VERSION:-latest}"
PREFIX="${SHIMMR_PREFIX:-/usr/local}"
# Releases are served from object storage rather than from the repository,
# which is private: GitHub release assets and raw.githubusercontent both 404
# for anyone who is not us. This script is published to the same place as the
# archives it fetches, so the two cannot drift apart.
BASE_URL="${SHIMMR_BASE_URL:-https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases}"

say()  { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
die()  { warn ""; warn "  $*"; warn ""; exit 1; }

need() {
    command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed."
}

need curl
need tar

# ------------------------------------------------------------------ platform

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)

case "$os" in
    linux|darwin) ;;
    *) die "Shimmr does not have a build for $os yet." ;;
esac

case "$arch" in
    x86_64|amd64) arch=amd64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) die "Shimmr does not have a build for $arch yet." ;;
esac

# ------------------------------------------------------------------- checksum

# Prefer whichever checksum tool this machine has. We refuse to install without
# one: an unverified 40 MB download from the internet is not something to
# execute, and "it probably downloaded fine" is not a security posture.
if command -v sha256sum >/dev/null 2>&1; then
    checksum() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
    checksum() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
    die "Neither sha256sum nor shasum is available, so the download cannot be verified."
fi

# ------------------------------------------------------------------ download

if [ "$VERSION" = "latest" ]; then
    url_base="$BASE_URL/latest/download"
    label="the latest release"
else
    url_base="$BASE_URL/download/$VERSION"
    label="$VERSION"
fi

# Asset names carry no version, so this is the same whether we are pulling a
# tagged release or whatever "latest" currently points at.
archive="shimmr-${os}-${arch}.tar.gz"

tmp=$(mktemp -d)
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT INT TERM

say ""
say "  Shimmr — $label, $os/$arch"
say ""
say "  Downloading…"
curl -fsSL --retry 3 -o "$tmp/$archive" "$url_base/$archive" \
    || die "Could not download $url_base/$archive"
curl -fsSL --retry 3 -o "$tmp/$archive.sha256" "$url_base/$archive.sha256" \
    || die "Could not download the checksum. Refusing to install unverified."

want=$(cut -d' ' -f1 < "$tmp/$archive.sha256")
got=$(checksum "$tmp/$archive")
if [ "$want" != "$got" ]; then
    warn ""
    warn "  Checksum mismatch. Not installing."
    warn "    expected  $want"
    warn "    got       $got"
    warn ""
    warn "  Try again. If it keeps happening, please report it rather than"
    warn "  working around it."
    exit 1
fi
say "  Verified."

tar -xzf "$tmp/$archive" -C "$tmp"
# The extracted directory does carry the version, so find it rather than
# assuming a name.
src=$(find "$tmp" -maxdepth 1 -type d -name 'shimmr-*' | head -1)
[ -d "$src" ] || die "The archive did not contain what was expected."

# ------------------------------------------------------------------- install

bindir="$PREFIX/bin"
libdir="$PREFIX/lib/shimmr"

sudo=""
if [ ! -w "$PREFIX" ] && [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        sudo="sudo"
        say ""
        say "  $PREFIX needs administrator access. You will be asked for your password."
        say "  To install without it, re-run with SHIMMR_PREFIX=\$HOME/.local"
    else
        die "$PREFIX is not writable. Re-run with SHIMMR_PREFIX=\$HOME/.local"
    fi
fi

say ""
say "  Installing:"
say "    $bindir/shimmr"
say "    $libdir/shimmr-engine"
say "    $libdir/LICENSES/"

$sudo mkdir -p "$bindir" "$libdir"
$sudo install -m 0755 "$src/shimmr" "$bindir/shimmr"
$sudo install -m 0755 "$src/shimmr-engine" "$libdir/shimmr-engine"
$sudo rm -rf "$libdir/LICENSES"
$sudo cp -R "$src/LICENSES" "$libdir/LICENSES"

# ---------------------------------------------------------------------- check

say ""
if ! "$bindir/shimmr" version >/dev/null 2>&1; then
    die "Installed, but the binary will not run. Please report this."
fi

case ":$PATH:" in
    *":$bindir:"*) ;;
    *)
        say "  Note: $bindir is not on your PATH."
        say "  Add it, or run shimmr by its full path."
        say ""
        ;;
esac

say "  Installed $("$bindir/shimmr" version)."
say ""
say "  Next:"
say "    shimmr signup --email you@company.com --org \"Your Co\""
say "    shimmr init"
say "    shimmr doctor"
say ""
say "  Licences for everything installed:  shimmr licenses"
say ""
