# Agentic BIM Engine (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, headless `runEngine()` pipeline that turns footprint + floor data into a valid, downloadable IFC4 file with per-element confidence and HITL flags.

**Architecture:** New framework-free module `src/lib/engine/` composed of a reducer-style orchestrator over five steps (ingest → fuse → generate-IFC → validate → score). IFC is written with the existing `web-ifc` dependency via an extended session shim. Geometry is deterministic TS/kernel code — never LLM-generated.

**Tech Stack:** TypeScript, `web-ifc@0.0.77` (write API), `earcut` (already used via `gis/earcut-extrude`), Vitest, Zustand (wiring only).

## Global Constraints

- All coordinates are **meters, XZ-plane, centered at the footprint bbox origin** (the repo's canonical convention — see `src/lib/cad/README.md`).
- No new runtime dependencies. Use `web-ifc` already in `package.json`.
- Engine modules are **pure**: no React, no Zustand imports, no `window` (except the WASM session, injected as a parameter). Wiring lives outside `src/lib/engine/`.
- `web-ifc` is **mocked in unit tests** (as `src/lib/ifc/__tests__/ifc-lifecycle.test.ts` already does); one integration test may use the real WASM harness.
- Constants (exact values): `DEFAULT_STOREY_HEIGHT_M = 3.3`, `DEFAULT_WALL_THICKNESS_M = 0.3`, `CONFLICT_TOLERANCE_PCT = 10`, `SLAB_AREA_TOLERANCE_PCT = 2`, `HITL_THRESHOLD = 0.85`, `W_GEOM = 0.6`, `W_HEIGHT = 0.4`, `TOPOLOGY_PENALTY = 0.2`.
- Confidence weights are Slice-1 heuristics (OCR/point-cloud terms absent), documented as such — never presented as validated ground truth.
- Gates per task: `pnpm lint` (0 errors) · the task's `vitest run <path>` (green) · type-check clean. Full `pnpm build` runs at the integration phase.
- Commits stage **explicit paths only** — never `git add -A`. Do not touch uncommitted P2-24–P2-28 files.
- Deferred capabilities (OCR, LiDAR, Z3, IfcDoor/IfcWindow openings, PostGIS) are labeled honestly, never stubbed as done.

---

### Task 1: Engine contract (`engine/types.ts`) — FOUNDATION (serial, blocks all)

**Files:**
- Create: `src/lib/engine/types.ts`
- Create: `src/lib/engine/index.ts` (barrel)
- Test: `src/lib/engine/__tests__/types.test.ts`

**Interfaces:**
- Produces: every type below. All later tasks import from `engine/types`.

- [ ] **Step 1: Write the contract**

```ts
// src/lib/engine/types.ts
export type SourceKind =
  | "cad-exact" | "cad-converted" | "cad-traced"
  | "vworld-measured" | "ledger" | "manual" | "era-estimate";

export type ElementKind = "wall" | "slab";

export interface BimEngineInput {
  pk: string;
  title?: string;
  cadFootprint?: { rings: [number, number][][]; source: "cad-exact" | "cad-converted" | "cad-traced" };
  vworldFootprint?: { rings: [number, number][][]; measuredHeightM?: number; groundFloors?: number };
  ledger?: { heightM?: number; floors?: number };
  params?: { floors?: number; heightM?: number; year?: number };
  defaultStoreyHeightM?: number;
}

export interface SpatialFeature {
  kind: "footprint" | "height" | "floors";
  footprint?: [number, number][][];
  heightM?: number;
  floors?: number;
  source: SourceKind;
}

export interface Conflict {
  field: "height" | "floors";
  sources: { source: SourceKind; value: number }[];
  chosen: SourceKind;
  deltaPct: number;
}

export interface FusedModel {
  pk: string;
  title: string;
  footprint: [number, number][][];
  footprintSource: SourceKind;
  floors: number;
  floorsSource: SourceKind;
  storeyHeightM: number;
  totalHeightM: number;
  heightSource: SourceKind;
  wallThicknessM: number;
}

export interface GeneratedElement {
  expressId: number;
  kind: ElementKind;
  storey: number;
  geomSource: SourceKind;
  heightSource: SourceKind;
}

export interface ValidationCheck {
  id: "ring-closed" | "slab-area" | "storey-monotonic" | "roundtrip-count";
  passed: boolean;
  detail: string;
  elementIds?: number[];
}

export interface ValidationReport {
  checks: ValidationCheck[];
  passed: boolean;
}

export interface ElementConfidence {
  expressId: number;
  kind: ElementKind;
  sconf: number;
  geomScore: number;
  heightScore: number;
  topologyPenalty: number;
}

export interface HitlFlag {
  expressId: number;
  kind: ElementKind;
  sconf: number;
  reason: string;
}

export interface BimEngineResult {
  ifcBytes: Uint8Array;
  model: FusedModel;
  elements: ElementConfidence[];
  hitlFlags: HitlFlag[];
  conflicts: Conflict[];
  validation: ValidationReport;
}

export const ENGINE_CONSTANTS = {
  DEFAULT_STOREY_HEIGHT_M: 3.3,
  DEFAULT_WALL_THICKNESS_M: 0.3,
  CONFLICT_TOLERANCE_PCT: 10,
  SLAB_AREA_TOLERANCE_PCT: 2,
  HITL_THRESHOLD: 0.85,
  W_GEOM: 0.6,
  W_HEIGHT: 0.4,
  TOPOLOGY_PENALTY: 0.2,
} as const;
```

```ts
// src/lib/engine/index.ts
export * from "./types";
```

- [ ] **Step 2: Write the guard test**

```ts
// src/lib/engine/__tests__/types.test.ts
import { describe, it, expect } from "vitest";
import { ENGINE_CONSTANTS } from "../types";

describe("engine constants", () => {
  it("pins the Slice-1 scoring weights and thresholds", () => {
    expect(ENGINE_CONSTANTS.W_GEOM + ENGINE_CONSTANTS.W_HEIGHT).toBeCloseTo(1);
    expect(ENGINE_CONSTANTS.HITL_THRESHOLD).toBe(0.85);
    expect(ENGINE_CONSTANTS.TOPOLOGY_PENALTY).toBe(0.2);
  });
});
```

- [ ] **Step 3: Run** `pnpm vitest run src/lib/engine/__tests__/types.test.ts` → PASS.
- [ ] **Step 4: Type-check** the file compiles. **Do not commit** (controller commits after the phase).

---

### Task 2: Ingest (`engine/steps/ingest.ts`) — PARALLEL WAVE

**Files:**
- Create: `src/lib/engine/steps/ingest.ts`
- Test: `src/lib/engine/steps/__tests__/ingest.test.ts`

**Interfaces:**
- Consumes: `BimEngineInput`, `SpatialFeature`, `SourceKind` from `engine/types`.
- Produces: `ingest(input: BimEngineInput): SpatialFeature[]`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { ingest } from "../ingest";

const RING: [number, number][][] = [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]];

