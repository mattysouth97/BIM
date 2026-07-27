# CAD Viewer + Markup (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render full DWG/DXF drawings in-browser with layer control, measurement, and markup — building the `CadDocument` model that later drafting phases will edit.

**Architecture:** npm `dxf-parser` output → `CadDocument` (plain data, meters, DXF XY) → pure geometry builder (per-layer line-segment buffers) → R3F orthographic viewer. Markups live in a separate Zustand store keyed by document id, persisted via idb-keyval, never mutating the source document. Spec: `docs/superpowers/specs/2026-07-27-cad-viewer-markup-design.md`.

**Tech Stack:** TypeScript, Next.js 16, React 19, React Three Fiber v9 + drei, Three.js, Zustand, idb-keyval, vitest.

## Global Constraints

- All coordinates in `CadDocument` are **meters, native DXF XY** (NOT the XZ/bbox-centered convention of `dxf-parser.ts` — conversion happens only at the use-as-footprint boundary).
- Angles are **radians, CCW** everywhere.
- `src/lib/cad/doc/**` must stay pure: no React, no DOM, no Three imports.
- Existing footprint pipeline (`parseDxfText`, `FootprintIngestResult`, upload guards) must keep working unchanged — all existing tests must still pass.
- Bilingual UI copy via the local `t(ko, en, isKo)` pattern used in `upload-stage.tsx`.
- Test runner: `pnpm vitest run <path>`; tests colocated under `__tests__/`.
- Commit after every task (at minimum); conventional-commit messages.

---

### Task 1: CadDocument types + ACI color table

**Files:**
- Create: `src/lib/cad/doc/types.ts`
- Create: `src/lib/cad/doc/aci-colors.ts`
- Test: `src/lib/cad/doc/__tests__/aci-colors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types below (imported by every later task); `aciToHex(index: number): string`.

- [ ] **Step 1: Write `types.ts`** (pure declarations — no test needed)

```ts
// src/lib/cad/doc/types.ts
// CadDocument — the editable CAD document model (phase-1: read-only viewer).
// Plain serializable data. Meters, native DXF XY, radians CCW.

export interface Vec2 { x: number; y: number }

interface CadEntityBase {
  /** Stable per-document id, assigned by the mapper ("e0", "e1", …). */
  id: string;
  layer: string;
  /** ACI color override; undefined = ByLayer. */
  colorIndex?: number;
  /** Set when the entity was flattened out of a block reference. */
  fromBlock?: string;
}

export interface CadLine extends CadEntityBase { kind: "line"; a: Vec2; b: Vec2 }
export interface CadPolyline extends CadEntityBase {
  kind: "polyline";
  vertices: Vec2[];
  /** Bulge leaving vertex i toward i+1; same length as vertices (0 = straight). */
  bulges: number[];
  closed: boolean;
}
export interface CadArc extends CadEntityBase {
  kind: "arc"; center: Vec2; radius: number; startAngle: number; endAngle: number;
}
export interface CadCircle extends CadEntityBase { kind: "circle"; center: Vec2; radius: number }
export interface CadEllipse extends CadEntityBase {
  kind: "ellipse";
  center: Vec2;
  /** Endpoint of the major axis relative to center (meters). */
  majorAxis: Vec2;
  /** Minor/major axis ratio (0..1]. */
  ratio: number;
  startParam: number;
  endParam: number;
}
export interface CadText extends CadEntityBase {
  kind: "text"; position: Vec2; height: number; rotation: number; text: string;
}
export interface CadPointEntity extends CadEntityBase { kind: "point"; position: Vec2 }

export type CadEntity =
  | CadLine | CadPolyline | CadArc | CadCircle | CadEllipse | CadText | CadPointEntity;

export interface CadLayer { name: string; colorIndex: number; visible: boolean }

export interface CadDocumentStats {
  /** Entities seen in the DXF ENTITIES section (before block flattening). */
  totalParsed: number;
  /** Entities that made it into `entities`. */
  mapped: number;
  /** Skipped DXF entity types → count (never silently dropped). */
  skipped: Record<string, number>;
}

export interface CadDocument {
  id: string;
  layers: CadLayer[];
  entities: CadEntity[];
  unitScaleToMeters: number;
  extents: { min: Vec2; max: Vec2 };
  warnings: string[];
  stats: CadDocumentStats;
}
```

- [ ] **Step 2: Write the failing ACI test**

```ts
// src/lib/cad/doc/__tests__/aci-colors.test.ts
import { describe, it, expect } from "vitest";
import { aciToHex } from "../aci-colors";

