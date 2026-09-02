# Packaging

A release is one archive per platform containing everything a person needs:

```
shimmr-0.1.0-linux-amd64/
  shimmr              5.9 MB   the command you run
  shimmr-engine       285 MB   the indexing engine it drives
  LICENSES/                    notices for both
  README.txt
```

Compressed, that is about **41 MB to download and 290 MB on disk**. The engine
is large because it embeds 162 language grammars and a semantic-search vector
blob — `.rodata` is 275 MB of it and actual code is 17 MB. Stripping saves
almost nothing; compression saves a great deal.

Nothing is fetched at install time. An installer that reaches out to a third
party mid-install is one outage away from a bad first impression, and the
engine's own availability is not something we control.

## Building archives

```bash
make package                      # this platform
make package-all                  # all five
make package GOOS=darwin GOARCH=arm64
```

For development, bundle a locally built engine:

```bash
ENGINE_SRC=/path/to/engine make package
```

## Why releases never use ENGINE_SRC

`packaging/engine.json` pins the engine to a **published upstream release
artifact** with its SHA-256, and the release workflow refuses to run when those
fields are empty.

This is not fussiness. The engine allows only one build per OS account: two
copies with different build fingerprints refuse to run together
([ADR 0007](../docs/decisions/0007-do-not-override-the-cache-root.md)). A
binary we compiled ourselves has a different fingerprint from the published
one, so bundling it would break Shimmr for every customer who already runs the
engine directly — the precise failure `shimmr doctor` was built to report.

Bumping the engine is therefore deliberate: update `version`, update every
`sha256`, and record it in `docs/internal/ATTRIBUTION.md`.

## Cutting a release

Push a tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

The workflow builds all five platforms, verifies the engine checksum for each,
checks that the shipped Linux binary runs and prints its copyright notice, then
publishes the archives with checksums. `workflow_dispatch` with `dry_run` does
everything except publish.

## Installing

```sh
curl -fsSL https://raw.githubusercontent.com/pra2107tham/shimmr/main/install.sh | sh
```

The installer verifies the archive against its published checksum and **refuses
to install if the checksum is missing or does not match** — both paths are
tested. It installs to `/usr/local` by default; `SHIMMR_PREFIX=$HOME/.local`
avoids needing sudo. It never edits editor config; `shimmr init` does that,
after showing what it intends to change.

## Not done yet

- **Windows.** The release workflow builds and packages a `.zip`, but there is
  no `install.ps1`, and none of the Windows path handling has been exercised on
  a Windows machine. Shipping an untested installer is worse than shipping
  none, so Windows users install by hand from the archive for now.
- **Code signing and notarisation.** macOS Gatekeeper will warn on an unsigned
  binary. Needs an Apple Developer account.
- **A hosted install URL.** `shimmr.dev/install` in the docs is aspirational;
  today the raw GitHub URL is the real one.
