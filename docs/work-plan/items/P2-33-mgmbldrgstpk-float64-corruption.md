---
id: P2-33
title: JSON.parse silently corrupts 22-digit mgmBldrgstPk, making distinct buildings indistinguishable
priority: P1
area: api
status: not-started
owner: unassigned
effort: S
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-01, UC-02]
---

# P2-33 — The building primary key is destroyed on parse

Found by green on 2026-09-04 while diagnosing 서울청운초등학교; mechanism confirmed
independently by orange the same day. **Not started** — the user cleared the fix,
but it was parked at the end-of-day milestone because it changes how *every*
register response is parsed and deserves a full disclosure pass rather than a
rushed hour.

## 1. Requirement (RE)

- **Problem.** `src/lib/api-proxy.ts` reads the upstream body as text (line 66),
  then parses it with a plain `JSON.parse(normalized)` (line ~100). `mgmBldrgstPk`
  arrives as a **bare 22-digit integer literal**, far past `Number.MAX_SAFE_INTEGER`
  (9,007,199,254,740,991 ≈ 9.0e15). JavaScript numbers are float64, so the value is
  silently rounded on parse and the surviving object holds
  `1.0000000000000052e+21` where the wire carried exact digits.

- **This is our bug, not upstream's.** The digits are intact in `text` at line 66.
  We destroy them at line 100.

- **It is not merely lossy — it collides.** Reproduced:

  ```js
  JSON.parse('{"pk":1000000000000005200000}').pk  // 1.0000000000000052e+21
  JSON.parse('{"pk":1000000000000005199999}').pk  // 1.0000000000000052e+21
  // ===  true
  ```

  Two *different* buildings become the same value. In one 법정동: **16 of 358 rows
  mangled (4.5%), 13 distinct corrupted values, 3 of them shared by two buildings
  each.** Those pairs are now mutually indistinguishable and permanently
  unaddressable — `mgmBldrgstPk` is the key every downstream lookup uses.

- **Impact.** Silent, irreversible, and invisible to the user: a corrupted key
  looks like a valid number. Any feature that round-trips a building by pk can
  fetch the wrong building or none.

- **Use case.** As a user I want the building I picked to be the building I get.

## 2. Specification (SDD)

- **Context pack**: `src/lib/api-proxy.ts` lines 60-110 (the text→parse path);
  every consumer of `mgmBldrgstPk` (`grep -rn "mgmBldrgstPk" src/`); the shape of a
  real 건축HUB response body.
- **Approach.** Quote long integer literals *in the raw text* before parsing, so
  they survive as strings. A targeted regex over the raw body for
  `"mgmBldrgstPk"\s*:\s*(\d{16,})` → `"mgmBldrgstPk":"$1"` is the minimal change.
  Do NOT reach for a global "quote every long number" pass without checking which
  other fields are numeric-but-long; widening it silently changes the type of
  fields other code does arithmetic on.
- **BDD scenarios**:
  1. Given a body with a 22-digit `mgmBldrgstPk`, When parsed, Then the value is a
     string carrying all 22 digits unchanged.
  2. Given two bodies whose pks differ only in the last digits, When both are
     parsed, Then the two values are **not equal**.
  3. Given a short/normal numeric field, When parsed, Then its type and value are
     unchanged (no collateral stringification).
  4. Given an XML error body or empty body, Then the existing early-return paths
     are untouched.

## 3. Constraints (CDD)

- `mgmBldrgstPk` becomes a **string**. Check every consumer before landing —
  strict `===` against a number, arithmetic, or `Number()` coercion downstream
  will break. This is the part that makes it an S-not-XS: the parse fix is four
  lines, the consumer audit is the work.
- Do not change the `{data, error}` contract of `fetchFromDataGoKr`.
- Do not "fix" this by asking upstream for a different format; the proxy must be
  robust to what data.go.kr actually sends.

## 4. Evaluation (EDD)

- **Red test first**: a fixture body with a known 22-digit pk asserting the exact
  string survives the round trip, plus the collision case from §1 proving two
  distinct buildings stay distinct. Both fail today.
- **Gates**: `node node_modules/vitest/vitest.mjs run src/lib`,
  `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js src`.
- **Disclosure**: state how many rows change type in a representative 법정동, and
  confirm no user-visible id string changes shape (a previously-corrupted pk will
  now render its true digits — that is the fix, but it *is* a visible change).
- **Acceptance criteria**:
  - [ ] 22-digit pk survives parse exactly, as a string
  - [ ] Two pks differing in the last digits remain distinct after parse
  - [ ] No other numeric field changed type
  - [ ] Every `mgmBldrgstPk` consumer audited for number-assumptions
- **Done when**: no register response can produce two buildings that share a key.
