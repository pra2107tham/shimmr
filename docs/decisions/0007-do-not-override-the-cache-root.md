# 0007 — Never override the engine's cache root

**Status:** Accepted
**Date:** 2026-09-02
**Resolves:** Q7; reverses the recommendation in Q9
**Supersedes:** the second mitigation listed in `01-engine-findings.md` §3.2

## Context

Two open questions assumed the same fix. Q7 asked whether Shimmr could coexist
with an engine the developer already had installed. Q9 asked how to stop the
engine's name reaching the customer through `~/.cache/<engine>`. Both were
answered with "give Shimmr its own cache root."

Phase 0 tested it. Two engine instances, **identical build**, run concurrently:

| Setup | Result |
|---|---|
| Same `CBM_CACHE_DIR` | Both start. 17 tools each.[^tools] |
| Different `CBM_CACHE_DIR` | **One fails to start**, exit 1 |

The failure is explicit:

```
CBM could not start because the active account daemon uses a different cache
directory (active cache 899c1320…; requested cache 58588125…). Close all CBM
sessions and commands, then retry with one consistent CBM_CACHE_DIR.
```

and the engine logs `{"reason":"cache_root", …}` with `active_build` and
`requested_build` identical. The cache root alone triggers it.

The rule is one canonical cache root **per OS account**, not per process and not
per application. Concurrency inside one root is fine and well supported.

## Decision

**Shimmr never sets `CBM_CACHE_DIR`, and never ships an installer that does.**
The engine keeps its default cache root, shared with any other copy on the
machine.

## Consequences

**Easy:** coexistence stops being a risk and becomes the default. A developer
already running the engine can install Shimmr and both work, because they share
one root — which is the arrangement the engine is built for.

**Hard:** Q9 loses its proposed fix. The engine's name stays visible in the
customer's cache path, and under ADR 0006 we do not name it in our own
documents. That is a cosmetic inconsistency we accept, because the alternative
breaks the product. If the name must eventually go, it has to come from the
engine's own configuration, not from us pointing it elsewhere.

**Accepted:** we do not control where the graph lives. Shimmr owns `~/.shimmr`
for its own account and usage files; the graph stays wherever the engine puts it.

**A hazard this creates:** two different *builds* sharing one root still
conflict — the README lists version, build, ABI and cache root as four separate
conditions, and we have only disproven our assumption about the fourth. If a
customer runs a different engine version than the one Shimmr bundles, one of
them fails to start. Detecting that during install and saying something honest
is now the mitigation, not cache separation. Tracked as Q10.

## Alternatives considered

- **A Shimmr-owned cache root.** Directly disproven above. It converts a
  non-problem into a startup failure.
- **Bundling a private copy of the engine under a different name.** Same
  outcome: the conflict is keyed on the account-wide daemon, not the path of the
  executable.

[^tools]: 17 because that experiment used an engine built from upstream `main`.
    The release we bundle has 15. What the experiment established — that two
    differing builds refuse to share an OS account — is unaffected by the count.
