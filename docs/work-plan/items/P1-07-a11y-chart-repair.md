---
id: P1-07
title: Accessibility and chart repair — Tab hijack, keyboard-inert rows, black bars
priority: P1
area: ux
status: done
owner: claude-opus-4-8-ultrawork
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-03, UC-05, UC-06]
---

# P1-07 — Accessibility + chart repair

Seven small, independent UI defects. (a)–(c) and (e) are WCAG blockers; (d) is a
broken visual; (f)–(g) are state/CSS desyncs. Land together; each has its own
verification.

## 1. Requirement (RE)

- **Problem**:
  - **(a) Tab key globally hijacked.** `src/hooks/use-editor-keybinds.ts:52-57`
    calls `e.preventDefault()` + `toggleEditMode()` on every Tab keydown
    (listener attached at :81, mounted app-wide at
    `src/components/workspace/workspace-shell.tsx:26`). Keyboard users cannot
    move focus through any control in the workspace — a hard WCAG 2.1.2
    (no keyboard trap) / 2.1.1 failure.
  - **(b) Search-result rows are mouse-only.** Row click → `router.push` at
    `src/components/search/search-results-table.tsx:273-282` (`handleRowClick`);
    rows render as `<TableRow onClick=…>` with no `tabIndex`, no `onKeyDown`,
    and no anchor — both the virtualized branch (:324-327) and the plain branch
    (:354-357). The app's core flow (search → open building) is unreachable by
    keyboard and invisible to screen readers.
  - **(c) FloatingPanel can be dragged off-screen and lost.** Position state is
    captured once from defaults (`src/components/workspace/floating-panel.tsx:45`
    — path correction: brief said `src/components/ui/floating-panel.tsx`; actual
    path is `src/components/workspace/floating-panel.tsx`) and `onPointerMove`
    (:64-70) applies raw pointer deltas with no viewport clamping. A panel
    dragged beyond the viewport edge persists there across close/reopen
    (`visible` gate at :88 does not reset `pos`).
  - **(d) Chart bars render black.** `chartConfig` colors use
    `hsl(var(--chart-1..4))` at
    `src/components/viewer/energy-breakdown-chart.tsx:27-30` — path correction:
    brief said `src/components/building/…`; actual path is
    `src/components/viewer/…`. But `--chart-1`..`--chart-5` are already complete
    `oklch()` colors (`src/app/globals.css:68-72`), so `hsl(oklch(…))` is
    invalid CSS and the bars fall back to the default fill (black). Grep
    confirms this is the **only** file with the `hsl(var(--chart` pattern —
    the "audit other recharts configs" task is satisfied by that grep plus a
    visual check of the other chart consumers of `ChartConfig`.
  - **(e) Upload file input is unfocusable.** `<input type="file"
    className="hidden">` at `src/components/upload/upload-stage.tsx:279-285`
    (the `hidden` class at :281) removes it from the tab order entirely — the
    "browse" affordance is click-only.
  - **(f) CAPEX numeric input desyncs the slider.** The numeric `onChange` at
    `src/components/twin/capex-input.tsx:136-139` accepts any finite value ≥ 0
    and ignores the `max` prop declared on the same input (:133) — typing
    999999 pushes state far beyond the slider range, leaving slider and number
    permanently out of sync.
  - **(g) Theme-toggle Moon icon is mispositioned.** The `Moon` icon is
    `absolute` (`src/components/layout/header.tsx:58`) but the `Button` base
    class (`src/components/ui/button.tsx:8`) has no `relative`, so the icon
    anchors to the nearest positioned ancestor (header or further up) instead
    of the button — the sun/moon swap renders in the wrong place.
- **Impact**: Keyboard and screen-reader users cannot complete the core
  search→select flow or even tab through the page; the energy-breakdown chart —
  the twin stage's central visual — shows black bars; panels can vanish
  irrecoverably without a reload; CAPEX input silently corrupts scenario state.