describe("aciToHex", () => {
  it("maps the 9 primary ACI colors exactly", () => {
    expect(aciToHex(1)).toBe("#ff0000"); // red
    expect(aciToHex(2)).toBe("#ffff00"); // yellow
    expect(aciToHex(3)).toBe("#00ff00"); // green
    expect(aciToHex(4)).toBe("#00ffff"); // cyan
    expect(aciToHex(5)).toBe("#0000ff"); // blue
    expect(aciToHex(6)).toBe("#ff00ff"); // magenta
    expect(aciToHex(7)).toBe("#ffffff"); // white/black
    expect(aciToHex(8)).toBe("#808080");
    expect(aciToHex(9)).toBe("#c0c0c0");
  });
  it("maps grays 250–255 as an ascending ramp", () => {
    const grays = [250, 251, 252, 253, 254, 255].map(aciToHex);
    expect(grays[0]).toBe("#333333");
    expect(grays[5]).toBe("#ffffff");
    expect(new Set(grays).size).toBe(6);
  });
  it("returns a valid hex for every chromatic index 10–249", () => {
    for (let i = 10; i <= 249; i++) {
      expect(aciToHex(i)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("falls back to white for 0 (ByBlock) and out-of-range", () => {
    expect(aciToHex(0)).toBe("#ffffff");
    expect(aciToHex(256)).toBe("#ffffff");
    expect(aciToHex(-3)).toBe("#ffffff");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/aci-colors.test.ts`
Expected: FAIL — cannot resolve `../aci-colors`.

- [ ] **Step 4: Implement `aci-colors.ts`**

```ts
// src/lib/cad/doc/aci-colors.ts
// AutoCAD Color Index → hex. Indices 1–9 and 250–255 are the canonical
// values; 10–249 are generated with the standard ACI hue/shade layout
// (24 hues × 10 shades) — an approximation, fine for viewing.

const PRIMARY: Record<number, string> = {
  1: "#ff0000", 2: "#ffff00", 3: "#00ff00", 4: "#00ffff",
  5: "#0000ff", 6: "#ff00ff", 7: "#ffffff", 8: "#808080", 9: "#c0c0c0",
};

const GRAYS: Record<number, string> = {
  250: "#333333", 251: "#5c5c5c", 252: "#858585",
  253: "#adadad", 254: "#d6d6d6", 255: "#ffffff",
};

export function aciToHex(index: number): string {
  if (!Number.isInteger(index)) return "#ffffff";
  if (PRIMARY[index]) return PRIMARY[index];
  if (GRAYS[index]) return GRAYS[index];
  if (index < 10 || index > 249) return "#ffffff";

  // Chromatic band: pairs step through 24 hues; within each hue,
  // 5 lightness levels, odd indices are the "half saturation" variant.
  const i = index - 10;
  const hue = (Math.floor(i / 10) * 360) / 24; // degrees
  const shade = Math.floor((i % 10) / 2);       // 0..4 dark ramp
  const muted = i % 2 === 1;
  const lightness = 0.5 - shade * 0.08;
  const saturation = muted ? 0.55 : 1.0;
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/aci-colors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cad/doc/types.ts src/lib/cad/doc/aci-colors.ts src/lib/cad/doc/__tests__/aci-colors.test.ts
git commit -m "feat(cad): CadDocument model types + ACI color table"
```

---

### Task 2: Curve tessellation helpers

**Files:**
- Create: `src/lib/cad/doc/tessellate.ts`
- Test: `src/lib/cad/doc/__tests__/tessellate.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `./types`.
- Produces:
  - `arcPoints(center: Vec2, radius: number, startAngle: number, endAngle: number, maxSegAngle?: number): Vec2[]` — CCW sweep from start to end (end > start after normalization), includes both endpoints.
  - `circlePoints(center: Vec2, radius: number, maxSegAngle?: number): Vec2[]` — closed ring WITHOUT duplicate last point.
  - `bulgeArcPoints(a: Vec2, b: Vec2, bulge: number, maxSegAngle?: number): Vec2[]` — includes both endpoints; straight `[a, b]` when `bulge === 0`.
  - `ellipsePoints(center: Vec2, majorAxis: Vec2, ratio: number, startParam: number, endParam: number, maxSegAngle?: number): Vec2[]`
  - `DEFAULT_MAX_SEG_ANGLE = Math.PI / 24` (7.5°).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/cad/doc/__tests__/tessellate.test.ts
import { describe, it, expect } from "vitest";
import { arcPoints, circlePoints, bulgeArcPoints, ellipsePoints } from "../tessellate";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("arcPoints", () => {
  it("includes exact endpoints for a quarter arc", () => {
    const pts = arcPoints({ x: 0, y: 0 }, 1, 0, Math.PI / 2);
    expect(near(pts[0].x, 1) && near(pts[0].y, 0)).toBe(true);
    const last = pts[pts.length - 1];
    expect(near(last.x, 0) && near(last.y, 1)).toBe(true);
    for (const p of pts) expect(near(Math.hypot(p.x, p.y), 1, 1e-6)).toBe(true);
  });
  it("handles end < start by wrapping CCW (270° arc)", () => {
    const pts = arcPoints({ x: 0, y: 0 }, 2, Math.PI / 2, 0);
    // sweep = 3π/2 at ≤7.5°/seg → ≥ 36 segments
    expect(pts.length).toBeGreaterThanOrEqual(37);
  });
});

describe("circlePoints", () => {
  it("returns a ring with no duplicate closing point", () => {
    const pts = circlePoints({ x: 5, y: 5 }, 3);
    const first = pts[0], last = pts[pts.length - 1];
    expect(near(first.x, last.x) && near(first.y, last.y)).toBe(false);
    expect(pts.length).toBeGreaterThanOrEqual(48);
  });
});

describe("bulgeArcPoints", () => {
  it("returns straight segment for bulge 0", () => {
    expect(bulgeArcPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, 0)).toEqual([
      { x: 0, y: 0 }, { x: 4, y: 0 },
    ]);
  });
  it("bulge 1 = semicircle bulging left of a→b", () => {
    const pts = bulgeArcPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, 1);
    const mid = pts[Math.floor(pts.length / 2)];
    // Semicircle over chord (0,0)–(4,0): apex near (2, 2)
    expect(near(mid.x, 2, 0.05)).toBe(true);
    expect(near(mid.y, 2, 0.05)).toBe(true);
    const first = pts[0], last = pts[pts.length - 1];
    expect(near(first.x, 0) && near(last.x, 4)).toBe(true);
  });
  it("negative bulge mirrors to the right of a→b", () => {
    const pts = bulgeArcPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, -1);
    const mid = pts[Math.floor(pts.length / 2)];
    expect(near(mid.y, -2, 0.05)).toBe(true);
  });
});

describe("ellipsePoints", () => {
  it("full ellipse respects ratio", () => {
    const pts = ellipsePoints({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.5, 0, Math.PI * 2);
    const xs = pts.map((p) => Math.abs(p.x));
    const ys = pts.map((p) => Math.abs(p.y));
    expect(near(Math.max(...xs), 2, 0.01)).toBe(true);
    expect(near(Math.max(...ys), 1, 0.01)).toBe(true);
  });
  it("rotated major axis rotates the ellipse", () => {
    // major axis along +Y → widest extent on Y
    const pts = ellipsePoints({ x: 0, y: 0 }, { x: 0, y: 2 }, 0.5, 0, Math.PI * 2);
    const ys = pts.map((p) => Math.abs(p.y));
    expect(near(Math.max(...ys), 2, 0.01)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/tessellate.test.ts`
Expected: FAIL — cannot resolve `../tessellate`.

- [ ] **Step 3: Implement `tessellate.ts`**

```ts
// src/lib/cad/doc/tessellate.ts
// Curve → polyline tessellation. Pure math, no deps.

import type { Vec2 } from "./types";

export const DEFAULT_MAX_SEG_ANGLE = Math.PI / 24; // 7.5°

const TAU = Math.PI * 2;

/** Normalize sweep so end > start (CCW), wrapping once if needed. */
function ccwSweep(start: number, end: number): number {
  let sweep = end - start;
  while (sweep <= 0) sweep += TAU;
  return sweep;
}

export function arcPoints(
  center: Vec2, radius: number, startAngle: number, endAngle: number,
  maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  const sweep = ccwSweep(startAngle, endAngle);
  const n = Math.max(1, Math.ceil(sweep / maxSegAngle));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (sweep * i) / n;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

export function circlePoints(
  center: Vec2, radius: number, maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  const n = Math.max(8, Math.ceil(TAU / maxSegAngle));
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

/**
 * DXF bulge arc between two vertices. bulge = tan(includedAngle / 4);
 * positive bulges CCW (left of a→b).
 */
export function bulgeArcPoints(
  a: Vec2, b: Vec2, bulge: number, maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  if (bulge === 0) return [{ ...a }, { ...b }];

  const theta = 4 * Math.atan(bulge); // signed included angle
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < 1e-12) return [{ ...a }, { ...b }];
  const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));

  // Center: perpendicular offset from chord midpoint.
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const d = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
  // Unit perpendicular (left of a→b).
  const ux = -(b.y - a.y) / chord, uy = (b.x - a.x) / chord;
  // |theta| < π: center is on the opposite side of the bulge apex.
  const side = (bulge > 0 ? -1 : 1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx + side * d * ux, cy = my + side * d * uy;

  const startAngle = Math.atan2(a.y - cy, a.x - cx);
  const endAngle = Math.atan2(b.y - cy, b.x - cx);

  const pts = bulge > 0
    ? arcPoints({ x: cx, y: cy }, radius, startAngle, endAngle, maxSegAngle)
    : arcPoints({ x: cx, y: cy }, radius, endAngle, startAngle, maxSegAngle).reverse();

  // Pin exact endpoints (tessellation drift).
  pts[0] = { ...a };
  pts[pts.length - 1] = { ...b };
  return pts;
}

export function ellipsePoints(
  center: Vec2, majorAxis: Vec2, ratio: number,
  startParam: number, endParam: number,
  maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  const sweep = endParam - startParam >= TAU - 1e-9
    ? TAU
    : ccwSweep(startParam, endParam);
  const n = Math.max(8, Math.ceil(sweep / maxSegAngle));
  const a = Math.hypot(majorAxis.x, majorAxis.y); // semi-major length
  const b = a * ratio;
  const rot = Math.atan2(majorAxis.y, majorAxis.x);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = startParam + (sweep * i) / n;
    const ex = a * Math.cos(t), ey = b * Math.sin(t);
    pts.push({
      x: center.x + ex * cosR - ey * sinR,
      y: center.y + ex * sinR + ey * cosR,
    });
  }
  return pts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/tessellate.test.ts`
Expected: PASS. If the bulge semicircle apex sign is wrong (apex at y≈−2 for bulge=+1), flip the `side` factor — do NOT loosen the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cad/doc/tessellate.ts src/lib/cad/doc/__tests__/tessellate.test.ts
git commit -m "feat(cad): arc/circle/bulge/ellipse tessellation helpers"
```

---

### Task 3: DXF → CadDocument mapper (core entities)

**Files:**
- Create: `src/lib/cad/doc/map-dxf-to-doc.ts`
- Modify: `src/lib/cad/dxf-parser.ts:55` — add `export` before `const INSUNITS_TO_METERS` (DRY; existing tests unaffected)
- Test: `src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts`

**Interfaces:**
- Consumes: `DxfParser` from npm `dxf-parser`; `INSUNITS_TO_METERS` from `@/lib/cad/dxf-parser`; types from `./types`; `arcPoints`, `circlePoints`, `bulgeArcPoints` from `./tessellate`.
- Produces: `mapDxfTextToDoc(text: string, docId: string): CadDocument` — never throws; hard parse failure returns an empty doc with a warning. Core mapping: LINE, LWPOLYLINE (bulge passthrough), POLYLINE (2D), ARC, CIRCLE. Everything else lands in `stats.skipped` (Task 4 drains most of it).

- [ ] **Step 1: Write the failing tests** (includes the DXF-builder helper later tests reuse)

```ts
// src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts
import { describe, it, expect } from "vitest";
import { mapDxfTextToDoc } from "../map-dxf-to-doc";
import type { CadArc, CadLine, CadPolyline } from "../types";

/** Build a minimal DXF file. Pass tag/value pairs per section. */
export function makeDxf(opts: {
  insunits?: number;
  tables?: string[];   // raw TABLES section lines
  blocks?: string[];   // raw BLOCKS section lines
  entities: string[];  // raw ENTITIES section lines
}): string {
  const L: string[] = [];
  L.push("0", "SECTION", "2", "HEADER");
  if (opts.insunits !== undefined)
    L.push("9", "$INSUNITS", "70", String(opts.insunits));
  L.push("0", "ENDSEC");
  if (opts.tables)
    L.push("0", "SECTION", "2", "TABLES", ...opts.tables, "0", "ENDSEC");
  if (opts.blocks)
    L.push("0", "SECTION", "2", "BLOCKS", ...opts.blocks, "0", "ENDSEC");
  L.push("0", "SECTION", "2", "ENTITIES", ...opts.entities, "0", "ENDSEC");
  L.push("0", "EOF");
  return L.join("\n");
}

export const LINE_MM = [
  "0", "LINE", "8", "WALLS", "10", "0", "20", "0", "11", "1000", "21", "2000",
];

describe("mapDxfTextToDoc — core", () => {
  it("maps LINE with mm→m unit scaling", () => {
    const doc = mapDxfTextToDoc(makeDxf({ insunits: 4, entities: LINE_MM }), "d1");
    expect(doc.entities).toHaveLength(1);
    const line = doc.entities[0] as CadLine;
    expect(line.kind).toBe("line");
    expect(line.layer).toBe("WALLS");
    expect(line.a).toEqual({ x: 0, y: 0 });
    expect(line.b.x).toBeCloseTo(1, 9);
    expect(line.b.y).toBeCloseTo(2, 9);
    expect(doc.unitScaleToMeters).toBe(0.001);
  });

  it("maps closed LWPOLYLINE with bulge passthrough", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: [
          "0", "LWPOLYLINE", "8", "OUTLINE", "90", "3", "70", "1",
          "10", "0", "20", "0", "42", "0.5",
          "10", "10", "20", "0",
          "10", "10", "20", "8",
        ],
      }),
      "d2",
    );
    const pl = doc.entities[0] as CadPolyline;
    expect(pl.kind).toBe("polyline");
    expect(pl.closed).toBe(true);
    expect(pl.vertices).toHaveLength(3);
    expect(pl.bulges[0]).toBeCloseTo(0.5, 9);
    expect(pl.bulges[1]).toBe(0);
  });

  it("maps ARC (angles already radians from dxf-parser)", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: ["0", "ARC", "8", "A", "10", "5", "20", "5", "40", "2", "50", "0", "51", "90"],
      }),
      "d3",
    );
    const arc = doc.entities[0] as CadArc;
    expect(arc.kind).toBe("arc");
    expect(arc.center).toEqual({ x: 5, y: 5 });
    expect(arc.radius).toBe(2);
    expect(arc.startAngle).toBeCloseTo(0, 9);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("extracts layer table colors and computes curve-aware extents", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        tables: [
          "0", "TABLE", "2", "LAYER",
          "0", "LAYER", "2", "WALLS", "62", "1",
          "0", "ENDTAB",
        ],
        entities: [
          ...["0", "CIRCLE", "8", "WALLS", "10", "0", "20", "0", "40", "3"],
        ],
      }),
      "d4",
    );
    const walls = doc.layers.find((l) => l.name === "WALLS");
    expect(walls?.colorIndex).toBe(1);
    expect(walls?.visible).toBe(true);
    expect(doc.extents.min.x).toBeCloseTo(-3, 6);
    expect(doc.extents.max.y).toBeCloseTo(3, 6);
  });

  it("counts unmapped entity types in stats.skipped, never throws on garbage", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({ insunits: 6, entities: ["0", "SOLID", "8", "X", "10", "0", "20", "0"] }),
      "d5",
    );
    expect(doc.stats.skipped["SOLID"]).toBe(1);
    const bad = mapDxfTextToDoc("not a dxf at all", "d6");
    expect(bad.entities).toHaveLength(0);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts`
Expected: FAIL — cannot resolve `../map-dxf-to-doc`.

- [ ] **Step 3: Export `INSUNITS_TO_METERS`** — in `src/lib/cad/dxf-parser.ts` change `const INSUNITS_TO_METERS` to `export const INSUNITS_TO_METERS`.

- [ ] **Step 4: Implement `map-dxf-to-doc.ts` (core)**

```ts
// src/lib/cad/doc/map-dxf-to-doc.ts
// npm dxf-parser output → CadDocument. Never throws.
// Pure module — no React, no DOM, no Three.

import DxfParser, { type IDxf } from "dxf-parser";
import { INSUNITS_TO_METERS } from "@/lib/cad/dxf-parser";
import type {
  CadDocument, CadEntity, CadLayer, CadPolyline, Vec2,
} from "./types";
import { arcPoints, bulgeArcPoints, circlePoints } from "./tessellate";

/* dxf-parser's entity typings are partial; we read loosely and validate. */
type RawEntity = Record<string, unknown> & { type: string; layer?: string };

export function mapDxfTextToDoc(text: string, docId: string): CadDocument {
  const warnings: string[] = [];
  const skipped: Record<string, number> = {};
  let dxf: IDxf | null = null;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch (err) {
    warnings.push(`DXF parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!dxf) return emptyDoc(docId, warnings);

  const rawInsUnits = dxf.header?.["$INSUNITS"];
  const insUnits =
    typeof rawInsUnits === "number" && Number.isFinite(rawInsUnits) ? rawInsUnits : 0;
  const scale = INSUNITS_TO_METERS[insUnits] ?? 1;
  if (insUnits === 0) warnings.push("Unitless DXF — assuming meters.");

  let nextId = 0;
  const idGen = () => `e${nextId++}`;
  const entities: CadEntity[] = [];
  const rawEntities = (dxf.entities ?? []) as unknown as RawEntity[];

  for (const raw of rawEntities) {
    const mapped = convertEntity(raw, scale, idGen, skipped, dxf, 0);
    entities.push(...mapped);
  }

  return {
    id: docId,
    layers: extractLayers(dxf, entities),
    entities,
    unitScaleToMeters: scale,
    extents: computeExtents(entities),
    warnings,
    stats: {
      totalParsed: rawEntities.length,
      mapped: entities.length,
      skipped,
    },
  };
}

function emptyDoc(docId: string, warnings: string[]): CadDocument {
  return {
    id: docId, layers: [], entities: [], unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
    warnings, stats: { totalParsed: 0, mapped: 0, skipped: {} },
  };
}

const v = (p: unknown, scale: number): Vec2 | null => {
  const q = p as { x?: unknown; y?: unknown } | undefined;
  if (typeof q?.x !== "number" || typeof q?.y !== "number") return null;
  return { x: q.x * scale, y: q.y * scale };
};

/** Task 4 extends this switch; depth guards recursive INSERT flattening. */
function convertEntity(
  raw: RawEntity, scale: number, idGen: () => string,
  skipped: Record<string, number>, dxf: IDxf, depth: number,
): CadEntity[] {
  const layer = typeof raw.layer === "string" ? raw.layer : "0";
  const colorIndex = typeof raw.colorIndex === "number" ? raw.colorIndex : undefined;
  const base = { layer, colorIndex } as const;

  switch (raw.type) {
    case "LINE": {
      const verts = raw.vertices as unknown[] | undefined;
      const a = v(verts?.[0], scale), b = v(verts?.[1], scale);
      if (!a || !b) break;
      return [{ ...base, id: idGen(), kind: "line", a, b }];
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const rawVerts = (raw.vertices as unknown[] | undefined) ?? [];
      if (raw.type === "POLYLINE") {
        const r = raw as Record<string, unknown>;
        if (r.is3dPolyline || r.is3dPolygonMesh || r.isPolyfaceMesh) break;
      }
      const vertices: Vec2[] = [];
      const bulges: number[] = [];
      for (const rv of rawVerts) {
        const p = v(rv, scale);
        if (!p) continue;
        vertices.push(p);
        const bg = (rv as { bulge?: unknown }).bulge;
        bulges.push(typeof bg === "number" ? bg : 0);
      }
      if (vertices.length < 2) break;
      const closed = Boolean((raw as { shape?: unknown }).shape);
      const pl: CadPolyline = {
        ...base, id: idGen(), kind: "polyline", vertices, bulges, closed,
      };
      return [pl];
    }
    case "ARC": {
      const center = v(raw.center, scale);
      const { radius, startAngle, endAngle } = raw as {
        radius?: unknown; startAngle?: unknown; endAngle?: unknown;
      };
      if (!center || typeof radius !== "number") break;
      return [{
        ...base, id: idGen(), kind: "arc", center, radius: radius * scale,
        startAngle: typeof startAngle === "number" ? startAngle : 0,
        endAngle: typeof endAngle === "number" ? endAngle : Math.PI * 2,
      }];
    }
    case "CIRCLE": {
      const center = v(raw.center, scale);
      const radius = (raw as { radius?: unknown }).radius;
      if (!center || typeof radius !== "number") break;
      return [{ ...base, id: idGen(), kind: "circle", center, radius: radius * scale }];
    }
  }
  skipped[raw.type] = (skipped[raw.type] ?? 0) + 1;
  return [];
}

function extractLayers(dxf: IDxf, entities: CadEntity[]): CadLayer[] {
  const table = (dxf.tables as unknown as {
    layer?: { layers?: Record<string, { colorIndex?: number; frozen?: boolean; visible?: boolean }> };
  } | undefined)?.layer?.layers ?? {};
  const names = new Set<string>(Object.keys(table));
  for (const e of entities) names.add(e.layer);
  return [...names].sort().map((name) => {
    const t = table[name];
    return {
      name,
      colorIndex: typeof t?.colorIndex === "number" ? Math.abs(t.colorIndex) : 7,
      visible: t?.visible === false || t?.frozen === true ? false : true,
    };
  });
}

function computeExtents(entities: CadEntity[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const e of entities) {
    switch (e.kind) {
      case "line": eat(e.a); eat(e.b); break;
      case "polyline":
        for (let i = 0; i < e.vertices.length; i++) {
          const j = (i + 1) % e.vertices.length;
          if (!e.closed && j === 0) { eat(e.vertices[i]); break; }
          if (e.bulges[i]) bulgeArcPoints(e.vertices[i], e.vertices[j], e.bulges[i]).forEach(eat);
          else eat(e.vertices[i]);
        }
        break;
      case "arc": arcPoints(e.center, e.radius, e.startAngle, e.endAngle).forEach(eat); break;
      case "circle": circlePoints(e.center, e.radius).forEach(eat); break;
      case "ellipse": {
        const a = Math.hypot(e.majorAxis.x, e.majorAxis.y);
        eat({ x: e.center.x - a, y: e.center.y - a });
        eat({ x: e.center.x + a, y: e.center.y + a });
        break;
      }
      case "text": eat(e.position); break;
      case "point": eat(e.position); break;
    }
  }
  if (minX === Infinity) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts`
Expected: PASS (5 tests). If the layer-table test fails, inspect what `dxf.tables.layer.layers` actually contains (log it) — dxf-parser may expose `color` (24-bit RGB) instead of `colorIndex`; if so, extend `extractLayers` to fall back: `colorIndex ?? aciFromColorName(color)` is NOT needed — just default to 7 and keep the test's expectation by mapping `62`-group correctly.

- [ ] **Step 6: Run existing CAD tests to confirm no regression**

Run: `pnpm vitest run src/lib/cad/__tests__`
Expected: PASS — the `export` keyword change is behavior-neutral.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cad/doc/map-dxf-to-doc.ts src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts src/lib/cad/dxf-parser.ts
git commit -m "feat(cad): DXF to CadDocument mapper - lines, polylines, arcs, circles"
```

---

### Task 4: Mapper — text, blocks, dimensions, ellipse, spline, point

**Files:**
- Modify: `src/lib/cad/doc/map-dxf-to-doc.ts` (extend `convertEntity`)
- Test: `src/lib/cad/doc/__tests__/map-dxf-extended.test.ts`

**Interfaces:**
- Consumes: `makeDxf` helper exported from `./map-dxf-to-doc.test.ts` (import from the sibling test file).
- Produces: mapping for TEXT, MTEXT (`stripMtextCodes` exported for reuse), INSERT (recursive flatten, depth cap 4, `fromBlock` tag), DIMENSION (via its anonymous `*D` block, else skipped), ELLIPSE, SPLINE (control-point polyline approximation), POINT. HATCH stays counted-skipped (npm parser lacks boundary data — accepted risk in spec).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/cad/doc/__tests__/map-dxf-extended.test.ts
import { describe, it, expect } from "vitest";
import { mapDxfTextToDoc, stripMtextCodes } from "../map-dxf-to-doc";
import { makeDxf } from "./map-dxf-to-doc.test";
import type { CadLine, CadText } from "../types";

describe("mapDxfTextToDoc — extended", () => {
  it("maps TEXT with height/rotation (degrees→radians)", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 4,
        entities: [
          "0", "TEXT", "8", "NOTES", "10", "500", "20", "500",
          "40", "250", "50", "90", "1", "Room 101",
        ],
      }),
      "t1",
    );
    const txt = doc.entities[0] as CadText;
    expect(txt.kind).toBe("text");
    expect(txt.text).toBe("Room 101");
    expect(txt.height).toBeCloseTo(0.25, 9);
    expect(txt.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(txt.position.x).toBeCloseTo(0.5, 9);
  });

  it("flattens INSERT with translation + rotation and tags fromBlock", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        blocks: [
          "0", "BLOCK", "8", "0", "2", "DOOR", "10", "0", "20", "0",
          "0", "LINE", "8", "DOORS", "10", "0", "20", "0", "11", "1", "21", "0",
          "0", "ENDBLK",
        ],
        entities: [
          "0", "INSERT", "8", "DOORS", "2", "DOOR",
          "10", "5", "20", "5", "50", "90",
        ],
      }),
      "t2",
    );
    expect(doc.entities).toHaveLength(1);
    const line = doc.entities[0] as CadLine;
    expect(line.kind).toBe("line");
    expect(line.fromBlock).toBe("DOOR");
    expect(line.a.x).toBeCloseTo(5, 6);
    expect(line.a.y).toBeCloseTo(5, 6);
    // (1,0) rotated 90° CCW → (0,1), translated → (5,6)
    expect(line.b.x).toBeCloseTo(5, 6);
    expect(line.b.y).toBeCloseTo(6, 6);
  });

  it("maps SPLINE as control-point polyline approximation", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: [
          "0", "SPLINE", "8", "S", "70", "8", "71", "3", "73", "4",
          "10", "0", "20", "0", "10", "1", "20", "2", "10", "2", "20", "2", "10", "3", "20", "0",
        ],
      }),
      "t3",
    );
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].kind).toBe("polyline");
    expect(doc.warnings.some((w) => w.includes("SPLINE"))).toBe(true);
  });

  it("skips DIMENSION without a resolvable block, counts it", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: ["0", "DIMENSION", "8", "DIMS", "2", "*D99", "10", "0", "20", "0"],
      }),
      "t4",
    );
    expect(doc.entities).toHaveLength(0);
    expect(doc.stats.skipped["DIMENSION"]).toBe(1);
  });
});

