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

describe("svgToSegments — parsePathToSubpaths: Z-then-draw regression (SVG 1.1 §8.3.3)", () => {
  it("a drawing command right after Z starts a NEW open subpath at the closed loop's initial point, without corrupting the closed loop's closing edge", () => {
    // Regression test for a real bug fix: `d="M0,0 L10,0 L10,10 Z L20,20"`
    // previously emitted ONE closed loop running through (20,20) (corrupting
    // the closed triangle's closing edge). Per SVG 1.1 §8.3.3 it must instead
    // emit the closed triangle (0,0)-(10,0)-(10,10) PLUS a separate open tail
    // starting fresh at the closed loop's own initial point, (0,0)->(20,20).
    const svg = `<svg><path d="M0,0 L10,0 L10,10 Z L20,20" /></svg>`;
    const { segments } = svgToSegments(svg);

    expect(segments).toEqual([
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 10, zMm: 0 } },
      { startMm: { xMm: 10, zMm: 0 }, endMm: { xMm: 10, zMm: 10 } },
      { startMm: { xMm: 10, zMm: 10 }, endMm: { xMm: 0, zMm: 0 } }, // the triangle's closing edge
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 20, zMm: 20 } }, // the new open tail
    ]);

    // No edge touches (20,20) except the open tail's own endpoint — in
    // particular NOT an edge from (10,10), which the old (buggy) behaviour
    // would have produced.
    const touching2020 = segments.filter(
      (s) =>
        (s.startMm.xMm === 20 && s.startMm.zMm === 20) || (s.endMm.xMm === 20 && s.endMm.zMm === 20),
    );
    expect(touching2020).toEqual([{ startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 20, zMm: 20 } }]);
  });
});

describe("svgToSegments — elliptical arc (A) flattening", () => {
  it("sweep=0 vs sweep=1 flatten to mirror-image midpoints (rx=ry=50 = half the chord ⇒ an exact semicircle)", () => {
    // rx=ry=50, chord from (0,0) to (100,0) is exactly 100 = 2*50, so the SVG
    // 1.1 Appendix F.6 endpoint-to-centre construction is forced to centre
    // the ellipse at the chord's own midpoint for BOTH sweep flags: dx2=-50,
    // dy2=0 ⇒ x1p=-50,y1p=0; numerator = rxSq*rySq - rxSq*y1pSq - rySq*x1pSq
    // = 2500*2500 - 0 - 2500*2500 = 0 ⇒ co=0 ⇒ centre=(50,0) either way.
    // theta1=π; |dTheta|=π either way, but the SIGN flips with sweep (the
    // `!sweep`/`sweep` 2π adjustment in flattenArc): sweep=1 ⇒ dTheta=+π,
    // sweep=0 ⇒ dTheta=-π. At the flattened chain's exact midpoint (the 8th
    // of the 16 fixed subdivisions, t=0.5):
    //   sweep=1: theta=π+π/2=3π/2 ⇒ (50+50·cos(3π/2), 0+50·sin(3π/2)) = (50,-50)
    //   sweep=0: theta=π+(-π)/2=π/2 ⇒ (50+50·cos(π/2),  0+50·sin(π/2))  = (50, 50)
    const sweep1 = svgToSegments(`<svg><path d="M0,0 A50,50 0 0,1 100,0"/></svg>`).segments;
    const sweep0 = svgToSegments(`<svg><path d="M0,0 A50,50 0 0,0 100,0"/></svg>`).segments;

    expect(sweep1).toHaveLength(16);
    expect(sweep0).toHaveLength(16);
    // The 8th chord's end vertex is the flattened chain's exact midpoint.
    expect(sweep1[7].endMm).toEqual({ xMm: 50, zMm: -50 });
    expect(sweep0[7].endMm).toEqual({ xMm: 50, zMm: 50 });
    // Both land on the same requested end regardless of sweep direction.
    expect(sweep1[15].endMm).toEqual({ xMm: 100, zMm: 0 });
    expect(sweep0[15].endMm).toEqual({ xMm: 100, zMm: 0 });
  });

  it("large-arc=1 sweeps the complementary (major) arc of the same circle, with a different chord count and extent than large-arc=0", () => {
    // rx=ry=80 > half-chord (50), so — unlike the degenerate r=50 case above,
    // where both flags coincide — the two large-arc flags select genuinely
    // different arcs of the SAME circle. Values below were observed by
    // running the importer on this fixture (rx=ry=80, sweep=1 both cases).
    const minor = svgToSegments(`<svg><path d="M0,0 A80,80 0 0,1 100,0"/></svg>`).segments;
    const major = svgToSegments(`<svg><path d="M0,0 A80,80 0 1,1 100,0"/></svg>`).segments;

    // Chord count: ceil(|dTheta| / (π/16)) — observed 7 chords (short way
    // round) vs 26 chords (long way round), a stark difference.
    expect(minor).toHaveLength(7);
    expect(major).toHaveLength(26);

    // Extent: the minor arc dips to zMm=-17 at its deepest; the major arc —
    // sweeping almost the whole circle — dips far further, to zMm=-142.
    const minZ = (segs: typeof minor) => Math.min(...segs.map((s) => s.endMm.zMm));
    expect(minZ(minor)).toBe(-17);
    expect(minZ(major)).toBe(-142);

    // Both still land exactly on the requested end point.
    expect(minor[minor.length - 1].endMm).toEqual({ xMm: 100, zMm: 0 });
    expect(major[major.length - 1].endMm).toEqual({ xMm: 100, zMm: 0 });
  });

  it("upscales rx/ry uniformly when the requested radius is too small for the chord (lambda>1), still landing exactly on the endpoint", () => {
    // Chord half-length is 50; rx=ry=10 gives lambda = 50²/10² = 25 > 1,
    // which forces the uniform scale s=sqrt(25)=5, i.e. an EFFECTIVE
    // rx=ry=50 — exactly the degenerate semicircle fixture above. If the
    // up-scaling branch were skipped, or scaled rx/ry non-uniformly, this
    // would not reproduce that fixture's flattened points at all.
    const upscaled = svgToSegments(`<svg><path d="M0,0 A10,10 0 0,1 100,0"/></svg>`).segments;
    const reference = svgToSegments(`<svg><path d="M0,0 A50,50 0 0,1 100,0"/></svg>`).segments;
    expect(upscaled).toEqual(reference);
    expect(upscaled[upscaled.length - 1].endMm).toEqual({ xMm: 100, zMm: 0 });
  });
});

