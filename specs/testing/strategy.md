# Chlat-Park — Test Strategy

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`test-matrix.md`](./test-matrix.md) · [`../features/*/acceptance.feature`](../features/)

---

## 1. Principles

1. **A feature is done when its acceptance criteria pass.** The `acceptance.feature` file is the
   contract; the tests implement it.
2. **Authorization is tested at the API boundary.** A unit test of `PermissionGuard` proves the
   guard works; it does not prove that a route is annotated correctly, that the scope resolves to
   the right site, or that the service re-checks the invariants. Those are integration concerns.
3. **E2E runs against a real database.** An in-memory fake does not enforce the unique
   constraints, the partial indexes, the transactions, or the row locks — which is where the
   interesting bugs live.
4. **The domain rules are tested once.** The tests call the domain services, not the HTTP
   endpoints, when the endpoint is not the subject of the test.
5. **A test that cannot fail is worse than no test.** The concurrency, the race, and the
   authorization tests are written to fail if the protection is removed.

## 2. The test pyramid

```
        ▲
       ╱ ╲         E2E (Playwright)          ~5 %
      ╱   ╲        The critical user journeys  through the real browser
     ╱─────╲       and the real API
    ╱       ╲
   ╱         ╲     Integration (Jest + a real DB)  ~35 %
  ╱           ╲    The API boundary, the services,
 ╱             ╲   the transactions, the constraints
╱───────────────╲
                 ╲  Unit (Jest)                ~60 %
                  ╲ the pure functions: the state machine, the
                   ╲ normalizer, the rounding, the pricing, the
                   ╲ permission computation
```

| Layer | Tool | Database | Runs on every PR? |
|---|---|---|---|
| Unit | Jest | none | Yes |
| Integration | Jest + `testcontainers` or a service container | A real PostgreSQL 16 | Yes |
| E2E | Playwright | A real PostgreSQL 16 + a seeded dataset | Yes |
| Contract | A schema snapshot + the OpenAPI drift check | none | Yes |
| Static | ESLint, `tsc --noEmit`, the route audit, the i18n parity check | none | Yes |
| Security | The secret scanner, the dependency audit, the bundle scan | none | Yes |
| Load | k6 | A staging-like environment | Nightly / pre-release |
| Offline | A manual script on real hardware | — | Phase 6 only |

## 3. What runs where

### 3.1 Unit tests (no database)

| Area | Examples |
|---|---|
| The session state machine | Every (from, to) pair; the illegal transitions |
| The plate normalizer | Khmer, Latin, mixed separators, the empty result, the separator-only input |
| The rounding | Half-up on the minor unit; the zero; the negative clamp |
| The pricing calculation | Flat, hourly (the grace period, the cap, the rounding-up boundary), tiered (the band selection) |
| The effective permission set | The role grants, the `GRANT` overrides, the `REVOKE` overrides, the expired grants |
| The scope resolution | The platform scope, the owned set, the assigned set, the union |
| The token generation | The uniqueness, the length, the hash stability |
| The claim validation order | The precedence of the verdicts |
| The error mapping | The domain error → the status and the code |
| The i18n loader | The interpolation, the fallback, the placeholder |
| The money formatter | The minor-unit conversion, the locale, the currency digits |

### 3.2 Integration tests (a real database)

| Area | Examples |
|---|---|
| The session creation transaction | The rollback when the entry claim fails |
| The claim | The single ticket; the concurrent claim; the expiry; the revocation |
| The exit completion | The row lock; the concurrent completion; the payment requirement; the fee snapshot |
| The payments | The partial unique index; the void; the exemption; the `site_id` denormalization |
| The pricing | The version monotonicity; the immutability; the effective-policy selection |
| The audit | The transaction atomicity; the redaction; the scope |
| The authorization | Every role × permission combination at the API boundary |
| The consistency checks | The nightly checks, with deliberately corrupted rows |

### 3.3 E2E tests (a browser and a real API)

| Journey | What it proves |
|---|---|
| Entry → claim → exit | The whole flow works through the real UI, in both locales |
| The claim on a phone viewport | The ticket fits in one screenshot; the QR is legible |
| The exit with a plate mismatch | The verdict blocks the exit in the UI |
| The concurrent exit | Two browser contexts; one completion |
| The language switch | The Khmer rendering; the parity |
| The guard's site selection | The scope follows the selection |