describe("stripMtextCodes", () => {
  it("converts \\P to newline and strips format groups", () => {
    expect(stripMtextCodes("Line1\\PLine2")).toBe("Line1\nLine2");
    expect(stripMtextCodes("{\\fArial|b0;Hello} World")).toBe("Hello World");
    expect(stripMtextCodes("\\H2.5x;Tall")).toBe("Tall");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/map-dxf-extended.test.ts`
Expected: FAIL — `stripMtextCodes` not exported; extended entities land in `skipped`.

- [ ] **Step 3: Extend `convertEntity`** — add these cases before the final `skipped` fallthrough, plus the helpers below:

```ts
    case "TEXT": {
      const position = v((raw as Record<string, unknown>).startPoint, scale);
      const r = raw as { textHeight?: unknown; rotation?: unknown; text?: unknown };
      if (!position || typeof r.text !== "string") break;
      return [{
        ...base, id: idGen(), kind: "text", position, text: r.text,
        height: typeof r.textHeight === "number" ? r.textHeight * scale : 0.2,
        rotation: typeof r.rotation === "number" ? (r.rotation * Math.PI) / 180 : 0,
      }];
    }
    case "MTEXT": {
      const r = raw as { position?: unknown; height?: unknown; rotation?: unknown; text?: unknown };
      const position = v(r.position, scale);
      if (!position || typeof r.text !== "string") break;
      return [{
        ...base, id: idGen(), kind: "text", position,
        text: stripMtextCodes(r.text),
        height: typeof r.height === "number" ? r.height * scale : 0.2,
        rotation: typeof r.rotation === "number" ? (r.rotation * Math.PI) / 180 : 0,
      }];
    }
    case "POINT": {
      const position = v((raw as Record<string, unknown>).position, scale);
      if (!position) break;
      return [{ ...base, id: idGen(), kind: "point", position }];
    }
    case "ELLIPSE": {
      const r = raw as {
        center?: unknown; majorAxisEndPoint?: unknown; axisRatio?: unknown;
        startAngle?: unknown; endAngle?: unknown;
      };
      const center = v(r.center, scale);
      const majorAxis = v(r.majorAxisEndPoint, scale);
      if (!center || !majorAxis || typeof r.axisRatio !== "number") break;
      return [{
        ...base, id: idGen(), kind: "ellipse", center, majorAxis, ratio: r.axisRatio,
        startParam: typeof r.startAngle === "number" ? r.startAngle : 0,
        endParam: typeof r.endAngle === "number" ? r.endAngle : Math.PI * 2,
      }];
    }
    case "SPLINE": {
      const cps = ((raw as { controlPoints?: unknown[] }).controlPoints ?? [])
        .map((p) => v(p, scale))
        .filter((p): p is Vec2 => p !== null);
      if (cps.length < 2) break;
      warnings.push("SPLINE approximated by its control polygon.");
      return [{
        ...base, id: idGen(), kind: "polyline",
        vertices: cps, bulges: cps.map(() => 0), closed: false,
      }];
    }
    case "INSERT":
    case "DIMENSION": {
      if (depth >= 4) break; // runaway nesting guard
      const r = raw as {
        name?: unknown; block?: unknown; position?: unknown; anchorPoint?: unknown;
        xScale?: unknown; yScale?: unknown; rotation?: unknown;
      };
      const blockName = typeof r.name === "string" ? r.name
        : typeof r.block === "string" ? r.block : null;
      const block = blockName
        ? (dxf.blocks as Record<string, { entities?: RawEntity[]; position?: unknown } | undefined> | undefined)?.[blockName]
        : undefined;
      if (!block?.entities?.length) break; // unresolvable → skipped
      const insertAt = v(r.position, scale) ?? v(r.anchorPoint, scale) ?? { x: 0, y: 0 };
      const basePoint = v(block.position, scale) ?? { x: 0, y: 0 };
      const sx = typeof r.xScale === "number" ? r.xScale : 1;
      const sy = typeof r.yScale === "number" ? r.yScale : 1;
      const rot = typeof r.rotation === "number" ? (r.rotation * Math.PI) / 180 : 0;
      const out: CadEntity[] = [];
      for (const child of block.entities) {
        for (const e of convertEntity(child, scale, idGen, skipped, dxf, depth + 1)) {
          out.push(transformEntity(e, insertAt, basePoint, sx, sy, rot, blockName!));
        }
      }
      if (out.length) return out;
      break;
    }
```

Note: `convertEntity` needs `warnings: string[]` as a parameter for the SPLINE case — add it to the signature and thread it through the Task 3 call site.

- [ ] **Step 4: Add `stripMtextCodes` and `transformEntity` helpers**

```ts
/** Strip common MTEXT inline format codes; keep the visible text. */
export function stripMtextCodes(s: string): string {
  return s
    .replace(/\\P/g, "\n")                       // paragraph
    .replace(/\\[A-Za-z][^;{}\\]*;/g, "")        // \H2.5x; \fArial|b0; etc.
    .replace(/[{}]/g, "")                        // group braces
    .trim();
}

function xform(p: Vec2, at: Vec2, bp: Vec2, sx: number, sy: number, rot: number): Vec2 {
  const x = (p.x - bp.x) * sx, y = (p.y - bp.y) * sy;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: at.x + x * c - y * s, y: at.y + x * s + y * c };
}

function transformEntity(
  e: CadEntity, at: Vec2, bp: Vec2, sx: number, sy: number, rot: number, blockName: string,
): CadEntity {
  const t = (p: Vec2) => xform(p, at, bp, sx, sy, rot);
  const tagged = { ...e, fromBlock: blockName };
  switch (tagged.kind) {
    case "line": return { ...tagged, a: t(tagged.a), b: t(tagged.b) };
    case "polyline": return { ...tagged, vertices: tagged.vertices.map(t) };
    case "arc": {
      // Uniform scale assumed for radius; mirror/skew inserts are out of scope v1.
      return {
        ...tagged, center: t(tagged.center), radius: tagged.radius * Math.abs(sx),
        startAngle: tagged.startAngle + rot, endAngle: tagged.endAngle + rot,
      };
    }
    case "circle": return { ...tagged, center: t(tagged.center), radius: tagged.radius * Math.abs(sx) };
    case "ellipse": {
      const maj = xform(
        { x: tagged.majorAxis.x + bp.x, y: tagged.majorAxis.y + bp.y }, { x: 0, y: 0 }, bp, sx, sy, rot,
      );
      return { ...tagged, center: t(tagged.center), majorAxis: maj };
    }
    case "text": return { ...tagged, position: t(tagged.position), rotation: tagged.rotation + rot };
    case "point": return { ...tagged, position: t(tagged.position) };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/map-dxf-extended.test.ts src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts`
Expected: PASS (both files — Task 3 tests must not regress). If the SPLINE fixture is rejected by dxf-parser, log `doc.stats.skipped` — some versions need group 72/74 counts; add `"72", "0", "74", "0"` to the fixture rather than changing the implementation.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cad/doc/map-dxf-to-doc.ts src/lib/cad/doc/__tests__/map-dxf-extended.test.ts
git commit -m "feat(cad): map text, block inserts, dimensions, ellipse, spline, point"
```

---

### Task 5: Geometry builder (CadDocument → per-layer segment buffers)

**Files:**
- Create: `src/lib/cad/doc/build-geometry.ts`
- Test: `src/lib/cad/doc/__tests__/build-geometry.test.ts`

**Interfaces:**
- Consumes: `CadDocument`, tessellation helpers.
- Produces:

```ts
export interface LayerGeometry {
  layer: string;
  /** xyz triples, 2 points per segment: [x1,y1,0, x2,y2,0, ...] — ready for BufferAttribute. */
  positions: Float32Array;
  segmentCount: number;
}
export interface TextLabel {
  entityId: string; text: string; position: Vec2;
  height: number; rotation: number; layer: string; colorIndex?: number;
}
export function buildLayerGeometries(doc: CadDocument): { layers: LayerGeometry[]; texts: TextLabel[] }
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/cad/doc/__tests__/build-geometry.test.ts
import { describe, it, expect } from "vitest";
import { buildLayerGeometries } from "../build-geometry";
import type { CadDocument } from "../types";

function doc(entities: CadDocument["entities"]): CadDocument {
  return {
    id: "t", layers: [], entities, unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
    warnings: [], stats: { totalParsed: 0, mapped: entities.length, skipped: {} },
  };
}

describe("buildLayerGeometries", () => {
  it("groups segments by layer with xyz triples", () => {
    const { layers } = buildLayerGeometries(doc([
      { id: "e0", kind: "line", layer: "A", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { id: "e1", kind: "line", layer: "B", a: { x: 0, y: 0 }, b: { x: 0, y: 2 } },
      { id: "e2", kind: "line", layer: "A", a: { x: 1, y: 0 }, b: { x: 1, y: 1 } },
    ]));
    const a = layers.find((l) => l.layer === "A")!;
    expect(a.segmentCount).toBe(2);
    expect(a.positions).toHaveLength(2 * 2 * 3);
    expect([...a.positions.slice(0, 6)]).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("closes closed polylines and honors bulges", () => {
    const { layers } = buildLayerGeometries(doc([
      {
        id: "e0", kind: "polyline", layer: "P", closed: true,
        vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }],
        bulges: [0, 0, 0],
      },
    ]));
    expect(layers[0].segmentCount).toBe(3); // triangle: closing edge included
    const bulged = buildLayerGeometries(doc([
      {
        id: "e1", kind: "polyline", layer: "P", closed: false,
        vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }], bulges: [1, 0],
      },
    ]));
    expect(bulged.layers[0].segmentCount).toBeGreaterThan(10); // tessellated arc
  });

  it("extracts text entities as labels, not segments", () => {
    const { layers, texts } = buildLayerGeometries(doc([
      { id: "e0", kind: "text", layer: "N", position: { x: 1, y: 2 }, height: 0.25, rotation: 0, text: "Hi" },
    ]));
    expect(layers).toHaveLength(0);
    expect(texts).toEqual([{
      entityId: "e0", text: "Hi", position: { x: 1, y: 2 },
      height: 0.25, rotation: 0, layer: "N", colorIndex: undefined,
    }]);
  });

  it("tessellates circles into closed rings", () => {
    const { layers } = buildLayerGeometries(doc([
      { id: "e0", kind: "circle", layer: "C", center: { x: 0, y: 0 }, radius: 1 },
    ]));
    const ring = layers[0];
    // Ring closes: last segment ends where first begins.
    const n = ring.positions.length;
    expect(ring.positions[n - 3]).toBeCloseTo(ring.positions[0], 5);
    expect(ring.positions[n - 2]).toBeCloseTo(ring.positions[1], 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/build-geometry.test.ts`
Expected: FAIL — cannot resolve `../build-geometry`.

- [ ] **Step 3: Implement `build-geometry.ts`**

```ts
// src/lib/cad/doc/build-geometry.ts
// CadDocument → renderable per-layer line-segment buffers + text labels.
// Pure module — the R3F viewer consumes these outputs verbatim.

import type { CadDocument, CadEntity, Vec2 } from "./types";
import { arcPoints, bulgeArcPoints, circlePoints, ellipsePoints } from "./tessellate";

export interface LayerGeometry {
  layer: string;
  positions: Float32Array;
  segmentCount: number;
}

export interface TextLabel {
  entityId: string; text: string; position: Vec2;
  height: number; rotation: number; layer: string; colorIndex?: number;
}

/** Point-size cross for POINT entities, in meters. */
const POINT_CROSS_HALF = 0.05;

export function buildLayerGeometries(
  doc: CadDocument,
): { layers: LayerGeometry[]; texts: TextLabel[] } {
  const segsByLayer = new Map<string, number[]>();
  const texts: TextLabel[] = [];

  const push = (layer: string, a: Vec2, b: Vec2) => {
    let arr = segsByLayer.get(layer);
    if (!arr) segsByLayer.set(layer, (arr = []));
    arr.push(a.x, a.y, 0, b.x, b.y, 0);
  };
  const pushChain = (layer: string, pts: Vec2[], close = false) => {
    for (let i = 0; i < pts.length - 1; i++) push(layer, pts[i], pts[i + 1]);
    if (close && pts.length > 2) push(layer, pts[pts.length - 1], pts[0]);
  };

  for (const e of doc.entities) emit(e, push, pushChain, texts);

  const layers: LayerGeometry[] = [...segsByLayer.entries()].map(([layer, arr]) => ({
    layer,
    positions: new Float32Array(arr),
    segmentCount: arr.length / 6,
  }));
  return { layers, texts };
}

function emit(
  e: CadEntity,
  push: (layer: string, a: Vec2, b: Vec2) => void,
  pushChain: (layer: string, pts: Vec2[], close?: boolean) => void,
  texts: TextLabel[],
): void {
  switch (e.kind) {
    case "line": push(e.layer, e.a, e.b); return;
    case "polyline": {
      const n = e.vertices.length;
      const last = e.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = e.vertices[i], b = e.vertices[(i + 1) % n];
        if (e.bulges[i]) pushChain(e.layer, bulgeArcPoints(a, b, e.bulges[i]));
        else push(e.layer, a, b);
      }
      return;
    }
    case "arc": pushChain(e.layer, arcPoints(e.center, e.radius, e.startAngle, e.endAngle)); return;
    case "circle": pushChain(e.layer, circlePoints(e.center, e.radius), true); return;
    case "ellipse":
      pushChain(e.layer, ellipsePoints(e.center, e.majorAxis, e.ratio, e.startParam, e.endParam));
      return;
    case "text":
      texts.push({
        entityId: e.id, text: e.text, position: e.position,
        height: e.height, rotation: e.rotation, layer: e.layer, colorIndex: e.colorIndex,
      });
      return;
    case "point": {
      const p = e.position, h = POINT_CROSS_HALF;
      push(e.layer, { x: p.x - h, y: p.y }, { x: p.x + h, y: p.y });
      push(e.layer, { x: p.x, y: p.y - h }, { x: p.x, y: p.y + h });
      return;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/build-geometry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cad/doc/build-geometry.ts src/lib/cad/doc/__tests__/build-geometry.test.ts
git commit -m "feat(cad): per-layer segment buffer builder for the viewer"
```

---

### Task 6: Snap engine + viewport fit math

**Files:**
- Create: `src/lib/cad/doc/snap.ts`
- Create: `src/lib/cad/doc/viewport.ts`
- Test: `src/lib/cad/doc/__tests__/snap.test.ts`
- Test: `src/lib/cad/doc/__tests__/viewport.test.ts`

**Interfaces:**
- Consumes: `LayerGeometry` from `./build-geometry`; `Vec2`, `CadDocument` from `./types`.
- Produces:

```ts
// snap.ts
export interface SnapHit { point: Vec2; kind: "endpoint" | "midpoint" }
export function buildSnapIndex(layers: LayerGeometry[], visibleLayers: ReadonlySet<string>): SnapIndex
export function findSnap(index: SnapIndex, cursor: Vec2, radius: number): SnapHit | null
// viewport.ts
export interface ViewState { center: Vec2; /** world meters per CSS pixel */ scale: number }
export function computeFitView(extents: CadDocument["extents"], widthPx: number, heightPx: number, paddingFrac?: number): ViewState
export function worldToScreen(p: Vec2, view: ViewState, widthPx: number, heightPx: number): Vec2
export function screenToWorld(p: Vec2, view: ViewState, widthPx: number, heightPx: number): Vec2
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/cad/doc/__tests__/snap.test.ts
import { describe, it, expect } from "vitest";
import { buildSnapIndex, findSnap } from "../snap";
import type { LayerGeometry } from "../build-geometry";

const seg = (layer: string, x1: number, y1: number, x2: number, y2: number): LayerGeometry => ({
  layer, positions: new Float32Array([x1, y1, 0, x2, y2, 0]), segmentCount: 1,
});

describe("snap", () => {
  it("snaps to the nearest endpoint within radius", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set(["A"]));
    const hit = findSnap(idx, { x: 0.3, y: 0.2 }, 0.5);
    expect(hit).toEqual({ point: { x: 0, y: 0 }, kind: "endpoint" });
  });
  it("prefers endpoint over midpoint at equal distance", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 2, 0)], new Set(["A"]));
    const hit = findSnap(idx, { x: 0.5, y: 0 }, 0.6);
    expect(hit?.kind).toBe("endpoint"); // (0,0) at 0.5 beats midpoint (1,0) at 0.5
  });
  it("finds midpoints", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set(["A"]));
    const hit = findSnap(idx, { x: 5.1, y: 0.1 }, 0.5);
    expect(hit).toEqual({ point: { x: 5, y: 0 }, kind: "midpoint" });
  });
  it("ignores hidden layers and returns null when out of range", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set());
    expect(findSnap(idx, { x: 0, y: 0 }, 1)).toBeNull();
    const idx2 = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set(["A"]));
    expect(findSnap(idx2, { x: 50, y: 50 }, 1)).toBeNull();
  });
});
```

```ts
// src/lib/cad/doc/__tests__/viewport.test.ts
import { describe, it, expect } from "vitest";
import { computeFitView, screenToWorld, worldToScreen } from "../viewport";

describe("viewport", () => {
  const extents = { min: { x: 0, y: 0 }, max: { x: 100, y: 50 } };

  it("fits extents with padding, centered", () => {
    const view = computeFitView(extents, 1000, 1000, 0.05);
    expect(view.center).toEqual({ x: 50, y: 25 });
    // Width-limited: 100m across ≤ 900px usable → ≥ 0.1 m/px (padding on both sides)
    expect(view.scale).toBeCloseTo(100 / 900, 3);
  });

  it("round-trips world↔screen with Y flip", () => {
    const view = { center: { x: 50, y: 25 }, scale: 0.1 };
    const s = worldToScreen({ x: 50, y: 25 }, view, 800, 600);
    expect(s).toEqual({ x: 400, y: 300 }); // center of viewport
    const up = worldToScreen({ x: 50, y: 35 }, view, 800, 600);
    expect(up.y).toBeLessThan(300); // +Y world is up-screen
    const w = screenToWorld(s, view, 800, 600);
    expect(w.x).toBeCloseTo(50, 9);
    expect(w.y).toBeCloseTo(25, 9);
  });

  it("handles degenerate zero-size extents", () => {
    const view = computeFitView({ min: { x: 5, y: 5 }, max: { x: 5, y: 5 } }, 800, 600);
    expect(view.center).toEqual({ x: 5, y: 5 });
    expect(view.scale).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/snap.test.ts src/lib/cad/doc/__tests__/viewport.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `snap.ts`**

```ts
// src/lib/cad/doc/snap.ts
// Endpoint/midpoint snapping over segment buffers via a uniform grid hash.

import type { Vec2 } from "./types";
import type { LayerGeometry } from "./build-geometry";

export interface SnapHit { point: Vec2; kind: "endpoint" | "midpoint" }

interface SnapCandidate { x: number; y: number; kind: SnapHit["kind"] }

export interface SnapIndex {
  cellSize: number;
  cells: Map<string, SnapCandidate[]>;
}

const CELL_SIZE = 1; // meters — fine for building-scale drawings

const key = (cx: number, cy: number) => `${cx},${cy}`;

export function buildSnapIndex(
  layers: LayerGeometry[], visibleLayers: ReadonlySet<string>,
): SnapIndex {
  const cells = new Map<string, SnapCandidate[]>();
  const add = (x: number, y: number, kind: SnapHit["kind"]) => {
    const k = key(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE));
    let arr = cells.get(k);
    if (!arr) cells.set(k, (arr = []));
    arr.push({ x, y, kind });
  };
  for (const lg of layers) {
    if (!visibleLayers.has(lg.layer)) continue;
    const p = lg.positions;
    for (let i = 0; i < lg.segmentCount; i++) {
      const x1 = p[i * 6], y1 = p[i * 6 + 1], x2 = p[i * 6 + 3], y2 = p[i * 6 + 4];
      add(x1, y1, "endpoint");
      add(x2, y2, "endpoint");
      add((x1 + x2) / 2, (y1 + y2) / 2, "midpoint");
    }
  }
  return { cellSize: CELL_SIZE, cells };
}

export function findSnap(index: SnapIndex, cursor: Vec2, radius: number): SnapHit | null {
  const r = Math.max(0, radius);
  const minCx = Math.floor((cursor.x - r) / index.cellSize);
  const maxCx = Math.floor((cursor.x + r) / index.cellSize);
  const minCy = Math.floor((cursor.y - r) / index.cellSize);
  const maxCy = Math.floor((cursor.y + r) / index.cellSize);
  let best: SnapCandidate | null = null;
  let bestD = r;
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (const c of index.cells.get(key(cx, cy)) ?? []) {
        const d = Math.hypot(c.x - cursor.x, c.y - cursor.y);
        // Strictly-better distance, or tie broken in favor of endpoints.
        if (d < bestD || (d === bestD && best?.kind === "midpoint" && c.kind === "endpoint")) {
          if (d <= r) { best = c; bestD = d; }
        }
      }
    }
  }
  return best ? { point: { x: best.x, y: best.y }, kind: best.kind } : null;
}
```

Note on the tie test: iteration order may visit the endpoint first, making the midpoint "not strictly better" — the tie-break clause keeps the behavior deterministic either way.

- [ ] **Step 4: Implement `viewport.ts`**

```ts
// src/lib/cad/doc/viewport.ts
// Pure 2D viewport math shared by the R3F camera and the SVG markup overlay.
// Screen coords: CSS pixels, origin top-left, +y down. World: meters, +y up.

import type { CadDocument, Vec2 } from "./types";

export interface ViewState { center: Vec2; scale: number }

export function computeFitView(
  extents: CadDocument["extents"], widthPx: number, heightPx: number,
  paddingFrac = 0.05,
): ViewState {
  const w = extents.max.x - extents.min.x;
  const h = extents.max.y - extents.min.y;
  const center = {
    x: (extents.min.x + extents.max.x) / 2,
    y: (extents.min.y + extents.max.y) / 2,
  };
  const usableW = widthPx * (1 - paddingFrac * 2);
  const usableH = heightPx * (1 - paddingFrac * 2);
  if (w <= 0 && h <= 0) return { center, scale: 0.01 }; // 1cm/px default
  const scale = Math.max(w / Math.max(usableW, 1), h / Math.max(usableH, 1));
  return { center, scale: scale > 0 ? scale : 0.01 };
}

export function worldToScreen(
  p: Vec2, view: ViewState, widthPx: number, heightPx: number,
): Vec2 {
  return {
    x: widthPx / 2 + (p.x - view.center.x) / view.scale,
    y: heightPx / 2 - (p.y - view.center.y) / view.scale,
  };
}

export function screenToWorld(
  p: Vec2, view: ViewState, widthPx: number, heightPx: number,
): Vec2 {
  return {
    x: view.center.x + (p.x - widthPx / 2) * view.scale,
    y: view.center.y - (p.y - heightPx / 2) * view.scale,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cad/doc/__tests__/snap.test.ts src/lib/cad/doc/__tests__/viewport.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cad/doc/snap.ts src/lib/cad/doc/viewport.ts src/lib/cad/doc/__tests__/snap.test.ts src/lib/cad/doc/__tests__/viewport.test.ts
git commit -m "feat(cad): snap index and viewport math for the viewer"
```

---

### Task 7: Markup store (per-document, idb-keyval persistence)

**Files:**
- Create: `src/store/cad-markup-store.ts`
- Test: `src/store/__tests__/cad-markup-store.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `@/lib/cad/doc/types`; `get`/`set` from `idb-keyval` (prod adapter only).
- Produces:

```ts
export type CadTool = "pan" | "measure" | "note" | "leader" | "cloud" | "select";
export type CadMarkup =
  | { id: string; kind: "note"; position: Vec2; text: string }
  | { id: string; kind: "leader"; from: Vec2; to: Vec2; text: string }
  | { id: string; kind: "cloud"; min: Vec2; max: Vec2 }
  | { id: string; kind: "measure"; a: Vec2; b: Vec2 };
export interface MarkupStorage {
  load(docId: string): Promise<CadMarkup[] | undefined>;
  save(docId: string, markups: CadMarkup[]): Promise<void>;
}
useCadMarkupStore: { docId, markups, tool, addMarkup, updateMarkup, removeMarkup, clearAll, setTool, loadForDocument(docId), _setStorage(s: MarkupStorage) }
```

Distinct from `annotation-store.ts` (3D twin annotations anchored to BIM elements) — CAD markups live in 2D drawing space keyed by document id.

- [ ] **Step 1: Write the failing tests**

```ts
// src/store/__tests__/cad-markup-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCadMarkupStore, type CadMarkup, type MarkupStorage } from "../cad-markup-store";

function memoryStorage(): MarkupStorage & { data: Map<string, CadMarkup[]> } {
  const data = new Map<string, CadMarkup[]>();
  return {
    data,
    load: async (id) => data.get(id),
    save: async (id, m) => { data.set(id, m); },
  };
}

const note = (id: string): CadMarkup => ({
  id, kind: "note", position: { x: 1, y: 2 }, text: "hello",
});

describe("cad-markup-store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    useCadMarkupStore.getState()._setStorage(storage);
    useCadMarkupStore.setState({ docId: null, markups: [], tool: "pan" });
  });

  it("adds, updates, removes markups", () => {
    const s = useCadMarkupStore.getState();
    s.loadForDocument("doc1");
    useCadMarkupStore.getState().addMarkup(note("m1"));
    expect(useCadMarkupStore.getState().markups).toHaveLength(1);
    useCadMarkupStore.getState().updateMarkup("m1", { text: "edited" });
    expect(
      (useCadMarkupStore.getState().markups[0] as Extract<CadMarkup, { kind: "note" }>).text,
    ).toBe("edited");
    useCadMarkupStore.getState().removeMarkup("m1");
    expect(useCadMarkupStore.getState().markups).toHaveLength(0);
  });

  it("persists on mutation and restores on load", async () => {
    useCadMarkupStore.getState().loadForDocument("doc1");
    useCadMarkupStore.getState().addMarkup(note("m1"));
    await Promise.resolve(); // let async save flush
    expect(storage.data.get("doc1")).toHaveLength(1);

    useCadMarkupStore.getState().loadForDocument("doc2");
    expect(useCadMarkupStore.getState().markups).toHaveLength(0);

    useCadMarkupStore.getState().loadForDocument("doc1");
    await new Promise((r) => setTimeout(r, 0)); // async load
    expect(useCadMarkupStore.getState().markups).toHaveLength(1);
  });

  it("tool selection round-trips", () => {
    useCadMarkupStore.getState().setTool("measure");
    expect(useCadMarkupStore.getState().tool).toBe("measure");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/store/__tests__/cad-markup-store.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `cad-markup-store.ts`**

```ts
// src/store/cad-markup-store.ts
// 2D drawing-space markups, keyed by CadDocument id. Local-first via
// idb-keyval; storage is injectable so tests run without IndexedDB.
// NOT the 3D annotation-store — that anchors to BIM elements.

"use client";

import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Vec2 } from "@/lib/cad/doc/types";

export type CadTool = "pan" | "measure" | "note" | "leader" | "cloud" | "select";

export type CadMarkup =
  | { id: string; kind: "note"; position: Vec2; text: string }
  | { id: string; kind: "leader"; from: Vec2; to: Vec2; text: string }
  | { id: string; kind: "cloud"; min: Vec2; max: Vec2 }
  | { id: string; kind: "measure"; a: Vec2; b: Vec2 };

export interface MarkupStorage {
  load(docId: string): Promise<CadMarkup[] | undefined>;
  save(docId: string, markups: CadMarkup[]): Promise<void>;
}

const IDB_PREFIX = "cad-markups:";

const idbStorage: MarkupStorage = {
  load: (docId) => idbGet<CadMarkup[]>(`${IDB_PREFIX}${docId}`),
  save: (docId, markups) => idbSet(`${IDB_PREFIX}${docId}`, markups),
};

interface CadMarkupState {
  docId: string | null;
  markups: CadMarkup[];
  tool: CadTool;
  addMarkup: (m: CadMarkup) => void;
  updateMarkup: (id: string, patch: Partial<CadMarkup>) => void;
  removeMarkup: (id: string) => void;
  clearAll: () => void;
  setTool: (tool: CadTool) => void;
  /** Switches document context and hydrates its markups asynchronously. */
  loadForDocument: (docId: string) => void;
  /** Test seam. */
  _setStorage: (s: MarkupStorage) => void;
}

let storage: MarkupStorage = idbStorage;

export const useCadMarkupStore = create<CadMarkupState>()((set, get) => {
  const persist = () => {
    const { docId, markups } = get();
    if (docId) void storage.save(docId, markups).catch(() => {});
  };
  return {
    docId: null,
    markups: [],
    tool: "pan",
    addMarkup: (m) => { set((s) => ({ markups: [...s.markups, m] })); persist(); },
    updateMarkup: (id, patch) => {
      set((s) => ({
        markups: s.markups.map((m) =>
          m.id === id ? ({ ...m, ...patch } as CadMarkup) : m,
        ),
      }));
      persist();
    },
    removeMarkup: (id) => {
      set((s) => ({ markups: s.markups.filter((m) => m.id !== id) }));
      persist();
    },
    clearAll: () => { set({ markups: [] }); persist(); },
    setTool: (tool) => set({ tool }),
    loadForDocument: (docId) => {
      set({ docId, markups: [] });
      void storage.load(docId).then((loaded) => {
        // Guard against a doc switch racing the async load.
        if (loaded && get().docId === docId) set({ markups: loaded });
      }).catch(() => {});
    },
    _setStorage: (s) => { storage = s; },
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/store/__tests__/cad-markup-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/cad-markup-store.ts src/store/__tests__/cad-markup-store.test.ts
git commit -m "feat(cad): markup store with per-document idb persistence"
```

---

### Task 8: Viewer store + R3F viewer shell

**Files:**
- Create: `src/store/cad-viewer-store.ts`
- Create: `src/components/cad-viewer/use-cad-view.ts`
- Create: `src/components/cad-viewer/cad-scene.tsx`
- Create: `src/components/cad-viewer/layer-panel.tsx`
- Create: `src/components/cad-viewer/cad-viewer.tsx`
- Test: `src/store/__tests__/cad-viewer-store.test.ts`

**Interfaces:**
- Consumes: `CadDocument`, `buildLayerGeometries`, `computeFitView`/`ViewState`, `aciToHex`.
- Produces:
  - `useCadViewerStore`: `{ doc, layerVisibility: Record<string, boolean>, openViewer(doc), closeViewer(), toggleLayer(name), setAllLayers(visible) }`
  - `useCadView(extents)` hook: `{ view: ViewState, containerRef, handlers, fit() }` — pointer-drag pan, wheel zoom about cursor, drives BOTH the ortho camera and the SVG overlay from one `ViewState`.
  - `<CadViewer onUseFootprint={(polygon, areaSqm, layer) => void} />` full-screen overlay, rendered when `doc !== null`.

Design note: we deliberately do NOT use drei MapControls — a single `ViewState` (center + meters-per-pixel) shared by the Three camera and the SVG markup overlay eliminates all camera-sync drift. The camera is `<OrthographicCamera manual>` with `zoom = 1 / view.scale`, `position = [center.x, center.y, 10]`.

- [ ] **Step 1: Write the failing viewer-store test**

```ts
// src/store/__tests__/cad-viewer-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCadViewerStore } from "../cad-viewer-store";
import type { CadDocument } from "@/lib/cad/doc/types";

const doc: CadDocument = {
  id: "d1",
  layers: [
    { name: "WALLS", colorIndex: 1, visible: true },
    { name: "HIDDEN", colorIndex: 3, visible: false },
  ],
  entities: [], unitScaleToMeters: 1,
  extents: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  warnings: [], stats: { totalParsed: 0, mapped: 0, skipped: {} },
};

describe("cad-viewer-store", () => {
  beforeEach(() => useCadViewerStore.setState({ doc: null, layerVisibility: {} }));

  it("openViewer seeds visibility from the layer table", () => {
    useCadViewerStore.getState().openViewer(doc);
    const s = useCadViewerStore.getState();
    expect(s.doc?.id).toBe("d1");
    expect(s.layerVisibility).toEqual({ WALLS: true, HIDDEN: false });
  });

  it("toggleLayer flips one layer; setAllLayers floods", () => {
    useCadViewerStore.getState().openViewer(doc);
    useCadViewerStore.getState().toggleLayer("WALLS");
    expect(useCadViewerStore.getState().layerVisibility.WALLS).toBe(false);
    useCadViewerStore.getState().setAllLayers(true);
    expect(useCadViewerStore.getState().layerVisibility.HIDDEN).toBe(true);
  });

  it("closeViewer clears the doc", () => {
    useCadViewerStore.getState().openViewer(doc);
    useCadViewerStore.getState().closeViewer();
    expect(useCadViewerStore.getState().doc).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement the store**

Run: `pnpm vitest run src/store/__tests__/cad-viewer-store.test.ts` → FAIL.

```ts
// src/store/cad-viewer-store.ts
"use client";

import { create } from "zustand";
import type { CadDocument } from "@/lib/cad/doc/types";

interface CadViewerState {
  doc: CadDocument | null;
  layerVisibility: Record<string, boolean>;
  openViewer: (doc: CadDocument) => void;
  closeViewer: () => void;
  toggleLayer: (name: string) => void;
  setAllLayers: (visible: boolean) => void;
}

export const useCadViewerStore = create<CadViewerState>()((set) => ({
  doc: null,
  layerVisibility: {},
  openViewer: (doc) =>
    set({
      doc,
      layerVisibility: Object.fromEntries(doc.layers.map((l) => [l.name, l.visible])),
    }),
  closeViewer: () => set({ doc: null, layerVisibility: {} }),
  toggleLayer: (name) =>
    set((s) => ({ layerVisibility: { ...s.layerVisibility, [name]: !s.layerVisibility[name] } })),
  setAllLayers: (visible) =>
    set((s) => ({
      layerVisibility: Object.fromEntries(Object.keys(s.layerVisibility).map((k) => [k, visible])),
    })),
}));
```

Run again → PASS. Commit: `git add src/store/cad-viewer-store.ts src/store/__tests__/cad-viewer-store.test.ts && git commit -m "feat(cad): viewer store with layer visibility"`

- [ ] **Step 3: Implement `use-cad-view.ts`** (pan/zoom state hook; logic delegates to `viewport.ts` which is already tested)

```ts
// src/components/cad-viewer/use-cad-view.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CadDocument, Vec2 } from "@/lib/cad/doc/types";
import { computeFitView, screenToWorld, type ViewState } from "@/lib/cad/doc/viewport";

export function useCadView(extents: CadDocument["extents"]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<ViewState>(() => computeFitView(extents, 800, 600));
  const dragging = useRef<{ startPx: Vec2; startCenter: Vec2 } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(
    () => setView(computeFitView(extents, size.w, size.h)),
    [extents, size.w, size.h],
  );
  useEffect(() => { fit(); }, [fit]);

  const toLocal = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Middle button always pans; left button pans too (tools overlay stops
    // propagation before this handler when they claim the click).
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragging.current = { startPx: toLocal(e), startCenter: { ...view.center } };
  }, [view.center]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = toLocal(e);
    const { startPx, startCenter } = dragging.current;
    setView((v) => ({
      ...v,
      center: {
        x: startCenter.x - (p.x - startPx.x) * v.scale,
        y: startCenter.y + (p.y - startPx.y) * v.scale,
      },
    }));
  }, []);

  const onPointerUp = useCallback(() => { dragging.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const px = toLocal(e);
    setView((v) => {
      const factor = Math.exp(e.deltaY * 0.001);
      const anchor = screenToWorld(px, v, size.w, size.h);
      const scale = Math.min(100, Math.max(1e-4, v.scale * factor));
      // Keep the world point under the cursor fixed while zooming.
      return {
        scale,
        center: {
          x: anchor.x - (px.x - size.w / 2) * scale,
          y: anchor.y + (px.y - size.h / 2) * scale,
        },
      };
    });
  }, [size.w, size.h]);

  return {
    containerRef, view, size, fit, setView,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onWheel },
  } as const;
}
```

- [ ] **Step 4: Implement `cad-scene.tsx`** (pure-render R3F children — no controls; camera driven by props)

```tsx
// src/components/cad-viewer/cad-scene.tsx
"use client";

import { useMemo } from "react";
import { OrthographicCamera, Text } from "@react-three/drei";
import type { CadDocument } from "@/lib/cad/doc/types";
import { buildLayerGeometries } from "@/lib/cad/doc/build-geometry";
import { aciToHex } from "@/lib/cad/doc/aci-colors";
import type { ViewState } from "@/lib/cad/doc/viewport";

const MAX_TEXT_LABELS = 2000;

export function CadScene({
  doc, layerVisibility, view,
}: {
  doc: CadDocument;
  layerVisibility: Record<string, boolean>;
  view: ViewState;
}) {
  const { layers, texts } = useMemo(() => buildLayerGeometries(doc), [doc]);
  const layerColor = useMemo(
    () => new Map(doc.layers.map((l) => [l.name, aciToHex(l.colorIndex === 7 ? 250 : l.colorIndex)])),
    [doc.layers],
  );

  return (
    <>
      <OrthographicCamera
        makeDefault
        manual={false}
        position={[view.center.x, view.center.y, 10]}
        zoom={1 / view.scale}
        near={0.1}
        far={100}
      />
      {layers.map((lg) =>
        layerVisibility[lg.layer] === false ? null : (
          <lineSegments key={lg.layer} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[lg.positions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color={layerColor.get(lg.layer) ?? "#c8c8c8"} />
          </lineSegments>
        ),
      )}
      {texts.length <= MAX_TEXT_LABELS &&
        texts.map((t) =>
          layerVisibility[t.layer] === false ? null : (
            <Text
              key={t.entityId}
              position={[t.position.x, t.position.y, 0]}
              rotation={[0, 0, t.rotation]}
              fontSize={t.height}
              color={layerColor.get(t.layer) ?? "#c8c8c8"}
              anchorX="left"
              anchorY="bottom"
            >
              {t.text}
            </Text>
          ),
        )}
    </>
  );
}
```

Note: ACI 7 means "white on dark / black on light" — remap to a dark gray (`250`) since the viewer uses the app's light background. If canvas bg ends up dark, drop the remap.

- [ ] **Step 5: Implement `layer-panel.tsx`**

```tsx
// src/components/cad-viewer/layer-panel.tsx
"use client";

import { Eye, EyeOff } from "lucide-react";
import { aciToHex } from "@/lib/cad/doc/aci-colors";
import type { CadLayer } from "@/lib/cad/doc/types";

export function LayerPanel({
  layers, visibility, onToggle, onAll, isKo,
}: {
  layers: CadLayer[];
  visibility: Record<string, boolean>;
  onToggle: (name: string) => void;
  onAll: (visible: boolean) => void;
  isKo: boolean;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/20 p-2 text-sm">
      <div className="flex items-center justify-between px-1 pb-1 text-xs font-semibold text-muted-foreground">
        <span>{isKo ? "레이어" : "Layers"} ({layers.length})</span>
        <span className="flex gap-1">
          <button type="button" className="hover:text-foreground" onClick={() => onAll(true)} title={isKo ? "모두 표시" : "Show all"}>
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => onAll(false)} title={isKo ? "모두 숨기기" : "Hide all"}>
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {layers.map((l) => (
        <button
          key={l.name}
          type="button"
          data-testid={`cad-layer-${l.name}`}
          onClick={() => onToggle(l.name)}
          className={`flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted ${
            visibility[l.name] === false ? "opacity-40" : ""
          }`}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-sm border"
            style={{ backgroundColor: aciToHex(l.colorIndex) }}
          />
          <span className="truncate">{l.name}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement `cad-viewer.tsx` shell** (Canvas + panels; markup overlay arrives in Task 9)

```tsx
// src/components/cad-viewer/cad-viewer.tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { X, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { useCadViewerStore } from "@/store/cad-viewer-store";
import { CadScene } from "./cad-scene";
import { LayerPanel } from "./layer-panel";
import { useCadView } from "./use-cad-view";
import type { Polygon2D } from "@/lib/cad/dxf-parser";

export interface CadViewerProps {
  onUseFootprint?: (polygon: Polygon2D, areaSqm: number, layer: string) => void;
}

export function CadViewer({ onUseFootprint }: CadViewerProps) {
  const doc = useCadViewerStore((s) => s.doc);
  if (!doc) return null;
  return <CadViewerInner key={doc.id} onUseFootprint={onUseFootprint} />;
}

function CadViewerInner({ onUseFootprint }: CadViewerProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const doc = useCadViewerStore((s) => s.doc)!;
  const layerVisibility = useCadViewerStore((s) => s.layerVisibility);
  const toggleLayer = useCadViewerStore((s) => s.toggleLayer);
  const setAllLayers = useCadViewerStore((s) => s.setAllLayers);
  const closeViewer = useCadViewerStore((s) => s.closeViewer);

  const { containerRef, view, size, fit, handlers } = useCadView(doc.extents);
  const skippedTotal = Object.values(doc.stats.skipped).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" data-testid="cad-viewer">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">{doc.id}</span>
          <span className="text-xs text-muted-foreground">
            {doc.stats.mapped} {isKo ? "객체" : "entities"}
            {skippedTotal > 0 && ` · ${skippedTotal} ${isKo ? "건너뜀" : "skipped"}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={fit} title={isKo ? "전체 보기" : "Fit to extents"}>
            <Maximize className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={closeViewer} data-testid="cad-viewer-close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <LayerPanel
          layers={doc.layers}
          visibility={layerVisibility}
          onToggle={toggleLayer}
          onAll={setAllLayers}
          isKo={isKo}
        />
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 cursor-grab active:cursor-grabbing"
          {...handlers}
        >
          <Canvas orthographic frameloop="demand" gl={{ preserveDrawingBuffer: true }}>
            <color attach="background" args={["#fafafa"]} />
            <CadScene doc={doc} layerVisibility={layerVisibility} view={view} />
          </Canvas>
          {/* MarkupOverlay mounts here in Task 9, using {view, size} */}
        </div>
      </div>
      {/* Warnings strip */}
      {doc.warnings.length > 0 && (
        <div className="border-t px-3 py-1 text-xs text-muted-foreground">
          {doc.warnings.join(" · ")}
        </div>
      )}
    </div>
  );
}
```

Unused-var note: `onUseFootprint`, `view`, `size` become live in Task 9 — if lint blocks the commit, wire `void onUseFootprint;` temporarily is NOT allowed (no fake code); instead commit Tasks 8+9 wiring of the overlay together if needed.

- [ ] **Step 7: Type-check and commit**

Run: `pnpm build 2>&1 | tail -30`
Expected: compiles (Canvas/drei imports resolve; no type errors in new files).

```bash
git add src/components/cad-viewer/
git commit -m "feat(cad): R3F viewer shell - ortho scene, pan/zoom, layer panel"
```

---

### Task 9: Measure + markup overlay, use-as-footprint, upload integration

**Files:**
- Create: `src/lib/cad/doc/to-footprint.ts`
- Create: `src/lib/cad/doc/hit-test.ts`
- Create: `src/components/cad-viewer/markup-overlay.tsx`
- Create: `src/components/cad-viewer/viewer-toolbar.tsx`
- Modify: `src/components/cad-viewer/cad-viewer.tsx` (mount toolbar + overlay, footprint panel)
- Modify: `src/lib/cad/dwg-parser.ts` (return `dxfText` alongside `ParsedDxf`)
- Modify: `src/components/upload/upload-stage.tsx` ("Open in viewer" + footprint callback)
- Test: `src/lib/cad/doc/__tests__/to-footprint.test.ts`
- Test: `src/lib/cad/doc/__tests__/hit-test.test.ts`

**Interfaces:**
- Consumes: everything above; `Polygon2D` from `@/lib/cad/dxf-parser`.
- Produces:
  - `polylineToFootprint(pl: CadPolyline): { polygon: Polygon2D; areaSqm: number } | null` — tessellates bulges, centers at bbox origin (same convention as `parseDxfText`), null for <3 vertices or near-zero area.
  - `findClosedPolylineAt(doc: CadDocument, cursor: Vec2, tolerance: number): CadPolyline | null` — nearest closed polyline whose boundary passes within tolerance.
  - `parseDwgFile` return type becomes `ParsedDxf & { dxfText?: string }` (both WASM and server paths set it; header-fail path leaves it undefined).
  - Upload stage: `status.kind === "ready" | "needs-pick"` shows a "뷰어에서 열기 / Open in viewer" button when a `CadDocument` exists; viewer's `onUseFootprint` sets status to `ready` with `source` layer and closes the viewer.

- [ ] **Step 1: Write failing tests for the pure helpers**

```ts
// src/lib/cad/doc/__tests__/to-footprint.test.ts
import { describe, it, expect } from "vitest";
import { polylineToFootprint } from "../to-footprint";
import type { CadPolyline } from "../types";

const rect: CadPolyline = {
  id: "e0", kind: "polyline", layer: "OUTLINE", closed: true,
  vertices: [{ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 110 }, { x: 100, y: 110 }],
  bulges: [0, 0, 0, 0],
};

describe("polylineToFootprint", () => {
  it("centers at bbox origin and computes area", () => {
    const fp = polylineToFootprint(rect)!;
    expect(fp.areaSqm).toBeCloseTo(200, 6);
    expect(fp.polygon[0]).toEqual([-10, -5]);
    expect(fp.polygon[2]).toEqual([10, 5]);
  });
  it("rejects open or degenerate polylines", () => {
    expect(polylineToFootprint({ ...rect, closed: false })).toBeNull();
    expect(
      polylineToFootprint({ ...rect, vertices: rect.vertices.slice(0, 2), bulges: [0, 0] }),
    ).toBeNull();
  });
  it("tessellates bulged edges into the polygon", () => {
    const bulged = { ...rect, bulges: [1, 0, 0, 0] };
    const fp = polylineToFootprint(bulged)!;
    expect(fp.polygon.length).toBeGreaterThan(6);
  });
});
```

```ts
// src/lib/cad/doc/__tests__/hit-test.test.ts
import { describe, it, expect } from "vitest";
import { findClosedPolylineAt } from "../hit-test";
import type { CadDocument, CadPolyline } from "../types";

const ring = (id: string, x0: number): CadPolyline => ({
  id, kind: "polyline", layer: "L", closed: true,
  vertices: [{ x: x0, y: 0 }, { x: x0 + 10, y: 0 }, { x: x0 + 10, y: 10 }, { x: x0, y: 10 }],
  bulges: [0, 0, 0, 0],
});

const doc = (entities: CadDocument["entities"]): CadDocument => ({
  id: "t", layers: [], entities, unitScaleToMeters: 1,
  extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
  warnings: [], stats: { totalParsed: 0, mapped: 0, skipped: {} },
});

describe("findClosedPolylineAt", () => {
  it("hits the boundary within tolerance, misses the interior", () => {
    const d = doc([ring("a", 0)]);
    expect(findClosedPolylineAt(d, { x: 5, y: 0.2 }, 0.5)?.id).toBe("a");
    expect(findClosedPolylineAt(d, { x: 5, y: 5 }, 0.5)).toBeNull();
  });
  it("returns the nearest of overlapping candidates", () => {
    const d = doc([ring("a", 0), ring("b", 9)]);
    expect(findClosedPolylineAt(d, { x: 9.1, y: 5 }, 1)?.id).toBe("b");
  });
});
```

- [ ] **Step 2: Run to verify FAIL, then implement the helpers**

```ts
// src/lib/cad/doc/to-footprint.ts
// Closed CadPolyline → footprint polygon in the app-wide convention:
// meters, bbox-centered at origin, [x, y] pairs (== [x, z] world).

import type { Polygon2D } from "@/lib/cad/dxf-parser";
import type { CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";

const MIN_AREA_SQM = 1;

export function polylineToFootprint(
  pl: CadPolyline,
): { polygon: Polygon2D; areaSqm: number } | null {
  if (!pl.closed || pl.vertices.length < 3) return null;

  const pts: Vec2[] = [];
  const n = pl.vertices.length;
  for (let i = 0; i < n; i++) {
    const a = pl.vertices[i], b = pl.vertices[(i + 1) % n];
    if (pl.bulges[i]) {
      const arc = bulgeArcPoints(a, b, pl.bulges[i]);
      pts.push(...arc.slice(0, -1)); // drop shared endpoint
    } else {
      pts.push(a);
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const polygon: Polygon2D = pts.map((p) => [p.x - cx, p.y - cy]);

  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  const areaSqm = Math.abs(sum / 2);
  if (areaSqm < MIN_AREA_SQM) return null;
  return { polygon, areaSqm };
}
```

```ts
// src/lib/cad/doc/hit-test.ts
import type { CadDocument, CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 :
    Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function findClosedPolylineAt(
  doc: CadDocument, cursor: Vec2, tolerance: number,
): CadPolyline | null {
  let best: CadPolyline | null = null;
  let bestD = tolerance;
  for (const e of doc.entities) {
    if (e.kind !== "polyline" || !e.closed) continue;
    const n = e.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = e.vertices[i], b = e.vertices[(i + 1) % n];
      const chain = e.bulges[i] ? bulgeArcPoints(a, b, e.bulges[i]) : [a, b];
      for (let j = 0; j < chain.length - 1; j++) {
        const d = distToSegment(cursor, chain[j], chain[j + 1]);
        if (d <= bestD) { best = e; bestD = d; }
      }
    }
  }
  return best;
}
```

Run: `pnpm vitest run src/lib/cad/doc/__tests__/to-footprint.test.ts src/lib/cad/doc/__tests__/hit-test.test.ts` → PASS.
Commit: `git add src/lib/cad/doc/to-footprint.ts src/lib/cad/doc/hit-test.ts src/lib/cad/doc/__tests__/to-footprint.test.ts src/lib/cad/doc/__tests__/hit-test.test.ts && git commit -m "feat(cad): footprint conversion and closed-polyline hit test"`

- [ ] **Step 3: Implement `viewer-toolbar.tsx`** (tool buttons + snapshot)

```tsx
// src/components/cad-viewer/viewer-toolbar.tsx
"use client";

import { Hand, MousePointer, Ruler, StickyNote, MoveUpRight, Cloud, Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCadMarkupStore, type CadTool } from "@/store/cad-markup-store";

const TOOLS: { tool: CadTool; icon: typeof Hand; ko: string; en: string }[] = [
  { tool: "pan", icon: Hand, ko: "이동", en: "Pan" },
  { tool: "select", icon: MousePointer, ko: "선택", en: "Select" },
  { tool: "measure", icon: Ruler, ko: "측정", en: "Measure" },
  { tool: "note", icon: StickyNote, ko: "메모", en: "Note" },
  { tool: "leader", icon: MoveUpRight, ko: "지시선", en: "Leader" },
  { tool: "cloud", icon: Cloud, ko: "구름", en: "Cloud" },
];

export function ViewerToolbar({ isKo, onSnapshot }: { isKo: boolean; onSnapshot: () => void }) {
  const tool = useCadMarkupStore((s) => s.tool);
  const setTool = useCadMarkupStore((s) => s.setTool);
  const clearAll = useCadMarkupStore((s) => s.clearAll);
  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background/95 p-1 shadow-sm">
      {TOOLS.map(({ tool: t, icon: Icon, ko, en }) => (
        <Button
          key={t}
          type="button"
          size="sm"
          variant={tool === t ? "secondary" : "ghost"}
          onClick={() => setTool(t)}
          title={isKo ? ko : en}
          data-testid={`cad-tool-${t}`}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      <div className="mx-1 h-5 w-px bg-border" />
      <Button type="button" size="sm" variant="ghost" onClick={onSnapshot} title={isKo ? "PNG 저장" : "Save PNG"}>
        <Camera className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={clearAll} title={isKo ? "마크업 지우기" : "Clear markups"}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `markup-overlay.tsx`** (SVG overlay; all click tools live here)

```tsx
// src/components/cad-viewer/markup-overlay.tsx
// Screen-space SVG overlay for markups + measure + select. Renders from the
// same ViewState as the camera, so it can never drift from the drawing.
"use client";

import { useCallback, useState } from "react";
import type { CadDocument, Vec2 } from "@/lib/cad/doc/types";
import type { SnapIndex } from "@/lib/cad/doc/snap";
import { findSnap } from "@/lib/cad/doc/snap";
import { screenToWorld, worldToScreen, type ViewState } from "@/lib/cad/doc/viewport";
import { findClosedPolylineAt } from "@/lib/cad/doc/hit-test";
import { polylineToFootprint } from "@/lib/cad/doc/to-footprint";
import { useCadMarkupStore, type CadMarkup } from "@/store/cad-markup-store";
import type { Polygon2D } from "@/lib/cad/dxf-parser";

const SNAP_PX = 12;
const HIT_PX = 8;

export interface FootprintPick {
  polygon: Polygon2D; areaSqm: number; layer: string;
}

export function MarkupOverlay({
  doc, view, size, snapIndex, isKo, onFootprintPick,
}: {
  doc: CadDocument;
  view: ViewState;
  size: { w: number; h: number };
  snapIndex: SnapIndex;
  isKo: boolean;
  onFootprintPick: (pick: FootprintPick) => void;
}) {
  const tool = useCadMarkupStore((s) => s.tool);
  const markups = useCadMarkupStore((s) => s.markups);
  const addMarkup = useCadMarkupStore((s) => s.addMarkup);
  const removeMarkup = useCadMarkupStore((s) => s.removeMarkup);
  const [pending, setPending] = useState<Vec2 | null>(null); // first click of 2-click tools
  const [hover, setHover] = useState<Vec2 | null>(null);

  const toWorld = useCallback((e: React.MouseEvent<SVGSVGElement>): Vec2 => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = { x: e.clientX - r.left, y: e.clientY - r.top };
    const w = screenToWorld(px, view, size.w, size.h);
    const snap = findSnap(snapIndex, w, SNAP_PX * view.scale);
    return snap ? snap.point : w;
  }, [view, size.w, size.h, snapIndex]);

  const S = useCallback(
    (p: Vec2) => worldToScreen(p, view, size.w, size.h),
    [view, size.w, size.h],
  );

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "pan") return; // transparent to pan (pointer-events off)
    e.stopPropagation();
    const w = toWorld(e);
    const id = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

    if (tool === "select") {
      const hitPl = findClosedPolylineAt(doc, w, HIT_PX * view.scale);
      if (hitPl) {
        const fp = polylineToFootprint(hitPl);
        if (fp) onFootprintPick({ ...fp, layer: hitPl.layer });
      }
      return;
    }
    if (tool === "note") {
      const text = window.prompt(isKo ? "메모 내용:" : "Note text:");
      if (text) addMarkup({ id, kind: "note", position: w, text });
      return;
    }
    if (tool === "measure" || tool === "leader" || tool === "cloud") {
      if (!pending) { setPending(w); return; }
      if (tool === "measure") addMarkup({ id, kind: "measure", a: pending, b: w });
      if (tool === "cloud") addMarkup({
        id, kind: "cloud",
        min: { x: Math.min(pending.x, w.x), y: Math.min(pending.y, w.y) },
        max: { x: Math.max(pending.x, w.x), y: Math.max(pending.y, w.y) },
      });
      if (tool === "leader") {
        const text = window.prompt(isKo ? "지시선 내용:" : "Leader text:");
        if (text) addMarkup({ id, kind: "leader", from: pending, to: w, text });
      }
      setPending(null);
    }
  }, [tool, toWorld, pending, doc, view.scale, addMarkup, onFootprintPick, isKo]);

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: tool === "pan" ? "none" : "auto" }}
      onClick={handleClick}
      onMouseMove={(e) => setHover(toWorld(e))}
      data-testid="cad-markup-overlay"
    >
      {markups.map((m) => (
        <MarkupGlyph key={m.id} m={m} S={S} onDelete={() => removeMarkup(m.id)} />
      ))}
      {/* live preview for 2-click tools */}
      {pending && hover && (
        <line
          x1={S(pending).x} y1={S(pending).y} x2={S(hover).x} y2={S(hover).y}
          stroke="#f59e0b" strokeDasharray="4 3"
        />
      )}
      {/* snap indicator */}
      {hover && tool !== "pan" && (
        <circle cx={S(hover).x} cy={S(hover).y} r={4} fill="none" stroke="#f59e0b" />
      )}
    </svg>
  );
}

function MarkupGlyph({
  m, S, onDelete,
}: { m: CadMarkup; S: (p: Vec2) => Vec2; onDelete: () => void }) {
  const del = (e: React.MouseEvent) => {
    if (e.altKey) { e.stopPropagation(); onDelete(); }
  };
  switch (m.kind) {
    case "note": {
      const p = S(m.position);
      return (
        <g onClick={del}>
          <rect x={p.x} y={p.y - 18} width={Math.max(40, m.text.length * 7.5)} height={18}
            rx={3} fill="#fef3c7" stroke="#f59e0b" />
          <text x={p.x + 4} y={p.y - 5} fontSize={12} fill="#78350f">{m.text}</text>
        </g>
      );
    }
    case "measure": {
      const a = S(m.a), b = S(m.b);
      const dist = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return (
        <g onClick={del}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2563eb" strokeWidth={1.5} />
          <circle cx={a.x} cy={a.y} r={3} fill="#2563eb" />
          <circle cx={b.x} cy={b.y} r={3} fill="#2563eb" />
          <text x={mid.x + 5} y={mid.y - 5} fontSize={12} fill="#1e40af" fontWeight={600}>
            {dist < 1 ? `${(dist * 100).toFixed(1)} cm` : `${dist.toFixed(2)} m`}
          </text>
        </g>
      );
    }
    case "leader": {
      const f = S(m.from), t = S(m.to);
      return (
        <g onClick={del}>
          <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#dc2626" strokeWidth={1.5}
            markerEnd="url(#cad-arrow)" />
          <text x={t.x + 5} y={t.y - 3} fontSize={12} fill="#991b1b">{m.text}</text>
          <defs>
            <marker id="cad-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
            </marker>
          </defs>
        </g>
      );
    }
    case "cloud": {
      const a = S({ x: m.min.x, y: m.max.y }); // top-left on screen
      const b = S({ x: m.max.x, y: m.min.y });
      return (
        <rect onClick={del} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y}
          rx={10} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="1 6"
          strokeLinecap="round" />
      );
    }
  }
}
```

(Alt+click deletes a markup; revision cloud is a dotted-arc rounded rect — visually cloud-like without arc math.)

- [ ] **Step 5: Wire toolbar + overlay + footprint panel into `cad-viewer.tsx`**

Inside `CadViewerInner`: build the snap index and mount the pieces.

```tsx
// additions at top of CadViewerInner
const markupsDocLoad = useCadMarkupStore((s) => s.loadForDocument);
const tool = useCadMarkupStore((s) => s.tool);
const [pick, setPick] = useState<FootprintPick | null>(null);
const glRef = useRef<HTMLCanvasElement | null>(null);
const { layers } = useMemo(() => buildLayerGeometries(doc), [doc]);
const snapIndex = useMemo(
  () => buildSnapIndex(layers, new Set(
    Object.entries(layerVisibility).filter(([, v]) => v).map(([k]) => k),
  )),
  [layers, layerVisibility],
);
useEffect(() => { markupsDocLoad(doc.id); }, [doc.id, markupsDocLoad]);

const snapshot = useCallback(() => {
  const canvas = glRef.current;
  if (!canvas) return;
  const a = document.createElement("a");
  a.download = `${doc.id}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}, [doc.id]);
```

- Canvas gains `onCreated={(state) => { glRef.current = state.gl.domElement; }}`.
- Toolbar floats top-center: `<div className="absolute left-1/2 top-2 z-10 -translate-x-1/2"><ViewerToolbar isKo={isKo} onSnapshot={snapshot} /></div>` inside the canvas container.
- `<MarkupOverlay doc={doc} view={view} size={{ w: size.w, h: size.h }} snapIndex={snapIndex} isKo={isKo} onFootprintPick={setPick} />` mounts after the Canvas.
- Pan gating: wrap `handlers` so pointer-drag pan only engages when `tool === "pan"` or the middle button is used (`e.button === 1`); other tools get clicks via the overlay.
- Footprint pick panel (bottom bar) when `pick !== null`:

```tsx
{pick && (
  <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-background/95 px-3 py-2 shadow">
    <span className="text-sm">
      {isKo ? "레이어" : "Layer"}: <code>{pick.layer}</code> · {pick.areaSqm.toFixed(0)} m²
    </span>
    <Button type="button" size="sm" data-testid="cad-use-footprint"
      onClick={() => { onUseFootprint?.(pick.polygon, pick.areaSqm, pick.layer); setPick(null); }}>
      {isKo ? "바닥 외곽선으로 사용" : "Use as footprint"}
    </Button>
    <Button type="button" size="sm" variant="ghost" onClick={() => setPick(null)}>✕</Button>
  </div>
)}
```

- [ ] **Step 6: Return `dxfText` from `parseDwgFile`**

In `src/lib/cad/dwg-parser.ts`: change the return type to `Promise<ParsedDxf & { dxfText?: string }>` and:
- WASM success path (`const parsed = parseDxfText(dxfText); return { ...parsed, ... }`) → add `dxfText` to the returned object.
- `convertViaServer` success path (same shape) → add `dxfText`.
- Failure paths unchanged (no `dxfText`).
Run: `pnpm vitest run src/lib/cad/__tests__/dwg-parser.test.ts` → PASS (additive field).

- [ ] **Step 7: Integrate into `upload-stage.tsx`**

- Add state: `const [cadDoc, setCadDoc] = useState<CadDocument | null>(null);`
- In `ingestDxf`, after a successful parse (any candidate count): `setCadDoc(mapDxfTextToDoc(text, fileNameRef.current ?? "drawing.dxf"))` — keep the uploaded file name in a ref set inside `processFile`.
- In the DWG branch: if `parsed.dxfText` exists, `setCadDoc(mapDxfTextToDoc(parsed.dxfText, file.name))`.
- PDF branch: `setCadDoc(null)`.
- Render near the ready/needs-pick blocks:

```tsx
{cadDoc && (status.kind === "ready" || status.kind === "needs-pick") && (
  <Button type="button" variant="outline" data-testid="open-cad-viewer"
    onClick={() => openViewer(cadDoc)}>
    <Eye className="mr-1.5 h-4 w-4" />
    {t("뷰어에서 열기", "Open in viewer", isKo)}
  </Button>
)}
<CadViewer
  onUseFootprint={(polygon, areaSqm, layer) => {
    setStatus({ kind: "ready", polygon, layer, areaSqm, warnings: [] });
    closeViewer();
  }}
/>
```

with `openViewer`/`closeViewer` from `useCadViewerStore`, `CadViewer` imported from `@/components/cad-viewer/cad-viewer`, and `Eye` from lucide.

- [ ] **Step 8: Verify, then commit**

Run: `pnpm vitest run src/lib/cad src/store` → all PASS.
Run: `pnpm build 2>&1 | tail -30` → compiles.

```bash
git add src/components/cad-viewer/ src/components/upload/upload-stage.tsx src/lib/cad/dwg-parser.ts src/lib/cad/doc/
git commit -m "feat(cad): markup tools, measure, use-as-footprint, upload integration"
```

---

### Task 10: Full verification, docs, deploy

**Files:**
- Modify: `src/lib/cad/README.md` (document `doc/` modules + viewer flow)
- Modify: `CLAUDE.md` (one Architecture bullet for `src/lib/cad/doc/` + viewer)

- [ ] **Step 1: Full test suite** — `pnpm vitest run 2>&1 | tail -12` → all green (was 1082 tests; expect ~+30).
- [ ] **Step 2: Production build** — `pnpm build 2>&1 | tail -30` → success, no type errors.
- [ ] **Step 3: Manual smoke via dev server + Playwright MCP** — upload `docs/samples/sample-footprint.dxf`, open viewer, verify: drawing renders, layer toggle hides geometry, measure shows plausible meters, note persists after viewer close/reopen, "Use as footprint" returns to upload-ready with the same area the LayerPicker showed. Screenshot for the record.
- [ ] **Step 4: Update `src/lib/cad/README.md`** — add a `doc/` section: types, mapper, build-geometry, snap, viewport, to-footprint, hit-test; extend the flow diagram with the viewer branch.
- [ ] **Step 5: Update `CLAUDE.md`** — add under Architecture: `src/lib/cad/doc/` — CadDocument model + viewer geometry (mapper, tessellation, snap, viewport math); `src/components/cad-viewer/` — in-browser DWG/DXF viewer with markup.
- [ ] **Step 6: Commit docs, deploy to prod** per standing instruction (clean worktree → `pnpm dlx vercel --prod`), verify deployment URL loads.

---

## Self-Review Notes

- Spec coverage: document model (T1), parsing/mapping (T3–T4), renderer/viewport (T5–T6, T8), markup/measure (T7, T9), integration + use-as-footprint (T9), testing (every task + T10). HATCH boundary downgraded to counted-skip — npm dxf-parser exposes no hatch boundary data; recorded as accepted risk (spec already lists hatches as boundary-only/at-risk).
- Type consistency: `LayerGeometry.positions` is xyz-triples everywhere (builder, snap index reads stride 6, scene BufferAttribute size 3). `ViewState.scale` is meters-per-pixel in all of viewport.ts, use-cad-view, overlay, and camera `zoom = 1/scale`.
- Deferred (phase 1 non-goals confirmed): editing source entities, DXF export, xrefs, SHX fonts, dimension re-association.