describe("svgToSegments — cubic (C) and quadratic (Q) Bézier flattening", () => {
  it("cubic C: endpoints exact, interior sample bows toward the control points", () => {
    // p0=(0,0), p1=(0,100), p2=(100,100), p3=(100,0): a symmetric S-shaped
    // control pair. At t=0.5 — the flattened chain's exact midpoint, the 8th
    // of BEZIER_FLATTEN_SEGMENTS=16 fixed subdivisions — the cubic Bernstein
    // weights are (0.125, 0.375, 0.375, 0.125), so:
    //   y = 0.125*0 + 0.375*100 + 0.375*100 + 0.125*0 = 75
    //   x = 0.125*0 + 0.375*0   + 0.375*100 + 0.125*100 = 50
    // 75 sits strictly between the straight chord's y (0, since p0.y=p3.y=0)
    // and the controls' y (100): the curve bows toward the controls rather
    // than cutting the chord.
    const { segments } = svgToSegments(`<svg><path d="M0,0 C0,100 100,100 100,0"/></svg>`);
    expect(segments).toHaveLength(16);
    expect(segments[0].startMm).toEqual({ xMm: 0, zMm: 0 }); // p0, exact
    expect(segments[15].endMm).toEqual({ xMm: 100, zMm: 0 }); // p3, exact (pinned against float drift)
    expect(segments[7].endMm).toEqual({ xMm: 50, zMm: 75 });
  });

  it("quadratic Q: endpoints exact, interior sample bows toward the single control point", () => {
    // p0=(0,0), control=(50,100), p2=(100,0). At t=0.5 the quadratic weights
    // are (0.25, 0.5, 0.25): y = 0.25*0 + 0.5*100 + 0.25*0 = 50; x = 0.25*0 +
    // 0.5*50 + 0.25*100 = 50 — again strictly between the chord (y=0) and
    // the control (y=100).
    const { segments } = svgToSegments(`<svg><path d="M0,0 Q50,100 100,0"/></svg>`);
    expect(segments).toHaveLength(16);
    expect(segments[0].startMm).toEqual({ xMm: 0, zMm: 0 });
    expect(segments[15].endMm).toEqual({ xMm: 100, zMm: 0 });
    expect(segments[7].endMm).toEqual({ xMm: 50, zMm: 50 });
  });
});

