# ADR-010: Guest Identity and Privacy

**Status:** Accepted (with deferred sub-decisions)
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** SESSION-005, TICKET-009, TICKET-010, ADMIN-004, ADMIN-010, ADMIN-011

---

## Context

The product owner has been explicit about what the platform administrator needs to see:
**"how many users (prefer to the users who apply this system into the parking lot)"** — the real
adoption of the system in the field, not the number of registered accounts.

That requirement collides with a product decision that is not up for negotiation: **registration
is optional, and guest usage is the normal case.** A motorcycle owner who scans a QR on the way
in, shows it on the way out, and never types a name, never creates a password, and never gives an
email address is the *typical* user of this product.

So there are two ways to count adoption, and one of them is a trap:

| Counting method | What it measures | The problem |
|---|---|---|
| `count(users where role = 'user')` | The registered owners | It reports a product that looks **unused**, because the majority of usage is by guests |
| `count(distinct plate_id_normalized)` | Everyone who parked | It is the right number, but it requires keeping the readable plate indefinitely, and it puts the plates in the reporting queries |

The second is the correct measurement with the wrong storage. This ADR settles how to get the
number without keeping the readable plate.

The second question in this ADR is **linking**. A guest ticket may later be attached to an
account. If that link could be made by knowing the public ticket reference, then anybody who
photographs a ticket could claim ownership of it, and could then see its history — and the "one
ticket, one exit" guarantee becomes an account-sharing problem.

## Decision

1. **Two identity channels are counted separately, then combined.**
   * **Registered owners** — `users` where `role = 'user'`.
   * **Guests** — the distinct **plate digests** across the sessions.

2. **The guest identity is a keyed digest:**
   ```
   plate_digest = HMAC-SHA256(server_pepper, plate_id_normalized)
   ```
   It is stored on `parking_sessions` (and mirrored on `tickets`), it is **indexed**, and it
   supports `count(DISTINCT plate_digest)` efficiently.

3. **The pepper is a server-side secret** in the deployment's secret store. It is never logged,
   never returned by any endpoint, and never in the client bundle. The digest is stored hex-encoded.

4. **The digest never leaves the database.** No API response contains a `plate_digest` — not even to
   the super admin. The per-plate detail view returns a **masked** plate (`AB***3`), derived from
   the session's readable plate when it has not yet been redacted.

5. **The readable plate is redacted after the retention window** (90 days by default — ADR-009),
   while the digest is retained. The adoption metric is therefore unaffected by the redaction.

6. **The admin console shows aggregates and per-site breakdowns only.** There is no raw plate list
   in any view. A per-plate detail view exists, is super-admin only, requires **both**
   `platform.analytics.read` **and** `platform.audit.export`, is rate-limited (5 per minute per
   actor), and is itself written to the audit log with the actor, the masked plate, and the reason.

7. **Linking a guest ticket to an account requires proof of possession of the ticket token** (the
   secret half of the QR), or a claim secret. **Knowledge of the public reference is never
   sufficient.** The public reference is designed to be read out loud, so it is not a secret.

8. **Linking changes nothing about the parking session.** The link writes `guest_user_id` and
   `linked_at` on the ticket and nothing else. The session, the ticket's issuance data, and the
   payment history are unchanged. Linking is an *identity* operation, not a *domain* operation.

9. **Unlinking is not offered.** It would create a way to hand a ticket to another account, which
   is the same problem as account sharing.

10. **The metrics computed from the digest** are the registered count, the distinct-guest count,
    the combined active-user count (the union of the digest and the `guest_user_id` in the
    window), the funnel, the claim rate, the completion rate, the repeat rate, the registered-vs-
    guest split, the per-site and per-owner breakdowns, and the monthly trend.

11. **A failed linking attempt is audited** (`ticket.link_failed`) with the actor and the
    reference, so a systematic attempt to claim other people's tickets is visible.

### 11.1 The pepper rotation consequence

Rotating the pepper changes every digest, so the historical digest continuity is **broken**: the
same plate before and after the rotation looks like two different guests, and the distinct-guest
count over a period spanning the rotation is wrong.

The rotation procedure is therefore:

