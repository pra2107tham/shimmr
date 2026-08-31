# 0006 — Do not name the engine in product or spec documentation

**Status:** Accepted
**Date:** 2026-08-31
**Amends:** `00-prd.md` §11 (recorded as amendment A8)

## Context

Shimmr is built on an MIT-licensed indexing engine. MIT imposes exactly one
obligation on us:

> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.

That obligation attaches to **the distributed software**. MIT carries no advertising
clause — unlike the historical BSD 4-clause licence, it does not require the upstream
project to be named in documentation, marketing, a product name, or a sales
conversation. We are entitled to sell Shimmr as Shimmr.

PRD §11 originally committed to the opposite posture — disclosing the engine by name
as a trust signal. That was a reasonable call when the paid tier was going to be
withheld upstream tools, because a customer who discovered the engine would also
discover they were being charged for it. ADR 0004 removed that exposure: nothing
local is withheld any more, so the disclosure no longer defuses anything.

## Decision

**Product-facing and specification documents refer to "the engine" and never name the
upstream project, its author, or its repository.** This covers the specs, the
architecture and tier docs, the roadmap, the README, the product overview, the
website, and anything shown to a customer or investor.

**Vendor identity lives in exactly two places:**

1. `docs/internal/ATTRIBUTION.md` — internal engineering reference, marked
   not-for-distribution. Records who the copyright holder is, the pinned commit, and
   what we owe them.
2. **The shipped artifact's licence notice** — a `NOTICE` / `LICENSES` file installed
   alongside the binary and surfaced by `shimmr licenses`. This is the MIT obligation
   and it is **non-negotiable**; it ships from the first release, not "once we get
   around to it".

`00-prd.md` retains the engine name in its body. It is a historical record of intent
under the working agreement's "never edit the PRD to match reality" rule, and it is
marked internal-only rather than rewritten.

## Consequences

**Easy:** Shimmr reads as a product rather than a wrapper, in every document that
leaves the building. Sales conversations don't open with a name that invites the
customer to go look it up.

**Hard:** engineers still need the engine's real behaviour documented, and that
documentation now has to describe it without naming it. `01-engine-findings.md` is
written that way; the identity it needs sits one file away.

**Also hard:** vendor-derived strings leak through paths, environment variables, and
per-project ignore files. Not naming the engine in prose while its name sits in the
customer's home directory is not a posture. Shimmr should own its own cache root and configuration surface — which is
worth doing on product grounds anyway, and may bear on the coexistence question in
Q7. Tracked as a new open question, Q9.

**Accepted:** a customer who reads the process table, the config file, or the licence
notice can identify the engine. That is fine and expected. The posture is **"we don't
advertise it"**, not "we deny it" — if a customer asks directly what Shimmr is built
on, the answer is honest and points at the licence notice. Claiming we wrote the
engine would be a false statement about our own product, and no naming policy
authorises that.

## Alternatives considered

- **Keep PRD §11's disclosure-as-trust posture.** Rejected: it was insurance against
  a paywall problem that ADR 0004 eliminated, and it spends the product's identity to
  buy something we no longer need.
- **Strip the name everywhere including internal docs.** Rejected: we cannot reproduce
  a copyright notice we refuse to write down, and we cannot verify claims against an
  unnamed thing. The working agreement's verification rule depends on it.
