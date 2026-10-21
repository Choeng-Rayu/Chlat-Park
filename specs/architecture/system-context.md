# Chlat-Park — System Context (C4 Level 1)

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`container-architecture.md`](./container-architecture.md) · [`../product/product-brief.md`](../product/product-brief.md)

---

## 1. Purpose

This document describes the system as a black box: what sits inside it, who and what interacts with
it, and what data crosses the boundary. It is the entry point for anyone new to the project and the
reference used by the threat model (`../security/threat-model.md`).

## 2. System in one paragraph

Chlat-Park is a **monorepo containing two deployable applications**: a Next.js web application
(`apps/web`, serving both the owner/guest experience and the guard dashboard as route groups) and a
NestJS API (`apps/api`, the single source of truth for domain rules). Both are backed by a
PostgreSQL database managed by Prisma 7. A Telegram bot operates as a **module inside the NestJS
API**, calling the same domain services as the website. A reverse proxy terminates TLS and routes
traffic to the two applications.

## 3. Context diagram

```
                        ┌────────────────────────────────────────────┐
                        │              Chlat-Park System             │
                        │                                            │
  ┌───────────┐         │  ┌──────────────────────────────────┐    │        ┌──────────────┐
  │  Guest    │────────┼─▶│  │  apps/api  (NestJS)              │◀───┼────────│  Telegram    │
  │ motorcycle│  HTTPS │  │  │  • domain services (single truth)│    │  HTTPS │  Bot clients │
  │  owner    │◀────────┼──│  │  • REST API  /api/v1              │    │        └──────────────┘
  │ (no acct) │         │  │  • TelegramModule (webhook)         │    │
  └───────────┘         │  │  │  • Prisma 7  ──▶  PostgreSQL      │    │        ┌──────────────┐
                        │  │  └──────────────────────────────────┘    │◀───────│  Platform    │
  ┌───────────┐         │  │  ┌──────────────────────────────────┐    │        │  admin       │
  │ Registered│─────────┼─▶│  │  apps/web  (Next.js)             │    │        └──────────────┘
  │  owner    │◀────────┼──│  │  • /            owner + guest     │    │
  └───────────┘         │  │  │  • /guard/      guard dashboard  │    │        ┌──────────────┐
                        │  │  │  • /owner/      owner console    │    │        │  Parking     │
  ┌───────────┐         │  │  └──────────────────────────────────┘    │        │  owner       │
  │  Guard    │─────────┼─▶│                                            │◀───────│  (manages    │
  │ (on-site  │◀────────┼──│                                            │        │   sites)     │
  │  monitor) │         │  └────────────────────────────────────────────┘        └──────────────┘
  └───────────┘
                                ┌───────────────┐
                                │  PostgreSQL   │
                                │  (private,    │
                                │   not public) │
                                └───────────────┘
```

## 4. Actors and external systems

| Actor / system | Interaction | Channel | Authentication |
|---|---|---|---|
| Guest motorcycle owner | Claims an entry QR, views and presents a ticket | HTTPS (web/PWA) | Opaque claim token → issued ticket token |
| Registered motorcycle owner | As guest, plus ticket history, account settings, Telegram linking | HTTPS | HTTP-only session cookie |
| Security guard | Creates sessions, issues entry QR, verifies exits, records payments | HTTPS | HTTP-only session cookie, site-scoped |
| Parking owner | Manages sites, guards, pricing, reviews reports and overrides | HTTPS | HTTP-only session cookie, site-scoped |
| Platform administrator | Platform config, revenue, adoption analytics, audit export | HTTPS | HTTP-only session cookie, `platform` scope |
| Telegram platform | Delivers bot updates, receives bot messages | HTTPS webhook (outbound from Telegram) | Webhook secret token + optional secret header |
| PostgreSQL | System of record | Private network, TLS in production | Credentials from environment secrets |
| Coolify / VPS | Runs the containers, reverse proxy, TLS, backups | Ops interface | SSH / Coolify UI |
| Local parking service | *Future* site-local authority during outages | Site LAN | **Deferred — not in the MVP** |

## 5. External dependencies (MVP)

| Dependency | Used for | Failure impact |
|---|---|---|
| PostgreSQL | All state | Total outage; no entry/exit |
| Reverse proxy / TLS terminator | HTTPS | Sites unreachable publicly |
| DNS | Public reachability | Sites unreachable publicly |
| Telegram (P1) | Bot channel | Web/PWA guest flow unaffected; bot channel degraded |
| Payment provider | *Not used in MVP* | n/a — manual cash only (ADR-005) |

