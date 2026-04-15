# CAD Upload Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining items from the CAD upload unification spec — `BIM_OUTLINE` DXF layer convention, two-point ruler PDF calibration, and a shared `FootprintIngestResult` contract across all three ingest paths.

**Architecture:** Introduce one new module (`src/lib/cad/ingest-result.ts`) that every path (DXF, DWG, PDF) funnels through so downstream code sees `{ polygon, areaSqm, source, confidence, layer, warnings }` regardless of format. Extend the existing DXF parser with case-insensitive `BIM_OUTLINE` priority so multi-candidate DXFs skip the picker when the convention is followed. Replace the PDF "approximate width" guess with a two-point ruler that captures real-world distance between two user-clicked points.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, vitest + happy-dom, @testing-library/react, dxf-parser 1.1.2, pdfjs-dist 5.x, libdxfrw WASM (shipped).

**Spec:** `docs/superpowers/specs/2026-04-13-cad-upload-unification-design.md`

---

## File Structure

**New files:**
- `src/lib/cad/ingest-result.ts` — shared `FootprintIngestResult` type + builder helpers that wrap parser outputs with `source` + `confidence`.
- `src/lib/cad/__tests__/ingest-result.test.ts` — unit tests for the builders.
- `src/components/upload/__tests__/pdf-tracer.test.tsx` — component tests for the two-point ruler UX.

**Modified files:**
- `src/lib/cad/dxf-parser.ts` — add `BIM_OUTLINE` priority in candidate selection (non-breaking: output shape unchanged).
- `src/lib/cad/pdf-to-polygon.ts` — accept `metersPerPixel` directly; keep the existing `realWorldWidthMeters` path for backward compatibility only until `pdf-tracer.tsx` is updated.
- `src/lib/cad/__tests__/dxf-parser.test.ts` — fixtures and assertions for `BIM_OUTLINE` priority.
- `src/lib/cad/__tests__/pdf-to-polygon.test.ts` — tests for the `metersPerPixel` path.
- `src/components/upload/pdf-tracer.tsx` — two-phase UX (ruler first, then trace).
- `src/components/upload/layer-picker.tsx` — add `BIM_OUTLINE` tip banner.
- `src/components/upload/upload-stage.tsx` — call builders so every path emits `FootprintIngestResult`; use `BIM_OUTLINE` auto-skip; handle the revised PDF tracer signature.
- `src/components/upload/__tests__/upload-stage.test.tsx` — new assertions for auto-skip + provenance.
- `CLAUDE.md` — short section documenting the `BIM_OUTLINE` convention.

---

## Task 1: `FootprintIngestResult` contract + builders

**Files:**
- Create: `src/lib/cad/ingest-result.ts`
- Test: `src/lib/cad/__tests__/ingest-result.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cad/__tests__/ingest-result.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  dxfResult,
  dwgResult,
  pdfResult,
  type FootprintIngestResult,
} from "../ingest-result";

const samplePolygon: [number, number][] = [
  [-5, -4],
  [5, -4],
  [5, 4],
  [-5, 4],
];

describe("ingest-result builders", () => {
  it("dxfResult sets source=dxf, confidence=exact, preserves layer + warnings", () => {
    const result: FootprintIngestResult = dxfResult({
      polygon: samplePolygon,
      areaSqm: 80,
      layer: "FOOTPRINT",
      warnings: ["something"],
    });
    expect(result.source).toBe("dxf");
    expect(result.confidence).toBe("exact");
    expect(result.layer).toBe("FOOTPRINT");
    expect(result.polygon).toBe(samplePolygon);
    expect(result.areaSqm).toBe(80);
    expect(result.warnings).toEqual(["something"]);
  });

  it("dwgResult sets source=dwg, confidence=converted, uses DXF layer when present", () => {
    const result = dwgResult({
      polygon: samplePolygon,
      areaSqm: 80,
      layer: "OUTLINE",
      warnings: [],
    });
    expect(result.source).toBe("dwg");
    expect(result.confidence).toBe("converted");
    expect(result.layer).toBe("OUTLINE");
  });

  it("dwgResult falls back to 'dwg-converted' when no DXF layer is available", () => {
    const result = dwgResult({
      polygon: samplePolygon,
      areaSqm: 80,
      layer: null,
      warnings: [],
    });
    expect(result.layer).toBe("dwg-converted");
  });

  it("pdfResult sets source=pdf, confidence=traced, layer=pdf-trace", () => {
    const result = pdfResult({
      polygon: samplePolygon,
      areaSqm: 80,
      warnings: [],
    });
    expect(result.source).toBe("pdf");
    expect(result.confidence).toBe("traced");
    expect(result.layer).toBe("pdf-trace");
  });

  it("all builders default warnings to [] when omitted", () => {
    expect(dxfResult({ polygon: samplePolygon, areaSqm: 80, layer: "A" }).warnings).toEqual([]);
    expect(dwgResult({ polygon: samplePolygon, areaSqm: 80, layer: null }).warnings).toEqual([]);
    expect(pdfResult({ polygon: samplePolygon, areaSqm: 80 }).warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/cad/__tests__/ingest-result.test.ts`
Expected: FAIL — module `../ingest-result` does not exist.

- [ ] **Step 3: Create the module**

Create `src/lib/cad/ingest-result.ts`:

```ts
// src/lib/cad/ingest-result.ts
// Shared output contract for all CAD ingest paths (DXF, DWG, PDF).
// Downstream code reads `source` + `confidence` to reason about reliability
// without caring which parser produced the polygon.

import type { Polygon2D } from "./dxf-parser";

export type IngestSource = "dxf" | "dwg" | "pdf";
export type IngestConfidence = "exact" | "converted" | "traced";

export interface FootprintIngestResult {
  polygon: Polygon2D;
  areaSqm: number;
  source: IngestSource;
  confidence: IngestConfidence;
  /** DXF layer name, or a synthetic tag for non-DXF sources. */
  layer: string;
  warnings: string[];
}

interface DxfInput {
  polygon: Polygon2D;
  areaSqm: number;
  layer: string;
  warnings?: string[];
}

interface DwgInput {
  polygon: Polygon2D;
  areaSqm: number;
  /** DXF layer name from the converted DXF, or `null` if unavailable. */
  layer: string | null;
  warnings?: string[];
}

interface PdfInput {
  polygon: Polygon2D;
  areaSqm: number;
  warnings?: string[];
}

export function dxfResult(input: DxfInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "dxf",
    confidence: "exact",
    layer: input.layer,
    warnings: input.warnings ?? [],
  };
}

export function dwgResult(input: DwgInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "dwg",
    confidence: "converted",
    layer: input.layer ?? "dwg-converted",
    warnings: input.warnings ?? [],
  };
}

export function pdfResult(input: PdfInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "pdf",
    confidence: "traced",
    layer: "pdf-trace",
    warnings: input.warnings ?? [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/cad/__tests__/ingest-result.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cad/ingest-result.ts src/lib/cad/__tests__/ingest-result.test.ts
git commit -m "feat(cad): add FootprintIngestResult contract with source/confidence builders"
```

