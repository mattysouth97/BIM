# Task 8 — Wiring the Agentic BIM Engine into the UI (brief)

You are implementing the wiring that makes `runEngine` (already built and committed in
`src/lib/engine/`) user-visible: per-element HITL flags in the fidelity panel and an
"Export IFC" download button. Strict TDD for pure modules; React Testing Library for the
component change. This is your complete requirements — use the exact rules below verbatim.

## Read first (context, do not modify)

- `src/lib/engine/index.ts`, `src/lib/engine/types.ts`, `src/lib/engine/orchestrator.ts` — `runEngine(input, session?)`, `BimEngineInput`, `BimEngineResult`, `HitlFlag`.
- `src/lib/ifc/ifc-session.ts` — `IfcWriteSession`, `getSharedIfcWriteSession()`.
- `src/lib/procedural/types.ts` — `BuildingRecipe` (`footprintPolygon?: [number,number][][]`, `footprintWidth`, `footprintDepth`, `floors: FloorSpec[]`, `totalHeight`).
- `src/components/workspace/properties-panel.tsx` — the host. It already has `buildingPk`, `useEffectiveRecipe(buildingPk)`, and props `footprintSource`/`ledgerHeit`/`measuredHeightM`, and renders `<FidelityDetailPanel>`.
- `src/components/twin/fidelity-detail-panel.tsx` — the panel you extend.
- `src/lib/fidelity/input-provenance.ts` — `FootprintSource = "cad"|"ifc"|"building"|"parcel"|null`.
- `src/lib/i18n` — `useT()` for ko/en strings.
- Study an existing RTL test (e.g. `src/components/workspace/__tests__/properties-panel-provenance.test.tsx`) for the test harness pattern.

## Files to create / modify

1. **Create** `src/lib/engine/counting-session.ts` — pure `createCountingWriteSession(): IfcWriteSession`:
   `createModel()→1`, `writeLine()→` a fresh incrementing integer (starts at 1), `saveModel()→new Uint8Array(0)`, `closeModel()→` noop. No WASM. This lets the UI compute elements/flags without touching web-ifc.
   **Test** `src/lib/engine/__tests__/counting-session.test.ts`: ids increment; saveModel returns empty bytes.

2. **Create** `src/lib/engine/build-engine-input.ts` — pure
   `buildEngineInput(args): BimEngineInput | null` where
   `args = { pk: string; title?: string; recipe: BuildingRecipe; footprintSource: FootprintSource; ledgerHeit: number; measuredHeightM: number | null }`.
   **Mapping rules (exact):**
   - `rings = recipe.footprintPolygon ?? rectangleRings(recipe.footprintWidth, recipe.footprintDepth)`, where
     `rectangleRings(w,d)` returns one closed ring centered at origin:
     `[[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]]]` (meters, XZ, origin-centered — matches engine convention).
   - `floors = Math.max(1, recipe.floors.filter(f => f.type === "above").length || recipe.floors.length)`.
   - Footprint by source (honest gating — parcel ≠ building, AFF-6):
     - `"cad"` → `cadFootprint: { rings, source: "cad-converted" }`  *(sub-confidence exact/converted/traced is not known at this layer; "cad-converted" is the conservative Slice-1 default — document this in a comment).*
     - `"ifc"` → `cadFootprint: { rings, source: "cad-exact" }`  *(IFC is an authoritative building outline).*
     - `"building"` → `vworldFootprint: { rings, measuredHeightM: measuredHeightM ?? undefined, groundFloors: floors }`.
     - `"parcel"` or `null` → **`return null`** (a lot boundary / era rectangle is not a real footprint; the engine is not applicable).
   - Always also set `params: { floors }` (floors count is a reliable derived value; `fuse` prefers ledger/vworld floors over this when present).
   - `ledger: ledgerHeit > 0 ? { heightM: ledgerHeit } : undefined`.
   - Return `{ pk, title, ...footprintSlot, ledger, params }`.
   **Test** `src/lib/engine/__tests__/build-engine-input.test.ts`: `"cad"` yields cadFootprint cad-converted; `"building"` yields vworldFootprint with groundFloors; `"parcel"` and `null` return null; polygon override is preferred over the rectangle; rectangle is built + closed when no polygon.

3. **Create** `src/lib/engine/engine-download.ts` — pure `downloadIfc(bytes: Uint8Array, filename: string): void` using a Blob (`type: "application/octet-stream"` — actually `"model/ifc"` acceptable) + a temporary anchor click + `URL.revokeObjectURL`. Guard against a non-DOM environment (no-op if `document` is undefined).
   **Test** `src/lib/engine/__tests__/engine-download.test.ts` (jsdom/happy-dom): stub `URL.createObjectURL`/`revokeObjectURL`, assert an anchor with the filename is clicked and the URL revoked.

