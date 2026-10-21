# Chlat-Park — Guard Training Guide

> **This is an operational runbook, not a specification.** It describes the guard's day-to-day
> work. The system behaviour it describes is specified in `specs/features/`.
>
> **Audience:** a new security guard, and the guard supervisor running the training session.
> **Read time:** 20 minutes. **Practice:** 30 minutes with a supervisor.

---

## 1. Your job, in one paragraph

You are the guard at a parking lot. A rider arrives. You type their plate number into the dashboard.
The screen shows a QR code. The rider scans it with their phone, and they get a ticket. When they
come back, they show you the ticket on their phone. You check the plate, take their money, and
press **Authorize Exit**. The bike leaves. That is the whole job.

**Two things you must never skip:** checking the physical plate against the screen, and taking the
payment before you authorize the exit.

## 2. Before your first shift

| Step | What you need |
|---|---|
| 1 | Your own login. **Never share a login with anyone.** Every action in the system is recorded against your name, and a shared login means a mistake cannot be traced to the right person. |
| 2 | Your site assigned. Your supervisor adds you to the site. If you do not see your site on the list, tell your supervisor. |
| 3 | The sign-in screen open on the guard dashboard, and a phone camera that can scan a QR code. |
| 4 | A pen and a small pad of paper, for the outage procedure. |

**Your supervisor walks you through one full entry and one full exit on a real motorcycle before
you work alone.** Do not skip this.

## 3. The entry flow

```
1. The rider arrives
        ↓
2. Sign in, choose your site         ← the site you are working at TODAY
        ↓
3. Type the plate number              ← exactly as it is on the motorcycle
        ↓
4. Check what the screen shows        ← the normalised plate
        ↓
5. Press "Confirm entry"
        ↓
6. The QR code appears on the monitor
        ↓
7. The rider scans it with their phone
        ↓
8. The dashboard shows the session as ACTIVE
```

### 3.1 Step by step

**Step 1 — Sign in.** Go to the guard dashboard. Sign in with your own account. If you are working
a different site than yesterday, **change the site** — the site at the top of the screen must be
the lot you are physically standing in. If your site is not in the list, do not work; tell your
supervisor.

**Step 2 — Type the plate.** Type the plate number **exactly as it appears on the motorcycle.**
Look at the plate, not at a piece of paper the rider hands you — a written plate is often wrong.

**Step 3 — Check the normalisation.** The screen shows you the plate after the system has cleaned it
up: spaces removed, hyphens removed, capital letters. For example, you type `ab-123` and the screen
shows `AB123`. That is correct. If the screen shows something that does **not** look like the
plate on the motorcycle, correct the input before you continue.

**Step 4 — Confirm.** Press **Confirm entry**. The session is created and the QR code appears.

**Step 5 — The rider scans.** The rider opens their camera and scans the QR code on the monitor.
Some riders will struggle — they may need help finding the camera, or they may have the phone
locked. Help them. This is normal and it is not a problem with the system.

### 3.2 If the rider does not scan the QR

You have three options, in this order:

| Situation | What to do |
|---|---|
| The rider is fumbling with their phone | Wait. The code lasts **5 minutes**. |
| The rider has no phone, no data, or no app | Press **Manual activate** on the session. This starts the parking clock and it is recorded against your name. Tell the rider to show this screen at the exit. |
| The rider changed their mind and is leaving | Press **Cancel**. The session is closed and nothing is charged. |

**The QR can be reissued.** If the code has expired, press **Show a new code**. The old code stops
working immediately and a new one appears with a new 5-minute timer.

**Do not write the rider's name or phone number anywhere.** The system does not need it, and the
privacy notice does not cover it.

## 4. The exit flow

```
1. The rider returns and shows their phone
        ↓
2. Scan the ticket QR  (or type the reference)
        ↓
3. Read the screen: plate, entry time, duration, amount
        ↓
4. COMPARE the screen's plate with the plate on the motorcycle
        ↓
5. Take the payment
        ↓
6. Tick "I have checked the plate"
        ↓
7. Press "Authorize Exit"
        ↓
8. The bike leaves
```

### 4.1 Step by step

**Step 1 — Scan.** Use the device's camera to scan the ticket QR code on the rider's phone. If the
camera will not scan it, the rider can type the short reference code shown on their screen (it
looks like `7K3M-9QX4`) into the manual entry box.

