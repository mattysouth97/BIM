import { describe, expect, it } from "vitest";

import { fromSvgString, svgToSegments } from "../blueprint/from-svg";
import { validateBlueprint } from "../blueprint/validate-blueprint";
import type { BoundaryLoop } from "../blueprint/blueprint-spec";

function vertexSet(loop: BoundaryLoop): Set<string> {
  return new Set(
    loop.segments.map((s) => {
      if (s.kind !== "line") throw new Error("expected a straight loop for this fixture");
      return `${s.startMm.xMm},${s.startMm.zMm}`;
    }),
  );
}

/** Shoelace area (mm²) of a straight-segment boundary loop, from its own vertices. */
function shoelaceAreaMm2(loop: BoundaryLoop): number {
  const pts = loop.segments.map((s) => {
    if (s.kind !== "line") throw new Error("expected a straight loop for this fixture");
    return s.startMm;
  });
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.xMm * b.zMm - b.xMm * a.zMm;
  }
  return Math.abs(sum) / 2;
}

/** Bounding-box area (mm²) of the same loop — what a naive "just the extents" reading would give. */
function boundingBoxAreaMm2(loop: BoundaryLoop): number {
  const pts = loop.segments.map((s) => {
    if (s.kind !== "line") throw new Error("expected a straight loop for this fixture");
    return s.startMm;
  });
  const xs = pts.map((p) => p.xMm);
  const zs = pts.map((p) => p.zMm);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
}