describe("ingest", () => {
  it("emits a footprint feature from CAD, preserving its provenance", () => {
    const f = ingest({ pk: "x", cadFootprint: { rings: RING, source: "cad-exact" } });
    expect(f.find((x) => x.kind === "footprint")).toMatchObject({ source: "cad-exact", footprint: RING });
  });
  it("emits height + floors from ledger, and floors from vworld groundFloors", () => {
    const f = ingest({ pk: "x", ledger: { heightM: 12, floors: 4 }, vworldFootprint: { rings: RING, groundFloors: 3 } });
    expect(f.filter((x) => x.kind === "height").map((x) => x.source)).toContain("ledger");
    expect(f.filter((x) => x.kind === "floors").map((x) => x.source)).toEqual(expect.arrayContaining(["ledger", "vworld-measured"]));
  });
  it("emits manual params as manual-sourced features", () => {
    const f = ingest({ pk: "x", params: { floors: 2, heightM: 7 } });
    expect(f.find((x) => x.kind === "floors" && x.source === "manual")).toBeTruthy();
    expect(f.find((x) => x.kind === "height" && x.source === "manual")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests → FAIL** (`ingest` not defined).
- [ ] **Step 3: Implement**

```ts
// src/lib/engine/steps/ingest.ts
import type { BimEngineInput, SpatialFeature } from "../types";

export function ingest(input: BimEngineInput): SpatialFeature[] {
  const out: SpatialFeature[] = [];
  if (input.cadFootprint) out.push({ kind: "footprint", footprint: input.cadFootprint.rings, source: input.cadFootprint.source });
  if (input.vworldFootprint) {
    out.push({ kind: "footprint", footprint: input.vworldFootprint.rings, source: "vworld-measured" });
    if (input.vworldFootprint.measuredHeightM != null) out.push({ kind: "height", heightM: input.vworldFootprint.measuredHeightM, source: "vworld-measured" });
    if (input.vworldFootprint.groundFloors != null) out.push({ kind: "floors", floors: input.vworldFootprint.groundFloors, source: "vworld-measured" });
  }
  if (input.ledger?.heightM != null) out.push({ kind: "height", heightM: input.ledger.heightM, source: "ledger" });
  if (input.ledger?.floors != null) out.push({ kind: "floors", floors: input.ledger.floors, source: "ledger" });
  if (input.params?.heightM != null) out.push({ kind: "height", heightM: input.params.heightM, source: "manual" });
  if (input.params?.floors != null) out.push({ kind: "floors", floors: input.params.floors, source: "manual" });
  return out;
}
```

- [ ] **Step 4: Run tests → PASS.** Type-check clean. **Do not commit.**

---

### Task 3: Fuse (`engine/steps/fuse.ts`) — PARALLEL WAVE

**Files:**
- Create: `src/lib/engine/steps/fuse.ts`
- Test: `src/lib/engine/steps/__tests__/fuse.test.ts`

**Interfaces:**
- Consumes: `BimEngineInput`, `SpatialFeature`, `FusedModel`, `Conflict`, `ENGINE_CONSTANTS`.
- Produces: `fuse(input: BimEngineInput, features: SpatialFeature[]): { model: FusedModel; conflicts: Conflict[] }`. Throws `Error("no footprint")` if no footprint feature exists.

Resolution hierarchy (highest first): footprint → cad-exact > cad-converted > cad-traced > vworld-measured. floors → ledger > vworld-measured > manual > (default 1, era-estimate). height → ledger > vworld-measured > manual > (floors × DEFAULT_STOREY_HEIGHT_M, era-estimate). storeyHeightM = totalHeightM / floors. A `Conflict` is recorded for height/floors when two numeric sources differ by > `CONFLICT_TOLERANCE_PCT`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { fuse } from "../fuse";
import { ingest } from "../ingest";

const RING: [number, number][][] = [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]];

describe("fuse", () => {
  it("prefers CAD footprint and ledger height/floors", () => {
    const input = { pk: "p", title: "T", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 13.2, floors: 4 } };
    const { model } = fuse(input, ingest(input));
    expect(model.footprintSource).toBe("cad-exact");
    expect(model.floors).toBe(4);
    expect(model.totalHeightM).toBeCloseTo(13.2);
    expect(model.storeyHeightM).toBeCloseTo(3.3);
    expect(model.heightSource).toBe("ledger");
  });
  it("falls back to era-estimate height from floors when no height source", () => {
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-traced" as const }, params: { floors: 3 } };
    const { model } = fuse(input, ingest(input));
    expect(model.heightSource).toBe("era-estimate");
    expect(model.totalHeightM).toBeCloseTo(3 * 3.3);
  });
  it("records a height conflict when ledger and vworld disagree > 10%", () => {
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 10, floors: 3 }, vworldFootprint: { rings: RING, measuredHeightM: 13 } };
    const { conflicts } = fuse(input, ingest(input));
    expect(conflicts.find((c) => c.field === "height")).toMatchObject({ chosen: "ledger" });
  });
  it("throws when no footprint is available", () => {
    expect(() => fuse({ pk: "p", ledger: { floors: 2 } }, [])).toThrow(/footprint/i);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `fuse` per the hierarchy and constants above (pure function; use `ENGINE_CONSTANTS.DEFAULT_STOREY_HEIGHT_M`, `DEFAULT_WALL_THICKNESS_M`, `CONFLICT_TOLERANCE_PCT`). Pick footprint by a priority rank map; pick floors/height by first available in priority order; compute `deltaPct` between the two highest numeric sources and push a `Conflict` when it exceeds tolerance.
- [ ] **Step 4: Run → PASS.** Type-check clean. **Do not commit.**

---

### Task 4: IFC writer (session shim + `engine/steps/generate-ifc.ts`) — PARALLEL WAVE (research-first)

**Files:**
- Modify: `src/lib/ifc/ifc-session.ts` (extend `IfcApiInstance` with the write surface; add `createModel`/`saveModel` helpers)
- Create: `src/lib/engine/steps/generate-ifc.ts`
- Test: `src/lib/engine/steps/__tests__/generate-ifc.test.ts`

**Interfaces:**
- Consumes: `FusedModel`, `GeneratedElement`, `ENGINE_CONSTANTS`, and an injected IFC write session.
- Produces: `generateIfc(model: FusedModel, session: IfcWriteSession): Promise<{ ifcBytes: Uint8Array; elements: GeneratedElement[] }>`.

- [ ] **Step 1: RESEARCH the web-ifc 0.0.77 write API before coding.** Read `node_modules/web-ifc/web-ifc-api.d.ts` and `node_modules/web-ifc/web-ifc-api.js`; confirm the real names/signatures for: model creation (`CreateModel`), writing entities (`WriteLine` / `CreateIfcEntity` / raw line writing), saving (`SaveModel` / `ExportFileAsIFC` returning `Uint8Array`), and how `IfcExtrudedAreaSolid`, `IfcArbitraryClosedProfileDef`, `IfcPolyline`, `IfcCartesianPoint`, spatial-containment rels are constructed. Also query context7 for `web-ifc` if the types are ambiguous. **Do not trust prior memory of the API — verify.**

- [ ] **Step 2: Write the behavioral test** (mock the session; assert element accounting, not raw IFC text)

```ts
import { describe, it, expect, vi } from "vitest";
import { generateIfc } from "../generate-ifc";
import type { FusedModel } from "../../types";

const model: FusedModel = {
  pk: "p", title: "T",
  footprint: [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]],
  footprintSource: "cad-exact",
  floors: 2, floorsSource: "ledger",
  storeyHeightM: 3.3, totalHeightM: 6.6, heightSource: "ledger",
  wallThicknessM: 0.3,
};

function fakeSession() {
  let id = 0;
  return {
    createModel: vi.fn(() => 1),
    writeLine: vi.fn(() => ++id),      // returns a fresh expressId
    saveModel: vi.fn(() => new Uint8Array([1, 2, 3])),
    closeModel: vi.fn(),
  };
}

describe("generateIfc", () => {
  it("emits one wall per footprint edge per storey and one slab per floor", async () => {
    const session = fakeSession();
    const { ifcBytes, elements } = await generateIfc(model, session as never);
    // 4 edges × 2 storeys = 8 walls; 2 slabs
    expect(elements.filter((e) => e.kind === "wall")).toHaveLength(8);
    expect(elements.filter((e) => e.kind === "slab")).toHaveLength(2);
    expect(elements.every((e) => e.geomSource === "cad-exact")).toBe(true);
    expect(ifcBytes).toBeInstanceOf(Uint8Array);
    expect(session.saveModel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Extend the session shim.** In `ifc-session.ts` add the verified write methods to `IfcApiInstance` and export an `IfcWriteSession` interface `{ createModel(): number; writeLine(...): number; saveModel(modelId): Uint8Array; closeModel(modelId): void }` plus `getSharedIfcWriteSession()` reusing the existing singleton. Keep the read surface intact.

- [ ] **Step 4: Implement `generateIfc`** — deterministic geometry only: build `IfcProject/Site/Building/Storey` hierarchy; for each storey, one `IfcWallStandardCase` per footprint edge (extruded to `storeyHeightM`, thickness `wallThicknessM`) and one `IfcSlab` (profile = footprint) at the storey elevation; track each as a `GeneratedElement` with `geomSource = model.footprintSource`, `heightSource = model.heightSource`. Return `saveModel()` bytes.

- [ ] **Step 5: Run** `pnpm vitest run src/lib/engine/steps/__tests__/generate-ifc.test.ts` → PASS. Type-check clean. **Do not commit.**

---

### Task 5: Score (`engine/steps/score.ts`) — PARALLEL WAVE

**Files:**
- Create: `src/lib/engine/steps/score.ts`
- Test: `src/lib/engine/steps/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `GeneratedElement`, `ValidationReport`, `ElementConfidence`, `HitlFlag`, `ENGINE_CONSTANTS`.
- Produces: `score(elements: GeneratedElement[], validation: ValidationReport): { elements: ElementConfidence[]; hitlFlags: HitlFlag[] }`.

Scoring: `geomScore` map `{ "cad-exact":1.0, "cad-converted":0.85, "cad-traced":0.70, "vworld-measured":0.80 }`; `heightScore` map `{ "ledger":1.0, "vworld-measured":0.80, "manual":0.70, "era-estimate":0.50 }`. `topologyPenalty = TOPOLOGY_PENALTY` if the element's `expressId` appears in any failed check's `elementIds`, else 0. `sconf = clamp01(W_GEOM*geomScore + W_HEIGHT*heightScore − topologyPenalty)`. Flag when `sconf < HITL_THRESHOLD` with reason naming the weakest driver.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { score } from "../score";
import type { GeneratedElement, ValidationReport } from "../../types";

const ok: ValidationReport = { passed: true, checks: [] };
const el = (expressId: number, geom: GeneratedElement["geomSource"], height: GeneratedElement["heightSource"]): GeneratedElement =>
  ({ expressId, kind: "wall", storey: 0, geomSource: geom, heightSource: height });

describe("score", () => {
  it("does not flag a cad-exact + ledger element (sconf 1.0)", () => {
    const { elements, hitlFlags } = score([el(1, "cad-exact", "ledger")], ok);
    expect(elements[0].sconf).toBeCloseTo(1.0);
    expect(hitlFlags).toHaveLength(0);
  });
  it("flags a vworld + era-estimate element (sconf 0.68 < 0.85)", () => {
    const { elements, hitlFlags } = score([el(2, "vworld-measured", "era-estimate")], ok);
    expect(elements[0].sconf).toBeCloseTo(0.68);
    expect(hitlFlags).toHaveLength(1);
  });
  it("applies the topology penalty to elements implicated in a failed check", () => {
    const bad: ValidationReport = { passed: false, checks: [{ id: "ring-closed", passed: false, detail: "open", elementIds: [3] }] };
    const { elements } = score([el(3, "cad-exact", "ledger")], bad);
    expect(elements[0].topologyPenalty).toBe(0.2);
    expect(elements[0].sconf).toBeCloseTo(0.8);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `score` + a local `clamp01`.
- [ ] **Step 4: Run → PASS.** Type-check clean. **Do not commit.**

---

### Task 6: Validate (`engine/steps/validate.ts`) — INTEGRATION (depends on Task 4)

**Files:**
- Create: `src/lib/engine/steps/validate.ts`
- Test: `src/lib/engine/steps/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `FusedModel`, `GeneratedElement`, `ValidationReport`, `ValidationCheck`, `ENGINE_CONSTANTS`.
- Produces: `validate(model: FusedModel, elements: GeneratedElement[]): ValidationReport`.

Checks (pure, no WASM): `ring-closed` (first == last vertex within 1e-6); `slab-area` (shoelace area of footprint vs each slab; here all slabs share the footprint so pass unless area ≤ 0 — implicate slab ids when area invalid); `storey-monotonic` (storey indices 0..floors-1 present and increasing); `roundtrip-count` accepts a passed-in expected count (wall+slab counts match `floors*edges + floors`). `passed` = all checks passed.

- [ ] **Step 1–4:** TDD as above: test a closed valid model passes all checks; test an open ring fails `ring-closed`; test a degenerate (collinear) footprint fails `slab-area`. Implement with a shoelace-area helper. **Do not commit.**

---

### Task 7: Orchestrator + golden fixture (`engine/orchestrator.ts`) — INTEGRATION

**Files:**
- Create: `src/lib/engine/orchestrator.ts`
- Test: `src/lib/engine/__tests__/orchestrator.test.ts`

**Interfaces:**
- Consumes: all steps + `BimEngineInput`, `BimEngineResult`. Accepts an injected write session (default `getSharedIfcWriteSession()`), so tests pass a fake.
- Produces: `runEngine(input: BimEngineInput, session?: IfcWriteSession): Promise<BimEngineResult>`.

- [ ] **Step 1: Write the end-to-end test** with a fake session (as in Task 4): a 2-storey 10×8 CAD-exact building with ledger height 6.6 → assert `result.validation.passed`, `result.elements.length === 10`, `result.hitlFlags.length === 0`, `result.ifcBytes.length > 0`, and no `conflicts`. A second case (vworld footprint + era height) asserts every element is flagged.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the reducer chain: `ingest → fuse → generateIfc → validate → score`, assembling `BimEngineResult`.
- [ ] **Step 4: Run → PASS.** **Do not commit.**

---

### Task 8: Wiring — twin-stage call + Export IFC + HITL feed — INTEGRATION (UI)

**Files:**
- Create: `src/lib/engine/engine-download.ts` (`downloadIfc(bytes, filename)` — Blob + anchor)
- Modify: the twin-stage container to call `runEngine` for the active building and expose an "Export IFC" action (locate via `src/lib/workflow/stages.ts` consumers and the twin stage component).
- Modify: `fidelity-detail-panel` to render `HitlFlag[]` (a section listing flagged elements + reason), guarded so an empty list renders nothing.
- Test: `src/lib/engine/__tests__/engine-download.test.ts` (jsdom Blob/anchor); a React Testing Library test that mounting the panel with two flags renders two rows.

**Interfaces:**
- Consumes: `BimEngineResult`, `HitlFlag`.

- [ ] TDD each pure/component piece. Keep the twin-stage change minimal (call + button). i18n: reuse `useT()`; add ko/en strings for "Export IFC" / "검토 필요 요소". **Do not commit.**

---

### Task 9: Targeted cleanup — LAST, after checkpoint

**Files:** determined by search, justified per deletion.

- [ ] Grep for glue the engine supersedes (only delete with a zero-reference grep shown in the commit body). Do NOT delete anything referenced by P2-24–P2-28 in-review files. If nothing is safely dead, this task is a no-op and says so.

---

## Self-Review

- **Spec coverage:** ingest/fuse/generate/validate/score/orchestrator/wiring/cleanup all map to spec §3–§8; deferred items excluded per §2. ✅
- **Placeholder scan:** generate-ifc is research-first by necessity (real web-ifc API), with a complete behavioral test as the contract — not a placeholder. ✅
- **Type consistency:** `runEngine`, `generateIfc`, `fuse`, `ingest`, `score`, `validate` signatures and the `IfcWriteSession` shape are consistent across Tasks 1–8. ✅