describe("svgToSegments — relative path commands", () => {
  it("m/l/h/v/c/q/a produce identical segments to their absolute-command twin", () => {
    // Every relative offset below is hand-derived from the CURRENT point at
    // that step of the absolute twin (not from the subpath start), matching
    // SVG's own relative-command semantics — e.g. the `q` control offset is
    // relative to the cursor after the preceding `c`, not to (0,0).
    const abs = `<svg><path d="M10,10 L20,10 L20,20 H10 V10 C10,10 20,20 30,10 Q10,10 40,10 A5,5 0 0,1 45,15"/></svg>`;
    const rel = `<svg><path d="m10,10 l10,0 l0,10 h-10 v-10 c0,0 10,10 20,0 q-20,0 10,0 a5,5 0 0,1 5,5"/></svg>`;
    expect(svgToSegments(rel).segments).toEqual(svgToSegments(abs).segments);
    // Sanity: the twin fixture actually exercises curves (not just lines).
    expect(svgToSegments(abs).segments.length).toBeGreaterThan(10);
  });
});

describe("svgToSegments — implicit command repetition", () => {
  it("extra coordinate pairs after M repeat as absolute L", () => {
    const implicit = svgToSegments(`<svg><path d="M 0 0 10 0 10 10"/></svg>`).segments;
    const explicit = svgToSegments(`<svg><path d="M 0 0 L 10 0 L 10 10"/></svg>`).segments;
    expect(implicit).toEqual(explicit);
    expect(implicit).toEqual([
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 10, zMm: 0 } },
      { startMm: { xMm: 10, zMm: 0 }, endMm: { xMm: 10, zMm: 10 } },
    ]);
  });

  it("extra coordinate pairs after m repeat as RELATIVE l, accumulating from the current point", () => {
    // If the repeats were (incorrectly) absolute, the third point would land
    // at (10,10); because they are relative lineto, it accumulates instead
    // to (10+10, 0+10) = (20,10).
    const { segments } = svgToSegments(`<svg><path d="m 0 0 10 0 10 10"/></svg>`);
    expect(segments).toEqual([
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 10, zMm: 0 } },
      { startMm: { xMm: 10, zMm: 0 }, endMm: { xMm: 20, zMm: 10 } },
    ]);
  });
});

describe("svgToSegments — multiple subpaths in one d attribute", () => {
  it("two Z-closed loops in a single d attribute produce two independent closed loops", () => {
    const { segments } = svgToSegments(
      `<svg><path d="M0,0 L10,0 L10,10 Z M20,20 L30,20 L30,30 Z"/></svg>`,
    );
    expect(segments).toEqual([
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 10, zMm: 0 } },
      { startMm: { xMm: 10, zMm: 0 }, endMm: { xMm: 10, zMm: 10 } },
      { startMm: { xMm: 10, zMm: 10 }, endMm: { xMm: 0, zMm: 0 } },
      { startMm: { xMm: 20, zMm: 20 }, endMm: { xMm: 30, zMm: 20 } },
      { startMm: { xMm: 30, zMm: 20 }, endMm: { xMm: 30, zMm: 30 } },
      { startMm: { xMm: 30, zMm: 30 }, endMm: { xMm: 20, zMm: 20 } },
    ]);
  });
});

