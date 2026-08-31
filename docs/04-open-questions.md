# Open questions — decide before building

**Q1, Q2 and Q3 are now decided** (2026-08-31) — see ADR [0004](decisions/0004-local-free-connected-paid.md)
and [0005](decisions/0005-harness-in-go.md). They are kept below with their answers so the
reasoning stays visible.

Q4–Q8 remain open and can be settled during the build.

Each question records a **recommendation**, because a default that can be
overruled beats an open loop.

---

## Q1 — Does the paywall withhold upstream tools, or only things we build? ✅ DECIDED

**Context:** `01-upstream-findings.md` §3.1. The engine is MIT and installable in
about two minutes, so withholding `get_architecture` from a free user stops only
the users who never think to look. Meanwhile it teaches every user who *does* look
that Shimmr's value is artificial scarcity — the opposite of the trust pitch.

**Options:**
- **(a) Keep PRD §8 as written.** Familiar SaaS shape. Converts the incurious.
- **(b) All upstream tools free; sell only what we add** — accounts, seats,
  dashboard, GitHub/PR context, cross-repo sync, support, our supply chain.
- **(c) Hybrid:** all upstream tools free, Team adds Shimmr-built features, and the
  Enterprise italic rows stay as-is.

> **Decided: (b)/(c) — local free, connected paid.** ADR 0004.

**Recommendation: (c).** It keeps a real paid tier without ever putting Shimmr in
the position of being caught withholding something free. It also makes the free
tier genuinely the best local code-graph setup a startup can get, which is the
adoption hook PRD §3 actually needs.

**But note:** (b)/(c) mean **v1's headline feature — tier gating — stops being the
product.** That is a large enough consequence that it deserves a deliberate answer
before writing code, not after. See Q2.

## Q2 — If Q1 lands on (b)/(c), what is v1? ✅ DECIDED

If gating is not the moat, "a proxy that blocks tools" is not a product. v1 would
instead be: **a branded, trustworthy install of the engine + a local usage log +
an account/licence identity**, with the harness still built (it is the seam
everything later hangs off) but its allow-list mostly permissive.

The work is nearly identical — the harness, the log, the licence file. What changes
is the pitch and the acceptance criteria. SPEC-001 is written so this decision can
land either way without rewriting it; only the tier map in §3 changes.

> **Decided: build the harness first, sell later.** Gate ships open; the lock arrives on
> external connections (GitHub, OpenHands) and automations. ADR 0004.

**Recommendation:** build SPEC-001 as specified regardless. It is the same code
either way, and it makes Q1 reversible.

## Q3 — Harness implementation language ✅ DECIDED

Go vs. Node/TypeScript. See `02-architecture.md` §6.

> **Decided: Go.** ADR 0005.

**Recommendation: Go.** Single static binary matches the engine's own distribution
story and the "just runs locally, no runtime" promise that this customer segment
buys. Node is the faster prototype but ships a runtime problem to the customer.

## Q4 — How should a blocked call be surfaced? 🟡 during build

A JSON-RPC error, or a successful result whose text is the upgrade message?
Architecture §2 argues for the latter. Needs an empirical check in **Claude Code and
Cursor specifically** — how each renders it to the user, and whether the agent
retries. Cheap to test once the harness exists.

## Q5 — What happens to the engine's built-in `localhost:9749` UI? 🟡

Upstream serves a 3D graph UI from inside the binary. It overlaps with the PRD §10
dashboard and it is genuinely good. Expose it, rebrand it, ignore it, or disable it?

**Recommendation:** leave it on and unbranded for v1, and do not mention it in
marketing. Rebranding someone else's UI is the kind of thing that reads badly if a
customer notices, and the §10 dashboard is a different artifact (usage, not graph
structure).

## Q6 — Do we ship the upstream binary, or ask the customer to fetch it? 🟡

Redistributing is allowed under MIT with the notice retained, and it is a much
better install experience. But it makes us responsible for the supply chain we
hand over, and we lose upstream's own signing/attestation story unless we pass the
original artifact through untouched.

**Recommendation:** redistribute the **unmodified upstream artifact**, verify its
published SHA-256 at install time, and keep upstream's LICENSE and checksums
visible in our install tree. See `decisions/0001`.

## Q7 — Coexistence with an existing upstream install 🟠

Per `01-upstream-findings.md` §3.2, an already-installed CBM may conflict. Needs an
empirical test: install both, see what actually breaks, and whether a distinct
`CBM_CACHE_DIR` is enough.

**Recommendation:** test this early — it is a direct threat to the "10 minutes,
zero support ticket" metric, and it is much cheaper to find now than in a design
partner's onboarding call.

## Q8 — What does "estimated tokens saved" actually mean? 🟡

PRD §10 promises it and PRD §12 makes it a proof metric, so the formula will end up
in a sales deck. It needs to be defensible: a stated, published method with its
assumptions visible, not a flattering multiplier.

**Recommendation:** define it as *bytes returned by graph tools ÷ average bytes a
naive file-read exploration would have returned for the same question*, with the
baseline stated. Upstream's own preprint (arXiv:2603.27277) claims 10× fewer tokens
across 31 repos and is a citable external anchor. Do not invent a number we cannot
show the working for.

---

## Settled, recorded elsewhere

| Question | Answer | Where |
|---|---|---|
| Is upstream really MIT? | Yes, confirmed on `main`; re-verify on the pinned commit | `01-upstream-findings.md` §1 |
| Fork the C source or wrap the binary? | Wrap, unmodified | `decisions/0001` |
| Is a stdio proxy the right shape? | Yes — upstream is stdio JSON-RPC | `decisions/0002` |
| Domain / final name? | Deferred, explicitly not a v1 blocker | `00-prd.md` §14 |
| Q1 — what does the paywall cover? | Local free, connected paid | `decisions/0004` |
| Q2 — what is v1? | The harness, gate open; sell at Phase 5 | `decisions/0004` |
| Q3 — language? | Go | `decisions/0005` |
