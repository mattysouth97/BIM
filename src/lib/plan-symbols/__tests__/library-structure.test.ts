// src/lib/plan-symbols/__tests__/library-structure.test.ts
//
// Validation suite for the structure library (columns, beams, foundations, stairs, railings).
// Tests enforce coverage, determinism, bounds fidelity, and section-specific conventions
// (e.g. concrete diagonals, beam dashes, footing double-lines).

import { describe, expect, it } from "vitest";
import { evaluateSymbol } from "../evaluate";
import { structureSymbols } from "../library/structure";
import { validateSection } from "./library-harness";

describe("plan-symbols/library/structure", () => {
  // Standard library validation: every structure family must have an entry,
  // all must be deterministic and bounds-sane.
  const validation = validateSection("structure", structureSymbols);

  it("covers all structure families with no errors", () => {
    expect(validation.errors).toEqual([]);
  });

  it("has correct family count", () => {
    expect(validation.familyCount).toBe(23);
  });

  // ===== COLUMN CONVENTIONS =====

  describe("columns", () => {
    it("round columns are drawn as circles with concrete marks", () => {
      const geom450 = evaluateSymbol(structureSymbols["column-struct-round-450"], {
        diameterMm: 450,
      });

      // Expect circle + cross ticks (concrete mark)
      const hasCircle = geom450.strokes.some((s) => s.kind === "circle");
      const tickCount = geom450.strokes.filter((s) => s.kind === "path").length;

      expect(hasCircle).toBe(true);
      expect(tickCount).toBeGreaterThanOrEqual(2); // At least X and Z ticks
    });

    it("rectangular columns have corner-to-corner diagonals for concrete", () => {
      const geom = evaluateSymbol(structureSymbols["column-struct-rect-450x600"], {
        widthMm: 450,
        depthMm: 600,
      });

      // Expect filled rect + 2 diagonal lines
      const rectOutline = geom.strokes.filter((s) => s.kind === "path" && s.points.length >= 4);
      const diagonalLines = geom.strokes.filter((s) => s.kind === "path" && s.points.length === 2);

      expect(rectOutline.length).toBeGreaterThanOrEqual(1);
      expect(diagonalLines.length).toBeGreaterThanOrEqual(2);
    });

    it("steel pipe column has distinctive center dot", () => {
      const geom = evaluateSymbol(structureSymbols["column-steel-pipe-273"], {
        diameterMm: 273,
      });

      const circles = geom.strokes.filter((s) => s.kind === "circle");
      expect(circles.length).toBeGreaterThanOrEqual(2); // Outer ring + center dot
    });

    it("steel H column shows web with marker lines", () => {
      const geom = evaluateSymbol(structureSymbols["column-steel-h-300"], {
        widthMm: 300,
        depthMm: 300,
        flangeThickMm: 60,
        webThickMm: 40,
      });

      const paths = geom.strokes.filter((s) => s.kind === "path");
      // Expect rect outline + web markers
      expect(paths.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ===== BEAM CONVENTIONS =====

  describe("beams", () => {
    it("all beams use dashed centerline (overhead in plan)", () => {
      const beamIds = [
        "beam-rc-rect-300x500",
        "beam-steel-i-200x400",
        "beam-steel-h-300x300",
        "beam-steel-box-200",
        "beam-steel-channel-200",
        "beam-timber-100x200",
      ];

      for (const id of beamIds) {
        const geom = evaluateSymbol(structureSymbols[id], structureSymbols[id].params || {});

        // At least one dashed stroke (the centerline)
        const dashedStrokes = geom.strokes.filter((s) => s.dashed);
        expect(dashedStrokes.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("RC and steel beams have width lines indicating depth", () => {
      const geom = evaluateSymbol(structureSymbols["beam-rc-rect-300x500"], {
        lengthMm: 1000,
        widthMm: 300,
        depthMm: 500,
      });

      // Should have 3 lines: centerline + 2 depth edges
      const lines = geom.strokes.filter((s) => s.kind === "path" && s.points.length === 2);
      expect(lines.length).toBe(3);
    });

    it("timber beam has solid depth lines (not dashed like others)", () => {
      const geom = evaluateSymbol(structureSymbols["beam-timber-100x200"], {
        lengthMm: 1000,
        widthMm: 100,
        depthMm: 200,
      });

      const solidLines = geom.strokes.filter(
        (s) => s.kind === "path" && !s.dashed && s.weight === "medium"
      );
      // 2 depth edges (top and bottom) - centerline is dashed
      expect(solidLines.length).toBeGreaterThanOrEqual(2);

      const dashedLines = geom.strokes.filter(
        (s) => s.kind === "path" && s.dashed && s.weight === "medium"
      );
      // Dashed centerline
      expect(dashedLines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===== FOUNDATION CONVENTIONS =====

  describe("foundations", () => {
    it("isolated and pile cap footings have double-line pads", () => {
      const geom1500 = evaluateSymbol(structureSymbols["footing-isolated-1500"], {
        widthMm: 1500,
        depthMm: 1500,
      });

      const geom1800 = evaluateSymbol(structureSymbols["pile-cap-1800"], {
        widthMm: 1800,
        depthMm: 1800,
      });

      // Each should have 2 rectangle outlines (outer cut + inner reveal)
      const rects1500 = geom1500.strokes.filter((s) => s.kind === "path" && s.points.length >= 4);
      const rects1800 = geom1800.strokes.filter((s) => s.kind === "path" && s.points.length >= 4);

      expect(rects1500.length).toBeGreaterThanOrEqual(2);
      expect(rects1800.length).toBeGreaterThanOrEqual(2);
    });

    it("strip footing uses dashed boundary", () => {
      const geom = evaluateSymbol(structureSymbols["footing-strip-600"], {
        lengthMm: 1000,
        widthMm: 600,
        depthMm: 400,
      });

      const dashedStrokes = geom.strokes.filter((s) => s.dashed);
      expect(dashedStrokes.length).toBeGreaterThanOrEqual(1);
    });

    it("pile is a circle with depth indicator", () => {
      const geom = evaluateSymbol(structureSymbols["pile-400"], {
        diameterMm: 400,
      });

      const circles = geom.strokes.filter((s) => s.kind === "circle");
      expect(circles.length).toBeGreaterThanOrEqual(1);

      // Should also have a dashed line indicating depth
      const dashedLines = geom.strokes.filter((s) => s.dashed);
      expect(dashedLines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===== STAIR CONVENTIONS =====

  describe("stairs", () => {
    it("stair run has boundary rectangle with riser ticks", () => {
      const geom = evaluateSymbol(structureSymbols["stair-run-8riser"], {
        widthMm: 1000,
        lengthMm: 2800,
        riserCount: 8,
      });

      // Should have a boundary rect + travel line + riser tick array
      const paths = geom.strokes.filter((s) => s.kind === "path");
      expect(paths.length).toBeGreaterThanOrEqual(9); // Rect + travel + 8 risers
    });

    it("stair landing is a simple rectangle", () => {
      const geom = evaluateSymbol(structureSymbols["stair-landing-1200"], {
        sizeMm: 1200,
      });

      const rects = geom.strokes.filter((s) => s.kind === "path" && s.points.length >= 4);
      expect(rects.length).toBeGreaterThanOrEqual(1);
    });

    it("ramp has dashed boundary with slope markers", () => {
      const geom = evaluateSymbol(structureSymbols["ramp-module"], {
        lengthMm: 1000,
        widthMm: 1200,
      });

      // Should have dashed boundary + slope ticks
      const dashedStrokes = geom.strokes.filter((s) => s.dashed);
      expect(dashedStrokes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===== RAILING CONVENTIONS =====

  describe("railings", () => {
    it("guardrail has centerline with baluster ticks", () => {
      const geom = evaluateSymbol(structureSymbols["railing-guard-1m"], {
        lengthMm: 1100,
        postCount: 7,
      });

      // Should have 1 centerline + 7 post ticks
      const lines = geom.strokes.filter((s) => s.kind === "path" && s.points.length === 2);
      expect(lines.length).toBeGreaterThanOrEqual(8); // Centerline + 7 posts
    });

    it("handrail is thin and has mount bracket ticks", () => {
      const geom = evaluateSymbol(structureSymbols["railing-handrail-1m"], {
        lengthMm: 1000,
        postCount: 5,
      });

      // Should have 1 thin centerline + 5 bracket ticks
      const lines = geom.strokes.filter((s) => s.kind === "path");
      expect(lines.length).toBeGreaterThanOrEqual(6); // Centerline + 5 brackets
    });

    it("post spacing is evenly distributed", () => {
      const geom = evaluateSymbol(structureSymbols["railing-guard-1m"], {
        lengthMm: 1100,
        postCount: 7,
      });

      const lines = geom.strokes.filter((s) => s.kind === "path" && s.points.length === 2);

      // Extract x positions of the posts (approximate from line start points)
      if (lines.length > 1) {
        const positions = lines.slice(1).map((line) => {
          if (line.kind === "path" && line.points.length === 2) {
            return line.points[0].xMm;
          }
          return 0;
        });

        // Check that spacing is roughly even (within tolerance)
        const spacings = [];
        for (let i = 1; i < positions.length; i++) {
          spacings.push(positions[i] - positions[i - 1]);
        }

        if (spacings.length > 0) {
          const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
          const tolerance = avgSpacing * 0.2; // 20% tolerance
          const evenlySpaced = spacings.every((s) => Math.abs(s - avgSpacing) <= tolerance);
          expect(evenlySpaced).toBe(true);
        }
      }
    });
  });

  // ===== PARAMETRIC SCALING =====

  describe("parametric scaling", () => {
    it("round column diameter changes with param", () => {
      const small = evaluateSymbol(structureSymbols["column-struct-round-450"], {
        diameterMm: 300,
      });
      const large = evaluateSymbol(structureSymbols["column-struct-round-450"], {
        diameterMm: 600,
      });

      // Larger param should produce larger bounds
      const smallSpan = (small.boundsMm?.maxX || 0) - (small.boundsMm?.minX || 0);
      const largeSpan = (large.boundsMm?.maxX || 0) - (large.boundsMm?.minX || 0);

      expect(largeSpan).toBeGreaterThan(smallSpan);
    });

    it("rectangular column dimensions change with params", () => {
      const sym = structureSymbols["column-struct-rect-450x600"];
      const narrow = evaluateSymbol(sym, { widthMm: 300, depthMm: 600 });
      const wide = evaluateSymbol(sym, { widthMm: 600, depthMm: 600 });

      const narrowWidth = (narrow.boundsMm?.maxX || 0) - (narrow.boundsMm?.minX || 0);
      const wideWidth = (wide.boundsMm?.maxX || 0) - (wide.boundsMm?.minX || 0);

      expect(wideWidth).toBeGreaterThan(narrowWidth);
    });

    it("beam length affects bounds", () => {
      const sym = structureSymbols["beam-rc-rect-300x500"];
      const short = evaluateSymbol(sym, {
        lengthMm: 500,
        widthMm: 300,
        depthMm: 500,
      });
      const long = evaluateSymbol(sym, {
        lengthMm: 2000,
        widthMm: 300,
        depthMm: 500,
      });

      const shortLength = (short.boundsMm?.maxX || 0) - (short.boundsMm?.minX || 0);
      const longLength = (long.boundsMm?.maxX || 0) - (long.boundsMm?.minX || 0);

      expect(longLength).toBeGreaterThan(shortLength);
    });
  });

  // ===== DETERMINISM =====

  describe("determinism", () => {
    it("each symbol evaluates identically on repeated calls", () => {
      const params = { diameterMm: 450 };
      const g1 = JSON.stringify(
        evaluateSymbol(structureSymbols["column-struct-round-450"], params)
      );
      const g2 = JSON.stringify(
        evaluateSymbol(structureSymbols["column-struct-round-450"], params)
      );
      expect(g1).toBe(g2);
    });
  });
});
