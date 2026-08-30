# 0001 — Wrap the unmodified upstream binary; do not rebuild the C source

**Status:** Accepted
**Date:** 2026-08-30

## Context

`DeusData/codebase-memory-mcp` is MIT-licensed pure C, shipped as a single static
binary. PRD §13 already leans toward wrapping rather than recompiling, on speed
grounds. Verification surfaced a second, stronger reason.

Upstream runs **one per-account coordination daemon** shared across every agent
client, and documents that all active processes "must run the exact same version,
executable build, coordination ABI, and canonical cache root." Conflicting
processes are rejected at a crash-safe admission barrier before doing any work.

A Shimmr-branded rebuild is, by definition, a different executable build. On any
machine where a developer already runs upstream CBM — plausible for our exact
early-adopter audience — one of the two would fail to start.

Upstream also publishes SLSA 3 provenance, signed releases, and VirusTotal scans
per release. Rebuilding discards all of that and replaces it with whatever supply
chain we can stand up ourselves.

## Decision

Ship the **upstream release artifact, byte-for-byte unmodified**. All Shimmr
behaviour lives in the harness process in front of it. Rebranding is limited to
what sits outside the binary: our installer, our CLI, our docs, our MCP server
name in the agent's config.

Retain upstream's LICENSE and copyright notice in everything we redistribute, and
verify the published SHA-256 of the artifact at install time.

## Consequences

**Easy:** days-of-work v1. Upstream's attestation chain stays intact and becomes
something we can point at in a security review. Upstream upgrades are a version
bump, not a re-port. No C toolchain, no cross-compilation matrix.

**Hard:** we cannot change engine behaviour at all — only gate access to it. The
CLI banner and any in-binary strings stay upstream-branded, so a curious customer
sees `codebase-memory-mcp` immediately. PRD §11's "own signed binary" is therefore
only true of *our* binary, the harness.

**Accepted:** that the engine is visibly not ours. PRD §11 already commits to
disclosing this, and it is the right call — for a "nothing leaves your infra"
pitch, an auditable upstream with public provenance is an asset.

**Still open:** whether coexistence with an existing upstream install works even
with an unmodified binary, given the cache-root rule. Tracked as Q7; must be tested
in Phase 0.

## Alternatives considered

- **Recompile with Shimmr branding.** Rejected: daemon conflict, lost attestation,
  a C build matrix for three platforms, and a permanent merge burden — all to
  change strings.
- **Hard fork and diverge.** Rejected for v1. Revisit only if we need to change
  engine *behaviour* (PRD §13 says the same). That is a different company.