describe("svgToSegments — transform parsing", () => {
  it("matrix(a,b,c,d,e,f) applies the SVG convention exactly: x'=ax+cy+e, y'=bx+dy+f", () => {
    // matrix(1,2,3,4,5,6): (1,0) -> (1*1+3*0+5, 2*1+4*0+6) = (6,8);
    //                       (0,1) -> (1*0+3*1+5, 2*0+4*1+6) = (8,10).
    const { segments } = svgToSegments(
      `<svg><g transform="matrix(1,2,3,4,5,6)"><line x1="1" y1="0" x2="0" y2="1"/></g></svg>`,
    );
    expect(segments).toEqual([{ startMm: { xMm: 6, zMm: 8 }, endMm: { xMm: 8, zMm: 10 } }]);
  });

  it("rotate(45, cx, cy) rotates about a non-origin centre", () => {
    // rotate(45,10,10) = translate(10,10) ∘ rotate(45) ∘ translate(-10,-10).
    // Point (20,10): offset from centre = (10,0).
    //   rotated offset = (10·cos45 - 0·sin45, 10·sin45 + 0·cos45) = (5√2, 5√2) ≈ (7.0711, 7.0711)
    //   + centre (10,10) = (17.0711, 17.0711) -> rounds to (17,17)
    // Point (10,20): offset from centre = (0,10).
    //   rotated offset = (0·cos45 - 10·sin45, 0·sin45 + 10·cos45) = (-5√2, 5√2) ≈ (-7.0711, 7.0711)
    //   + centre (10,10) = (2.9289, 17.0711) -> rounds to (3,17)
    const { segments } = svgToSegments(
      `<svg><g transform="rotate(45,10,10)"><line x1="20" y1="10" x2="10" y2="20"/></g></svg>`,
    );
    expect(segments).toEqual([{ startMm: { xMm: 17, zMm: 17 }, endMm: { xMm: 3, zMm: 17 } }]);
  });

  it("skewX(deg) shears x by y*tan(deg), leaving y unchanged", () => {
    // skewX(45): x' = x + y*tan(45°) ≈ x + y (tan(45°) is 1 to within float
    // precision); y'=y. Point (0,10) -> (~10,10); point (5,10) -> (~15,10).
    const { segments } = svgToSegments(
      `<svg><line transform="skewX(45)" x1="0" y1="10" x2="5" y2="10"/></svg>`,
    );
    expect(segments).toEqual([{ startMm: { xMm: 10, zMm: 10 }, endMm: { xMm: 15, zMm: 10 } }]);
  });

  it("nested <g> transforms compose ancestor-then-own — the CHILD's transform runs first, then the PARENT's — and swapping the nesting order changes the result", () => {
    // Local points (0,0) and (1,0), transformed two different ways using the
    // SAME two transform functions in opposite nesting.
    //
    // Fixture A: outer(parent)=translate(10,0), inner(child)=rotate(90).
    //   child first: rotate90(0,0)=(0,0); rotate90(1,0)=(0,1)
    //     [90°: x'=x·cos90-y·sin90=0, y'=x·sin90+y·cos90=1]
    //   then parent: translate10 -> (10,0) and (10,1).
    const a = svgToSegments(
      `<svg><g transform="translate(10,0)"><g transform="rotate(90)"><line x1="0" y1="0" x2="1" y2="0"/></g></g></svg>`,
    ).segments;
    expect(a).toEqual([{ startMm: { xMm: 10, zMm: 0 }, endMm: { xMm: 10, zMm: 1 } }]);

    // Fixture B: outer(parent)=rotate(90), inner(child)=translate(10,0) — the
    // nesting is swapped. If composition order didn't matter this would
    // equal A; it must not.
    //   child first: translate10(0,0)=(10,0); translate10(1,0)=(11,0)
    //   then parent: rotate90(10,0)=(0,10); rotate90(11,0)=(0,11)
    const b = svgToSegments(
      `<svg><g transform="rotate(90)"><g transform="translate(10,0)"><line x1="0" y1="0" x2="1" y2="0"/></g></g></svg>`,
    ).segments;
    expect(b).toEqual([{ startMm: { xMm: 0, zMm: 10 }, endMm: { xMm: 0, zMm: 11 } }]);

    expect(a).not.toEqual(b);
  });
});