1. Announce it, and note the rotation date.
2. Rotate the pepper in the environment.
3. Recompute the digests for the retained rows **if** the continuity matters for the reporting
   period — this requires temporarily keeping the readable plate, which the redaction job may have
   already removed. **After a rotation, the historical distinct-guest counts are not comparable
   across the rotation boundary.**
4. Record the rotation in the metrics, so the console can flag a "digest continuity broken"
   marker on a chart that spans it.

## Consequences

### Positive

* **The adoption number is meaningful.** The platform can say "312 distinct motorcycle owners
  parked with us last month", which is the question the product owner actually asked.
* **The readable plate is not needed for counting.** The digest answers the cardinality question
  without keeping the plate, which makes the 90-day redaction acceptable.
* **The digest is not reversible.** Without the pepper, the plate space cannot be brute-forced
  against the digest.
* **A ticket cannot be stolen by knowing its reference.** The reference is public by design; the
  token is the secret; only the token proves possession.
* **Linking does not touch the domain.** A guest ticket that is later linked is still the same
  ticket for the same session with the same payments.
* **A systematic attempt to claim other people's tickets is visible** in the audit log.

### Negative

* **The digest is a permanent fingerprint** of each motorcycle. It is justified by the aggregate
  analytics, but it is not free, and it must be covered by the privacy notice.
* **Pepper rotation breaks the historical counts.** The continuity is not automatically repairable
  once the readable plate has been redacted.
* **The combined active-user count is an approximation.** A registered owner and a guest on the
  same motorcycle are two identities, and the union counts them as one only through the plate
  digest matching a `guest_user_id`'s session history. The metric is a *lower bound* on the true
  number of people.
* **The "distinct guests ever parked" count over all time grows forever.** The table grows with
  the digest, and the count query gets slower. At the pilot's scale this is irrelevant; it is a
  Phase-7 consideration.
* **The per-plate view is a privacy-sensitive feature even with all the controls.** It is audited
  and rate-limited precisely because it is the sharpest edge in the console.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | What is the legal basis for retaining the `plate_digest` indefinitely? | Legitimate interest (aggregate analytics) is the likely basis; it must be confirmed before the privacy notice is published. | Before Phase 7 |
| D2 | Should the digest be salted per deployment, or per plate? | Per deployment (a single pepper) is what makes the cardinality count possible. Per-plate salt would break the count. | Settled — a single pepper. |
| D3 | Should the pepper support a version prefix so that old and new digests can coexist? | That would let the rotation be non-destructive for the counts, at the cost of a wider pepper set. | Phase 6 |
| D4 | When should the pepper be rotated, and who authorises it? | The current answer: on a suspected compromise, by the platform owner, and recorded. | Before Phase 7 |
| D5 | Is the per-plate view needed at all in the MVP? | The current answer: yes, gated and audited — it is what makes a support investigation possible. | Settled for the MVP |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Count only the registered users | It answers a question nobody asked, and it would report a product as unused when it is busy. |
| Count `distinct plate_id_normalized` | It requires keeping the readable plate indefinitely and puts the plates in the reporting queries. The digest gives the same cardinality with a non-reversible value. |
| A plain SHA-256 of the plate | The plate space is small and enumerable — a plain hash is reversible by brute force. The HMAC with a secret pepper is what makes it non-reversible. |
| A per-plate random salt | It would break the cardinality count, which is the entire purpose. |
| Linking by the public reference | The reference is designed to be read aloud. Anybody who photographs a ticket could then claim it. |
| Linking by the plate | Two different motorcycles could share a plate across sites, and the plate is not a secret. |
| Linking by an emailed code | A good alternative for a registered user, but it is heavier than the token for the common case. It remains an option for a "link a ticket I claimed earlier" flow. |
| Showing a raw plate list in the admin console | It is personal data of people who never consented. Aggregates answer the business question without it. |
| Making the super admin exempt from the per-plate view's controls | The super admin's actions are audited *because* of the privilege. |
| Allowing unlinking | It creates a ticket-transfer path and a way to launder a shared ticket. |

## Related

* `specs/architecture/rbac-design.md` §9 — the adoption metric SQL.
* `specs/features/guest-ticket/` — the linking flow.
* `specs/features/admin-console/` — the per-plate view and its controls.
* ADR-007 — the plate normalization that the digest is computed over.
* ADR-009 — the retention that makes the redaction possible.