## 6. Data crossing the boundary

### 6.1 Inbound

| Data | Source | Sensitivity | Handling |
|---|---|---|---|
| Plate ID | Guard (trusted) | Personal data of a third party | Normalized, digested with a server pepper, retained per ADR-009/010 |
| Claim token | Owner (bearer) | Secret | SHA-256 hashed server-side; raw token never logged |
| Ticket token / reference | Owner (bearer) | Secret | Hashed server-side; safe reference only in public responses |
| Credentials | Guard / owner / admin | Secret | Hashed with Argon2id; never logged; never returned |
| Payment amount + reason | Guard | Financial | Integer minor units; every change audited |
| Telegram update | Telegram | Secret (webhook) | Validated via secret token; replay-protected by update id |
| Offline event batch | *Future* | Secret-bearing | Authenticated transport, deduplicated by event id — **Deferred** |

### 6.2 Outbound

| Data | Destination | Contents |
|---|---|---|
| Entry QR payload | Guard monitor | Claim token only — no plate, no personal data |
| Ticket display | Owner device | Site, plate, entry time, reference, instructions only — no internal ids |
| Fee preview | Guard dashboard | Amount, currency, policy version, line-item breakdown |
| Revenue / adoption aggregates | Admin console | Aggregates and per-site breakdowns — never a raw plate list |
| Audit export | Admin (explicit action) | Full audit rows, with the export itself audited |
| Bot message | Telegram | Ticket details and QR image where supported |

## 7. Trust boundaries

| # | Boundary | Crossing | Controls |
|---|---|---|---|
| TB-1 | Public internet → reverse proxy | All HTTP | TLS 1.2+, HSTS, request size limits, rate limiting at the proxy and the app |
| TB-2 | Reverse proxy → `apps/web` | HTTP | Network-internal; the web app holds no secrets and no signing keys |
| TB-3 | `apps/web` → `apps/api` | HTTP (internal) | The API is the only trust anchor; the web app is a pure client of it |
| TB-4 | `apps/api` → PostgreSQL | SQL | Private network, credentials from env, parameterised queries via Prisma |
| TB-5 | `apps/api` → Telegram | HTTPS | Webhook secret token; outbound calls authenticated with a bot token from env |
| TB-6 | Browser → `apps/api` | HTTPS | Cookie session, CSRF protection on cookie-authenticated mutations, DTO validation |
| TB-7 | *(Future)* Site LAN → local parking service | HTTP | *Deferred* |

**Key architectural property:** the browser and the Telegram client are both untrusted. Every
decision that matters — is this ticket valid, may this guard exit this session, what is the fee —
is made by `apps/api` against database state, never by the client.

## 8. Context-level quality attributes

| Attribute | Target (MVP) | Verified by |
|---|---|---|
| Availability | Single VPS; monthly target 99.5 % during site hours | Health probes + uptime monitoring |
| Performance | p95 < 500 ms for common dashboard API calls, excluding third-party latency | Load test in `specs/testing/test-matrix.md` |
| Security | TLS only, Argon2id passwords, deny-by-default authorization, rate limits on auth/claim/verify/payment | Security tests + route audit |
| Integrity | Transactional session and payment transitions; DB constraints | Integration tests against a real database |
| Privacy | Minimal collection; plates redacted after 90 days; aggregates only in the admin console | Retention job + audit |
| Recoverability | Encrypted backups to a separate destination; tested restore | `docs/database-backup-restore.md` |
| Scalability | Pilot: 1 VPS, a handful of sites, hundreds of sessions/day | Load test; horizontal scale is possible but not provisioned |

## 9. Explicit non-goals at context level

* No camera/ANPR, no barrier control, no automatic plate detection.
* No payment provider, no card data, no PCI scope.
* No offline operation in the MVP — the local parking service is designed, not delivered.
* No multi-region, no multi-tenant data residency requirements.

## 10. Known context-level weaknesses

| Weakness | Why it is accepted for the pilot | Mitigation |
|---|---|---|
| Single VPS is a single point of failure | Pilot scale, one site at a time | Backups + tested restore; documented outage procedure; local service is the future answer |
| Telegram depends on the internet | Telegram is a P1 convenience channel | Web/PWA is the primary channel |
| Guest identity is only a plate | Registration is optional by design | HMAC digest for counting without retaining readable plates |
| Guest ticket recovery is not yet defined | Deferred decision (see ADR-009 / `features/guest-ticket/`) | Guard-assisted recovery with a manual review case, audited |