---

## Task 2: `BIM_OUTLINE` priority in DXF parser

**Files:**
- Modify: `src/lib/cad/dxf-parser.ts`
- Modify: `src/lib/cad/__tests__/dxf-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/cad/__tests__/dxf-parser.test.ts` at the bottom (before the closing brace of the file, inside a new `describe` block):

```ts
describe("parseDxfText — BIM_OUTLINE layer priority", () => {
  function buildBimOutlinePriorityFixture(outlineLayerName: string): string {
    // Two closed LWPOLYLINE rectangles — the BIM_OUTLINE one is SMALLER so
    // area-ranking alone would pick the other. BIM_OUTLINE must still win.
    return dxf([
      [0, "SECTION"], [2, "HEADER"],
      [9, "$INSUNITS"], [70, 6], // meters
      [0, "ENDSEC"],
      [0, "SECTION"], [2, "ENTITIES"],
      // Larger ring on a non-BIM layer (40 × 30 = 1200 m²)
      [0, "LWPOLYLINE"],
      [8, "RANDOM"],
      [90, 4], [70, 1],
      [10, 0],  [20, 0],
      [10, 40], [20, 0],
      [10, 40], [20, 30],
      [10, 0],  [20, 30],
      // BIM_OUTLINE ring (15 × 10 = 150 m² — smaller than the decoy)
      [0, "LWPOLYLINE"],
      [8, outlineLayerName],
      [90, 4], [70, 1],
      [10, 100], [20, 100],
      [10, 115], [20, 100],
      [10, 115], [20, 110],
      [10, 100], [20, 110],
      [0, "ENDSEC"],
      [0, "EOF"],
    ]);
  }

  it("ranks BIM_OUTLINE first even when another ring has a larger area", () => {
    const text = buildBimOutlinePriorityFixture("BIM_OUTLINE");
    const result = parseDxfText(text);
    expect(result.candidates[0].layer).toBe("BIM_OUTLINE");
    expect(result.candidates[0].areaSqm).toBeCloseTo(150, 3);
    expect(result.candidates[1].layer).toBe("RANDOM");
  });

  it("matches BIM_OUTLINE case-insensitively", () => {
    const text = buildBimOutlinePriorityFixture("bim_outline");
    const result = parseDxfText(text);
    expect(result.candidates[0].layer.toLowerCase()).toBe("bim_outline");
  });

  it("also matches hyphenated BIM-OUTLINE", () => {
    const text = buildBimOutlinePriorityFixture("BIM-OUTLINE");
    const result = parseDxfText(text);
    expect(result.candidates[0].layer).toBe("BIM-OUTLINE");
  });

  it("falls back to area ranking when BIM_OUTLINE layer is absent", () => {
    const text = buildBimOutlinePriorityFixture("FOOTPRINT");
    const result = parseDxfText(text);
    // RANDOM (1200 m²) is larger than FOOTPRINT (150 m²) and should win.
    expect(result.candidates[0].layer).toBe("RANDOM");
  });

  it("rejects under-threshold BIM_OUTLINE rings like any other (no special bypass)", () => {
    // A 2×2 BIM_OUTLINE ring = 4 m², below MIN_AREA_SQM=10, must be filtered.
    const text = dxf([
      [0, "SECTION"], [2, "HEADER"],
      [9, "$INSUNITS"], [70, 6],
      [0, "ENDSEC"],
      [0, "SECTION"], [2, "ENTITIES"],
      [0, "LWPOLYLINE"],
      [8, "BIM_OUTLINE"],
      [90, 4], [70, 1],
      [10, 0], [20, 0],
      [10, 2], [20, 0],
      [10, 2], [20, 2],
      [10, 0], [20, 2],
      [0, "ENDSEC"],
      [0, "EOF"],
    ]);
    const result = parseDxfText(text);
    expect(result.candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/cad/__tests__/dxf-parser.test.ts`
Expected: FAIL — `result.candidates[0].layer` will be `"RANDOM"` (area-ranked) instead of `"BIM_OUTLINE"` in the priority cases.

- [ ] **Step 3: Implement priority in `parseDxfText`**

Modify `src/lib/cad/dxf-parser.ts`. Locate this existing block near the bottom of `parseDxfText`:

```ts
  // Rank by area descending — the outer footprint is usually the largest ring.
  candidates.sort((a, b) => b.areaSqm - a.areaSqm);

  return { candidates, unitScaleToMeters, warnings };
}
```

Replace it with:

```ts
  // Rank by BIM_OUTLINE layer convention first (case-insensitive, optional
  // hyphen/underscore), then by area descending for ties and non-BIM layers.
  // A well-authored DXF names its building outline `BIM_OUTLINE` so the
  // upload-stage can skip the layer picker entirely.
  candidates.sort((a, b) => {
    const aIsOutline = BIM_OUTLINE_PATTERN.test(a.layer);
    const bIsOutline = BIM_OUTLINE_PATTERN.test(b.layer);
    if (aIsOutline && !bIsOutline) return -1;
    if (bIsOutline && !aIsOutline) return 1;
    return b.areaSqm - a.areaSqm;
  });

  return { candidates, unitScaleToMeters, warnings };
}
```

Add this constant and helper just below the existing `MAX_REASONABLE_AREA_SQM` constant (around line 79):

```ts
/**
 * Reserved DXF layer name for the building outline.
 *
 * When a candidate matches this pattern (case-insensitive, optional
 * hyphen/underscore), it is promoted above area-ranked peers so the upload UI
 * can skip the layer picker. Matches: BIM_OUTLINE, bim_outline, BIM-OUTLINE,
 * BIMOUTLINE.
 */
export const BIM_OUTLINE_PATTERN = /^bim[_-]?outline$/i;
```

