---
phase: 16-contextual-toolbar-migration
verified: 2026-03-30T03:49:00Z
status: gaps_found
score: 9/11 must-haves verified
gaps:
  - truth: "The toolbar component renders items from TOOLBAR_CONFIGS based on the current workflow stage"
    status: failed
    reason: "contextual-toolbar.tsx imports TOOLBAR_CONFIGS but immediately voids it (line 769). Stage-specific rendering is done via inline conditionals (stage === 'assemble', stage === 'configure', stage === 'analyze'), not by indexing TOOLBAR_CONFIGS[stage]. The data structure exists and is correct but is not the rendering driver."
    artifacts:
      - path: "src/components/workspace/contextual-toolbar.tsx"
        issue: "TOOLBAR_CONFIGS is imported and voided — not used for rendering. Key link pattern 'TOOLBAR_CONFIGS[stage]' does not appear anywhere in the file."
    missing:
      - "Either render toolbar items by iterating TOOLBAR_CONFIGS[stage].flatMap(g => g.items), OR document in PLAN that inline stage components ARE the rendering strategy and remove the misleading key_link pattern claim"
  - truth: "Key link: contextual-toolbar.tsx -> toolbar-configs.ts via 'TOOLBAR_CONFIGS[stage]'"
    status: failed
    reason: "The plan's key_link declared pattern 'TOOLBAR_CONFIGS\\[stage\\]' does not appear in contextual-toolbar.tsx. The import exists but the data is not consumed. This means the TOOLBAR_CONFIGS abstraction is currently dead weight — if toolbar-configs.ts were deleted the component would still compile and function identically."
    artifacts:
      - path: "src/components/workspace/contextual-toolbar.tsx"
        issue: "line 769: 'void TOOLBAR_CONFIGS' — the data-driven contract is broken; inline components duplicate the stage logic independently"
    missing:
      - "Wire TOOLBAR_CONFIGS into rendering OR acknowledge the inline approach as the canonical design and update toolbar-configs.ts to serve a different purpose (e.g., icon/label lookup)"
human_verification:
  - test: "Confirm toolbar height does not shift on stage change"
    expected: "Toolbar stays at exactly 40px (h-10) when switching between Select, Assemble, Configure, Analyze, Export stages"
    why_human: "Layout shift requires visual inspection — cannot verify CSS reflow programmatically"
  - test: "Confirm mode indicator badge updates in real-time"
    expected: "Badge changes color and label when switching draw modes (Wall=blue, Opening=green), annotation modes (purple), transform modes (amber)"
    why_human: "Requires clicking interactive controls in a running browser"
  - test: "Confirm Copy Floor button works end-to-end"
    expected: "Clicking Copy Floor in plan-view floor selector popover adds a new floor with same height as active floor"
    why_human: "Requires plan-view mode active in browser with a loaded building"
---

# Phase 16: Contextual Toolbar Migration Verification Report

**Phase Goal:** The toolbar reflects the current workflow stage and viewer-overlay.tsx no longer exists as a monolith
**Verified:** 2026-03-30T03:49:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Toolbar component renders items from TOOLBAR_CONFIGS based on current workflow stage | FAILED | `TOOLBAR_CONFIGS` is imported and voided (line 769); inline stage conditionals drive rendering, not the data map |
| 2 | A persistent mode indicator badge shows the current tool name and icon | VERIFIED | `ModeIndicatorBadge` always renders in toolbar strip (line 779); covers wall/opening/annotation/transform/select states |
| 3 | Global controls (view presets, plan/3D toggle) appear in every stage | VERIFIED | `GlobalToolbarSection` always renders on the right side (line 848); Front/Side/Top/Iso/Reset + Grid3x3 toggle |
| 4 | Assemble stage shows drawing tools, snap controls, floor selector with Copy Floor | VERIFIED | `AssembleToolbar` renders plan-view sub-panels with floor selector, snap controls, drawing modes; Copy Floor at line 446 calls `copyFloor(activeFloor, floorCount)` + `setFloorCount(floorCount + 1)` + `setActiveFloor(floorCount)` |
| 5 | Model source badge displays parametric vs uploaded status | VERIFIED | Lines 794-803: Badge renders "Architectural Model"/"건축 모델" or "Estimated Geometry"/"추정 형상" based on `modelSource` prop |
| 6 | Toolbar height is fixed — stage switching does not shift layout | VERIFIED (needs human) | Toolbar strip has `className="h-10 shrink-0 ..."` (line 776); outer div is `relative` wrapper; layout constrained |
| 7 | viewer-overlay.tsx is deleted from the codebase | VERIFIED | File does not exist; no remaining import references in src/ (comments only) |
| 8 | BuildingScene no longer manages configPanelOpen/layerPanelOpen/uploadDialogOpen as local state | VERIFIED | Lines 152-157 of building-scene.tsx read all three from `useWorkspaceStore` |
| 9 | ContextualToolbar renders inside BuildingScene above the Canvas | VERIFIED | Line 282 of building-scene.tsx: `<ContextualToolbar>` rendered above `<div className="relative flex-1 min-h-0">` containing Canvas |
| 10 | All previously working toolbar buttons continue to function after migration | VERIFIED (needs human) | All store subscriptions from viewer-overlay lines 43-79 have counterparts; build passes; full human confirmation needed |
| 11 | Key link: TOOLBAR_CONFIGS[stage] drives toolbar rendering | FAILED | Pattern `TOOLBAR_CONFIGS[stage]` does not appear in contextual-toolbar.tsx |

