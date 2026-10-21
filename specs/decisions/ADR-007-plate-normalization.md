# ADR-007: Plate Normalization

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** SESSION-004, SESSION-005, PARK-008

---

## Context

The plate is the primary identifier of a motorcycle in this system. It is typed by a guard, on a
phone keyboard, at a car park entrance, possibly in a hurry and possibly with the rider's
motorcycle helmet still on. It is later compared against the plate on the motorcycle at the exit.

The raw string is therefore unreliable as an identity: "AB-123", "ab 123", "AB123", and " AB-123 "
may all be the same physical plate. If the system treats them as different plates, three things
break:

1. **The duplicate-active-session check** fails to detect a second visit, so the same motorcycle
   can occupy two active sessions at one site.
2. **The physical plate check at the exit** produces false mismatches, and the guard learns to
   ignore it.
3. **The adoption analytics over-count** the guests, because the same plate is counted as several
   people.

The counter-requirement is that the normalization must not **destroy** information. A plate is not
a random string: in Cambodia, plates contain Khmer script and Latin characters, and they may carry
meaningful separators. Two plates that differ only by a separator are the same plate; two plates
that differ by a character are not.

## Decision

1. **The raw string is always preserved.** The session stores `plate_id_original` exactly as the
   guard typed it, alongside `plate_id_normalized`. The original is what the guard saw; the
   normalized form is what the system compares.

2. **The normalization rules, in order:**
   1. **Trim** the leading and trailing whitespace.
   2. **Collapse** runs of internal whitespace into a single space.
   3. **Uppercase** using a locale-independent Unicode mapping. Khmer characters are unaffected.
   4. **Strip the separators that carry no meaning:** spaces and hyphens (`-`).
   5. **Preserve everything else verbatim** — every Khmer letter, every Latin letter, every digit,
      and any other character.

3. **Never transliterate.** Khmer script stays Khmer. The system does not convert Khmer to Latin,
   Latin to Khmer, or either to a phonetic form. A transliteration would be a lossy guess, and a
   wrong guess would merge two different motorcycles.

4. **The comparison at the exit uses the same normalizer.** The guard's observed plate is
   normalized before it is compared with the session's normalized plate. This guarantees that the
   comparison is consistent with the storage.

5. **The normalized form is the key** for the duplicate-active-session check and for the
   `plate_digest`.

6. **The normalized form is what the exit screen displays.** The guard compares the physical plate
   with a consistent rendering. The original is available in the session detail for reference.

7. **An empty result is rejected.** A plate that normalizes to nothing (only spaces and hyphens)
   is a validation error, not a session with an empty plate.

8. **The `plate_digest` is `HMAC-SHA256(server_pepper, plate_id_normalized)`.** The pepper is a
   server-side secret, so the digest cannot be reversed by brute force over the plate space
   (see ADR-010).

### 7.1 The concrete rules

```
Input:   "  ab-123  "
Step 1:  "ab-123"          (trim)
Step 2:  "ab-123"          (collapse internal whitespace)
Step 3:  "AB-123"          (uppercase, locale-independent)
Step 4:  "AB123"           (strip the hyphens and the spaces)
Result:  "AB123"
```

```
Input:   "សិទ 123"
Step 1:  "សិទ 123"        (trim)
Step 2:  "សិទ 123"        (collapse)
Step 3:  "សិទ 123"        (Khmer is unaffected by the uppercase mapping)
Step 4:  "សិទ123"         (strip the space)
Result:  "សិទ123"         (Khmer preserved verbatim)
```

```
Input:   "---"
Step 4:  ""                (nothing meaningful remains)
Result:  REJECTED          (a validation error, not a session)
```

## Consequences

### Positive

* **The duplicate-active-session check works.** "AB-123" and "ab123" are the same plate, so the
  same motorcycle cannot open two active sessions at one site.
* **The physical plate check is trustworthy.** The guard sees a consistent rendering, and the
  comparison uses the same function as the storage. A false mismatch — the most corrosive failure
  for a guard's trust in the system — is eliminated.
* **The analytics count people, not keystrokes.** The `plate_digest` is computed over the
  normalized form, so the same plate typed two ways is one guest.
* **The original is preserved for the edge cases.** A plate that contains a meaningful hyphen (if
  the format turns out to use one as a separator of significance) can still be reconstructed from
  the original, and the guard training can be corrected without a data migration.
* **No information is destroyed.** The transformation is a normalisation, not a canonicalisation
  that collapses distinct plates.

### Negative

* **The normalized form is a guess about which characters are separators.** If a plate format turns
  out to use a hyphen meaningfully, the rule must change — and the change is a **data migration**,
  not a code change, because the stored normalized values would have to be recomputed.
* **Uppercasing is locale-sensitive in some languages.** The implementation must use a
  locale-independent mapping (`toUpperCase()` without a locale argument, or an explicit
  `und` locale), so that the Turkish dotted/dotless I problem does not apply.
* **Two normalization rules must not be implemented in two places.** The normalizer is a single
  shared function in `@chlat/contracts`, used by the API, the web app, and (later) the local
  authority.
* **The normalized form is not the display form for the *original*.** A guard looking at the
  original sees what they typed, which may differ from what the system compares. The exit screen
  shows the normalized form to keep the comparison honest.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | What is the exact set of plate formats the pilot accepts? | The current rule accepts any non-empty string of Khmer, Latin, and digits, up to 32 characters after normalization. | Before Phase 2 |
| D2 | Is a hyphen ever meaningful in a Cambodian plate format? | The current rule strips it. If a format uses it meaningfully, the rule and the data change together. | Before Phase 2 |
| D3 | Should the site define a plate format mask per site? | The current answer: no, one global rule. A per-site mask would be a P1 nicety. | Phase 5 |
| D4 | Should the normalized form be stored, or computed on read? | It is stored, so the duplicate check and the digest are indexable. | Settled |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Store the raw string and compare it exactly | "AB-123" and "ab123" become different motorcycles. The duplicate check and the physical plate check both break. |
| Normalize by stripping every non-alphanumeric character | It would also strip meaningful characters, and it risks mangling Khmer. The rule is a whitelist of *specific* separators, not a blacklist of everything else. |
| Transliterate Khmer to Latin for the comparison | A lossy guess. Two different Khmer plates could collide, which merges two motorcycles — a serious safety error at the exit. |
| Case-fold instead of uppercase | The direction does not matter, as long as it is consistent. Uppercase is chosen because plates are conventionally written in uppercase, so the display matches the plate on the motorcycle. |
| Use a locale-specific uppercase | The Turkish-I problem: a locale-sensitive mapping would produce a different normalized value on a Turkish device. The implementation must use a locale-independent mapping. |
| Strip only the spaces, keep the hyphens | Hyphens are a formatting separator on Cambodian plates. Keeping them would let "AB-123" and "AB123" differ. |
| Store only the normalized form | The original is lost, and the guard's input cannot be reviewed in a dispute. |
| A per-plate UUID with a lookup table | An extra table and an extra lookup on the hot path, for a problem that a normalization function solves. |

## Related

* `specs/features/parking-session/` — the storage of the original and the normalized form.
* `specs/data/schema.md` — the `plate_id_original` / `plate_id_normalized` / `plate_digest` columns.
* ADR-010 — the guest identity and the digest.
* `specs/features/exit-verification/` — the physical plate check.
