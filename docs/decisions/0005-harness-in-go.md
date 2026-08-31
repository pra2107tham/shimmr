# 0005 — The harness is written in Go

**Status:** Accepted
**Date:** 2026-08-31
**Resolves:** Q3 in `04-open-questions.md`

## Context

The harness needs to ship to developer laptops on macOS, Linux, and Windows, matching
the three platforms the engine supports. PRD §12 sets the success metric as *under ten
minutes from download to first index, with zero support tickets.*

Node/TypeScript would reach a first prototype faster and has the most heavily exercised
MCP SDK. Go produces a single static binary with no runtime for the customer to install.

## Decision

Write the harness in **Go**.

## Consequences

**Easy:** one file to download and run, matching the engine's own distribution story.
Cross-compilation for all three platforms is a build matrix, not a packaging project.
Nothing to install first, which is exactly what the ten-minute metric requires.

**Hard:** MCP work in Go means more protocol handling written by hand than the Node SDK
would require. For a proxy that special-cases two methods and relays the rest verbatim,
this is a small amount of code.

**Accepted:** a slower first prototype, in exchange for not shipping a runtime
dependency to every customer forever.

## Alternatives considered

- **Node/TypeScript.** Rejected: `node: command not found` on a customer's first run is
  a support ticket, and it lands directly on the metric the product is judged by.
  Bundling a runtime solves it at the cost of a large binary and a bundler step.
- **Rust.** Comparable distribution story to Go; rejected on build times and on there
  being no problem here that needs it.