4. **Update** `src/lib/engine/index.ts` barrel to also export `createCountingWriteSession`, `buildEngineInput`, `downloadIfc`.

5. **Create** `src/hooks/use-engine-result.ts` — `"use client"` hook
   `useEngineResult({ buildingPk, recipe, footprintSource, ledgerHeit, measuredHeightM }): { available: boolean; result: BimEngineResult | null; exporting: boolean; exportIfc: () => Promise<void>; unavailableReason: string | null }`.
   - Build input via `buildEngineInput`. If it returns null → `{ available:false, result:null, unavailableReason: "needs-outline", exportIfc: noop, exporting:false }`.
   - Compute `result` by running `runEngine(input, createCountingWriteSession())` inside a `useEffect` (async) with a cancellation guard; store in state. Re-run when inputs change. (No WASM — cheap.)
   - `exportIfc`: async; rebuild input, `const s = await getSharedIfcWriteSession(); const r = await runEngine(input, s);` then `downloadIfc(r.ifcBytes, \`\${(recipe.buildingName || buildingPk)}.ifc\`)`. Wrap in try/catch; on error call `toast.error(...)` from `sonner` and log; set/clear `exporting`. This is the ONLY real-WASM path.

6. **Modify** `src/components/twin/fidelity-detail-panel.tsx` — add optional props
   `hitlFlags?: HitlFlag[]`, `onExportIfc?: () => void`, `exporting?: boolean`, `engineUnavailableReason?: string | null`.
   Render a new bordered section at the bottom of the accordion content titled (via a `t()` passed in or a plain label — keep it consistent with the file's current English-label style; this file currently uses English category labels, so English is fine here):
   - If `engineUnavailableReason` is set: a muted line "IFC export needs a CAD or building-outline footprint."
   - Else: an "Export IFC" `<Button>` (calls `onExportIfc`, disabled + spinner when `exporting`), and if `hitlFlags?.length`, a list "N element(s) need review" with each flag's `kind`, short id, and `reason`. If zero flags, a muted "All elements above confidence threshold." line.
   Keep everything additive; do not change existing rendering. Guard all new UI so that when none of the new props are passed the panel renders exactly as before.
   **Test** `src/components/twin/__tests__/fidelity-detail-panel-engine.test.tsx`: passing two `hitlFlags` renders two review rows and an enabled Export button; passing `engineUnavailableReason` renders the outline-needed message and no Export button.

7. **Modify** `src/components/workspace/properties-panel.tsx` — inside the existing "Twin Fidelity" `AccordionItem`, call `useEngineResult({ buildingPk, recipe: effectiveRecipe, footprintSource, ledgerHeit, measuredHeightM })` (only when `effectiveRecipe` exists) and pass `hitlFlags`, `onExportIfc`, `exporting`, `engineUnavailableReason` into the existing `<FidelityDetailPanel>`. Do not restructure the component. Respect the existing early-return-when-no-data guard (hooks must run unconditionally — call `useEngineResult` before the early return, passing `effectiveRecipe` which may be undefined; have the hook treat an undefined recipe as `available:false`).

## Global constraints (binding)

- Additive only. Do NOT modify: `src/app/api/vworld/footprint/route.ts`, anything under `src/lib/campus/`, `src/hooks/use-campus-buildings.ts` (a concurrent session owns those). Do NOT touch the existing engine step modules or `orchestrator.ts`/`types.ts`.
- Heed `AGENTS.md`: this is Next.js 16 / React 19 — read the relevant guide under `node_modules/next/dist/docs/` before writing component/hook code if unsure; keep `"use client"` on hook/components.
- Real WASM runs ONLY on the explicit Export click, wrapped in try/catch with a `sonner` toast on failure. Flags come from the pure counting session — never call `getSharedIfcWriteSession()` during render.
- Coordinates stay meters/XZ/origin-centered. Reuse `ENGINE_CONSTANTS`; never hardcode duplicates.
- TDD: failing test first for each pure module and the component. Run each new test file with `pnpm exec vitest run <path>`. Then run `pnpm exec vitest run src/lib/engine src/hooks src/components/twin` and confirm green.
- Do NOT `git add`/`git commit` — the controller commits.
- If a genuine ambiguity blocks you, stop and report BLOCKED with the specific question rather than guessing.

## Report

Return: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), every file created/modified, the exact test commands run and their pass/fail counts, and any concerns (especially anything you could not verify without real WASM).
