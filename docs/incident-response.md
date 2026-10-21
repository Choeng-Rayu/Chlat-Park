# Chlat-Park — Incident Response Runbook

> **This is an operational runbook, not a specification.** It describes how to respond to an
> incident. The system behaviour it protects is specified in `specs/`.

**Last updated:** 2026-10-21
**Audience:** the platform operator, the parking owner, and the support person on call.

---

## 1. How to use this document

Find the symptom. Follow the section. The severity levels determine who is called and how fast.

| Severity | Meaning | Response |
|---|---|---|
| **SEV-1** | A site cannot operate. Revenue is being lost now. | Page immediately. The platform operator is engaged. |
| **SEV-2** | A site can operate but something is wrong — the revenue looks wrong, the reports are wrong, one guard cannot work. | Engage the platform operator within the hour. |
| **SEV-3** | A minor issue with no operational impact. | Handle in working hours. |

**When in doubt, treat it as SEV-1.** A parking lot that cannot let motorcycles out is a business
stoppage for that lot.

---

## 2. The first five minutes (any incident)

```
1.  What is the symptom?          → find the section below
2.  Is a site down?               → SEV-1. Check the health endpoints first.
3.  Is money at risk?             → do NOT "fix" the numbers. Capture the state first.
4.  Preserve the evidence.        → the logs, the audit trail, the payment rows
5.  Communicate.                   → the owner, the guards, the platform operator
6.  Fix the smallest thing.       → roll back the release before writing a hotfix
```

**The two rules that are violated most often:**

- **Do not edit or delete financial data to make a report look right.** The report is a symptom; the
  cause is somewhere else. A manual `UPDATE` destroys the evidence and creates a second problem.
- **Do not roll back a migration before taking a backup.** The backup is what makes the rollback
  possible.

---

## 3. A site is down (SEV-1)

### 3.1 Diagnose

```bash
# 1. Is the API reachable?
curl -fsS -m 10 https://api.chlat-park.com/api/v1/health/live  | jq .

# 2. Is it ready (the database and the migrations)?
curl -fsS -m 10 https://api.chlat-park.com/api/v1/health/ready | jq .

# 3. From outside, does the site load?
curl -fsS -m 10 -o /dev/null -w '%{http_code}\n' https://chlat-park.com/

# 4. The platform and the logs
coolify logs --service api --tail 200 --since 30m
coolify logs --service db  --tail 100 --since 30m
```

| The result | The cause | Go to |
|---|---|---|
| `/live` fails | The API process is down or restarting | §3.2 |
| `/live` works, `/ready` fails | The database or the migrations | §3.3 |
| Both work, the site does not load | The proxy, the DNS, or the web service | §3.4 |
| Everything works, but the guard's device fails | The device, or the site network | §3.5 |

### 3.2 The API process is down

```bash
coolify logs --service api --tail 300 --since 15m
```

| In the log | The cause | The action |
|---|---|---|
| `Cannot find module …` | A broken build | Redeploy the previous image tag |
| `Environment variable … is missing` | A missing secret | Restore the secret in Coolify and redeploy |
| `P1001: Can't reach the database server` | The database is down | §3.3 |
| `P3009: migration … was not applied` | A migration was not run | §3.3 |
| A JavaScript heap out of memory | The memory limit is too low | Raise the limit, or investigate a leak |
| Nothing — the container is restarting | A crash loop | Check the resource usage; roll back |

**If the cause is not obvious within 10 minutes, roll back to the previous release.** A known-good
release is better than a debug session during a site outage. See `docs/deployment.md` §4.

### 3.3 The database or the migrations

```bash
# Is the database container up?
coolify ps
# Is the disk full?
coolify exec --service db -- df -h /var/lib/postgresql/data
# The migration state
DATABASE_URL='…' pnpm --filter @chlat/api prisma migrate status
```

| The cause | The action |
|---|---|
| The disk is full (> 90 %) | Free space; check the WAL archive; then restart the database |
| A migration was not applied | `pnpm --filter @chlat/api prisma migrate deploy` |
| A migration failed halfway | The transaction rolled back — nothing to do. Fix the cause and re-run |
| The database container is restarting | Check the logs; check the memory; check the disk |
| The database will not start (corruption) | **Stop. Restore from the backup** — `docs/database-backup-restore.md` §6 |