**Step 2 — Read the screen.** You will see:

| On the screen | What it means |
|---|---|
| **The plate** | The plate this ticket is for |
| **The site** | Where the motorcycle is parked |
| **The entry time** | When it was parked |
| **The duration** | How long it has been there |
| **The amount** | What is owed, in the site's currency |
| **The pricing version** | Which price list was used |
| **The payment state** | Whether it has been paid |
| **The status badge** | Whether the exit can go ahead |

**Step 3 — Check the plate. This is the most important step on this page.** Look at the actual
motorcycle in front of you. Compare it with the plate on the screen. They must be the same
motorcycle.

> **A screenshot is not proof.** A ticket can be photographed and shared. The screen is what the
> system knows *right now*; the motorcycle in front of you is what you can verify. If they do not
> match, the ticket is not for this bike.

**Step 4 — Take the payment.** Choose the payment method from the ones your site accepts. Enter
the amount. Add a short reason (for example, "paid at the gate"). Press **Record payment**.

**Step 5 — Tick the confirmation.** Tick **"I have checked the plate on the motorcycle"** only
after you have actually looked at the bike. The button stays disabled until you do.

**Step 6 — Authorize the exit.** Press **Authorize Exit**. The session closes. The bike leaves.

### 4.2 The status badges

| Badge | What it means | What you do |
|---|---|---|
| **Ready to exit** (green) | Everything checks out. | Take the payment, then authorize. |
| **Payment required** (amber) | The ticket is fine; the fee is not settled. | Take the payment, then authorize. |
| **Plate does not match** (red) | The plate on the ticket is not the plate on the bike. | **Do not authorize the exit.** Go to §5. |
| **Already exited** (grey) | This session was already closed. | The rider has already left. Send them to the supervisor. |
| **Ticket was revoked** (red) | A supervisor cancelled this ticket. | Send them to the supervisor. |
| **Ticket expired** (red) | The ticket is no longer valid. | Go to §5. |
| **Ticket not found** (grey) | The code is wrong, or the ticket does not exist. | Ask the rider to show the ticket again. If it still fails, go to §5. |
| **Needs a supervisor** (amber) | A supervisor is already looking at this session. | Do not touch it. Call your supervisor. |
| **No active session** (grey) | There is no parking session for this ticket. | Go to §5. |

**The badges use a colour *and* a word *and* an icon.** Never rely on the colour alone — the
sunlight on the monitor can wash it out.

## 5. When something is wrong

**The rule: you never authorise an exit you are not sure about.** Raise it instead. Every exception
is recorded, and a supervisor can resolve it. A wrongly closed session is a much bigger problem
than a slow exit.

| Situation | What to do |
|---|---|
| **The plate does not match** | Press **Open manual review**. Choose the "plate mismatch" reason and write what you see (for example, "ticket is AB123, bike is AB124"). Ask the rider to wait. Call your supervisor. |
| **The rider lost the ticket** | Use **Search by plate** on the exit screen. Find the active session for that plate. Press **Open manual review** — a supervisor must approve the exit. Do not authorise it yourself. |
| **The rider says they already paid** | Check the payment state on the screen. If it is unpaid, the money has not been recorded. If it is paid, authorise the exit. If there is a dispute, open a manual review with a "payment dispute" reason. |
| **The amount looks wrong** | Press **Open manual review** with a "payment dispute" reason and write what the rider says. Do not change the amount to match what they were charged — the amount comes from the site's price list, and your supervisor resolves pricing questions. |
| **The screen says "No active session"** | The rider may have parked at another site, or the session was cancelled. Search by plate. If nothing is found, open a manual review. |
| **The system is slow or the page will not load** | Try a refresh. If it is still broken, tell your supervisor and follow the outage procedure in §8. |
| **A rider is aggressive about the fee** | Stay calm, do not change the amount, open a manual review, and call your supervisor. Never argue about money at the gate — escalate. |

## 6. Money

| Rule | Why |
|---|---|
| **Record what was actually received.** | The revenue report is built from your records. |
| **Always give a reason.** | "Paid at the gate" is enough. A reason is required, and it is what makes a correction possible later. |
| **A mistake is voided, never edited.** | If you recorded the wrong amount or the wrong session, ask your supervisor to void it. They will enter the correct payment as a new record. The void and the correction both stay in the records — that is intentional. |
| **Never record a payment for a session you did not take money for.** | Even to "fix" a stuck session. Ask your supervisor. |
| **An exemption (a free exit) needs a reason and a supervisor's approval.** | Free exits are exceptions, and the site owner sees them. |

