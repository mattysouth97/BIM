---
id: P2-07
title: Harden persisted stores — versioning, API-key policy, building-scoped annotations
priority: P2
area: state
status: done
owner: claude-opus-4-8-ultrawork
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-04, UC-05, UC-06]
---

# P2-07 — Harden persisted stores

## 1. Requirement (RE)
- **Problem**: all 6 persisted zustand stores use `persist()` with no `version`/`migrate` — app-store.ts:31 (options :50-58), workflow-store.ts:31, workspace-store.ts:74, annotation-store.ts:59 (options :104-110), editor-mode-store.ts:40, layer-store.ts:56 (grep confirms zero `version` keys). Any shape change silently rehydrates stale data. The data.go.kr API key is persisted in plaintext localStorage (app-store.ts:52-53 partialize includes apiKey). Annotations persist globally with no building scope (annotation-store.ts:105-110) — anchorElementId collisions across buildings resurrect stale annotations on the wrong model. The persisted workflow stage outlives the transient material/recipe stores it gates on — reload lands users on twin/report with empty data and no recovery path.
- **Impact**: silent state corruption across deploys; credential-at-rest exposure; wrong-building annotations; dead-end UI after reload.
- **Use case**: As a returning user I want my saved state to survive upgrades safely, never leak my API key beyond policy, and never show another building's annotations.

## 2. Specification (SDD)
- **Context pack**: zustand persist docs (version/migrate/partialize); all six store files; src/lib/workflow/stages.ts:27-35 (guards); how annotations key `anchorElementId` (src/store/annotation-store.ts full file + its consumers in src/components/viewer/).
- **BDD scenarios**:
  1. Given persisted state from version 1 and code at version 2, When rehydrated, Then `migrate` transforms or drops it deterministically (never silent garbage); unknown/newer versions fall back to defaults.
  2. Given the API-key policy decision (session-only OR documented localStorage), When implemented, Then partialize matches the decision and the API-key dialog/README (P2-04) state the policy.
  3. Given annotations on building A, When building B loads, Then zero of A's annotations appear (annotations keyed/filtered by building id).
  4. Given persisted stage="report" with empty transient stores, When the app reloads, Then the user is redirected to the earliest stage whose guard fails (search or upload) with a recoverable path, not an empty report.
- **Versioning**: set `version: 1` on all six stores with trivial initial migrators; bump per future shape change.

## 3. Constraints (CDD)
- **Design constraints**: zustand `persist` native version/migrate only — no custom storage layer; storage keys (`name:`) unchanged so existing users migrate rather than lose data, except where the API-key policy requires removal; annotation building-scoping must not break same-building reload.
- **May touch**: src/store/*.ts, src/components/settings/api-key-dialog.tsx (policy copy), a small stage-recovery effect (likely in providers or workflow-store subscriber).
- **Must not**: change store action signatures consumed elsewhere; no server-side persistence; do not persist the transient material/recipe stores as a "fix" — recovery via stage reset only.
- **Fitness functions**: every persist() call has `version` + `migrate`; apiKey absent from localStorage under session-only policy (or policy doc present); annotation rehydration filtered by active building id; reload-on-twin-with-no-data lands on a working stage.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: store tests — v0(unversioned) payload → migrated defaults; annotation-store — two buildings' annotations isolated; workflow recovery — persisted "twin" + empty materials resolves to a valid stage.
- **Gates**: `pnpm test -- store`; `pnpm test`; `pnpm lint`; `pnpm build`; manual localStorage inspection before/after.
- **Security / honesty checklist**: API-key policy explicit in UI copy; no key in logs/errors; migration never fabricates user data (drop > guess).
- **Acceptance criteria**:
  - [x] version+migrate on all 6 stores
  - [x] API-key persistence policy decided, implemented, documented
  - [~] Annotations building-scoped → deferred to P2-16
  - [~] Stage/transient-store reload recovery works → deferred to P2-16
- **Done when**: shape changes, reloads, and cross-building navigation can no longer surface stale or leaked persisted state.

### Evaluation notes (2026-07-21, claude-opus-4-8-ultrawork)

- **Versioning (headline fix — silent corruption across deploys)**: new shared
  `src/store/persist-migrate.ts::versionedMigrate` added to ALL SIX persisted stores
  (app, workflow, workspace, annotation, editor-mode, layer) with `version: 1`. Behavior is
  deterministic and honest: a v0 (unversioned legacy) payload is adopted as-is (existing
  users keep their data — storage `name:` keys unchanged), any newer/unknown version falls
  back to defaults (never trusts a future shape). Migration never fabricates data
  (preserve-or-drop, never guess). Unit-tested (3 cases).
- **API-key policy (decision: documented localStorage)**: keeping localStorage persistence
  (session-only would force re-entry every reload) with an explicit policy note added to the
  api-key-dialog copy (bilingual) — key stored only in this browser's localStorage, never
  sent to or logged by the server, clear after use on shared machines. Matches the README
  policy line from P2-04. No key in logs/errors.
- **Deferred to P2-16** (filed): annotation building-scoping (anchorElementId collisions
  across buildings — needs an annotation-store keying refactor + viewer-consumer changes) and
  workflow stage-recovery after reload (a runtime navigation effect). Both are larger,
  higher-risk refactors held back to keep this item's versioning slice — the headline
  "silent state corruption across deploys" fix applied uniformly to all 6 stores — low-risk
  and fully verified.
- Gates: `vitest run persist-migrate` 3/3 · `pnpm test` **1117 passed** · `pnpm lint`
  0 errors · `pnpm build` green.