**Do not run a migration by hand during an incident** unless the incident *is* a missing
migration. A hand-run migration skips the verification step.

### 3.4 The proxy or the web service

```bash
coolify logs --service proxy --tail 100 --since 15m
coolify ps
# Is the certificate valid?
echo | openssl s_client -connect chlat-park.com:443 -servername chlat-park.com 2>/dev/null \
  | openssl x509 -noout -dates
```

| The cause | The action |
|---|---|
| The certificate expired | Renew it in Coolify; check the ACME logs |
| The proxy container is restarting | Check the resource usage; restart it |
| The `web` service is down | Redeploy it; check the build logs |
| The DNS is wrong | Fix the DNS; the propagation takes up to an hour |

### 3.5 The site network, but the platform is fine

Test from the site's own device, not from your laptop:

```bash
# On the guard's device
curl -fsS -m 10 https://api.chlat-park.com/api/v1/health/live
ping -c 3 1.1.1.1
```

| The finding | The action |
|---|---|
| DNS fails | The site's DNS is broken. Use the IP address as a temporary workaround, or fix the site's router |
| The ping fails | The site has no internet. The site cannot use the system |
| The API is reachable but the dashboard is blank | A browser cache or a service-worker issue. Clear the site data |

### 3.6 While you are fixing it — the guards

**The guard's site cannot use the system. Go back to paper.** The procedure is in
`docs/guard-training.md` §8:

1. The guard uses the paper ticket book.
2. The entry time and the plate are written on the paper ticket.
3. The payment is taken and written on the paper ticket.
4. **Every paper ticket is kept.**
5. The outage start and end times are logged.

**When the site comes back, the sessions are entered into the system** by the supervisor, with the
correct entry and exit times, so the revenue is not lost. This is a manual data entry task, and it
is the supervisor's job, not the platform operator's. The platform operator provides the list of
paper tickets and the correct pricing.

**The paper sessions are entered with the real times.** The entry time is the time on the paper
ticket, and the exit time is the time the rider left. This keeps the fee correct. The entry is
made as a normal session, and it is marked as an outage entry in the audit reason.

### 3.7 The communication

| Who | What to say | When |
|---|---|---|
| The site's guard | "Use the paper procedure. Keep every ticket. Call me when it is over." | Immediately |
| The parking owner | "The site is running on paper. We will enter the tickets when it is back. Here is the expected downtime." | Immediately |
| The platform operator | The incident channel | Immediately |
| Other site owners | "A technical issue is affecting one site. Your site is unaffected." | If the incident could spread |

---

## 4. A ticket is disputed (SEV-2)

### 4.1 The common disputes

| The dispute | What it usually means | The action |
|---|---|---|
| "I paid and it says unpaid" | The payment was not recorded, or it was recorded against the wrong session | Search by plate; if the payment is genuinely missing, record it now with the reason "disputed payment confirmed by rider" |
| "It says I owe more than I paid" | A price change, or a long stay | Show the pricing version on the screen; open a manual review |
| "I never parked there" | A plate typo at entry, or the wrong site | Open a manual review with "ticket dispute"; the supervisor checks the photos and the paper trail |
| "My bike is still there and it says I already left" | A duplicate scan, or a second session | Search by plate; there should be a second active session |
| "The QR screenshot does not work" | A screenshot of an expired or revoked ticket | The screenshot is only a copy — the system checks the live state. If the session is still active, scan the live ticket; if not, open a manual review |

### 4.2 The procedure

```
1. Ask the rider to state the plate and the arrival time.
2. Search the site by plate (exit screen → Search by plate).
3. Compare: the plate, the entry time, the duration, the amount.
4a. The system is right → explain it. Show the pricing version and the duration.
4b. The system is wrong → record the correct payment, or open a manual review.
5. Every dispute that touches money gets a manual review, whatever the outcome.
6. Log it: date, site, plate (the digest), what was claimed, what was found, what was done.
```

**Never resolve a money dispute by editing a payment directly.** Use the void-and-re-record flow, so
that the correction is visible (ADR-005).

### 4.3 The manual review

The manual review is the designed path for every exception:

```bash
# The supervisor opens it from the dashboard:
#   Session → Open manual review → category → reason → Save
```