## 7. Your own account

| Rule | Why |
|---|---|
| **Sign out at the end of your shift.** | Especially on a shared device. |
| **Never let somebody else use your login.** | Even a colleague covering five minutes. Every action is recorded against your name. |
| **Change your password if you think somebody has seen it.** | Tell your supervisor. |
| **If you are removed from a site, your access ends immediately.** | You will see the error and you must stop working at that site. |

## 8. When the internet goes down

> **Chlat-Park needs an internet connection to work.** If the site loses its connection, the system
> cannot create sessions or authorise exits. This is a known limitation of the current version.

**The procedure:**

1. **Tell your supervisor immediately.** They will call the platform operator.
2. **Go back to paper.** Use the paper ticket book, exactly as you did before Chlat-Park. Write
   the plate and the entry time on the paper ticket. Give the paper ticket to the rider.
3. **At the exit**, take the money, write the amount and the reason on the paper ticket, and let
   the rider leave. Do not guess at the amount — use the printed price list your supervisor has.
4. **Keep every paper ticket.** Do not throw them away. The supervisor needs them to enter the
   sessions once the connection is back.
5. **Do not use the system in a half-working state.** If the dashboard loads but the claim or the
   exit fails, that is still an outage. Use the paper procedure.
6. **Log the time the outage started and the time it ended.**

**What the platform operator does** is in `docs/incident-response.md`. The paper sessions are
entered into the system afterwards, by the supervisor, with the correct times — so the revenue is
not lost.

## 9. The quick reference card

```
ENTRY
  1. Sign in → choose today's site
  2. Type the plate exactly as it is on the bike
  3. Check the normalised plate on the screen
  4. Confirm entry → the QR appears
  5. The rider scans it → the session turns ACTIVE
  No scan? Manual activate (records your name) | Cancel | Show a new code

EXIT
  1. Scan the ticket, or type the reference
  2. Read: plate · entry time · duration · amount
  3. COMPARE the screen's plate with the bike  ← never skip
  4. Record the payment (method + amount + reason)
  5. Tick "I have checked the plate"
  6. Authorize exit

NOT SURE?  →  Open manual review  →  Call your supervisor
             Never authorise an exit you are not certain about.

NO INTERNET?  →  Paper tickets  →  Keep them all  →  Tell your supervisor
```

## 10. The questions a guard actually asks

**"What if the rider does not have a smartphone?"**
Manual activate. The clock starts when you do it, and the screen becomes their ticket.

**"What if the rider does not have mobile data?"**
The QR needs a connection to be claimed. If they cannot claim, use Manual activate. The e-ticket
then does not exist, and you close the session from the session list at the exit.

**"What if the amount is 0?"**
The site may have a free parking policy. The screen will show 0 and you authorise the exit
normally.

**"Can I exit a bike whose ticket I cannot find?"**
Not on your own authority. Search by plate, then open a manual review. Your supervisor approves it.

**"Can the same ticket be used twice?"**
No. The second attempt shows "Already exited". If a rider claims they have not left yet, check
with your supervisor — it may be a different session.

**"What if I record the wrong amount?"**
Ask your supervisor to void the payment, then record the correct one. Do not try to fix it
yourself, and do not record a second payment to "balance" it.

**"What if the screen shows a plate that looks wrong?"**
Cancel the entry (if it is still pending) and create a new one with the correct plate. If it is
already active, open a manual review.

**"Who can see what I did?"**
Your supervisor and the site owner can see your actions on that site. That is deliberate — it is
how mistakes get found and fixed.

## 11. The supervisor's checklist

- [ ] Every guard has their own account.
- [ ] Every guard has been added to the right site, with the right role.
- [ ] Every guard has practised one entry and one exit with a supervisor.
- [ ] Every guard knows the paper-ticket outage procedure.
- [ ] Every guard knows that a manual review is the correct answer when they are unsure.
- [ ] The printed price list is at the guard station.
- [ ] The supervisor knows how to void a payment and how to open a manual review.
- [ ] The supervisor knows the escalation path for a site outage.
