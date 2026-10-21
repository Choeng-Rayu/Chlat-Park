# Guest Ticket — Design

**Status:** In progress
**Requirement IDs:** TICKET-001 … TICKET-012

---

## 1. Architecture

```
Claim flow                                apps/api
──────────                                ───────────────────────────────────────────────
POST /entry-claims/claim  ──────────────▶ EntryClaimsService.claim
                                              │ BEGIN TX
                                              │  INSERT tickets (public_reference, token_hash)
                                              │  UPDATE entry_claims SET claimed_at
                                              │  UPDATE parking_sessions → ACTIVE
                                              │ COMMIT
                                              └─▶ { ticket: { reference, token, display } }
                                                        │
                                                        ▼
                                              apps/web /ticket/[reference]
                                              renders the ticket page
```

```
Exit flow
─────────
Guard scans the ticket QR        Guard types the reference
        │                                  │
        ▼                                  ▼
   ticket token                       public reference
        │                                  │
        └──────────► POST /verification/exit ◄──────┘
                        resolves to the ticket + the LIVE session state
```

**Both identifiers resolve to the same ticket row.** The token is the secret; the reference is the
convenience.

## 2. Data model

```prisma
model Ticket {
  id              String       @id @default(uuid()) @db.Uuid
  sessionId       String       @unique @db.Uuid
  publicReference String       @unique
  tokenHash       String?      @unique
  plateDigest     String?
  status          TicketStatus @default(ISSUED)
  issuedAt        DateTime     @default(now()) @db.Timestamptz(3)
  revokedAt       DateTime?    @db.Timestamptz(3)
  revokedReason   String?
  guestUserId     String?      @db.Uuid   // set when the ticket is linked to an account
  linkedAt        DateTime?    @db.Timestamptz(3)
  createdAt       DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime     @updatedAt @db.Timestamptz(3)

  session         ParkingSession @relation(fields: [sessionId], references: [id])
  linkedUser      User?          @relation(fields: [guestUserId], references: [id])

  @@index([guestUserId])
  @@index([status])
}

enum TicketStatus { ISSUED  REVOKED  EXPIRED }
```

### 2.1 The two identifiers

| Identifier | Form | Entropy | Storage | Purpose |
|---|---|---|---|---|
| **Ticket token** | 128+ bits, base64url (≥ 22 chars) | ≥ 128 bits | SHA-256 hash, unique | The QR payload; the bearer credential |
| **Public reference** | 8 chars, e.g. `7K3M-9QX4` | ~40 bits (5⁸ ≈ 390k) | plain, unique | Manual entry; reading aloud; short display |

**Why the reference is "public".** It is designed to be read out loud or typed. At 8 characters from
a 32-character unambiguous alphabet it has ≈ 1.1×10¹² combinations, which is enough to make blind
guessing impractical **when combined with rate limiting on the verification endpoint**. It is *not*
sufficient to authorize anything: the verification endpoint returns a status and a display, and the
**exit completion** additionally requires a scanned or confirmed ticket, plus the physical plate
check by the guard, plus the payment requirement. The reference alone must never be enough to
close a session without the guard's explicit action — and the guard's action is itself an audited,
authorized operation.

**The alphabet** excludes characters that are confused in reading or typing:

```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789   (31 characters — no I, O, 0, 1)
```

Presented as `XXXX-XXXX` for readability.

## 3. The safe public payload

```jsonc
{
  "reference": "7K3M-9QX4",
  "token": "<raw ticket token — only in the issuing response and the owner's own ticket page>",
  "display": {
    "siteName": "Riverside Parking",
    "siteAddress": "Street 5, Phnom Penh",
    "plateId": "AB-123",
    "entryAt": "2026-10-21T09:12:44.000Z",
    "entryAtLocal": "2026-10-21 16:12",
    "timezone": "Asia/Phnom_Penh",
    "instructions": { "en": "Show this QR to the guard when you leave.", "km": "…" }
  }
}
```

**Never included:** the internal session id, the internal ticket id, the guard id, the pricing
policy id, the plate digest, the owner's identity (there is none for a guest), the fee, or the
ticket's token hash.

### 3.1 The ticket token on the owner's own page

The owner's ticket page needs the token to render the QR. It is fetched by presenting the token
itself (the page is opened from the claim response or from a link carrying the token) and is
returned **only to the presenter of that token**. A registered owner viewing their ticket history
gets the **display** fields but not the token, unless the row is `guest_user_id = <their id>` and
the request presents the token (TICKET-011).

## 4. State transitions

### 4.1 Ticket

```
   issued ──revoke (staff, reason required)──▶ REVOKED
      │                                            (terminal for exit purposes)
      │
      └──ticket validity window passes──▶ EXPIRED
```

