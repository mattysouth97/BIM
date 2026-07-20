---
id: P2-16
title: Building-scope persisted annotations + workflow stage recovery after reload
priority: P2
area: state
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-04, UC-05]
---

# P2-16 — Annotation building-scoping + stage recovery (P2-07 follow-up)

Split from P2-07. That item added `version` + `migrate` to all six persisted
stores (silent-corruption-across-deploys fix) and documented the API-key
storage policy. These two remaining sub-items are larger refactors and were
deferred to keep P2-07's versioning slice low-risk.

## 1. Requirement (RE)
- **Annotation building-scoping**: `annotation-store` persists annotations
  globally with no building scope, so an `anchorElementId` collision across
  buildings can resurrect building A's annotations on building B's model.
  Key/filter persisted annotations by the active building id
  (`useActiveBuildingStore.buildingPk`, from P1-08).
- **Stage recovery**: the persisted workflow `stage` outlives the transient
  material/recipe stores it gates on. Reloading on `stage: "twin"|"report"`
  with empty transient stores lands the user on an empty panel with no path
  out. On load, redirect to the earliest stage whose guard fails (search or
  upload) via a small recovery effect.

## 2. Specification (SDD)
- Annotations: add a `buildingPk` field to each annotation (or a per-building
  map) and filter rehydrated annotations to the active building; same-building
  reload must still show them.
- Recovery: a subscriber/effect (providers or a workflow-store consumer) that,
  on mount, resets `stage` to the earliest guard-failing stage when the
  transient stores are empty. Reuse `getBlockingStage` (P1-08).

## 3. Constraints (CDD)
- **May touch**: `src/store/annotation-store.ts` + its viewer consumers,
  a small recovery effect (providers / workflow subscriber).
- **Must not**: persist the transient material/recipe stores; change store
  action signatures consumed elsewhere.
- **Fitness**: two buildings' annotations are isolated in a test; reload-on-twin
  with empty materials resolves to a valid stage.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test -- store`; `pnpm test`; `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [ ] Annotations building-scoped (A's never appear on B)
  - [ ] Stage/transient-store reload recovery lands on a working stage
- **Done when**: cross-building navigation and reloads never surface stale
  annotations or dead-end panels.