**Score:** 9/11 truths verified (2 failed — related root cause)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/workflow/toolbar-configs.ts` | TOOLBAR_CONFIGS data map + ToolbarItem/ToolbarGroup interfaces | VERIFIED | 362 lines, exports TOOLBAR_CONFIGS for all 5 stages, GLOBAL_ITEMS, ToolbarItem, ToolbarGroup, ToolbarItemType; no React runtime imports |
| `src/components/workspace/contextual-toolbar.tsx` | ContextualToolbar component rendering stage-keyed toolbar items | PARTIAL | 878 lines, exports ContextualToolbar, reads stage from useWorkflowStore, renders stage-keyed sub-components — but uses inline conditionals not TOOLBAR_CONFIGS[stage] |
| `src/components/viewer/building-scene.tsx` | BuildingScene without ViewerOverlay and without panel open local state | VERIFIED | Imports ContextualToolbar (line 26), useWorkspaceStore (line 17); no ViewerOverlay import; panel state from store at lines 152-157 |
| `src/store/workspace-store.ts` | configPanelOpen, layerPanelOpen, uploadDialogOpen state added | VERIFIED | 113 lines; all three fields present with defaults false; toggleConfigPanel/toggleLayerPanel/setConfigPanelOpen/setLayerPanelOpen/setUploadDialogOpen actions; NOT in partialize |
| `src/components/viewer/viewer-overlay.tsx` | Deleted | VERIFIED | File does not exist on disk |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `contextual-toolbar.tsx` | `toolbar-configs.ts` | `import TOOLBAR_CONFIGS` | PARTIAL | Import present (line 12) but consumed via `void TOOLBAR_CONFIGS` — not used for rendering; pattern `TOOLBAR_CONFIGS[stage]` absent |
| `contextual-toolbar.tsx` | `workflow-store.ts` | `useWorkflowStore` stage subscription | VERIFIED | Line 765: `const stage = useWorkflowStore((s) => s.stage)` |
| `contextual-toolbar.tsx` | `modelSource prop` | Model source badge rendering | VERIFIED | Lines 794-803: badge renders Architectural Model / Estimated Geometry |
| `building-scene.tsx` | `contextual-toolbar.tsx` | renders ContextualToolbar above Canvas | VERIFIED | Line 282: `<ContextualToolbar ...>` in flex-col layout above viewport div |
| `building-scene.tsx` | `workspace-store.ts` | reads panel state from store | VERIFIED | Lines 152-157: three useWorkspaceStore selectors for panel open state |
| `contextual-toolbar.tsx` | `modelSource prop` (Plan 02) | `modelSource.*uploaded` pattern | VERIFIED | Line 796: `variant={modelSource === "uploaded" ? "default" : "outline"}` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `contextual-toolbar.tsx` | `stage` | `useWorkflowStore` → Zustand FSM | Yes — FSM driven by user navigation | FLOWING |
| `contextual-toolbar.tsx` | `modelSource` | prop from `building-scene.tsx` local state | Yes — set by `handleToggleModelSource` and file load | FLOWING |
| `contextual-toolbar.tsx` | `drawingMode` / `annotationMode` / `transformMode` | `usePlanStore` / `useAuthoringStore` | Yes — set by toolbar buttons writing to store | FLOWING |
| `workspace-store.ts` | `configPanelOpen` / `layerPanelOpen` / `uploadDialogOpen` | toggle/set actions called from building-scene.tsx | Yes — default false, toggled by buttons | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| toolbar-configs.ts exports TOOLBAR_CONFIGS with all 5 stages | `grep -c "select:\|assemble:\|configure:\|analyze:\|export:" toolbar-configs.ts` | 5 matches | PASS |
| viewer-overlay.tsx deleted | `test ! -f src/components/viewer/viewer-overlay.tsx` | file absent | PASS |
| No dangling ViewerOverlay imports | `grep -r "viewer-overlay\|ViewerOverlay" src/` | comments only, no imports | PASS |
| Production build passes | `pnpm build` | clean build, all routes compiled | PASS |
| workspace-store panel state not persisted | partialize function excludes configPanelOpen/layerPanelOpen/uploadDialogOpen | confirmed at lines 104-110 | PASS |
| TOOLBAR_CONFIGS[stage] drives rendering | `grep "TOOLBAR_CONFIGS\[" contextual-toolbar.tsx` | no matches | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CTX-02 | 16-01-PLAN, 16-02-PLAN | User sees toolbar items that change based on the current workflow stage | SATISFIED | Stage switching via `stage === "assemble"/"configure"/"analyze"` inline conditionals renders different toolbar sub-components; behavior is correct even if mechanism differs from plan |
| CTX-03 | 16-01-PLAN, 16-02-PLAN | Existing viewer-overlay.tsx is decomposed into stage-keyed toolbar configs | SATISFIED | viewer-overlay.tsx deleted (603 lines gone); functionality migrated to contextual-toolbar.tsx + toolbar-configs.ts |
| FLOW-02 | 16-01-PLAN, 16-02-PLAN | User sees a persistent mode indicator showing the current tool/action | SATISFIED | ModeIndicatorBadge always renders in toolbar strip with color-coded labels for all tool modes |

No orphaned requirements found — all three IDs from PLAN frontmatter appear in REQUIREMENTS.md and are mapped to Phase 16.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `contextual-toolbar.tsx` | 769 | `void TOOLBAR_CONFIGS` — imported data structure is discarded | Warning | TOOLBAR_CONFIGS serves no runtime purpose; inline stage logic duplicates the data contract independently; creates maintenance divergence risk |
| `contextual-toolbar.tsx` | 770 | `void GLOBAL_ITEMS` — GLOBAL_ITEMS imported and discarded | Info | Same root cause as above; GlobalToolbarSection renders inline, not from GLOBAL_ITEMS |

Neither anti-pattern prevents the phase goal from being achieved. They represent a design divergence: the plan promised a data-driven approach but the implementation uses a more direct inline approach. The functional outcome is equivalent.

### Human Verification Required

#### 1. Toolbar Height Stability

**Test:** Load a building, then use browser devtools or visual inspection to measure toolbar height while switching between the 5 workflow stages (Select, Assemble, Configure, Analyze, Export)
**Expected:** Toolbar height remains exactly 40px (h-10) in all stages; no layout jump or reflow
**Why human:** CSS layout shift requires visual inspection; `shrink-0` and `h-10` are present in code but reflow behavior depends on content at runtime

#### 2. Mode Indicator Real-Time Updates

**Test:** Load a building, enter Assemble stage, enable Edit Mode (pencil icon), then click Wall drawing mode, then Opening mode, then a dimension annotation
**Expected:** Badge color and label update instantly: blue "Draw Wall", green "Place Opening", purple "Dimension"
**Why human:** Badge rendering depends on reactive store subscriptions — requires a running browser to verify real-time behavior

#### 3. Copy Floor End-to-End

**Test:** Load a building, switch to Plan View (grid icon), open the floor selector popover, click "Copy Floor"
**Expected:** Floor count increases by 1; new floor appears with the same height as the active floor; active floor index advances to the new floor
**Why human:** Requires plan-view mode in a running browser with a loaded building

### Gaps Summary

Two related gaps exist from a single root cause: the contextual toolbar component was implemented with inline stage conditionals (`{stage === "assemble" && <AssembleToolbar />}`) rather than by iterating `TOOLBAR_CONFIGS[stage]` as specified in the plan. As a result:

1. The must-have truth "renders items from TOOLBAR_CONFIGS" is not satisfied literally.
2. The key link pattern `TOOLBAR_CONFIGS[stage]` does not exist in the component.

**Impact on phase goal:** The phase goal ("toolbar reflects the current workflow stage") IS achieved — toolbar items change per stage, viewer-overlay.tsx is deleted, mode indicator is visible. The requirements CTX-02, CTX-03, and FLOW-02 are all satisfied at the behavioral level.

**What remains broken:** The architectural contract between toolbar-configs.ts and contextual-toolbar.tsx. The data-driven design that future phases may rely on to add toolbar items declaratively is not wired. If a future phase adds items to TOOLBAR_CONFIGS expecting them to appear in the toolbar, they will be silently ignored.

**Resolution options:**
- Wire TOOLBAR_CONFIGS[stage] into rendering (connects the data contract)
- OR formally document the inline approach as canonical and remove the misleading key_link

---

_Verified: 2026-03-30T03:49:00Z_
_Verifier: Claude (gsd-verifier)_