Also export the pattern so `upload-stage.tsx` can use the same matcher for its auto-skip check.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/cad/__tests__/dxf-parser.test.ts`
Expected: PASS — all existing tests still green, 5 new BIM_OUTLINE tests added.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cad/dxf-parser.ts src/lib/cad/__tests__/dxf-parser.test.ts
git commit -m "feat(cad): add BIM_OUTLINE layer priority in DXF parser

Candidates on a layer matching /^bim[_-]?outline\$/i are ranked ahead of
larger rings on other layers. Area-ranking remains the fallback when the
convention is not used. Sub-threshold rings (< MIN_AREA_SQM) are still
filtered regardless of layer name."
```

---

## Task 3: `pdfToPolygon` accepts `metersPerPixel` directly

**Files:**
- Modify: `src/lib/cad/pdf-to-polygon.ts`
- Modify: `src/lib/cad/__tests__/pdf-to-polygon.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/cad/__tests__/pdf-to-polygon.test.ts` at the bottom:

```ts
describe("pdfToPolygon — metersPerPixel calibration (two-point ruler)", () => {
  it("accepts metersPerPixel directly and scales the polygon", () => {
    // 100×80 pixel rectangle with metersPerPixel=0.1 → 10×8 m = 80 m²
    const result = pdfToPolygon({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ],
      metersPerPixel: 0.1,
    })!;
    expect(result).not.toBeNull();
    expect(result.metersPerPixel).toBeCloseTo(0.1, 9);
    expect(result.areaSqm).toBeCloseTo(80, 3);
  });

  it("returns null when metersPerPixel is not positive", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    expect(pdfToPolygon({ points: pts, metersPerPixel: 0 })).toBeNull();
    expect(pdfToPolygon({ points: pts, metersPerPixel: -0.1 })).toBeNull();
  });

  it("centers polygon at bbox origin in the metersPerPixel path", () => {
    const result = pdfToPolygon({
      points: [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 130 },
        { x: 50, y: 130 },
      ],
      metersPerPixel: 0.1,
    })!;
    const xs = result.polygon.map(([x]) => x);
    const zs = result.polygon.map(([, z]) => z);
    expect(Math.min(...xs)).toBeCloseTo(-5, 6);
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
    expect(Math.min(...zs)).toBeCloseTo(-4, 6);
    expect(Math.max(...zs)).toBeCloseTo(4, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/cad/__tests__/pdf-to-polygon.test.ts`
Expected: FAIL — TypeScript error on `metersPerPixel` input field (not in `PdfToPolygonInput`).

- [ ] **Step 3: Extend the input type and implementation**

Replace the `PdfToPolygonInput` interface and the `pdfToPolygon` function body in `src/lib/cad/pdf-to-polygon.ts` with:

```ts
export interface PdfToPolygonInput {
  /** Traced pixel-space vertices (in order). Minimum 3. */
  points: PixelPoint[];
  /**
   * Real-world width of the traced polygon's bounding box, in meters.
   * Legacy calibration path; mutually exclusive with `metersPerPixel`.
   */
  realWorldWidthMeters?: number;
  /**
   * Pre-computed scale from a two-point ruler. Overrides
   * `realWorldWidthMeters` when provided. Must be > 0.
   */
  metersPerPixel?: number;
}

export function pdfToPolygon(input: PdfToPolygonInput): PdfToPolygonResult | null {
  const { points } = input;
  if (points.length < 3) return null;

  // Bounding box in pixel space.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const widthPx = maxX - minX;
  const heightPx = maxY - minY;
  if (widthPx <= 0 || heightPx <= 0) return null;

  // Resolve scale. metersPerPixel wins if both are provided.
  let metersPerPixel: number;
  if (typeof input.metersPerPixel === "number") {
    if (!(input.metersPerPixel > 0)) return null;
    metersPerPixel = input.metersPerPixel;
  } else if (typeof input.realWorldWidthMeters === "number") {
    if (!(input.realWorldWidthMeters > 0)) return null;
    metersPerPixel = input.realWorldWidthMeters / widthPx;
  } else {
    return null;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const polygon: Polygon2D = points.map((p) => [
    (p.x - cx) * metersPerPixel,
    (cy - p.y) * metersPerPixel,
  ]);

  const areaSqm = Math.abs(signedArea(polygon));
  return { polygon, metersPerPixel, areaSqm };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/cad/__tests__/pdf-to-polygon.test.ts`
Expected: PASS — all existing tests still green; 3 new metersPerPixel tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cad/pdf-to-polygon.ts src/lib/cad/__tests__/pdf-to-polygon.test.ts
git commit -m "feat(cad): pdfToPolygon accepts metersPerPixel from two-point ruler

Adds metersPerPixel as an alternative calibration input to the existing
realWorldWidthMeters guess. When provided, metersPerPixel wins. The legacy
path is kept so pdf-tracer can be migrated in a separate commit."
```

---

## Task 4: Two-point ruler phase in `PdfTracer`

**Files:**
- Modify: `src/components/upload/pdf-tracer.tsx`
- Create: `src/components/upload/__tests__/pdf-tracer.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/upload/__tests__/pdf-tracer.test.tsx`:

```tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { PdfTracer } from "../pdf-tracer";

