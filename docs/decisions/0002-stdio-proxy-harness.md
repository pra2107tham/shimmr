# 0002 — The harness is a stdio JSON-RPC proxy

**Status:** Accepted
**Date:** 2026-08-30

## Context

Upstream is launched by every supported agent as a standard MCP stdio server — an
`mcpServers` entry with `command` and `args`, JSON-RPC over stdin/stdout, with
stdout reserved exclusively for protocol traffic.

The PRD §7 architecture assumes a thin local proxy between agent and engine. That
assumption needed checking; it holds.

## Decision

The harness is a process that the agent spawns *instead of* the engine, and which
spawns the engine as its own child. It relays JSON-RPC in both directions, and
handles exactly two methods specially:

- `tools/list` — forward, then filter the response to the licensed allow-list
- `tools/call` — check the tool name, forward or refuse

Everything else is byte-for-byte passthrough.

## Consequences

**Easy:** it works with every MCP client that supports stdio, which is all of them,
without per-client code. It survives upstream adding tools, since unknown names
pass through. It is small enough to be audited by a customer in one sitting —
which matters for a product sold on trust.

**Hard:** the harness is now on the critical path of every call and must not break
the protocol. Two constraints follow and are non-negotiable:

1. **Nothing but JSON-RPC on stdout**, ever. All logging goes to stderr.
2. Engine crashes must be reported honestly, never masked by a synthesised
   healthy-looking response.

**Accepted:** the harness sees only agent-initiated traffic. Upstream's background
watcher, auto-index-on-start, and shared daemon do work the harness never observes,
so the usage log is a log of agent calls, not of engine activity. The dashboard
must say so rather than implying total coverage.

## Alternatives considered

- **Wrapper script that swaps binaries by tier.** Simpler, but cannot filter
  `tools/list`, cannot meter, and cannot produce a branded refusal.
- **Patch the engine's tool registration.** Requires rebuilding — rejected in 0001.
- **An HTTP proxy in front of the engine's `:9749` server.** That port serves the
  graph UI, not MCP. Wrong seam.