- **Use case**: As a keyboard-only user, I want to tab through the workspace,
  open a search result with Enter, and operate every control, so that I can use
  the simulator without a mouse. As any user, I want charts to render in the
  intended palette and inputs to stay in sync.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/hooks/use-editor-keybinds.ts` (full file) +
     `src/store/editor-mode-store.ts:19-22` (`toggleEditMode` semantics)
  2. `src/components/workspace/workspace-shell.tsx:23-35` (mount point)
  3. `src/components/search/search-results-table.tsx:273-370` (both row branches)
     + the `Table` primitives in `src/components/ui/table.tsx`
  4. `src/components/workspace/floating-panel.tsx` (full file)
  5. `src/components/viewer/energy-breakdown-chart.tsx:26-31` +
     `src/app/globals.css:68-72` + `src/components/ui/chart.tsx` (`ChartConfig`)
  6. `src/components/upload/upload-stage.tsx:270-295`
  7. `src/components/twin/capex-input.tsx:90-154` (slider + numeric pair)
  8. `src/components/layout/header.tsx:40-70` + `src/components/ui/button.tsx:7-8`
- **BDD scenarios**:
  1. *(a)* Given focus on a workspace button, when the user presses Tab, then
     focus moves to the next focusable element (browser default) and the editor
     mode does NOT toggle; given the new mode-toggle key (see Constraints), when
     pressed outside a text input, then `toggleEditMode()` fires.
  2. *(b)* Given the results table, when a row receives focus and the user
     presses Enter or Space, then navigation to `/building/{id}` occurs; rows
     expose an accessible name (building name/address) via role/aria; given a
     screen reader, then each row is announced as a link/button, not plain text.
  3. *(c)* Given a panel dragged toward any viewport edge, when the pointer
     moves, then `pos` is clamped so at least the drag header stays inside the
     viewport; given a panel previously dragged off-screen (pre-fix state), when
     reopened, then its position is clamped back into view on mount.
  4. *(d)* Given the energy-breakdown chart with a non-empty breakdown, when
     rendered, then each bar's fill resolves to the corresponding
     `var(--chart-N)` oklch color (assert via computed style or a snapshot that
     distinguishes from `#000`).
  5. *(e)* Given the upload stage, when tabbing, then the file input (or its
     visible proxy) is focusable and activates the file dialog on Enter;
     `data-testid="upload-file-input"` behavior (existing tests/e2e) unchanged.
  6. *(f)* Given the CAPEX numeric input, when typing a value above `max` (or
     below `min`), then the emitted value is clamped to [min, max] and slider +
     numeric display agree.
  7. *(g)* Given the header theme toggle, when rendered, then the Moon icon is
     positioned within the button's box in both themes (visual/regression check).

## 3. Constraints (CDD)

- **Design constraints**:
  - (a) Replace Tab with a non-focus key — use `` ` `` (backquote) or `m` —
    following the existing no-modifier digit-key pattern
    (`use-editor-keybinds.ts:64-74`); update the hook's doc comment (:37-41) and
    any onboarding/tour copy that mentions Tab (grep for "Tab" in
    `src/components` tour/onboarding files). Do NOT scope-fix by keeping Tab
    with modifiers unless the tour text is updated in the same commit.
  - (b) Prefer semantic HTML: render the row's primary cell content as an
    actual anchor (`next/link` → `/building/{id}`) or give the `TableRow`
    `tabIndex={0}`, `role="link"`, `onKeyDown` (Enter/Space), and
    `aria-label` from the building name/address. Both branches (virtualized
    :324, plain :354) must get the same treatment. Keep `cursor-pointer` and
    hover styles.
  - (c) Clamp in `onPointerMove` against `window.innerWidth/innerHeight` using
    the panel's current size (`size` state, :46-49); keep ≥48 px of the header
    visible. Also clamp once on mount (handles persisted/pre-fix off-screen
    positions).
  - (d) Use `var(--chart-N)` directly in `chartConfig` (shadcn `ChartContainer`
    emits `--color-{key}` from the config; the bars consume
    `var(--color-{key})` per :50-70 — changing the config value to a plain
    `var(--chart-N)` reference is sufficient). Do not edit `globals.css`
    values.
  - (e) Swap `hidden` → `sr-only` (Tailwind screen-reader-only utility) on the
    input; verify the wrapping `<label>` (:275) still triggers the dialog.
  - (f) Clamp in the existing `onChange` (:136-139):
    `Math.min(Math.max(v * KRW_MAN, min), max)` — do not add new state.
  - (g) Add `relative` to this button's `className` in `header.tsx` (:51-56).
    Do NOT add `relative` to the shared `buttonVariants` base
    (`ui/button.tsx:8`) — that would change layout for every button consumer.
- **May touch**:
  - `src/hooks/use-editor-keybinds.ts`
  - `src/components/search/search-results-table.tsx`
  - `src/components/workspace/floating-panel.tsx`
  - `src/components/viewer/energy-breakdown-chart.tsx`
  - `src/components/upload/upload-stage.tsx`
  - `src/components/twin/capex-input.tsx`
  - `src/components/layout/header.tsx`
  - Tour/onboarding copy referencing the Tab binding (grep first)
  - Tests: component/hook tests under `src/**/__tests__/`
- **Must not**:
  - Do not edit `src/components/ui/button.tsx` (shared primitive).
  - Do not edit `src/app/globals.css` token values.
  - Do not change the editor-mode digit bindings (1–4) or Escape.
  - Do not alter virtualization thresholds (`useVirtual` at
    `search-results-table.tsx:285`) or row heights.
  - No new dependencies.
- **Fitness functions**:
  - `grep -n "\"Tab\"" src/hooks/use-editor-keybinds.ts` → 0 matches.
  - `grep -n "tabIndex" src/components/search/search-results-table.tsx` → ≥ 2
    (both row branches) OR an anchor inside rows.
  - `grep -n "hsl(var(--chart" -r src` → 0 matches.
  - `grep -n "className=\"hidden\"" src/components/upload/upload-stage.tsx` →
    0 matches on the file input.
  - FloatingPanel `setPos` call sites pass clamped values (grep + read).

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/hooks/__tests__/use-editor-keybinds.test.tsx` (new): fire Tab keydown →
    `preventDefault` NOT called, `toggleEditMode` NOT called; fire the
    replacement key → toggle fires; fire in a text input → nothing fires
    (existing `isFocusInTextInput` guard, :12-19).
  - `src/components/search/__tests__/search-results-table.test.tsx` (new or
    extend): row is focusable; Enter/Space on a focused row calls
    `router.push` with the encoded id (mock `next/navigation`); both
    virtualized and non-virtualized paths (rows.length 31 vs 3).
  - `src/components/workspace/__tests__/floating-panel.test.tsx` (new):
    `onPointerMove` with coordinates beyond viewport → state clamped; mount
    with off-screen `defaultX/defaultY` → clamped into view.
  - `src/components/twin/__tests__/capex-input.test.tsx` (new): change events
    above max / below min emit clamped values.
  - Chart: assert `chartConfig` values are `var(--chart-N)` (unit) and, if a
    jsdom/happy-dom render is feasible, that `Cell` fills are not `#000`/black.
  - Header toggle: class-level assertion that the toggle button carries
    `relative`.