The session moves to `MANUAL_REVIEW` and a review case is created. The resolution is made by the
owner or the platform operator, with a reason, and it is audited.

**A review case that has been open for more than 24 hours is escalated.** The reports show the
open cases with their ages.

---

## 5. The revenue looks wrong (SEV-2)

### 5.1 The four questions, in order

Before changing anything, answer:

1. **Which figure is wrong?** The collected, the exempt, the voided, or the uncollected-at-close?
2. **Which site and which period?**
3. **Is it a reporting bug or a data bug?** A reporting bug means the numbers are wrong but the
   data is right. A data bug means a payment was recorded incorrectly.
4. **When did it change?** Compare with yesterday's report for the same period.

### 5.2 The common causes

| The symptom | The likely cause | The action |
|---|---|---|
| The collected is too **high** | A payment was recorded twice, or a `VOIDED` payment is being counted | Check the payment rows; the partial unique index makes a double `PAID` impossible, so look for a `PENDING` that was later voided and re-recorded |
| The collected is too **low** | A payment was recorded without a `captured_at`, or a payment was voided by mistake | The console shows the **uncaptured payment count** as a warning — check it. A payment with a null `captured_at` is excluded from the revenue query |
| The exempt is unexpectedly high | A guard is exempting fees | List the exemptions with the actor and the reason; talk to the guard and the owner |
| The uncollected at close is too high | Sessions were completed without a `PAID` payment | This is the real "money not collected" figure; check the sessions individually |
| The revenue changed after a price change | A historical session was re-priced | It should not be possible: the session stores its pricing version and the fee snapshot. If it happened, it is a bug — report it |
| A site's revenue is zero | The site's `site_id` is wrong on the payments | Run the consistency check (§5.4) |
| The revenue for a period is zero | The period's `captured_at` is outside the window | The window is on `captured_at`, not `created_at`. A payment recorded on the 31st but captured on the 1st lands in the next month |

### 5.3 The reporting-window trap

> **Revenue is counted by `captured_at`, not by `created_at`.** A payment that was *recorded* at
> 23:59 on the 31st and *confirmed* at 00:01 on the 1st falls into the **next** period. The console
> shows the count of payments with a null `captured_at` as a warning, precisely so that this is
> visible.

If the report "looks wrong" at a month boundary, check this first. It is the most common cause.

### 5.4 The consistency checks

```bash
pnpm --filter @chlat/api job:check-consistency
```

| The check | What a finding means |
|---|---|
| `payments.site_id` ≠ the session's `site_id` | A payment is attributed to the wrong site — the wrong owner's revenue |
| A `COMPLETED` session with no fee snapshot | The uncollected figure is unreliable for that session |
| A `PENDING_CLAIM` session with an `entry_at`, or an `ACTIVE` one without | The state machine was bypassed |
| An `ACTIVE` session with no ticket | The claim half-completed |
| A claimed entry claim with no ticket | The same, from the other side |
| A session with a readable plate and no digest | The adoption count is under-reporting |

**Do not patch the rows by hand.** A finding is fixed by a **reviewed migration**, or by fixing the
code that caused it. See `specs/data/migrations.md` §6.7.

### 5.5 The individual session

```sql
SELECT s.id, s.status, s.entry_at, s.exit_at,
       s.fee_amount_minor, s.fee_currency, s.pricing_policy_version,
       p.id AS payment_id, p.status, p.amount_minor, p.captured_at, p.reason
FROM parking_sessions s
LEFT JOIN payments p ON p.session_id = s.id
WHERE s.id = '<session-id>';
```

Read the timeline: when the session was created, when it was claimed, when it was paid, when it
completed, and what the fee snapshot says. The audit log for that session gives the human
narrative.

---

## 6. A guard cannot sign in (SEV-2)

| The symptom | The cause | The action |
|---|---|---|
| "Account suspended" | The guard was deactivated | Check the assignment; the owner re-activates the guard |
| The site is not in the list | The assignment is missing or deactivated | The owner adds the assignment; the access takes effect immediately |
| "Invalid credentials" but the password is right | The password was changed | Reset it; a reset is audited |
| "Session expired" repeatedly | The clock on the device is wrong | Fix the device's clock; the tokens are time-based |
| The account was never created | The invitation was not completed | The owner re-invites the guard |

