// The SVG import seam the schematic dialog actually drives: hand-written SVG →
// layer summary + guessed roles → `importSvgString` → a BlueprintSpec that
// passes its own validator. The dialog calls exactly these three functions in
// exactly this order, so a green suite here means the entry point in the UI is
// wired to something real.
//
// The fixture is deliberately the SVG twin of the DXF fixture in
// `import-cad-dialog.test.tsx`: an L-shaped outline, a core rectangle and a
// labelled room, each on its own `data-layer` group. Same geometry, same
// expected reading — that is the claim `from-svg.ts` makes by mirroring
// `from-cad.ts`, and this file is what tests it end to end.

import { describe, it, expect } from "vitest";

import {
  guessSvgLayerAssignments,
  importSvgString,
  summariseSvgLayers,
  type SvgImportOutcome,
} from "@/lib/generative/blueprint/import-svg-file";
import { svgToSegments } from "@/lib/generative/blueprint/from-svg";
import { validateBlueprint } from "@/lib/generative/blueprint/validate-blueprint";
import {
  segmentStart,
  type BlueprintSpec,
  type PointMm,
} from "@/lib/generative/blueprint/blueprint-spec";
import type { CadLayerAssignments } from "@/lib/generative/blueprint/import-cad-file";

/**
 * L-shaped plate 20 m × 20 m with an 8 m × 8 m bite out of the top-right
 * (336 m²), a 4 m × 4 m core, an 8 m × 8 m room, and a label inside the room.
 * Coordinates are millimetres, so `svgUnitsToMm` 1 is the honest reading.
 */
const PLAN_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20000 20000" width="600" height="600">
  <g data-layer="A-WALL">
    <polygon points="0,0 20000,0 20000,12000 12000,12000 12000,20000 0,20000" />
  </g>
  <g data-layer="A-CORE">
    <rect x="14000" y="2000" width="4000" height="4000" />
  </g>
  <g data-layer="A-ZONE">
    <rect x="2000" y="2000" width="8000" height="8000" />
  </g>
  <text x="6000" y="6000" font-size="300">Office</text>