### 3.4 What must **not** be mocked

| Do not mock | Why |
|---|---|
| The database in an integration test | The unique constraints, the transactions, the row locks, and the partial indexes are the subject |
| The clock in a concurrency or a fee test | The server clock is the contract |
| The token generator in a security test | The entropy is the control |
| The authorization service in an API test | The whole point is to test the real check path |

**Acceptable mocks:** the Telegram HTTP client, the email sender (in the future), the clock in a
*unit* test of a pure function, and the external storage in a backup test.

## 4. The database in tests

```ts
// apps/api/test/setup/global-setup.ts
import { GenericContainer, StartedTestContainer } from 'testcontainers';

let postgres: StartedTestContainer;

beforeAll(async () => {
  postgres = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'chlat_test',
    })
    .withExposedPorts(5432)
    .start();

  process.env.DATABASE_URL = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/chlat_test`;

  // Apply every migration, so the tests run against the real schema
  await runMigrations(process.env.DATABASE_URL);
});

afterAll(async () => {
  await postgres.stop();
});
```

**Migrations run before the tests.** A test that runs against a schema built with
`prisma db push` is testing a different schema from the one that will be deployed.

**Isolation:** each test file runs in its own transaction that is rolled back, or each test file
gets a fresh schema. The concurrency tests need real commits, so they use a dedicated file with
its own schema and clean up explicitly.

## 5. The acceptance-criteria mapping

Every `Scenario:` in an `acceptance.feature` file maps to at least one automated test. The
mapping is enforced by tagging the tests:

```ts
describe('entry claim (CLAIM-005)', () => {
  it('rejects a claimed token with 410 CLAIM_ALREADY_CLAIMED', async () => { … });
});
```

**A CI check enumerates the tags in the `.feature` files and the tags in the test files and fails
when a scenario has no test.** The check is a script, not a convention.

```bash
pnpm --filter @chlat/api check:acceptance-mapping
```

## 6. The "authorization tested at the API boundary" rule

The rule, stated precisely:

> An authorization test must send a real HTTP request, with a real session cookie, to a real
> endpoint, against a real database, as a user whose scope does **not** include the target.

A test that calls `AuthorizationService.can()` directly is a unit test. It is valuable, and it is
**not** sufficient. The bugs it misses:

* a route with the wrong `@RequirePermissions` (or none at all),
* a scope resolution that reads the wrong site,
* a service that performs a write before the check,
* an endpoint that is registered on a path the guard does not cover.

**The canonical shape of an authorization test:**

```ts
describe('authorization at the API boundary', () => {
  it('rejects a guard acting outside their assigned site', async () => {
    const guard = await createGuard({ siteId: siteA.id });
    const { cookie } = await login(guard.email, guard.password);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/parking-sites/${siteB.id}/sessions`)
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.error.code).toBe('AUTHZ_SCOPE_DENIED');
  });
});
```

## 7. The concurrency tests

The concurrency bugs are the ones a normal test suite misses, so they are written explicitly.

| Test | What it proves |
|---|---|
| Two claims of the same token | Exactly one ticket; the loser gets 409 |
| Two exit completions of the same session | Exactly one completion; one audit row |
| Ten `PAID` payments for one session | Exactly one `PAID` row; nine 409s |
| Two session creations for the same plate at one site | One succeeds, or both, per the policy — never a duplicate active session |
| Two `POST /auth/refresh` with the same token | One succeeds; the family is revoked on the replay |

**How to write them:** fire the requests with `Promise.all` against a real database (not a
transaction that is rolled back), and assert the outcome on the database, not on the responses.

```ts
const [a, b] = await Promise.all([
  request(app.getHttpServer()).post('/api/v1/entry-claims/claim').send({ token }),
  request(app.getHttpServer()).post('/api/v1/entry-claims/claim').send({ token }),
]);

const tickets = await prisma.ticket.count({ where: { sessionId } });
expect(tickets).toBe(1);
expect([a.status, b.status].sort()).toEqual([200, 409]);
```

## 8. The coverage policy

| Metric | Target | Enforcement |
|---|---|---|
| Statement coverage — `apps/api/src` | ≥ 80 % | A CI report; a warning below 70 % |
| Branch coverage — the domain services | ≥ 85 % | A CI report |
| The permission catalogue | 100 % of the keys exercised by at least one authorization test | The route audit + the matrix test |
| The state machine | 100 % of the transitions | The transition table test |
| The acceptance scenarios | 100 % mapped to a test | `check:acceptance-mapping` |

**Coverage is a floor, not a goal.** A high coverage number on a codebase with no concurrency
tests and no authorization tests is a false sense of safety.

## 9. The static and contract checks in CI

| Check | Command | Fails when |
|---|---|---|
| Lint | `pnpm lint` | An ESLint error (including the `dangerouslySetInnerHTML` ban) |
| Typecheck | `pnpm typecheck` | A TypeScript error |
| Unit + integration | `pnpm test` | A test fails |
| E2E | `pnpm test:e2e` | A test fails |
| The OpenAPI drift | `pnpm --filter @chlat/contracts openapi --check` | The committed contract differs from the generated one |
| The route audit | part of `pnpm test` | A route lacks `@RequirePermissions` / `@Public()`, or a public route is not on the allowlist |
| The i18n parity | `pnpm --filter @chlat/i18n check` | The locale key sets differ |
| The acceptance mapping | `pnpm check:acceptance-mapping` | A scenario has no test |
| The secret scan | `gitleaks` | A secret pattern is found |
| The dependency audit | `npm audit --audit-level=high` | A high or critical advisory is present |
| The bundle scan | a `grep` over the client build | A server secret appears in the client |
| The migration drift | `prisma migrate diff` | The schema and the migrations disagree |

## 10. The load and soak tests

| Test | Profile | Target |
|---|---|---|
| The dashboard read path | 10 concurrent guards, a read every 2 s | p95 < 500 ms |
| The claim path | 5 claims/second for 10 minutes | p95 < 800 ms; no error rate above 0.1 % |
| The exit path | 5 completions/second | p95 < 1 s; exactly one completion per session |
| The report path | 1 report per second for 5 minutes | p95 < 3 s |
| A 24-hour soak | The pilot volume | No memory growth, no connection-pool exhaustion, no lock contention |

The load tests run against a **staging-like** environment, never against production.

## 11. The offline tests (Phase 6)

The offline tests must include a **real network disconnection** and a **restart/recovery** test. A
mocked network failure is insufficient — the behaviours that break are the ones around a socket
timeout, a DNS failure, a half-open connection, and a process kill.

| Test | How |
|---|---|
| The internet is cut | Disconnect the site's network interface (or block it at the router) |
| The central backend is unreachable | Point the site at a black-holed address |
| The local service is killed | `kill -9` mid-transaction |
| The local service is power-cycled | A physical or virtual power cycle |
| The events are duplicated | Submit the same batch repeatedly |
| The events arrive out of order | Submit with the sequence numbers reversed |
| The key is rotated | Rotate while the site is online, then while it is offline |

## 12. The test data

| Fixture | Purpose |
|---|---|
| `siteA` / `siteB` | Two sites with two owners, for the scope tests |
| `guardAtA` / `guardAtB` | Two guards at different sites |
| `ownerOfA` | The owner of site A |
| `superAdmin` | The platform administrator |
| `pendingSession` / `activeSession` / `completedSession` | The session states |
| `validClaimToken` | A live claim token |
| `expiredClaimToken` / `revokedClaimToken` | The failure claims |
| `flatPolicy` / `hourlyPolicy` / `tieredPolicy` | The pricing rules |

**The seed script is deterministic.** A test that depends on random data is a flaky test. The
session ids, the reference codes, and the timestamps are fixed.

## 13. The definition of a good test

| Property | Test |
|---|---|
| Deterministic | The same result on every run, in any order, on any machine |
| Independent | One test's failure does not change another's outcome |
| Fast | A unit test < 100 ms, an integration test < 5 s, an E2E test < 30 s |
| Readable | The name states the behaviour, not the implementation |
| Failing for the right reason | A red test means the behaviour broke, not that a fixture was missing |
| Traceable | Tagged with the requirement ID it covers |

## 14. The related documents

* `specs/testing/test-matrix.md` — the per-requirement mapping.
* `specs/features/*/acceptance.feature` — the acceptance criteria.
* `specs/features/security/` — the security requirements.
* `specs/data/migrations.md` — the consistency checks, which double as tests.
