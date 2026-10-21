# ADR-008: Entry QR Token Design

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Engineering
**Requirement IDs:** CLAIM-001 … CLAIM-006, CLAIM-010, CLAIM-014

---

## Context

The entry QR is the most attacked surface in the product. It is a bearer credential displayed
**in public** — on a monitor, in a car park, visible to anyone in the car — for a window of time.
Whoever photographs it can claim the parking session before the owner does.

At the same time, the entry QR is the mechanism that makes the whole product work: it is how the
owner claims a session without an account, and (per ADR-004) how the fee clock starts.

So the token has to satisfy three properties at once:

1. **Unguessable** — a brute-force attack against the claim endpoint must be infeasible.
2. **Short-lived and single-use** — a photographed monitor must be a worthless artefact a few
   minutes later.
3. **Revocable** — the guard must be able to invalidate it (on cancellation, on reissue) without
   waiting for it to expire.

There is a fourth, quieter property: it must not leak. The QR is displayed on a monitor, the
token is in the URL of a claim page, and everything ends up in logs, browser history, and
referrer headers unless it is deliberately kept out.

## Decision

1. **The claim token is 256 bits of cryptographically secure randomness**, base64url-encoded
   (43 characters, no padding). It is generated with `crypto.randomBytes(32)` — not `Math.random`,
   not a UUID, not a hash of a counter.

2. **Only the SHA-256 hash of the token is stored**, in a unique indexed column. The raw token is
   returned to the issuing guard **exactly once**, at issuance.

3. **The default TTL is 5 minutes**, configurable per site between 1 and 60 minutes.

4. **A claim is single-use.** `claimed_at` is set in the same transaction as the ticket issuance.
   A second attempt returns 410 `CLAIM_ALREADY_CLAIMED`.

5. **A claim is revocable.** `revoked_at` is set when the session is cancelled or when the QR is
   reissued. A revoked claim returns 410 `CLAIM_CLAIM_REVOKED`.

6. **The token is not a slow hash.** The token has 256 bits of entropy, so a brute-force search is
   infeasible regardless of the hash's speed. A KDF would add latency to every claim and protect
  against nothing. (The plate digest is a different case — a low-entropy input — and it *does* use
   an HMAC with a secret pepper; see ADR-010.)

7. **The QR payload contains only the token.** No plate, no site name, no price, no session id. A
   photograph of the monitor therefore yields a short-lived claim credential and nothing else.

8. **The claim endpoint is public and rate-limited**: 20 attempts per IP per minute and 5
   successful claims per session per minute.

9. **The claim validation order is fixed and unit-tested:** unknown → 404; revoked → 410; expired →
   410; already claimed → 410; the session is not pending → 409. The raw token is never written to a
   log, an audit row, an error message, or a metric label.

10. **The raw token is moved out of the URL into the request body** as soon as the claim page
    loads, and the page sets `Referrer-Policy: no-referrer`. The URL fragment is preferred over the
    query string, so the token does not reach the server's access log.

11. **A cryptographic hash is sufficient for the online MVP.** The verifier is the central backend,
    which can look the token up in constant time. A signed payload is designed for the offline
    phase (ADR-003), where the verifier cannot ask anyone.

## Consequences

### Positive

* **Brute force is infeasible.** 2²⁵⁶ ≈ 7.9×10¹⁶ candidate tokens. At ten billion attempts per
  second, a full sweep takes roughly 250 000 years.
* **A photographed monitor is worthless quickly.** Five minutes, one use, revocable at any time.
* **A database dump does not yield usable claim tokens.** The hashes are one-way, and the plate
  space is not the attack surface here.
* **The token can be revoked immediately.** A row update, not a key rotation or a deny-list.
* **The stored data is minimal.** A hash, an expiry, and two nullable timestamps.
* **The implementation is small and auditable.** Roughly forty lines of token service, with no key
  management and no signature verification in the hot path.

### Negative

* **A photographed QR can be claimed by the wrong person within the TTL.** The claim succeeds
  whoever presents the token first. The mitigation is physical: the guard is present at the monitor
  and the physical plate check at the exit is the real control.
* **The URL carries the token briefly.** Even with the fragment and the referrer policy, a token
  can be seen in the address bar or in a screen recording. The 5-minute TTL bounds the exposure.
* **No offline verification.** A disconnected site cannot validate a claim. The online MVP accepts
  this; the signed payload in ADR-003 addresses it in Phase 6.
* **The token cannot be recovered after issuance.** If the guard's browser loses the response, the
  QR must be reissued. That is the intended workflow — reissue exists for exactly this.
* **The 5-minute TTL is a compromise.** It must be long enough for a rider to get off the bike,
  find a phone, open the app, and scan — and short enough that a photographed monitor is useless
  a moment later. It is configurable per site for exactly this reason.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | Should the entry QR be a signed payload even online, so the QR can be rendered and understood offline? | The current answer: no. The opaque token is simpler and revocable. The signed format is designed in ADR-003 §7. | Phase 2 / Phase 6 |
| D2 | What is the default TTL for a site with a slow queue? | The current default is 5 minutes; the site is configurable between 1 and 60. | Phase 2 |
| D3 | Should the claim page show the plate so the owner can confirm they are at the right lot? | It would leak the plate into the QR-adjacent display and into the browser. The current answer: no. | Phase 3 |
| D4 | Should a successful claim be visually confirmed on the guard's monitor? | A UX nicety; it must not require a polling channel that the MVP does not have. | Phase 3 |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A short numeric code (4–6 digits) | Far too small a space to be safe as a bearer credential on a public screen. |
| A UUID | 122 bits of entropy in the *identifier* portion, but a UUID's randomness comes from a
  mixed source and its format invites people to treat it as an identifier rather than a secret.
  A dedicated CSPRNG token is unambiguous. |
| A signed payload containing the session id | Longer, needs key distribution to every verifier, and is not revocable without a deny-list. |
| Storing the raw token | A database dump then yields live claim credentials. |
| A slow hash (bcrypt/argon2) of the token | 256 bits of entropy makes brute force infeasible regardless; the KDF only adds latency. |
| A long TTL (hours) | A photographed monitor would be a real credential for a long window. |
| Letting the guard type the owner's name or phone as the claim | Collects personal data with no benefit; the ticket is bearer-based. |
| A JWT claim token | Self-contained but not revocable without a deny-list, and it is longer on the QR. |
| Not revoking on reissue | Two live tokens for one session would break the "exactly one ticket" guarantee. |
| Making the claim idempotent (returning the same ticket on a repeat) | A repeat claim from a *different* device is indistinguishable from an attack. Single use is safer; recovery goes through the guard. |

## Related

* `specs/features/entry-qr-claim/` — the requirements and the design.
* `specs/security/threat-model.md` §4.1 — the spoofing analysis.
* `specs/architecture/offline-architecture.md` §7 — the future signed payload.
* ADR-003 — the offline authority.
* ADR-004 — the claim activates the session.
