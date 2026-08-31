# SPEC-002 — Signed licence file + issuance

**Phase:** 2 · **Status:** Draft
**Depends on:** SPEC-001
**Implements:** PRD §9, §11

---

## 1. Goal

Replace SPEC-001's plaintext `config.json` with a signed licence file the customer
cannot edit to promote themselves, plus a manual way for us to issue one. Manual is
the point at this stage — self-serve is Phase 4.

## 2. Scope

**In:** licence format, offline signature verification, an issuance script, the
Shimmr installer that places the file and configures agents.
**Out:** signup UI, seat enforcement across machines, the heartbeat, revocation.

## 3. Format (draft)

```json
{
  "payload": {
    "org_id":  "acme-inc",
    "tier":    "team",
    "seats":   12,
    "issued":  "2026-09-01T00:00:00Z",
    "expires": "2027-09-01T00:00:00Z"
  },
  "signature": "<base64 Ed25519 over the canonical JSON of payload>"
}
```

- **Ed25519**, public key compiled into the harness, private key never on a
  customer machine.
- Canonical serialisation must be pinned exactly (sorted keys, no whitespace) or
  signatures verify inconsistently across implementations.
- Verification is **fully offline**. No network call in this phase.

## 4. Behaviour

| Condition | Result |
|---|---|
| Valid signature, unexpired | Grant the licensed tier |
| Valid signature, expired | **Starter**, stderr notice with the expiry date |
| Bad or missing signature | **Starter**, stderr warning |
| File absent | **Starter**, silent (this is the normal free-user path) |

Same governing principle as SPEC-001 §5: a licence problem degrades to free, never
to broken. A paid customer with a clock-skewed machine must still get a working
tool.

## 5. Honesty constraint

Per `decisions/0001` and `01-engine-findings.md` §3.1, this is **tamper-evidence,
not DRM.** A determined user bypasses it by installing the MIT engine directly, and
that is fine. The signature exists so that an honest org cannot casually
self-upgrade, and so we can tell what a customer is entitled to. Do not spend
effort on obfuscation, anti-debugging, or binary hardening — it cannot work here,
and building it would mean we had misunderstood the product.

## 6. Acceptance criteria (draft)

1. A licence issued by the script verifies and grants its tier.
2. Any single-byte edit to `payload` causes verification to fail → Starter.
3. An expired licence → Starter, with the date in the stderr notice.
4. Absent licence → Starter, no error output.
5. Verification performs **zero** network calls (same monitor as SPEC-001 #8).
6. The installer places the licence, configures Claude Code and Cursor, and does
   not invoke upstream's own `install`.

## 7. Open items

- `[DECIDE]` Key rotation: how does a harness built today verify a licence signed
  with next year's key? Needs a key-id field now, or a painful migration later.
- `[DECIDE]` Does the installer *replace* upstream's agent-config management, or
  coexist with it? Upstream's `install`/`update` rewrite agent configs and can
  silently undo our setup.
- `[OPEN]` Seat count is in the payload but unenforceable offline. Either enforce
  it at Phase 4 via the heartbeat, or drop the field rather than ship a number that
  means nothing.
