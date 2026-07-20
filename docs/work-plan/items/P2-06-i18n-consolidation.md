---
id: P2-06
title: Consolidate i18n onto a single t(ko,en) catalog honoring the language store
priority: P2
area: ux
status: not-started
owner: unassigned
effort: L
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-05, UC-06, UC-07, UC-08]
---

# P2-06 — Consolidate i18n onto a single t(ko,en) catalog

## 1. Requirement (RE)
- **Problem**: ~479 lines matching `isKo` across src/**/*.tsx (three coexisting patterns). (1) isKo ternaries everywhere; (2) twin/* is hardcoded Korean-only — src/components/twin/roi-readout.tsx:119-124 ("NPV · 할인율…", "실시간"), scenario-rail.tsx:70-77 ("투자 시나리오", "CAPEX → ROI 시뮬레이션"), capex-input.tsx:74,127 ("투자 예산 (CAPEX)", "직접 입력 (만원)"), program-track-selector.tsx:23-30 (TRACK_OPTIONS labels/details all Korean); (3) src/components/export/export-dropdown.tsx:23,56 hardcodes both languages in one string ("CSV 파일이 다운로드되었습니다. (CSV exported)"). WorkflowStepper hardcodes `.en` (src/components/workspace/workflow-stepper.tsx:40) although STAGE_LABELS carries ko (src/lib/workflow/stages.ts:10-15). `<html lang="ko">` is static (src/app/layout.tsx:44) regardless of the store.
- **Impact**: English users get Korean on the entire Twin stage (the product's core), Korean users get English stepper labels; accessibility/SEO lang attribute is wrong half the time.
- **Use case**: As a user toggling KO/EN I want every surface to switch consistently, including the Twin panels and the document lang.

## 2. Specification (SDD)
- **Context pack**: src/store/app-store.ts:13-14,37-38 (language store); src/lib/workflow/stages.ts:10-15; the four twin components above; src/components/workspace/workflow-stepper.tsx:40; src/components/export/export-dropdown.tsx:19-57; src/app/layout.tsx:43-47; then a repo-wide `grep -n "isKo" src`.
- **BDD scenarios**:
  1. Given language="en", When the Twin stage renders, Then roi-readout, scenario-rail, capex-input, and program-track-selector show English strings.
  2. Given language="ko", When the stepper renders, Then stage labels come from STAGE_LABELS[stage].ko.
  3. Given a language toggle at runtime, When the store changes, Then all converted surfaces update without reload and `<html lang>` follows (small client effect component inside the server layout).
  4. Given export-dropdown, When toasts fire, Then a single-language message per the store, not the bilingual concatenation.
- **Design**: introduce `src/lib/i18n.ts` exporting `t(ko: string, en: string)` bound to the language store (hook form `useT()` for components) plus a message-catalog object for multi-string components (e.g. TRACK_OPTIONS). Migrate twin/*, stepper, export-dropdown first; remaining isKo ternaries may migrate incrementally but must use the same helper.

## 3. Constraints (CDD)
- **Design constraints**: one helper, one catalog — no second i18n library; helper is the only place reading the language store for strings; keep STAGE_LABELS shape (stages.ts stays store-free per its :17-18 comment); html lang updated via a tiny client component, layout stays a server component.
- **May touch**: new src/lib/i18n.ts(+tests), src/components/twin/**, src/components/workspace/workflow-stepper.tsx, src/components/export/export-dropdown.tsx, src/app/layout.tsx (lang wiring only), any file migrated to the helper.
- **Must not**: change persisted store shape (P2-07 owns versioning); no translation of API/data strings (ledger fields from data.go.kr stay as delivered); no visual redesign.
- **Fitness functions**: zero hardcoded Korean literals in src/components/twin/**; `grep -c "isKo"` strictly decreases and every remaining site calls the helper; `<html lang>` equals the store value after toggle.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: src/lib/__tests__/i18n.test.ts — t() returns ko/en by store, updates on setLanguage; component tests for stepper (ko + en) and one twin panel.
- **Gates**: `pnpm test -- i18n stepper twin`; `pnpm test`; `pnpm lint`; `pnpm build`; manual toggle sweep across search → twin → report.
- **Security / honesty checklist**: no machine-translated technical terms presented as authoritative program names — keep official program names (그린리모델링 etc.) with English gloss, matching dossier usage.
- **Acceptance criteria**:
  - [ ] Single t()/catalog helper exists and is adopted by twin/*, stepper, export-dropdown
  - [ ] html lang follows the store
  - [ ] Full toggle sweep shows no mixed-language surface
- **Done when**: the KO/EN toggle switches 100% of app chrome and Twin surfaces with one code path.