**Deactivating a guard takes effect immediately** — the next request is rejected, without waiting
for a token to expire. If a guard still has access after deactivation, that is a bug: check the
`authzVersion` and the cache.

---

## 7. A security concern (SEV-1 or SEV-2)

| The concern | The immediate action |
|---|---|
| A suspected credential leak (a guard's password, the bot token, the pepper) | Rotate it: see `docs/deployment.md` §8. Revoke the affected sessions |
| A suspected ticket-token leak | The tokens are single-use and expire in 5 minutes. Revoke the affected sessions by cancelling them |
| Suspicious access to the admin console | Revoke the account; review the audit log for that actor; export the audit log |
| Suspicious activity in the audit log | Export the audit log (the export is itself audited) and preserve it off-site before investigating |
| A suspected breach of the database | **Stop the API.** Take a backup. Rotate the database password. Restore from a known-good backup if there is evidence of tampering. Preserve the logs |
| A web server compromise | Rebuild the container from the source, not from the running container |

**The audit log is append-only and the database role has no `DELETE` grant on it.** A tampered
audit log means the database role was changed — that is itself the finding.

**Export and preserve the evidence before you investigate.** The audit log and the application logs
are the record. Investigating first and exporting later can lose the state you need.

---

## 8. The platform is down for everyone (SEV-1)

```bash
# 1. Is it the platform or the internet?
curl -fsS -m 10 https://api.chlat-park.com/api/v1/health/live
curl -fsS -m 10 https://api.chlat-park.com/api/v1/health/ready
coolify ps
```

| The finding | The action |
|---|---|
| The VPS is down or rebooting | Contact the VPS provider; the sites run on paper meanwhile |
| The disk is full on the VPS | Free the space; the database cannot write |
| The VPS is up but the app is down | §3.2 |
| A deployment is in progress | Let it finish; do not start a second one |

**If the whole platform is down, every site runs on paper.** The supervisors collect the paper
tickets and the platform operator coordinates the manual entry once the platform is back.

---

## 9. The data is wrong (SEV-3 or SEV-2)

| The case | The action |
|---|---|
| A wrong plate on a session | The session is not editable. Cancel it (if pending) or open a manual review |
| A wrong amount on a payment | Void it and re-record it. Never edit it |
| A wrong price on a policy | A policy is immutable. Create a new version |
| A wrong site on a session | Not editable. Open a manual review; the operator fixes it with a reviewed migration |
| A missing session | Create it manually with the correct times, with the reason "outage entry" |
| A missing audit row | **Do not fabricate it.** Report it — an audit gap is a finding, and the code that caused it must be fixed |

---

## 10. The escalation and the communication

| Severity | Who is notified | Within |
|---|---|---|
| SEV-1 | The platform operator, the affected owner, the affected guard's supervisor | Immediately |
| SEV-2 | The platform operator, the affected owner | 1 hour |
| SEV-3 | The platform operator | The next working day |

**The update format**

```
[SEV-1] Chlat-Park — Riverside Parking cannot process exits
Started:   2026-10-21 09:12 UTC
Impact:    1 site, ~40 sessions/hour, revenue collection stopped
Cause:     (known / investigating)
Action:    Sites on paper procedure; platform operator engaged
Next update: 09:30 UTC
```

**Give a next-update time, even if the update is "no change".** Silence is worse than a bad update.

---

## 11. The after-action review

Within 48 hours of any SEV-1:

| The question | Where the answer goes |
|---|---|
| What was the impact (in sessions, in money, in time)? | The incident record |
| What was the root cause? | The incident record |
| Did the monitoring detect it, or did a human? | The monitoring gap → a new alert |
| Did the runbook work? | The runbook is updated |
| What is the one change that would have made this smaller? | The backlog |

**The incident record is appended to `docs/drills/`** (or an incident log). It is not deleted, and
it is not edited after the fact.

---

## 12. The runbooks index

| Situation | Runbook |
|---|---|
| Deploying or releasing | `docs/deployment.md` |
| Restoring the database | `docs/database-backup-restore.md` |
| Training a guard | `docs/guard-training.md` |
| A site is down / a ticket is disputed / the revenue looks wrong | This document |
| The consistency checks and the migration policy | `specs/data/migrations.md` |
| The threat model and the `@Public()` allowlist | `specs/security/threat-model.md` |