describe("fromSvgString — <rect> boundary", () => {
  it("reads a simple rectangle boundary from <rect>", () => {
    const svg = `<svg width="200" height="100"><rect x="0" y="0" width="10000" height="6000" /></svg>`;
    const spec = fromSvgString(svg);

    const report = validateBlueprint(spec);
    expect(report.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(report.blueprintValid).toBe(true);

    expect(spec.source).toBe("svg");
    expect(spec.boundaries).toHaveLength(1);
    expect(spec.boundaries[0].loop.segments).toHaveLength(4);
    expect(vertexSet(spec.boundaries[0].loop)).toEqual(
      new Set(["0,0", "10000,0", "10000,6000", "0,6000"]),
    );
  });

  it("is deterministic for the same SVG text", () => {
    const svg = `<svg><rect x="0" y="0" width="10000" height="6000" /></svg>`;
    const a = fromSvgString(svg);
    const b = fromSvgString(svg);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("fromSvgString — <polygon> / <path> boundaries with real area", () => {
  it("reads a closed <polygon> boundary and computes its true (non-rectangular) area", () => {
    const svg = `<svg><polygon points="0,0 12000,0 6000,8000" /></svg>`;
    const spec = fromSvgString(svg);

    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    expect(spec.boundaries).toHaveLength(1);
    expect(spec.boundaries[0].loop.segments).toHaveLength(3);
    // Triangle area = base * height / 2 = 12000 * 8000 / 2.
    expect(shoelaceAreaMm2(spec.boundaries[0].loop)).toBeCloseTo(48_000_000, -1);
  });

  it("reads a non-convex L-shape boundary from <path> L commands, not reducible to its bounding box", () => {
    const svg = `<svg><path d="M0,0 L10000,0 L10000,6000 L6000,6000 L6000,10000 L0,10000 Z" /></svg>`;
    const spec = fromSvgString(svg);

    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    const loop = spec.boundaries[0].loop;
    expect(loop.segments).toHaveLength(6);

    const area = shoelaceAreaMm2(loop);
    const bboxArea = boundingBoxAreaMm2(loop);
    // Bounding box is the full 10m x 10m square (100 m²); the L-shape itself
    // is 84 m² — genuinely less, proving the reader kept the notch rather
    // than collapsing the loop to its extents.
    expect(bboxArea).toBeCloseTo(100_000_000, -1);
    expect(area).toBeCloseTo(84_000_000, -1);
    expect(area).toBeLessThan(bboxArea);
  });
});

describe("fromSvgString — nested <g transform> accumulation", () => {
  it("composes translate() and rotate() down the tree onto child geometry", () => {
    const svg = `<svg>
      <g transform="translate(1000,2000)">
        <g transform="rotate(90)">
          <rect x="0" y="0" width="4000" height="2000" />
        </g>
      </g>
    </svg>`;
    const { segments } = svgToSegments(svg);

    const points = new Set(
      segments.flatMap((s) => [
        `${s.startMm.xMm},${s.startMm.zMm}`,
        `${s.endMm.xMm},${s.endMm.zMm}`,
      ]),
    );
    // Local rect corners (0,0)(4000,0)(4000,2000)(0,2000), rotated 90° about
    // the origin — (x,y) -> (-y,x) — then translated by (1000,2000).
    expect(points).toEqual(new Set(["1000,2000", "1000,6000", "-1000,6000", "-1000,2000"]));
  });
});

describe("fromSvgString — <text> labels", () => {
  it("anchors a <text> label at its transformed position and classifies a zone from it", () => {
    const svg = `<svg>
      <polygon points="0,0 20000,0 20000,20000 0,20000" />
      <g transform="translate(2000,2000)">
        <polygon points="0,0 6000,0 6000,6000 0,6000" />
        <text x="3000" y="3000">OPEN OFFICE AREA</text>
      </g>
    </svg>`;
    const spec = fromSvgString(svg);

    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    expect(spec.zones).toHaveLength(1);
    expect(spec.zones[0].program.value).toBe("office-open");
    expect(spec.zones[0].label).toBe("OPEN OFFICE AREA");
    expect(spec.voids).toHaveLength(0);
  });

  it("concatenates nested <tspan> content into the enclosing label", () => {
    const svg = `<svg><text x="500" y="500">HELLO <tspan>WORLD</tspan></text></svg>`;
    const { labels } = svgToSegments(svg);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: "HELLO WORLD", positionMm: { xMm: 500, zMm: 500 } });
  });
});

describe("svgToSegments — low-level extraction, mirroring cadDocumentToSegments", () => {
  it("extracts plain segments and labels with no layer, matching input verbatim (unit scale 1)", () => {
    const svg = `<svg><line x1="0" y1="0" x2="1000" y2="0" /><text x="500" y="500">HELLO</text></svg>`;
    const { segments, labels } = svgToSegments(svg);
    expect(segments).toEqual([
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 1000, zMm: 0 } },
    ]);
    expect(labels).toEqual([{ text: "HELLO", positionMm: { xMm: 500, zMm: 500 } }]);
  });

  it("reads a data-layer attribute inherited from an ancestor <g>, mirroring a DXF layer", () => {
    const svg = `<svg>
      <polygon points="0,0 10000,0 10000,6000 6000,6000 6000,10000 0,10000" />
      <g data-layer="A-CORE">
        <polygon points="7000,1000 9000,1000 9000,3000 7000,3000" />
      </g>
    </svg>`;
    const spec = fromSvgString(svg);
    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    expect(spec.cores).toHaveLength(1);
  });

  it("honors an explicit id-based boundary/core layerMapping, mirroring fromCadDocument", () => {
    const svg = `<svg>
      <polygon id="A-WALL" points="0,0 10000,0 10000,6000 6000,6000 6000,10000 0,10000" />
      <polygon id="A-CORE" points="7000,1000 9000,1000 9000,3000 7000,3000" />
    </svg>`;
    const spec = fromSvgString(svg, { boundary: ["A-WALL"], core: ["A-CORE"] });
    expect(spec.boundaries[0].loop.segments).toHaveLength(6);
    expect(spec.cores).toHaveLength(1);
    expect(validateBlueprint(spec).blueprintValid).toBe(true);
  });
});

describe("fromSvgString — viewBox-based unit scaling", () => {
  it("scales user-unit coordinates (established by viewBox, not width/height) via svgUnitsToMm", () => {
    const svg = `<svg viewBox="0 0 5000 3000" width="500" height="300">
      <rect x="0" y="0" width="5000" height="3000" />
    </svg>`;
    // If width/height (500x300) were mistakenly used as the scaling basis
    // instead of the viewBox's own 5000x3000 user-unit frame, these
    // coordinates would come out completely different.
    const spec = fromSvgString(svg, {}, { svgUnitsToMm: 2 });
    expect(vertexSet(spec.boundaries[0].loop)).toEqual(
      new Set(["0,0", "10000,0", "10000,6000", "0,6000"]),
    );
  });

  it("defaults svgUnitsToMm to 1 (assume already millimetres) when unspecified", () => {
    const svg = `<svg><rect x="0" y="0" width="10000" height="6000" /></svg>`;
    const { segments } = svgToSegments(svg);
    expect(segments[0].startMm).toEqual({ xMm: 0, zMm: 0 });
    expect(segments.some((s) => s.endMm.xMm === 10000)).toBe(true);
  });
});

describe("fromSvgString — malformed SVG throws honestly", () => {
  it("throws on an empty document rather than fabricating a blueprint", () => {
    expect(() => fromSvgString("")).toThrow();
    expect(() => svgToSegments("   ")).toThrow();
  });

  it("throws on an unterminated tag", () => {
    const svg = `<svg><rect x="0" y="0" width="10" height="10"`;
    expect(() => fromSvgString(svg)).toThrow();
  });

  it("throws when the root element is not <svg>", () => {
    const svg = `<notsvg><rect x="0" y="0" width="10" height="10" /></notsvg>`;
    expect(() => fromSvgString(svg)).toThrow(/<svg>/);
  });

  it("throws on a mismatched closing tag", () => {
    const svg = `<svg><g><rect x="0" y="0" width="10" height="10" /></foo></svg>`;
    expect(() => fromSvgString(svg)).toThrow();
  });

  it("throws honestly when no closed loop exists — never fabricates a boundary", () => {
    const svg = `<svg><line x1="0" y1="0" x2="1000" y2="0" /></svg>`;
    expect(() => fromSvgString(svg)).toThrow(/no closed loop/i);
  });

  it("throws on an unsupported path command (S/s smooth-curve shorthand)", () => {
    const svg = `<svg><path d="M0,0 L10,0 S20,10 30,0 Z" /></svg>`;
    expect(() => fromSvgString(svg)).toThrow(/unsupported/i);
  });
});
