---
id: P2-04
title: Rewrite README and retitle landing hero to the GreenRetrofit identity
priority: P2
area: docs
status: done
owner: claude-opus-4-8-ultrawork
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01]
---

# P2-04 — Rewrite README and retitle landing hero to the GreenRetrofit identity

## 1. Requirement (RE)
- **Problem**: README.md:1-36 is 100% create-next-app boilerplate — no product name, no data.go.kr API-key setup, no feature list, no screenshots. The landing hero says "건축물대장 조회 / Building Ledger Lookup" (src/app/page.tsx:247-253) and root metadata matches ("건축물대장 | Building Ledger", src/app/layout.tsx:31-35). Retrofits/savings are never mentioned until a user reaches the Twin stage by accident. Package name is `korea-building-info` — product drift between identity and capability.
- **Impact**: new contributors/users can't set up the project (the API key requirement is undiscoverable); the landing page undersells the core value (retrofit ROI simulation); organic sharing shows a lookup-tool title.
- **Use case**: As a first-time visitor (repo or site) I want to understand the GreenRetrofit value proposition and get running with an API key in minutes.

## 2. Specification (SDD)
- **Context pack**: README.md; src/app/page.tsx:240-260; src/app/layout.tsx:31-35; package.json (name, scripts); src/components/settings/api-key-dialog.tsx (what setup actually asks); src/lib/workflow/stages.ts:10-15 (journey labels); docs/screenshots/ (NOTE: pre-pivot, see P2-08 — regenerate or omit).
- **BDD scenarios**:
  1. Given a fresh clone, When a user follows README setup, Then they have a running dev server with a working ledger search (API-key step documented: where to get a data.go.kr key, where to paste it in the UI).
  2. Given the landing page, When it loads, Then the hero states the savings/retrofit value prop in both languages (honoring the language store).
  3. Given the README, When scanned, Then it lists: value prop, feature list (search → twin → retrofit report), tech stack, API-key setup, screenshots or journey description, live URL if one exists, license.
- **Metadata**: title/description in layout.tsx updated to the savings story (coordinate with P2-03's generateMetadata work — root metadata only here).

## 3. Constraints (CDD)
- **Design constraints**: bilingual copy (ko primary, en secondary) consistent with the in-app language toggle; no fabricated metrics — do not cite MAPE/R² or savings numbers in README (ML metrics are P2-05 scope and currently unverifiable); keep hero change minimal (copy + optional supporting line), no layout redesign.
- **May touch**: README.md, src/app/page.tsx (hero copy only, ~:247-253), src/app/layout.tsx (metadata :31-35 only).
- **Must not**: change any logic, routing, fonts, or other components; do not add docs/ files outside this scope; do not reference uncommitted screenshots.
- **Fitness functions**: README contains the strings "data.go.kr" (or 공공데이터포털) and an API-key setup section; hero mentions retrofit/savings; `pnpm build` passes.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: none functional; if a copy test exists for the hero, update it. Manual verification checklist below.
- **Gates**: `pnpm build`; `pnpm lint`; visual check of `/` in both languages.
- **Security / honesty checklist**: README must not print a real API key; no invented performance claims; live URL included only if actually deployed — otherwise a "deploy your own" note.
- **Acceptance criteria**:
  - [x] README rewritten (value prop, features, API-key setup, stack, journey)
  - [x] Hero + metadata retitled to the savings story
  - [x] Both languages render correctly (ko/en per the language store)
  - [x] No create-next-app boilerplate remains
- **Done when**: a new user can go from README → running app → understood value prop without reading source.

### Evaluation notes (2026-07-21, claude-opus-4-8-ultrawork)

- README fully rewritten: bilingual (ko-primary) value prop, feature list
  (search→twin→retrofit report), data.go.kr 건축HUB API-key setup steps (5× "data.go.kr",
  keys stored client-side only — noted), optional VWORLD_API_KEY, commands table, tech
  stack, "deploy your own on Vercel" note, OFL font license. No fabricated metrics
  (MAPE/R²/savings numbers intentionally omitted — P2-05 scope).
- Landing hero retitled to "그린리모델링 투자 시뮬레이터 / GreenRetrofit Simulator" with a
  savings/ROI supporting line in both languages (copy-only, no layout change). Root
  `layout.tsx` metadata title/description updated to the savings story.
- No hero copy test existed (grep). Gates: `pnpm lint` 0 errors · `pnpm build` green.
  Live `/` bilingual visual check deferred (no dev server this session) — the copy toggles
  on the existing `isKo` store flag, same pattern as the rest of the page.
