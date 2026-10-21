# Security

**Status:** In progress
**Requirement IDs:** SEC-001 … SEC-018
**Depends on:** `authentication`, `authorization`

---

## 1. Problem

This feature is the **cross-cutting** security layer: the controls that apply to every request
rather than to one flow. Most of them are already specified elsewhere — rate limiting in
`authentication`, the deny-by-default rule in `authorization`, the token design in
`entry-qr-claim`. This spec collects them into one list, states the requirements in testable
form, and names the controls that belong to no single feature.

Two failure modes dominate the security design of a product like this:

* **The bearer credential is treated as proof.** A QR code is a photograph. The system must always
  re-derive the truth from the server's state.
* **The authorization shortcut.** A check in the UI, a check in a controller that somebody forgot
  to copy, a `if (isAdmin)` branch. The defence is deny-by-default plus a route audit.

## 2. Scope

### 2.1 In scope

* Transport security: HTTPS only, HSTS, secure cookies.
* Input validation at the boundary: strict DTO schemas, no unknown keys.
* Output encoding and the Content-Security-Policy.
* CSRF protection on cookie-authenticated mutations.
* CORS: a strict allowlist.
* Rate limiting, with per-route budgets.
* Request identification (`X-Request-Id`) and structured logging.
* Secret management: nothing in Git, nothing in the image, nothing in the browser.
* Log and error redaction.
* Security headers.
* The security-relevant CI checks: secret scanning, the route audit, the dependency audit, the
  "no `NEXT_PUBLIC_*` secret" check.
* The dependency and container posture.

### 2.2 Out of scope

* A penetration test by an external firm (recommended before production; not part of the MVP
  build).
* A SOC 2 / ISO 27001 programme.
* Bug bounty.
* A WAF or a cloud-level DDoS product beyond what Coolify provides.
* Anonymisation of the plate beyond the digest (the plate is needed operationally).

## 3. Actors

| Actor | Interaction |
|---|---|
| Anyone on the internet | The public surface: the claim endpoint, the webhook, the health probes, the static site |
| An authenticated staff member | Everything else |
| An attacker | The threat model enumerates their goals; this spec lists the controls |

## 4. Behaviour

Every request passes through a fixed chain, in this order:

```
request
  → RequestIdInterceptor        (stamp X-Request-Id)
  → Helmet / security headers
  → Body size limit
  → CORS check
  → CSRF check (cookie-authenticated mutations only)
  → JwtAuthGuard                (unless @Public())
  → PermissionGuard             (deny-by-default)
  → RateLimitGuard
  → ZodValidationPipe           (strict)
  → Controller → Service
  → AllExceptionsFilter         (a consistent error envelope, no internals)
  → RedactInterceptor            (log redaction)
```

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| SEC-001 | All public traffic must be served over TLS 1.2 or later, and the application must redirect plain HTTP to HTTPS and set `Strict-Transport-Security` with a `max-age` of at least 6 months. | P0 |
| SEC-002 | The system must not serve any content over plain HTTP, and the reverse proxy must reject plain HTTP rather than merely redirecting it for API traffic. | P0 |
| SEC-003 | Every request body must be validated against a strict schema that rejects unknown properties, and the validation must happen before the controller is invoked. | P0 |
| SEC-004 | Every response that sets a cookie must set `HttpOnly` (for session and token cookies), `Secure`, and `SameSite=Lax` or stricter. | P0 |
| SEC-005 | Cookie-authenticated mutating requests must be protected against CSRF with a double-submit token bound to the session, and the token must not be readable by a cross-origin page. | P0 |
| SEC-006 | The API must return `Access-Control-Allow-Origin` only for the configured application origin, and must not use a wildcard with credentials. | P0 |
| SEC-007 | The API must set a Content-Security-Policy without `unsafe-inline` or `unsafe-eval`, and the web app must not use `dangerouslySetInnerHTML` for user-controlled data. | P0 |
| SEC-008 | Rate limits must be applied to the authentication, claim, verification, payment, and admin endpoints, and exceeding a limit must return 429 with a `Retry-After` header. | P0 |
| SEC-009 | Every response must include a `X-Request-Id` header, and the same id must appear in every log line for that request and in any audit row it produces. | P0 |
| SEC-010 | No secret may be committed to the repository, and the CI pipeline must run a secret scanner over the repository and the built images. | P0 |
| SEC-011 | No secret may be included in a container image, in a `NEXT_PUBLIC_*` variable, or in the browser bundle, and the CI pipeline must verify the built client bundle contains no server-side secret. | P0 |
| SEC-012 | Logs and error responses must not contain a raw claim token, a raw ticket token, a password, a password hash, a cookie, an authorization header, a bot token, the plate pepper, or a raw plate. | P0 |
| SEC-013 | Error responses must use a consistent envelope with a stable machine-readable code, and must not contain a stack trace, a SQL fragment, an internal path, or an internal identifier. | P0 |
| SEC-014 | The database must not be reachable from the public internet, and the application must connect using a least-privilege database role. | P0 |
| SEC-015 | Dependency vulnerabilities reported by the audit tool at the configured severity must fail the CI pipeline, and the base container images must be pinned by digest. | P0 |
| SEC-016 | The system must not accept a plate, a ticket reference, a token, or any other identifier that does not match its documented format, and must not pass unvalidated input into a query. | P0 |
| SEC-017 | The `@Public()` allowlist must be reviewed in the threat model, and any change to it must be a security-relevant change that requires explicit review. | P0 |
| SEC-018 | The system must apply a strict Content-Type check and must reject a request whose body is not the expected format, so that a request cannot be smuggled past a parser. | P0 |

