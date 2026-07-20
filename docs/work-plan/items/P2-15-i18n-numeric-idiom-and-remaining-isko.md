---
id: P2-15
title: i18n tail — localize Korean numeric idiom (억/만/년) and migrate remaining isKo sites to useT
priority: P2
area: ux
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-05, UC-06, UC-07, UC-08]
---

# P2-15 — i18n tail (P2-06 follow-up)

Split from P2-06. The `useT()`/catalog foundation landed and every user-facing
**string label** in `src/components/twin/**`, the stepper, export-dropdown, and
`<html lang>` now switch languages. This item cleans up the residual tail that
P2-06 explicitly deferred as incremental.

## 1. Requirement (RE)
- **Numeric idiom**: `formatKrw`/`formatYears` in the twin components still render
  the Korean 억/만/천만/년 suffixes for both languages, so an English user sees
  "₩2.5억" and "3.0년". Localize the numeric idiom (e.g. lang-aware formatters:
  "₩250M" / "3.0 yr" for en) — thread `lang` into the pure formatters or add
  en variants.
- **Remaining isKo sites**: ~28 `isKo` ternaries remain across `src/**` (outside
  the migrated surfaces). Migrate them to `useT()` for one code path; `grep -c
  "isKo"` should trend to zero.

## 2. Specification (SDD)
- Reuse `src/lib/i18n.ts` (`useT`, `pick`) — no new helper/library.
- Formatters become `format(krw, lang)` or gain en branches; keep the ko output
  byte-identical so existing ko snapshots/tests hold.

## 3. Constraints (CDD)
- **May touch**: twin numeric formatters, any component still using `isKo`.
- **Must not**: change the persisted store shape; retranslate official program
  names (keep 그린리모델링 etc. with English gloss, per P2-06).
- **Fitness**: `grep -rc "isKo" src` strictly decreases toward 0; no Korean
  numeric suffix rendered when `lang === "en"`.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`; manual KO/EN toggle sweep
  confirming no "억/만/년" leaks in English.
- **Acceptance criteria**:
  - [ ] Twin numeric formatters are language-aware (no 억/만/년 in English)
  - [ ] Remaining isKo sites migrated to useT
- **Done when**: the KO/EN toggle produces zero mixed-language output anywhere,
  including numeric idiom.