| From | Event | To | Actor | Effect |
|---|---|---|---|---|
| — | issued | ISSUED | system (during the claim) | The ticket becomes usable |
| ISSUED | revoke | REVOKED | guard / owner / super admin, with a reason | The ticket can no longer authorize an exit; the session is usually moved to `MANUAL_REVIEW` |
| ISSUED | validity window passes | EXPIRED | system (implicit) | The ticket can no longer authorize an exit |

**Expiry is implicit.** The validity window is derived from the session, not stored as a separate
expiry column: a ticket is valid while its session may still be exited. The `EXPIRED` state exists
so that a stale ticket is distinguishable from a live one, and is applied by a sweeper or lazily
at read time. A ticket whose session is `COMPLETED` or `CANCELLED` is treated as spent regardless
of the ticket's own state (TICKET-012).

### 4.2 Linking

```
   guest ticket (guest_user_id = null)
        │  present the ticket token (proof of possession)
        ▼
   linked ticket (guest_user_id = <user id>, linked_at = now)
        │
        └── no transition back to guest (unlinking is not offered in the MVP)
```

| From | Event | To | Preconditions |
|---|---|---|---|
| guest | link | linked | The caller is authenticated; the presented token hashes to this ticket; the ticket is not already linked to another user |

**Unlinking is not offered.** It would create a way to hand a ticket to another account, which is
the same problem as account sharing.

## 5. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Ticket not found by reference | 404 `TICKET_NOT_FOUND` | The same response for a revoked ticket's reference lookup, so a revoked ticket is not confirmable by enumeration |
| Ticket revoked | The verification result is `REVOKED` | Exit is not authorized; the UI offers "open a manual review" |
| Ticket already used | The verification result is `ALREADY_COMPLETED` | The session is `COMPLETED` |
| Ticket token presented for a different ticket | 404 | The lookup is by hash equality |
| Linking without proof of possession | 403 `TICKET_LINK_UNAUTHORIZED` | Audited as a failed linking attempt |
| Linking a ticket already linked to another account | 409 `TICKET_ALREADY_LINKED` | The message does not reveal the owning account |
| Storage full / DB error | 500 | No partial state |

## 6. Security considerations

| Threat | Control |
|---|---|
| Screenshot replay | The backend checks the live session state; a completed session cannot exit again |
| Enumerating public references | The reference is ~40 bits and the verification endpoint is rate-limited; the endpoint returns a status, not sensitive data |
| Stealing the ticket page | The page sets `Cache-Control: no-store`; the token is not in browser storage; the page requires the token to render the QR |
| Sharing an account to reuse a ticket | A ticket authorizes exactly one exit; linking does not change the session or payment history |
| XSS stealing the token | No `dangerouslySetInnerHTML`; a strict CSP; the token is fetched per request rather than embedded in a global |
| Token leakage in logs | The logger redacts `ticketToken`; the audit row records the reference, never the token |
| Leaking personal data on a public page | The public payload has no personal data beyond the plate the owner already displays |
| A revoked ticket being used after revocation | The verification reads the live ticket status |

### 6.1 Storage policy

| Location | Ticket token | Rationale |
|---|---|---|
| Server database | hash only | A dump does not yield a usable ticket |
| HTTP response (claim, owner's page) | raw, once | The owner must be able to render the QR |
| `localStorage` / `sessionStorage` | **never** | Readable by injected script and persistent on a shared device |
| Service-worker cache | **never** | Would make the ticket readable offline and after a logout |
| Cookie | **never** | The token is not a session credential |
| URL query string | avoided | It leaks through the referrer and browser history; the fragment is used and cleared |

## 7. Observability

| Event | Where |
|---|---|
| `ticket.issued` | Audit log (session, reference) |
| `ticket.revoked` | Audit log (reference, actor, reason) |
| `ticket.linked` | Audit log (reference, user) |
| `ticket.link_failed` | Audit log (reference, actor, reason) |
| `tickets_issued_total{site}` | Metrics |
| `ticket_issue_to_claim_seconds` | Histogram — how long between the session being created and the ticket being issued |
| `guest_link_rate` | Gauge — the share of tickets linked to an account (adoption signal) |

## 8. Alternatives considered

| Alternative | Why rejected |
|---|---|
| The QR carries the session id | Guessable and enumerable; it would also expose an internal identifier. |
| A short numeric ticket number (4–6 digits) | Far too small a space to be safe as a bearer credential. |
| The QR carries a signed ticket payload | Better for offline verification, but the online MVP does not need it, and a signature is not revocable. Deferred to the offline phase. |
| Showing the fee on the ticket | The fee depends on the exit time and possibly on a pricing change; showing a stale price creates disputes. |
| Storing the ticket token in `localStorage` for offline access | Makes the ticket readable by any script and survives a logout on a shared phone. |
| Allowing account unlinking | Creates a ticket-transfer path. |
| Requiring registration before showing the ticket | Breaks the core promise: guests must be able to park. |
