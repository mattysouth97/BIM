# Fix brief — Agentic BIM Engine review findings (Slice 1)

Two independent fix lanes over DISJOINT files. Strict TDD (adjust/extend the existing
tests; run them red where behavior changes, then green). Do NOT `git add`/`git commit` —
the controller commits. Do NOT touch `src/lib/campus/**`, `src/hooks/use-campus-buildings.ts`,
or `src/app/api/vworld/footprint/route.ts` (concurrent session). Reuse `ENGINE_CONSTANTS`.

---

## LANE A — engine-core fixes

Files you own: `src/lib/engine/steps/generate-ifc.ts`, `src/lib/engine/steps/validate.ts`,
`src/lib/engine/steps/fuse.ts`, `src/lib/engine/steps/ingest.ts`, `src/lib/engine/types.ts`,
their `__tests__`, and a NEW integration test. Do NOT touch the UI panel or the hook.

### A1 (Important) — Emit `IfcUnitAssignment` (metres)
`generate-ifc.ts` writes `IfcProject.UnitsInContext: null`. Spec §4 requires metres units.
- Verify the IFC4 express type codes + field shapes for `IfcUnitAssignment` and `IfcSIUnit`
  against `node_modules/web-ifc/web-ifc-api.js` (as the original writer did — do NOT guess).
- Emit `IfcSIUnit(UnitType=.LENGTHUNIT., Name=.METRE.)` and `IfcSIUnit(.AREAUNIT., .SQUARE_METRE.)`,
  wrap in an `IfcUnitAssignment`, and set `IfcProject.UnitsInContext` to it. Enum members use the
  `enumValue(...)` helper (type 3). `Dimensions`/`Prefix` are null.
- Update the header scope-note (lines 15-17): remove the "does not implement IfcUnitAssignment" claim.
- The existing mocked `generate-ifc.test.ts` uses a fake `writeLine` counter — assert the unit
  assignment lines are written (the element counts 8 walls / 2 slabs must stay unchanged).

### A2 (Important) — Honest validation + real write→read round-trip
Two parts:
- **Rename the tautological check.** In `validate.ts` + the `ValidationCheck.id` union in
  `types.ts`, rename `"roundtrip-count"` → `"element-count"`. Update its `detail` text to say it
  verifies the element accounting matches the construction formula (NOT a byte round-trip).
  Update `validate.test.ts` and any other reference. `score.ts` reads `check.elementIds` only —
  unaffected — but grep to be sure nothing else references the old id string.
- **Add a REAL round-trip integration test** `src/lib/engine/steps/__tests__/generate-ifc-roundtrip.integration.test.ts`:
  - Use `// @vitest-environment node` at the top.
  - Construct a REAL `IfcWriteSession` for the test by `import`-ing web-ifc directly and calling
    `new IfcAPI()` then `Init(locateFile)` where `locateFile` returns the absolute path to
    `node_modules/web-ifc/web-ifc-node.wasm` (or `web-ifc.wasm`). Build a small
    `{ createModel, writeLine, saveModel, closeModel }` around it matching `IfcWriteSession`.
  - `runEngine(input, realSession)` for a 2-storey 10×8 CAD-exact building, then re-open
    `result.ifcBytes` with `api.OpenModel(bytes)` and assert `GetLineIDsWithType` counts:
    8 `IFCWALLSTANDARDCASE`, 2 `IFCSLAB`, 2 `IFCBUILDINGSTOREY`, and that a length unit exists.
  - **HONEST FALLBACK:** if web-ifc genuinely cannot `Init` in the node test env after a real
    attempt, DO NOT fake it. Delete the non-working test, and instead soften the "verified
    against node_modules/web-ifc" comments in `generate-ifc.ts` to
    "entity names cross-checked against web-ifc 0.0.77 source; runtime write→read not yet
    asserted by an automated test (browser smoke pending)." Report exactly which path you took.

### A3 (Minor) — No silent empty "valid" model
- `ingest.ts`: do NOT emit a `height`/`floors` feature when its value is `<= 0` (0 means
  "data unavailable" per CLAUDE.md — it must never become an authoritative source).
- `fuse.ts`: clamp `floors = Math.max(1, chosenFloors)` and guard the `storeyHeightM` division.
- Add tests: a ledger `{ floors: 0 }` yields a model with `floors >= 1` (era-estimate fallback),
  never `NaN` `storeyHeightM`, and does not silently produce zero elements.

### A4 (Minor) — Rename over-promising check
Rename the `"slab-area"` check id → `"footprint-nondegenerate"` in `validate.ts` + the
`types.ts` union + tests. Keep the honest inline comment. (Leave `SLAB_AREA_TOLERANCE_PCT` in
`ENGINE_CONSTANTS` for Slice 2, but add a one-line comment that it is not yet consumed.)

### A5 (Minor) — Conforming IFC GlobalId
Replace `guid()` in `generate-ifc.ts` with a pure function emitting a valid **22-character**
compressed `IfcGloballyUniqueId` (128-bit UUID → base64 with the IFC alphabet
`0-9,A-Z,a-z,_,$`). Add a unit test asserting output length is exactly 22 and every char is in
the IFC alphabet. **If you cannot implement the compression provably correctly, keep the current
documented readable string and note the validator impact — do NOT ship a subtly-wrong GUID.**

After all Lane-A fixes: `pnpm exec vitest run src/lib/engine` green (report the integration
test outcome explicitly).

---

## LANE B — UI fixes

File you own: `src/components/twin/fidelity-detail-panel.tsx` and its test
`src/components/twin/__tests__/fidelity-detail-panel-engine.test.tsx`. Do NOT touch engine
modules, the hook, or `properties-panel.tsx`.

### B1 (Minor) — i18n the new engine strings
Plan Task 8 requires `useT()` for the new strings. Add `import { useT } from "@/lib/i18n"` and
`const { t } = useT();` in `FidelityDetailPanel`, and replace the four hardcoded strings:
- `Export IFC` → `t("IFC 내보내기", "Export IFC")`
- `N element(s) need review` → `t(\`\${n}개 요소 검토 필요\`, \`\${n} element\${n !== 1 ? "s" : ""} need review\`)`
- `All elements above confidence threshold.` → `t("모든 요소가 신뢰도 기준을 통과했습니다.", "All elements above confidence threshold.")`
- `IFC export needs a CAD or building-outline footprint.` → `t("IFC 내보내기에는 CAD 또는 건물 외곽선 도면이 필요합니다.", "IFC export needs a CAD or building-outline footprint.")`
First check `useT()`'s default language in the test env and update the RTL test queries so they
still find the button/rows (query by role/testid or the language `useT` actually returns in tests).

### B2 (Minor) — Don't show a false "all-clear"
Currently when `hitlFlags === undefined` (engine hasn't computed yet), the panel renders
"All elements above confidence threshold." — an unearned all-clear. Fix so:
- `hitlFlags === undefined` → render nothing (or a muted "…" placeholder) for the flags area.
- `hitlFlags` defined & empty → the all-clear line.
- `hitlFlags` non-empty → the review list.
Extend the RTL test: passing no `hitlFlags` (but `onExportIfc` set) shows the Export button and
NO all-clear text; passing `hitlFlags={[]}` shows the all-clear.

After Lane-B fixes: `pnpm exec vitest run src/components/twin` green.

---

## Report (each lane)
status (DONE / DONE_WITH_CONCERNS / BLOCKED), files changed, exact test commands + pass/fail
counts, and for A2 the explicit outcome (real round-trip test passing, or honest fallback taken).
