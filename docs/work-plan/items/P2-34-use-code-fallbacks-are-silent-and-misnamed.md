---
id: P2-34
title: Use codes outside the confirmed four fall back silently, and the MEP reason string names the wrong use class
priority: P2
area: energy
status: not-started
owner: unassigned
effort: M
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-03, UC-06]
---

# P2-34 — A fallback that misnames the building

Found by green on 2026-09-04 diagnosing 서울청운초등학교 (교육연구시설, `mainPurpsCd`
prefix `10`); confirmed independently by orange. **Not started** — the user cleared
the honesty half and explicitly excluded inventing ratios; parked at the end-of-day
milestone because it moves published numbers and wants a disclosure pass.

Two defects, one cause: only four use-code families are mapped, and everything
else falls through **silently**.

## 1. Requirement (RE)

### (a) The reason string asserts a use class the building does not have

`src/lib/mep/rules.ts:181` — `buildingUseFamily("10000")` takes prefix `"10"`,
matches none of 01/02/14/03/04/07, returns `"default"`. `chooseArchetype` then
skips the residential and retail branches and lands on the era branch, returning:

```
archetype: "vrf"
reason:    "2000년 이후 업무시설: 시스템에어컨(VRF) + 환기유닛 관행"
```

for a **교육연구시설**. Verified by reading the branch, not inferred.

An assumption is fine — this repo is built on named assumptions. **An assumption
that misnames the building's use class is a false statement in a user-visible
reason string**, and the reason string is precisely the artefact the
stated-versus-assumed invariant exists to keep honest. It does not say "no rule
for this use class, defaulting to the post-2000 office pattern"; it says the
building *is* 업무시설.

### (b) Unmapped use codes get generic ratios with no record

`src/lib/energy/system-breakdown.ts:112` — `SYSTEM_RATIOS[prefix] ?? DEFAULT_RATIOS`.
The table holds only `01`, `02`, `07`, `14`. No flag, no provenance entry, no
assumption record: the output is indistinguishable from a sourced result.

In the sampled 법정동 this is **77 of 358 buildings (21.5%)**. For a school,
`DEFAULT_RATIOS.dhw = 0.12` is implausible against a 급식실.

## 2. Specification (SDD)

**Do these in order; the first is shippable alone and is the honest minimum.**

### Step 1 — make the fallback visible (no new numbers)

- The reason string must not name a use class the building does not have. State
  the fallback as a fallback, naming the actual use code.
- An unmapped `mainPurpsCd` must produce a **recorded assumption** — the same
  machinery every other named assumption uses — not a silent default. It must be
  visible wherever assumptions are surfaced, and reversible like the others.
- No ratio values change in this step. Numbers stay exactly as they are; only
  their honesty about provenance changes.

### Step 2 — extend the tables with real values (evidence-backed, separate)

- Add `SYSTEM_RATIOS` entries for `10` (교육연구시설) and the other high-frequency
  unmapped codes, and a matching `buildingUseFamily` family with its own archetype
  rule.
- **Do not invent ratios.** Values must come from the actual MOLIT/ASHRAE tables
  behind P1-04 and `docs/05_Research/`. If the table cannot be found, Step 1 still
  stands on its own and Step 2 waits. Guessing a plausible-looking ratio and
  shipping it as sourced is the exact failure this repo's invariant exists to
  prevent, and it would be worse than the silent default because it would look
  researched.

### BDD scenarios

1. Given `mainPurpsCd` `"10000"`, When an archetype is chosen, Then the reason
   does not contain "업무시설", and identifies the choice as a fallback.
2. Given an unmapped `mainPurpsCd`, When a system breakdown is produced, Then a
   named assumption records that generic ratios were used and which code was
   unmapped.
3. Given a mapped code (01/02/07/14), Then reason, ratios and assumptions are
   **byte-identical to today** — Step 1 must not disturb the confirmed four.

## 3. Constraints (CDD)

- Step 1 changes no numbers. Step 2 changes numbers for every previously-unmapped
  building and needs the P2-32 disclosure treatment: before/after for a
  representative building, and a statement of how many rows move.
- Do not widen `buildingUseFamily`'s return union without checking every consumer;
  it is used for archetype selection beyond the two sites named here
  (`grep -rn "buildingUseFamily" src/`).
- `DEFAULT_RATIOS` should remain as the last resort, but reaching it must be an
  event that is recorded, not a silent `??`.

## 4. Evaluation (EDD)

- **Red test first**: assert the reason for `"10000"` contains no "업무시설", and
  that an unmapped code yields a recorded assumption. Both fail today.
- **Regression guard**: a test pinning that the four mapped codes produce
  unchanged output, so Step 1 provably touches only the fallback path.
- **Gates**: `node node_modules/vitest/vitest.mjs run src/lib/mep src/lib/energy`,
  `tsc --noEmit`, `eslint src`.
- **Acceptance criteria**:
  - [ ] No reason string names a use class the building does not have
  - [ ] An unmapped use code produces a visible, named, reversible assumption
  - [ ] The four mapped codes are byte-identical to before
  - [ ] (Step 2, separately) real sourced ratios for `10` and other frequent codes
- **Done when**: a building whose use class we have no rule for says so, instead
  of being quietly described as an office.

## Notes

- `docs/work-plan/README.md` is another session's lock; the dashboard rows for
  this item and [[P2-33]] are flagged to its owner rather than added here.
- **ID collision to resolve:** two files claim `P2-32` —
  `P2-32-loan-term-buydown-ignores-preset-term.md` and `P2-32-ortho-roof-trace.md`.
  Not renumbered here because the second is another session's.