## 6. Acceptance criteria

### Normal

* **SEC-003** — Given a create-session request with an extra unknown body field, then the response
  is 400 with `VALIDATION_FAILED` naming the field.
* **SEC-009** — Given any API request, then the response contains a `X-Request-Id` header, and the
  same id appears in the log line and in the audit row the request produced.
* **SEC-004** — Given a successful login, then the session cookies carry `HttpOnly`, `Secure`, and
  `SameSite=Lax`.

### Failure

* **SEC-013** — Given an unexpected internal error, then the response is 500 with the code
  `INTERNAL_ERROR` and contains no stack trace, no SQL text, and no file path.
* **SEC-014** — Given a connection attempt to the database port from outside the private network,
  then the connection is refused.
* **SEC-018** — Given a request with `Content-Type: text/plain` to a JSON endpoint, then the
  response is 415.

### Abuse

* **SEC-001** — Given a plain HTTP request, then it is redirected to HTTPS (or rejected for API
  traffic), and the response includes the HSTS header.
* **SEC-006** — Given a request from an origin that is not the application origin, then no
  `Access-Control-Allow-Origin` header is returned.
* **SEC-008** — Given 20 claim attempts from one IP in a minute, then the 21st is rejected with 429
  and a `Retry-After` header.
* **SEC-005** — Given a valid session cookie and a mutating request with a foreign CSRF token, then
  the response is 403 and no state changed.
* **SEC-010, SEC-011** — Given the CI pipeline runs, then the secret scanner finds nothing, the
  client bundle contains no server secret, and no `NEXT_PUBLIC_*` variable name suggests a secret.
* **SEC-016** — Given a request with a plate containing a SQL metacharacter, then it is either
  stored as the literal string (parameterised) or rejected by validation, and no SQL error is
  returned to the client.
* **SEC-012** — Given a full claim-and-exit flow, when the logs and the error responses are
  inspected, then no token, password, cookie, or raw plate appears.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | What severity threshold fails the dependency audit? | Engineering | Phase 1 (current answer: high or critical) |
| Q2 | Is an external penetration test required before the production launch? | Product owner | Before Phase 7 |
| Q3 | Should the admin export endpoints require a second factor? | Product owner | Before Phase 7 |

## 8. Related

* `specs/security/threat-model.md` — the analysis these controls answer.
* `specs/security/access-control-matrix.md` — the permission matrix.
* `specs/features/authentication/` — the credential controls.
* `specs/features/authorization/` — the deny-by-default rule and the route audit.