// pdfjs-dist needs browser APIs we can't satisfy in happy-dom — stub the
// module so mount never blocks on rendering a real PDF.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      getPage: () => Promise.resolve({
        getViewport: () => ({ width: 720, height: 540 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

describe("PdfTracer — two-point ruler calibration", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the ruler phase before the tracing phase", async () => {
    const onConfirm = vi.fn();
    render(
      <PdfTracer pdfBytes={new ArrayBuffer(8)} onConfirm={onConfirm} lang="en" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("pdf-tracer-phase-ruler")).toBeTruthy();
    });
    expect(screen.queryByTestId("pdf-tracer-phase-trace")).toBeNull();
  });

  it("requires two ruler points and a positive distance to leave the ruler phase", async () => {
    render(<PdfTracer pdfBytes={new ArrayBuffer(8)} onConfirm={vi.fn()} lang="en" />);

    await waitFor(() => screen.getByTestId("pdf-tracer-phase-ruler"));

    const proceed = screen.getByTestId("pdf-tracer-proceed-to-trace") as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);

    // One ruler click — still disabled.
    const overlay = screen.getByTestId("pdf-tracer-overlay") as HTMLCanvasElement;
    fireEvent.click(overlay, { clientX: 10, clientY: 10 });
    expect(proceed.disabled).toBe(true);

    // Second ruler click — still disabled until a positive distance is entered.
    fireEvent.click(overlay, { clientX: 110, clientY: 10 });
    expect(proceed.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("pdf-tracer-ruler-meters"), {
      target: { value: "10" },
    });
    expect(proceed.disabled).toBe(false);
  });

  it("rejects coincident ruler points", async () => {
    render(<PdfTracer pdfBytes={new ArrayBuffer(8)} onConfirm={vi.fn()} lang="en" />);

    await waitFor(() => screen.getByTestId("pdf-tracer-phase-ruler"));
    const overlay = screen.getByTestId("pdf-tracer-overlay") as HTMLCanvasElement;

    fireEvent.click(overlay, { clientX: 50, clientY: 50 });
    fireEvent.click(overlay, { clientX: 50, clientY: 50 });
    fireEvent.change(screen.getByTestId("pdf-tracer-ruler-meters"), {
      target: { value: "5" },
    });
    const proceed = screen.getByTestId("pdf-tracer-proceed-to-trace") as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);
  });

  it("confirming a traced polygon after ruler calibration calls onConfirm with meter-scaled polygon", async () => {
    const onConfirm = vi.fn();
    render(<PdfTracer pdfBytes={new ArrayBuffer(8)} onConfirm={onConfirm} lang="en" />);

    await waitFor(() => screen.getByTestId("pdf-tracer-phase-ruler"));
    const overlay = screen.getByTestId("pdf-tracer-overlay") as HTMLCanvasElement;

    // Ruler: 100 px = 10 m → metersPerPixel = 0.1
    fireEvent.click(overlay, { clientX: 0, clientY: 0 });
    fireEvent.click(overlay, { clientX: 100, clientY: 0 });
    fireEvent.change(screen.getByTestId("pdf-tracer-ruler-meters"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByTestId("pdf-tracer-proceed-to-trace"));

    await waitFor(() => screen.getByTestId("pdf-tracer-phase-trace"));

    // Trace a 100×80 px rectangle → 10×8 m = 80 m² in world units.
    fireEvent.click(overlay, { clientX: 0, clientY: 0 });
    fireEvent.click(overlay, { clientX: 100, clientY: 0 });
    fireEvent.click(overlay, { clientX: 100, clientY: 80 });
    fireEvent.click(overlay, { clientX: 0, clientY: 80 });

    fireEvent.click(screen.getByTestId("pdf-tracer-confirm"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [poly, area] = onConfirm.mock.calls[0];
    expect(poly).toHaveLength(4);
    expect(area).toBeCloseTo(80, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/upload/__tests__/pdf-tracer.test.tsx`
Expected: FAIL — `pdf-tracer-phase-ruler` / `pdf-tracer-ruler-meters` / `pdf-tracer-proceed-to-trace` test IDs don't exist yet.

- [ ] **Step 3: Rewrite `pdf-tracer.tsx` with two phases**

Replace the entire content of `src/components/upload/pdf-tracer.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Undo2, RotateCcw, Check, Ruler } from "lucide-react";
import type { PixelPoint } from "@/lib/cad/pdf-to-polygon";
import { pdfToPolygon } from "@/lib/cad/pdf-to-polygon";
import type { Polygon2D } from "@/lib/cad/dxf-parser";

interface PdfTracerProps {
  pdfBytes: ArrayBuffer;
  targetWidth?: number;
  onConfirm: (polygon: Polygon2D, areaSqm: number) => void;
  lang?: "ko" | "en";
}

type Phase = "ruler" | "trace";

function t(ko: string, en: string, isKo: boolean): string {
  return isKo ? ko : en;
}

/**
 * Two-phase PDF calibrator + tracer.
 *
 *   Phase 1 (ruler): user clicks two points on a dimension line and types
 *     the real-world distance. The live pixel distance + resulting
 *     metersPerPixel are shown so the user can verify before continuing.
 *   Phase 2 (trace): user clicks polygon vertices to outline the building.
 *     Scale is taken from the ruler phase, not a guessed bbox width.
 *
 * pdfjs-dist is loaded lazily on the client so SSR and test environments
 * without a DOM never pull in the full PDF stack.
 */
export function PdfTracer({
  pdfBytes,
  targetWidth = 720,
  onConfirm,
  lang = "en",
}: PdfTracerProps) {
  const isKo = lang === "ko";

  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [renderState, setRenderState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; widthPx: number; heightPx: number }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  const [phase, setPhase] = useState<Phase>("ruler");
  const [rulerPoints, setRulerPoints] = useState<PixelPoint[]>([]);
  const [rulerMeters, setRulerMeters] = useState<string>("");
  const [tracePoints, setTracePoints] = useState<PixelPoint[]>([]);

  // --- PDF render (unchanged from prior version) ---------------------------
  useEffect(() => {
    let cancelled = false;
    async function renderPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const dataCopy = pdfBytes.slice(0);
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(dataCopy) });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = renderCanvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas context unavailable");

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        const overlay = overlayCanvasRef.current;
        if (overlay) {
          overlay.width = canvas.width;
          overlay.height = canvas.height;
        }

        if (!cancelled) {
          setRenderState({ kind: "ready", widthPx: canvas.width, heightPx: canvas.height });
        }
      } catch (err) {
        if (cancelled) return;
        setRenderState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    void renderPdf();
    return () => { cancelled = true; };
  }, [pdfBytes, targetWidth]);

  // --- Overlay redraw ------------------------------------------------------
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (phase === "ruler") {
      // Blue ruler segment between the (up to) 2 ruler points.
      if (rulerPoints.length > 0) {
        ctx.strokeStyle = "rgb(37, 99, 235)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rulerPoints[0].x, rulerPoints[0].y);
        if (rulerPoints[1]) ctx.lineTo(rulerPoints[1].x, rulerPoints[1].y);
        ctx.stroke();
        for (const p of rulerPoints) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "rgb(37, 99, 235)";
          ctx.fill();
          ctx.strokeStyle = "white";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      return;
    }

    // phase === "trace"
    if (tracePoints.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(tracePoints[0].x, tracePoints[0].y);
    for (let i = 1; i < tracePoints.length; i++) {
      ctx.lineTo(tracePoints[i].x, tracePoints[i].y);
    }
    if (tracePoints.length >= 3) {
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 130, 246, 0.18)";
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(37, 99, 235)";
    ctx.stroke();
    for (const p of tracePoints) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(37, 99, 235)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "white";
      ctx.stroke();
    }
  }, [phase, rulerPoints, tracePoints]);

  // --- Click handling (canvas → overlay coords) ----------------------------
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || canvas.width);
    const scaleY = canvas.height / (rect.height || canvas.height);
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    if (phase === "ruler") {
      setRulerPoints((prev) => (prev.length >= 2 ? [{ x, y }] : [...prev, { x, y }]));
    } else {
      setTracePoints((prev) => [...prev, { x, y }]);
    }
  }, [phase]);

  // --- Derived values ------------------------------------------------------
  const rulerMetersNum = Number(rulerMeters);
  const rulerPixelDistance = useMemo(() => {
    if (rulerPoints.length < 2) return 0;
    const [a, b] = rulerPoints;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }, [rulerPoints]);

  const metersPerPixel = useMemo(() => {
    if (rulerPixelDistance <= 0) return 0;
    if (!(rulerMetersNum > 0)) return 0;
    return rulerMetersNum / rulerPixelDistance;
  }, [rulerPixelDistance, rulerMetersNum]);

  const canProceedFromRuler = rulerPoints.length === 2 && rulerPixelDistance > 0 && metersPerPixel > 0;

  const canConfirmTrace = tracePoints.length >= 3 && metersPerPixel > 0;

  // --- Handlers ------------------------------------------------------------
  const handleUndo = useCallback(() => {
    if (phase === "ruler") setRulerPoints((prev) => prev.slice(0, -1));
    else setTracePoints((prev) => prev.slice(0, -1));
  }, [phase]);

  const handleClear = useCallback(() => {
    if (phase === "ruler") setRulerPoints([]);
    else setTracePoints([]);
  }, [phase]);

  const handleProceedToTrace = useCallback(() => {
    if (canProceedFromRuler) setPhase("trace");
  }, [canProceedFromRuler]);

  const handleBackToRuler = useCallback(() => {
    setPhase("ruler");
    setTracePoints([]);
  }, []);

  const handleConfirm = useCallback(() => {
    const result = pdfToPolygon({ points: tracePoints, metersPerPixel });
    if (!result) return;
    onConfirm(result.polygon, result.areaSqm);
  }, [onConfirm, tracePoints, metersPerPixel]);

  return (
    <div className="flex flex-col gap-3">
      {/* Canvas stack */}
      {renderState.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t("PDF 렌더링 중…", "Rendering PDF…", isKo)}
        </div>
      )}
      {renderState.kind === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <span>{t("PDF를 읽을 수 없습니다: ", "Could not read PDF: ", isKo)}{renderState.message}</span>
        </div>
      )}
      <div className="relative inline-block" style={{ maxWidth: targetWidth }}>
        <canvas ref={renderCanvasRef} className="block rounded border bg-white" style={{ width: "100%", height: "auto" }} />
        <canvas
          ref={overlayCanvasRef}
          data-testid="pdf-tracer-overlay"
          onClick={handleClick}
          className="absolute inset-0 block cursor-crosshair"
          style={{ width: "100%", height: "auto" }}
        />
      </div>

      {phase === "ruler" && (
        <div data-testid="pdf-tracer-phase-ruler" className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            <h3 className="text-sm font-semibold">
              {t("축척 보정 (1/2)", "Calibrate scale (1 of 2)", isKo)}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "치수선의 양 끝 두 점을 순서대로 클릭한 뒤, 두 점 사이의 실제 거리(미터)를 입력하세요.",
              "Click two points on a dimension line, then enter the real-world distance between them in meters.",
              isKo,
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
            <span>
              {t("선택된 점", "Points", isKo)}: <strong>{rulerPoints.length}/2</strong>
            </span>
            <span>
              {t("픽셀 거리", "Pixel distance", isKo)}: <strong>{rulerPixelDistance.toFixed(1)} px</strong>
            </span>
            {metersPerPixel > 0 && (
              <span>
                m/px: <strong>{metersPerPixel.toFixed(4)}</strong>
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pdf-ruler-meters" className="text-xs">
              {t("실제 거리 (미터)", "Real-world distance (meters)", isKo)}
            </Label>
            <Input
              id="pdf-ruler-meters"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder={t("예: 5", "e.g. 5", isKo)}
              value={rulerMeters}
              onChange={(e) => setRulerMeters(e.target.value)}
              className="max-w-[200px]"
              data-testid="pdf-tracer-ruler-meters"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleUndo} disabled={rulerPoints.length === 0}>
                <Undo2 className="mr-1 h-4 w-4" /> {t("되돌리기", "Undo", isKo)}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={rulerPoints.length === 0}>
                <RotateCcw className="mr-1 h-4 w-4" /> {t("초기화", "Clear", isKo)}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleProceedToTrace}
              disabled={!canProceedFromRuler}
              data-testid="pdf-tracer-proceed-to-trace"
            >
              {t("외곽선 추적으로", "Proceed to trace", isKo)}
            </Button>
          </div>
        </div>
      )}

      {phase === "trace" && (
        <div data-testid="pdf-tracer-phase-trace" className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
          <h3 className="text-sm font-semibold">
            {t("외곽선 추적 (2/2)", "Trace footprint (2 of 2)", isKo)}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "건물 외곽선의 각 꼭짓점을 순서대로 클릭하세요. 세 점 이상이면 닫힌 다각형이 됩니다.",
              "Click each corner of the building outline in order. After 3+ points the polygon closes automatically.",
              isKo,
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
            <span>{tracePoints.length} {t("정점", "vertices", isKo)}</span>
            <span className="text-muted-foreground">· m/px: {metersPerPixel.toFixed(4)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleUndo} disabled={tracePoints.length === 0}>
                <Undo2 className="mr-1 h-4 w-4" /> {t("되돌리기", "Undo", isKo)}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={tracePoints.length === 0}>
                <RotateCcw className="mr-1 h-4 w-4" /> {t("초기화", "Clear", isKo)}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleBackToRuler}>
                {t("축척으로 돌아가기", "Back to ruler", isKo)}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!canConfirmTrace}
              data-testid="pdf-tracer-confirm"
            >
              <Check className="mr-1 h-4 w-4" /> {t("외곽선 확정", "Confirm footprint", isKo)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run both the new and the existing upload-stage tests**

Run: `pnpm test src/components/upload/__tests__/pdf-tracer.test.tsx src/components/upload/__tests__/upload-stage.test.tsx`
Expected: PASS — all new ruler tests pass; the existing upload-stage PDF test ("transitions to the PDF tracing UI") still matches `Trace footprint|외곽선 추적` heading substring so it continues passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/upload/pdf-tracer.tsx src/components/upload/__tests__/pdf-tracer.test.tsx
git commit -m "feat(upload): replace PDF approximate-width with two-point ruler calibration

Two-phase UX — (1) user clicks two points on a dimension line + types the
real-world distance; pixel distance and m/px are shown live for verification,
(2) user traces the building outline with the calibrated scale. The imprecise
'approximate building width' input is removed."
```

---

## Task 5: BIM_OUTLINE tip in `LayerPicker`

**Files:**
- Modify: `src/components/upload/layer-picker.tsx`

- [ ] **Step 1: Add the tip banner**

In `src/components/upload/layer-picker.tsx`, locate this block:

```tsx
      <h3 className="text-sm font-semibold">
        {isKo
          ? "풋프린트 레이어를 선택하세요"
          : "Select the footprint layer"}
      </h3>
      <p className="text-xs text-muted-foreground">
        {isKo
          ? `${candidates.length}개의 닫힌 폴리라인이 발견되었습니다. 건물 외곽선을 선택하세요.`
          : `${candidates.length} closed polylines found. Pick the building outline.`}
      </p>
```

Append this banner immediately after the `</p>`:

```tsx
      <div
        className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-2 text-[11px] text-muted-foreground"
        data-testid="layer-picker-bim-outline-tip"
      >
        {isKo
          ? <>팁: 외곽선 레이어 이름을 <code>BIM_OUTLINE</code> 으로 지정하면 이 단계가 자동으로 건너뛰어집니다.</>
          : <>Tip: name your outline layer <code>BIM_OUTLINE</code> to skip this step next time.</>}
      </div>
```

- [ ] **Step 2: Verify existing LayerPicker tests still pass**

Run: `pnpm test src/components/upload/__tests__/upload-stage.test.tsx`
Expected: PASS — existing multi-candidate test still finds the `FOOTPRINT` card via `data-layer` attribute.

- [ ] **Step 3: Commit**

```bash
git add src/components/upload/layer-picker.tsx
git commit -m "feat(upload): LayerPicker shows BIM_OUTLINE convention tip"
```

---

## Task 6: Wire `FootprintIngestResult` through `UploadStage`

**Files:**
- Modify: `src/components/upload/upload-stage.tsx`
- Modify: `src/components/upload/__tests__/upload-stage.test.tsx`

- [ ] **Step 1: Write the new failing tests**

Add to `src/components/upload/__tests__/upload-stage.test.tsx` (inside the existing `describe("UploadStage")` block, before its closing brace):

```ts
  it("DXF with BIM_OUTLINE layer auto-skips the layer picker", async () => {
    const BIM_DXF = [
      "0", "SECTION", "2", "HEADER",
      "9", "$INSUNITS", "70", "6",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      // Larger decoy ring (40 × 30 = 1200 m²) on RANDOM
      "0", "LWPOLYLINE", "8", "RANDOM",
      "90", "4", "70", "1",
      "10", "0",  "20", "0",
      "10", "40", "20", "0",
      "10", "40", "20", "30",
      "10", "0",  "20", "30",
      // BIM_OUTLINE ring (15 × 10 = 150 m²)
      "0", "LWPOLYLINE", "8", "BIM_OUTLINE",
      "90", "4", "70", "1",
      "10", "100", "20", "100",
      "10", "115", "20", "100",
      "10", "115", "20", "110",
      "10", "100", "20", "110",
      "0", "ENDSEC",
      "0", "EOF", "",
    ].join("\n");

    const file = new File([BIM_DXF], "plan.dxf", { type: "application/dxf" });
    if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(file, "text", { value: async () => BIM_DXF });
    }

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    // Continue becomes enabled without any layer-picker interaction.
    await waitFor(() => {
      const btn = screen.getByTestId("upload-continue") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    // Layer picker heading must not be present.
    expect(screen.queryByText(/Select the footprint layer|풋프린트 레이어/)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/upload/__tests__/upload-stage.test.tsx`
Expected: FAIL — the existing code shows the layer picker for any multi-candidate DXF; the BIM_OUTLINE short-circuit doesn't exist yet.

- [ ] **Step 3: Update `upload-stage.tsx`**

Replace the entire content of `src/components/upload/upload-stage.tsx` with:

```tsx
"use client";

import { useCallback, useState } from "react";
import { Upload, FileBox, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import {
  parseDxfText,
  BIM_OUTLINE_PATTERN,
  type FootprintCandidate,
  type ParsedDxf,
  type Polygon2D,
} from "@/lib/cad/dxf-parser";
import { parseDwgFile } from "@/lib/cad/dwg-parser";
import {
  dxfResult,
  dwgResult,
  pdfResult,
  type FootprintIngestResult,
  type IngestSource,
} from "@/lib/cad/ingest-result";
import { FootprintPreview } from "./footprint-preview";
import { LayerPicker } from "./layer-picker";
import { PdfTracer } from "./pdf-tracer";

const ACCEPTED_EXTENSIONS = [".dxf", ".dwg", ".pdf"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type UploadStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | {
      kind: "needs-pick";
      candidates: FootprintCandidate[];
      warnings: string[];
      source: Extract<IngestSource, "dxf" | "dwg">;
    }
  | { kind: "pdf-tracing"; pdfBytes: ArrayBuffer }
  | { kind: "ready"; result: FootprintIngestResult }
  | { kind: "error"; message: string };

function t(ko: string, en: string, isKo: boolean): string {
  return isKo ? ko : en;
}

/** Wrap a DXF-shaped parser output as a FootprintIngestResult for the given source. */
function wrapParsed(
  parsed: ParsedDxf,
  candidate: FootprintCandidate,
  source: "dxf" | "dwg",
): FootprintIngestResult {
  if (source === "dxf") {
    return dxfResult({
      polygon: candidate.polygon,
      areaSqm: candidate.areaSqm,
      layer: candidate.layer,
      warnings: parsed.warnings,
    });
  }
  return dwgResult({
    polygon: candidate.polygon,
    areaSqm: candidate.areaSqm,
    layer: candidate.layer,
    warnings: parsed.warnings,
  });
}

export function UploadStage() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const [pendingLayer, setPendingLayer] = useState<string | null>(null);

  const buildingPk = useActiveBuildingPk();
  const setOverride = useRecipeStore((s) => s.setOverride);
  const advance = useWorkflowStore((s) => s.advance);
  const retreat = useWorkflowStore((s) => s.retreat);

  const ingestParsed = useCallback(
    (parsed: ParsedDxf, source: "dxf" | "dwg", noCandidatesMessage: string) => {
      if (parsed.candidates.length === 0) {
        setStatus({ kind: "error", message: noCandidatesMessage });
        return;
      }
      const top = parsed.candidates[0];
      // BIM_OUTLINE auto-skip: if the top-ranked candidate matches the
      // convention, commit it directly without showing the picker.
      if (
        parsed.candidates.length === 1 ||
        BIM_OUTLINE_PATTERN.test(top.layer)
      ) {
        setStatus({ kind: "ready", result: wrapParsed(parsed, top, source) });
        return;
      }
      setStatus({
        kind: "needs-pick",
        candidates: parsed.candidates,
        warnings: parsed.warnings,
        source,
      });
    },
    [],
  );

  const processFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf("."));

      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setStatus({
          kind: "error",
          message: t(
            `지원하지 않는 파일 형식: ${ext}`,
            `Unsupported file type: ${ext}`,
            isKo,
          ),
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setStatus({
          kind: "error",
          message: t("파일 크기가 50MB를 초과합니다", "File exceeds 50 MB limit", isKo),
        });
        return;
      }

      setStatus({ kind: "parsing" });

      try {
        if (ext === ".dxf") {
          const text = await file.text();
          const parsed = parseDxfText(text);
          ingestParsed(
            parsed,
            "dxf",
            t(
              "DXF 파일에서 닫힌 외곽 폴리라인을 찾지 못했습니다. 외곽선을 BIM_OUTLINE 레이어의 닫힌 폴리라인으로 내보냈는지 확인하세요.",
              "No closed outline polyline found in the DXF. Put the outline on layer BIM_OUTLINE as a closed LWPOLYLINE for a one-click ingest.",
              isKo,
            ),
          );
        } else if (ext === ".pdf") {
          const buf = await file.arrayBuffer();
          setStatus({ kind: "pdf-tracing", pdfBytes: buf });
        } else {
          const parsed = await parseDwgFile(file);
          ingestParsed(
            parsed,
            "dwg",
            parsed.warnings[parsed.warnings.length - 1] ??
              t(
                "DWG 변환에 실패했습니다. .dxf로 내보내어 다시 업로드하세요.",
                "DWG conversion failed. Export as .dxf and upload again.",
                isKo,
              ),
          );
        }
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [ingestParsed, isKo],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleLayerPreview = useCallback((candidate: FootprintCandidate) => {
    setPendingLayer(candidate.layer);
  }, []);

  const handlePdfConfirm = useCallback((polygon: Polygon2D, areaSqm: number) => {
    setStatus({
      kind: "ready",
      result: pdfResult({ polygon, areaSqm }),
    });
  }, []);

  const handleLayerConfirm = useCallback((candidate: FootprintCandidate) => {
    setPendingLayer(null);
    setStatus((prev) => {
      if (prev.kind !== "needs-pick") return prev;
      const wrap =
        prev.source === "dxf"
          ? dxfResult({
              polygon: candidate.polygon,
              areaSqm: candidate.areaSqm,
              layer: candidate.layer,
              warnings: prev.warnings,
            })
          : dwgResult({
              polygon: candidate.polygon,
              areaSqm: candidate.areaSqm,
              layer: candidate.layer,
              warnings: prev.warnings,
            });
      return { kind: "ready", result: wrap };
    });
  }, []);

  const commitAndAdvance = useCallback(() => {
    if (status.kind !== "ready") return;
    if (!buildingPk) {
      setStatus({
        kind: "error",
        message: t(
          "활성 건물이 없습니다. 검색 단계로 돌아가 건물을 선택하세요.",
          "No active building. Return to search and pick a building first.",
          isKo,
        ),
      });
      return;
    }
    const rings: [number, number][][] = [status.result.polygon];
    setOverride(buildingPk, "footprintPolygon", rings);
    advance({ footprintPolygon: rings });
  }, [status, buildingPk, setOverride, advance, isKo]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-start overflow-auto bg-background p-8">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileBox className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {t("도면 업로드", "Upload CAD Floor Plan", isKo)}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "선택한 건물의 CAD 외곽 도면을 업로드하세요. DXF는 BIM_OUTLINE 레이어 규칙을 따르면 자동으로 처리됩니다.",
              "Upload the CAD outline for the selected building. DXFs that follow the BIM_OUTLINE layer convention ingest automatically.",
              isKo,
            )}
          </p>
        </div>

        <div
          data-testid="upload-dropzone"
          className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className={`h-10 w-10 ${dragOver ? "text-primary" : "text-muted-foreground/50"}`} />
          <div className="text-center">
            <p className="text-sm font-medium">
              {t("파일을 끌어다 놓거나", "Drag and drop a file, or", isKo)}
            </p>
            <label className="cursor-pointer">
              <span className="text-sm text-primary underline">
                {t("파일 선택", "browse", isKo)}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".dxf,.dwg,.pdf"
                onChange={handleFileInput}
                data-testid="upload-file-input"
              />
            </label>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[10px]">.dxf</Badge>
            <Badge variant="outline" className="text-[10px]">.dwg</Badge>
            <Badge variant="outline" className="text-[10px]">.pdf</Badge>
          </div>
        </div>

        {status.kind === "parsing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("도면 처리 중…", "Processing drawing…", isKo)}
          </div>
        )}

        {status.kind === "error" && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="flex-1">{status.message}</span>
          </div>
        )}

        {status.kind === "needs-pick" && (
          <LayerPicker
            candidates={status.candidates}
            selectedLayer={pendingLayer}
            onPreview={handleLayerPreview}
            onConfirm={handleLayerConfirm}
            lang={isKo ? "ko" : "en"}
          />
        )}

        {status.kind === "pdf-tracing" && (
          <PdfTracer
            pdfBytes={status.pdfBytes}
            onConfirm={handlePdfConfirm}
            lang={isKo ? "ko" : "en"}
          />
        )}

        {status.kind === "ready" && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {t("외곽선 준비 완료", "Footprint ready", isKo)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("출처", "Source", isKo)}: <code>{status.result.source}</code>
                  {" · "}
                  {t("신뢰도", "Confidence", isKo)}: <code>{status.result.confidence}</code>
                  {" · "}
                  {t("레이어", "Layer", isKo)}: <code>{status.result.layer}</code>
                  {" · "}
                  {status.result.areaSqm.toFixed(0)} m²
                </div>
              </div>
            </div>
            <div className="flex justify-center text-primary">
              <FootprintPreview polygon={status.result.polygon} size={260} />
            </div>
            {status.result.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {status.result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" onClick={() => retreat()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("검색으로 돌아가기", "Back to search", isKo)}
          </Button>
          <Button
            type="button"
            disabled={status.kind !== "ready" || !buildingPk}
            onClick={commitAndAdvance}
            data-testid="upload-continue"
          >
            {t("트윈으로 계속", "Continue to Twin", isKo)}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the full upload-stage test suite**

Run: `pnpm test src/components/upload/__tests__/upload-stage.test.tsx`
Expected: PASS — the new BIM_OUTLINE auto-skip test plus all existing tests (single DXF, multi-candidate picker, DWG error, PDF transition).

- [ ] **Step 5: Verify full suite + type-check**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green. The `build` step catches any TypeScript regressions from the new exports.

- [ ] **Step 6: Commit**

```bash
git add src/components/upload/upload-stage.tsx src/components/upload/__tests__/upload-stage.test.tsx
git commit -m "feat(upload): funnel all ingest paths through FootprintIngestResult

- DXF / DWG / PDF each produce {source, confidence, layer, warnings} uniformly.
- BIM_OUTLINE layer (case-insensitive, underscore or hyphen) auto-skips the
  layer picker even when another ring is larger.
- Ready panel shows source + confidence so users see provenance at a glance."
```

---

## Task 7: Document the `BIM_OUTLINE` convention

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a short section**

In `CLAUDE.md`, locate the `## API Gotchas (건축HUB)` heading. Insert a new section immediately before it:

```markdown
## CAD Upload Conventions

- DXF: name the building outline layer `BIM_OUTLINE` (case-insensitive; `BIM-OUTLINE` and `BIMOUTLINE` also match the `^bim[_-]?outline$` pattern in `src/lib/cad/dxf-parser.ts`). When present, the upload stage skips the layer picker.
- DWG: converted client-side via libdxfrw WASM (`public/wasm/libdxfrw.wasm`, ~1.4 MB, lazy-loaded on first DWG upload). Server fallback at `/api/cad/convert` uses `$DWG_CONVERTER_PATH` (ODA File Converter or similar) when the WASM path fails.
- PDF: two-phase tracer — (1) click two points on a dimension line + enter the real-world distance to calibrate scale, (2) click polygon vertices to trace the outline. Scale is exact to the user-clicked ruler segment, not a guessed bbox width.
- All three paths produce `FootprintIngestResult` from `src/lib/cad/ingest-result.ts` with `source` + `confidence` provenance for downstream fidelity consumption.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document BIM_OUTLINE DXF layer convention and CAD upload contracts"
```

---

## Task 8: Manual QA pass

**Files:**
- None (manual verification only).

- [ ] **Step 1: Run the full suite one more time**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: server starts on port 3000.

- [ ] **Step 3: Manual QA checklist**

With the dev server running, exercise the upload stage:

- [ ] DXF with a `BIM_OUTLINE` layer uploads and advances to Twin without showing the picker.
- [ ] DXF with multiple closed polylines and NO `BIM_OUTLINE` shows the picker + the BIM_OUTLINE tip banner.
- [ ] DXF on a non-convention layer still works via the picker.
- [ ] DWG upload completes via WASM (check browser console for no server-fallback warning).
- [ ] PDF upload shows ruler phase first; "Proceed to trace" is disabled until two points + a positive distance are entered; tracing phase confirms the polygon.
- [ ] Ready panel displays `source`, `confidence`, and `layer` for each path.
- [ ] Same building ingested via all three formats produces areas within ~5% of each other.
- [ ] All UI strings render correctly in both `ko` and `en` (toggle via the language store).

- [ ] **Step 4: Stop the dev server**

`Ctrl+C` in the dev server terminal.

- [ ] **Step 5: No commit needed.** Report manual QA results in the task summary.

---

## Self-Review

After writing this plan I checked it against the revised spec:

- **Spec coverage:**
  - Goal 1 (shared output contract) — Tasks 1, 6 ✅
  - Goal 3 (two-point ruler) — Tasks 3, 4 ✅
  - Goal 4 (`BIM_OUTLINE` convention) — Tasks 2, 6, 7 ✅
  - Goal 5 (`source` + `confidence`) — Tasks 1, 6 ✅
  - Goal 2 (DWG conversion works) — shipped; no task needed ✅
  - Acceptance criterion "All three paths produce FootprintIngestResult" — Task 6 step 3 wires this uniformly ✅
  - Acceptance criterion "bilingual error messages" — Tasks 4, 6 use the existing `t(ko, en, isKo)` helper for every new string ✅
  - Manual-QA 5%-agreement criterion — Task 8 step 3 ✅

- **Placeholder scan:** no TBD / TODO / "implement later" in any step; every code block shows the exact content to write.

- **Type consistency:**
  - `BIM_OUTLINE_PATTERN` — exported from `dxf-parser.ts` in Task 2, imported by `upload-stage.tsx` in Task 6 ✅
  - `FootprintIngestResult` + `dxfResult` / `dwgResult` / `pdfResult` — defined in Task 1, used in Task 6 ✅
  - `IngestSource` — exported from `ingest-result.ts` in Task 1, imported for the `needs-pick` status in Task 6 ✅
  - `ParsedDxf` — already exported from `dxf-parser.ts`; Task 6 adds it to the existing import group ✅
  - `pdfToPolygon` `metersPerPixel` field — added in Task 3, consumed by `pdf-tracer.tsx` in Task 4 ✅

- **Scope check:** 8 tasks, each a commit, all hitting the three unfinished spec items. Pillar extraction, auto-vectorization, and fidelity wiring remain explicit non-goals.