describe("svgToSegments — path/attribute number lexer", () => {
  it("parses scientific notation (1e3, 2.5E-1) in coordinate attributes", () => {
    // svgUnitsToMm=100 keeps the small operand's rounded output non-zero and
    // legible: 1e3 units = 1000 * 100 = 100000mm; 2.5E-1 units = 0.25 * 100
    // = 25mm exactly (0.25 is exactly representable in binary).
    const { segments } = svgToSegments(`<svg><line x1="1e3" y1="0" x2="2.5E-1" y2="0"/></svg>`, 100);
    expect(segments).toEqual([{ startMm: { xMm: 100_000, zMm: 0 }, endMm: { xMm: 25, zMm: 0 } }]);
  });

  it("splits compact numbers with no separator: a bare '-' starts a new number, a second leading '.' starts a new number", () => {
    // Path-data numbers need no separator between them when the boundary is
    // unambiguous: "10-5" lexes as 10, -5 (the '-' cannot continue the first
    // number, which has no exponent); ".5.5" lexes as 0.5, 0.5 (a second '.'
    // cannot continue the first number). "L10-5" -> point (10,-5); the
    // implicit-repeat lineto ".5.5" -> point (0.5,0.5), which Math.round
    // takes to (1,1) (JS rounds .5 up, toward +Infinity).
    const { segments } = svgToSegments(`<svg><path d="M0,0 L10-5 .5.5"/></svg>`);
    expect(segments).toEqual([
      { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 10, zMm: -5 } },
      { startMm: { xMm: 10, zMm: -5 }, endMm: { xMm: 1, zMm: 1 } },
    ]);
  });

  it("arc flags may be packed with no separator ('A5,5 0 1110,10') — identical to the fully-separated spelling", () => {
    // readFlag() always consumes exactly one character regardless of what
    // follows, so two flags packed directly against following digits parse
    // correctly: the flag scanner takes the first two '1' characters, then
    // the ordinary number scanner reads the remaining "10,10" — exactly as
    // if the path had been written "0 1,1,10,10" with every value separated.
    const compact = svgToSegments(`<svg><path d="M0,0 A5,5 0 1110,10"/></svg>`).segments;
    const explicit = svgToSegments(`<svg><path d="M0,0 A5,5 0 1,1,10,10"/></svg>`).segments;
    expect(compact).toEqual(explicit);
    // A real (non-degenerate) flattened arc, not a single fallback line —
    // confirms the flags/endpoint were parsed as an actual large+swept arc.
    expect(compact.length).toBeGreaterThan(1);
  });
});

describe("svgToSegments — XML entity/comment/CDATA/attribute-value edge cases", () => {
  it("decodes named and numeric entity references in ordinary text content", () => {
    const { labels } = svgToSegments(
      `<svg><text x="0" y="0">A &amp; B &lt;tag&gt; &quot;quoted&quot;</text></svg>`,
    );
    expect(labels).toEqual([{ text: 'A & B <tag> "quoted"', positionMm: { xMm: 0, zMm: 0 } }]);
  });

  it("does NOT entity-decode CDATA section content (correct per XML: CDATA is literal, not subject to entity replacement)", () => {
    const { labels } = svgToSegments(`<svg><text x="0" y="0"><![CDATA[A &amp; B]]></text></svg>`);
    // If CDATA were (incorrectly) run through the same entity decoder as
    // ordinary text, this would come out as "A & B" instead.
    expect(labels).toEqual([{ text: "A &amp; B", positionMm: { xMm: 0, zMm: 0 } }]);
  });

  it("skips XML comments between text runs, collapsing/trimming the resulting whitespace", () => {
    const { labels } = svgToSegments(`<svg><text x="0" y="0">HELLO <!-- c --> WORLD</text></svg>`);
    expect(labels).toEqual([{ text: "HELLO WORLD", positionMm: { xMm: 0, zMm: 0 } }]);
  });

  it("accepts a '>' character inside a quoted attribute value without ending the tag early", () => {
    const { segments } = svgToSegments(
      `<svg><rect data-layer="A>B" x="0" y="0" width="10" height="10"/></svg>`,
    );
    expect(segments).toHaveLength(4);
    expect(segments.every((s) => s.layer === "A>B")).toBe(true);
  });
});

describe("fromSvgString — data-layer attribute takes precedence over id for layer classification, inherited through nested <g>", () => {
  it("data-layer wins over a conflicting id on the SAME element", () => {
    const svg = `<svg>
      <polygon points="0,0 10000,0 10000,6000 0,6000" />
      <polygon id="NOT-MAPPED" data-layer="A-CORE" points="1000,1000 3000,1000 3000,3000 1000,3000" />
    </svg>`;
    // If `id` had won instead of `data-layer`, "NOT-MAPPED" would not match
    // the `core: ["A-CORE"]` mapping and this loop would fall through to a
    // void instead of a core.
    const spec = fromSvgString(svg, { core: ["A-CORE"] });
    expect(spec.cores).toHaveLength(1);
    expect(spec.voids).toHaveLength(0);
  });

  it("a data-layer set on an ancestor <g> is inherited by a child with neither its own id nor data-layer", () => {
    const svg = `<svg>
      <polygon points="0,0 10000,0 10000,6000 0,6000" />
      <g data-layer="A-CORE">
        <polygon points="1000,1000 3000,1000 3000,3000 1000,3000" />
      </g>
    </svg>`;
    const spec = fromSvgString(svg, { core: ["A-CORE"] });
    expect(spec.cores).toHaveLength(1);
    expect(spec.voids).toHaveLength(0);
  });
});