</svg>`;

/** The same drawing authored in METRES — 1 user unit = 1000 mm. */
const PLAN_SVG_METRES = PLAN_SVG.replace(
  /(points|x|y|width|height|viewBox)="([^"]*)"/g,
  (whole, attr: string, value: string) => {
    if (attr === "viewBox" || attr === "points") {
      return `${attr}="${value.replace(/[\d.]+/g, (n) => String(Number(n) / 1000))}"`;
    }
    // Leave the presentation width/height alone: they are viewport size, not
    // drawing coordinates (see `from-svg.ts`, "VIEWBOX VS WIDTH/HEIGHT").
    if (whole === 'width="600"' || whole === 'height="600"') return whole;
    return `${attr}="${String(Number(value) / 1000)}"`;
  },
);

const L_AREA_SQM = 336;

function guesses(svg: string, svgUnitsToMm = 1): CadLayerAssignments {
  return guessSvgLayerAssignments(svgToSegments(svg, svgUnitsToMm).segments);
}

/** The boundary loop's corners: one vertex per chained segment, in order. */
function boundaryPoints(blueprint: BlueprintSpec): PointMm[] {
  return blueprint.boundaries[0].loop.segments.map(segmentStart);
}

function expectOk(outcome: SvgImportOutcome) {
  if (!outcome.ok) {
    throw new Error(`expected a successful import, got ${outcome.error.code}: ${outcome.error.message}`);
  }
  return outcome;
}

describe("SVG import — layer summary and guessed roles", () => {
  it("reads one layer per data-layer group, with honest edge and loop counts", () => {
    const layers = summariseSvgLayers(svgToSegments(PLAN_SVG, 1).segments);

    expect(layers.map((layer) => layer.name)).toEqual(["A-CORE", "A-WALL", "A-ZONE"]);

    const wall = layers.find((layer) => layer.name === "A-WALL")!;
    expect(wall.entityCount).toBe(6); // six edges of the L, not "one entity"
    expect(wall.closedShapeCount).toBe(1);
    expect(wall.largestClosedAreaSqm).toBeCloseTo(L_AREA_SQM, 3);

    const core = layers.find((layer) => layer.name === "A-CORE")!;
    expect(core.entityCount).toBe(4);
    expect(core.largestClosedAreaSqm).toBeCloseTo(16, 3);

    // No per-layer text attribution exists at this seam, and none is invented.
    expect(layers.every((layer) => layer.textCount === 0)).toBe(true);
  });

  it("guesses roles from the layer names, without applying them", () => {
    expect(guesses(PLAN_SVG)).toEqual({
      "A-WALL": { role: "boundary" },
      "A-CORE": { role: "core" },
      "A-ZONE": { role: "zone", program: "office-open" },
    });
  });
});

describe("SVG import — the dialog pipeline, end to end", () => {
  it("turns the drawing into a blueprint that passes its own validator", () => {
    const { blueprint, report } = expectOk(
      importSvgString(PLAN_SVG, guesses(PLAN_SVG), { fileName: "plan.svg", name: "plan" }),
    );

    expect(blueprint.source).toBe("svg");
    expect(blueprint.boundaries).toHaveLength(1);
    expect(blueprint.cores).toHaveLength(1);
    expect(blueprint.zones).toHaveLength(1);
    // The label inside the room named its program; nothing else could have.
    expect(blueprint.zones[0].program.value).toBe("office-open");

    const validation = validateBlueprint(blueprint);
    expect(validation.counts.critical).toBe(0);

    expect(report.loops.boundary).toBe(1);
    expect(report.loops.core).toBe(1);
    expect(report.loops.zone).toBe(1);
    expect(report.boundaryLayer).toBe("A-WALL");
    expect(report.boundaryAreaSqm).toBeCloseTo(L_AREA_SQM, 3);
    expect(report.svg.labelCount).toBe(1);
    expect(report.svg.unlayeredSegmentCount).toBe(0);
  });

  it("preserves the L: six corners, one reflex, area well under the bounding box", () => {
    const { blueprint } = expectOk(importSvgString(PLAN_SVG, guesses(PLAN_SVG)));
    const points = boundaryPoints(blueprint);

    expect(points).toHaveLength(6);

    // Shoelace area — the notch is real geometry, not a rounded rectangle.
    let twice = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      twice += a.xMm * b.zMm - b.xMm * a.zMm;
    }
    const areaSqm = Math.abs(twice) / 2 / 1e6;
    expect(areaSqm).toBeCloseTo(L_AREA_SQM, 3);

    // Exactly one reflex corner is what makes an L an L.
    const cross = points.map((_, i) => {
      const prev = points[(i + points.length - 1) % points.length];
      const here = points[i];
      const next = points[(i + 1) % points.length];
      return (
        (here.xMm - prev.xMm) * (next.zMm - here.zMm) -
        (here.zMm - prev.zMm) * (next.xMm - here.xMm)
      );
    });
    const positive = cross.filter((c) => c > 0).length;
    expect(Math.min(positive, cross.length - positive)).toBe(1);
  });

  it("keeps millimetre bounds the drawing's own — 0…20 m on both axes", () => {
    const { blueprint } = expectOk(importSvgString(PLAN_SVG, guesses(PLAN_SVG)));
    const points = boundaryPoints(blueprint);

    expect(Math.min(...points.map((p) => p.xMm))).toBe(0);
    expect(Math.max(...points.map((p) => p.xMm))).toBe(20_000);
    expect(Math.min(...points.map((p) => p.zMm))).toBe(0);
    expect(Math.max(...points.map((p) => p.zMm))).toBe(20_000);
  });

  it("is deterministic: same SVG, same mapping, byte-identical blueprint", () => {
    const first = expectOk(importSvgString(PLAN_SVG, guesses(PLAN_SVG), { name: "plan" }));
    const second = expectOk(importSvgString(PLAN_SVG, guesses(PLAN_SVG), { name: "plan" }));

    expect(JSON.stringify(second.blueprint)).toBe(JSON.stringify(first.blueprint));
    expect(JSON.stringify(second.report)).toBe(JSON.stringify(first.report));
  });

  it("honours an ignored layer by dropping its geometry, and says it did", () => {
    const assignments: CadLayerAssignments = {
      ...guesses(PLAN_SVG),
      "A-ZONE": { role: "ignore" },
    };
    const { blueprint, report } = expectOk(importSvgString(PLAN_SVG, assignments));

    expect(blueprint.zones).toHaveLength(0);
    expect(report.svg.ignoredSegmentCount).toBe(4);
    expect(report.skipped).toContainEqual({
      reason: "layer-ignored",
      subject: "A-ZONE — edges",
      count: 4,
    });
  });
});

describe("SVG import — the unit scale is stated, never assumed silently", () => {
  it("marks an untouched scale as assumed, and lands carrying SCALE_UNCALIBRATED", () => {
    const { blueprint, report } = expectOk(importSvgString(PLAN_SVG, guesses(PLAN_SVG)));

    expect(report.svg.scale).toMatchObject({ svgUnitsToMm: 1, confirmed: false });
    expect(report.units.declared).toBe(false);
    expect(report.units.assumption).toContain("ASSUMED");
    expect(blueprint.coordinateSystem.calibrated).toBe(false);
    expect(blueprint.coordinateSystem.method).toBe("assumed");

    const codes = validateBlueprint(blueprint).violations.map((v) => v.code);
    expect(codes).toContain("SCALE_UNCALIBRATED");
  });

  it("fails honestly when a metre-authored drawing is read at 1 unit = 1 mm", () => {
    const outcome = importSvgString(PLAN_SVG_METRES, guesses(PLAN_SVG_METRES, 1));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // 20 mm × 20 mm of "building" is below the 1 m² loop floor: no loop, and no
    // fabricated fallback blueprint either.
    expect(outcome.error.code).toBe("NO_CLOSED_LOOPS");
    expect(outcome.report.svg.scale.confirmed).toBe(false);
  });

  it("reads the same geometry once the scale is stated, and reports it as stated", () => {
    const assignments = guesses(PLAN_SVG_METRES, 1000);
    const { blueprint, report } = expectOk(
      importSvgString(PLAN_SVG_METRES, assignments, {
        svgUnitsToMm: 1000,
        scaleConfirmed: true,
      }),
    );

    expect(report.svg.scale).toMatchObject({ svgUnitsToMm: 1000, confirmed: true });
    expect(report.boundaryAreaSqm).toBeCloseTo(L_AREA_SQM, 3);
    expect(blueprint.coordinateSystem.calibrated).toBe(true);
    expect(blueprint.coordinateSystem.method).toBe("explicit-dimension");
    expect(validateBlueprint(blueprint).violations.map((v) => v.code)).not.toContain(
      "SCALE_UNCALIBRATED",
    );

    // Same drawing, same millimetres: the scale is a calibration, not a redraw.
    const millimetres = expectOk(importSvgString(PLAN_SVG, guesses(PLAN_SVG)));
    expect(boundaryPoints(blueprint)).toEqual(boundaryPoints(millimetres.blueprint));
  });
});

describe("SVG import — malformed input fails, never fabricates", () => {
  it("reports an unterminated element with the parser's own message", () => {
    const outcome = importSvgString(
      '<svg viewBox="0 0 10 10"><g data-layer="A-WALL"><rect x="0" y="0" width="4" height="4"/></svg>',
      { "A-WALL": { role: "boundary" } },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("SVG_MALFORMED");
    expect(outcome.error.message).toContain("</g>");
    expect(outcome.report.layers).toEqual([]);
    expect(outcome.report.loops.detected).toBe(0);
  });

  it("refuses a document that is not an SVG at all", () => {
    const outcome = importSvgString("<html><body>not a drawing</body></html>", {});
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("SVG_MALFORMED");
    expect(outcome.error.message).toContain("<svg> root element");
  });

  it("names an unsupported path command instead of guessing the curve", () => {
    const outcome = importSvgString(
      '<svg><path data-layer="A-WALL" d="M 0 0 L 10 0 S 15 5 10 10 Z"/></svg>',
      { "A-WALL": { role: "boundary" } },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("SVG_MALFORMED");
    expect(outcome.error.message).toMatch(/S/);
  });

  it("says so when the mapped boundary layer holds no closed loop", () => {
    const outcome = importSvgString(PLAN_SVG, {
      ...guesses(PLAN_SVG),
      "A-WALL": { role: "zone", program: "office-open" },
      "A-CORE": { role: "core" },
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NO_BOUNDARY_LAYER");
  });
});