- **Gates**:
  - `pnpm test -- src/hooks src/components`
  - `pnpm test` (full suite green)
  - `pnpm lint`
  - `pnpm build`
  - Manual/e2e smoke (note in PR): tab-order walk of home → search → building;
    `e2e/building-flow.spec.ts` must still pass if runnable
    (`pnpm exec playwright test` — optional gate, environment-dependent).
- **Security / honesty checklist**:
  - No `e.preventDefault()` on Tab anywhere in `src/`.
  - Do not fake keyboard support with mouse-only handlers — key handlers must
    call the same `handleRowClick` path.
  - Clamp math must use the real rendered size, not hard-coded panel dims.
- **Acceptance criteria**:
  - [x] (a) Tab moves focus; mode toggle moved to a non-Tab key (backquote);
        hook doc updated (no tour copy referenced Tab — grep-confirmed).
  - [x] (b) Both row branches keyboard- and screen-reader-operable.
  - [x] (c) Panel position clamped on drag and on mount.
  - [x] (d) Bars render in `--chart-N` colors; grep confirms it is the only
        offending config (production source now free of the hsl-wrapped token).
  - [x] (e) File input focusable via `sr-only`; wrapping `<label>` opens dialog.
  - [x] (f) Numeric CAPEX input clamps to [min, max]; slider stays in sync.
  - [x] (g) Moon icon anchored inside the theme-toggle button (`relative`).
  - [x] New tests pass; full suite, lint, build green.
- **Done when**: a keyboard-only user can complete search→select→view, the
  breakdown chart renders in the intended palette, and the four smaller
  defects are each covered by a passing test.

### Evaluation notes (2026-07-21, claude-opus-4-8-ultrawork)

- **(a)** Toggle moved Tab → backquote (`` ` ``, no-modifier convention); `preventDefault`
  removed. No onboarding/tour copy referenced Tab (grep), so only the hook doc was updated.
- **(b)** `rowA11yProps(original)` helper — `role="link"`, `tabIndex:0`, `aria-label` from
  building name/address, `onKeyDown` (Enter/Space, preventDefault on Space) routing through
  the same `handleRowClick`; spread into BOTH branches + focus-ring styling.
- **(c)** `clampToViewport` keeps ≥48 px of the panel in view; applied on `onPointerMove`
  AND a mount `useEffect` (recovers persisted off-screen positions).
- **(d)** `chartConfig` → `var(--chart-N)` (exported for the unit test); production source
  grep-clean of the hsl-wrapped token — this was the only file with the bug.
- **(e)** Upload file input `hidden` → `sr-only` (keeps tab order); label still opens dialog.
- **(f)** Numeric CAPEX `onChange` clamps `Math.min(Math.max(v*KRW_MAN, min), max)`.
- **(g)** `relative` added to the theme-toggle button only (shared `ui/button.tsx` untouched).
- **Deviations**: (b) `tabIndex` appears once (in the shared helper spread into both branches,
  proven by a 2-spread source assertion) rather than twice inline — cleaner than duplication;
  the fitness "≥2 OR anchor" intent (both branches operable) is met. Virtualized-branch render
  assertion replaced with a source-level check because @tanstack/react-virtual renders 0 rows
  under happy-dom (no measured height). Manual keyboard/e2e tab-walk NOT run this session
  (unit-proven; Playwright optional gate not executed).
- Gates: targeted 16/16 (5 suites) · `pnpm test` **1095 passed / 1 skipped** · `pnpm lint`
  0 errors · `pnpm build` green · all 6 fitness greps clean.
