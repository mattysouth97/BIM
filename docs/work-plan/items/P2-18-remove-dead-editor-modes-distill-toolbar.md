---
id: P2-18
title: Remove vestigial editor modes (탐색/층 편집/객체 편집/속성) and distill the workspace chrome
priority: P2
area: ux
status: done
owner: claude-fable-5-session
effort: S
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-01, UC-04, UC-05]
---

# P2-18 — Dead editor-mode system removal + toolbar/tour distillation

The workspace toolbar exposed a 4-mode editor dropdown (탐색 / 층 편집 /
객체 편집 / 속성) with keyboard shortcuts (1–4, `, Escape), a persisted
zustand store, per-object LRU mode memory, and versioned migration — but
`currentMode` was **read by nothing**. No scene, panel, or tool logic ever
branched on it. It was write-only chrome left over from the manual-authoring
feature the Digital Twin pivot (v4.0) removed.

## 1. Requirement (RE)
- Remove UI affordances that do nothing; distill the workspace chrome to the
  functions that actually exist (stage tools, panel toggles, view presets,
  building identity).

## 2. Specification (SDD) — what was removed/changed
- **Deleted**: `mode-indicator.tsx` (the mode dropdown), `editor-mode-store.ts`
  (persisted store), `use-editor-keybinds.ts` + test (global 1–4/`/Escape
  key capture serving the dead modes).
- **Contextual toolbar**: building identity (name + era badge) now leads the
  strip; removed the leading mode slot; removed the duplicate "Reset View"
  button (it called the same `onViewChange("iso")` as "Isometric" — the iso
  tooltip now says it is the default view).
- **toolbar-configs.ts**: deleted dead data nothing rendered (`GLOBAL_ITEMS`
  duplicated the hardcoded view buttons; `PROP_ACTION_ITEMS` was an empty
  set) and their unused icon imports.
- **Onboarding tour**: copy said "5 stages: Select Building, Assemble,
  Configure, Analyze, Export" and "drag components from the catalog" — both
  describe the removed authoring app. Rewritten to the real 4-stage pipeline
  (Search → Upload CAD (optional) → Twin → Report) and scene-tree browsing.
- The orphaned `editor-mode-store` localStorage key is inert (nothing reads
  it); no migration needed.

## 3. Constraints (CDD)
- **Must not**: remove functional chrome (stage toolbar toggles for the
  config/layer panels, view presets, floating Scene/Properties panels).
- **Fitness**: zero references to the deleted modules; keyboard 1–4/`/Escape
  no longer captured globally.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [x] Mode dropdown, store, and keybinds fully removed (grep clean)
  - [x] Toolbar: identity → stage tools → view presets, no dead/duplicate
        buttons
  - [x] Onboarding tour describes the actual 4-stage workflow
- **Done when**: every control in the workspace chrome performs a real
  function. 1249 tests passing, lint 0 errors, build green.
