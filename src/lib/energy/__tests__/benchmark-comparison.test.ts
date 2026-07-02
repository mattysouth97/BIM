// src/lib/energy/__tests__/benchmark-comparison.test.ts

import { describe, it, expect } from "vitest";
import { compareToBenchmark } from "../benchmark-comparison";

describe("compareToBenchmark", () => {
  describe("office building at p50 value", () => {
    it("returns percentile near 50 and performance 'average'", () => {
      // 2000s office p50 = 220
      const result = compareToBenchmark(220, "office", "2000s");
      expect(result.percentile).toBeCloseTo(50, 0);
      expect(result.performance).toBe("average");
    });

    it("populates all required fields", () => {
      const result = compareToBenchmark(220, "office", "2000s");
      expect(result.buildingDemand).toBe(220);
      expect(result.p25).toBe(165);
      expect(result.p50).toBe(220);
      expect(result.p75).toBe(295);
      expect(result.peerGroup.useType).toBe("office");
      expect(result.peerGroup.era).toBe("2000s");
      expect(result.peerGroup.region).toBe("national");
    });
  });

  describe("very efficient building below p25", () => {
    it("returns performance 'excellent'", () => {
      // 2010s office p25 = 130; demand well below p25
      const result = compareToBenchmark(80, "office", "2010s");
      expect(result.performance).toBe("excellent");
    });

    it("returns percentile below 25", () => {
      const result = compareToBenchmark(80, "office", "2010s");
      expect(result.percentile).toBeLessThan(25);
    });
  });

  describe("inefficient building above p75", () => {
    it("returns performance 'poor'", () => {
      // 2000s office p75 = 295; demand well above
      const result = compareToBenchmark(400, "office", "2000s");
      expect(result.performance).toBe("poor");
    });

    it("returns percentile above 75", () => {
      const result = compareToBenchmark(400, "office", "2000s");
      expect(result.percentile).toBeGreaterThan(75);
    });
  });

  describe("building between p25 and p50", () => {
    it("returns performance 'good'", () => {
      // 2000s office: p25=165, p50=220; midpoint ≈ 192
      const result = compareToBenchmark(192, "office", "2000s");
      expect(result.performance).toBe("good");
    });

    it("returns percentile between 25 and 50", () => {
      const result = compareToBenchmark(192, "office", "2000s");
      expect(result.percentile).toBeGreaterThan(25);
      expect(result.percentile).toBeLessThan(50);
    });
  });

  describe("building between p50 and p75", () => {
    it("returns performance 'below-average'", () => {
      // 2000s office: p50=220, p75=295; midpoint ≈ 257
      const result = compareToBenchmark(257, "office", "2000s");
      expect(result.performance).toBe("below-average");
    });

    it("returns percentile between 50 and 75", () => {
      const result = compareToBenchmark(257, "office", "2000s");
      expect(result.percentile).toBeGreaterThan(50);
      expect(result.percentile).toBeLessThan(75);
    });
  });

  describe("unknown use type falls back gracefully", () => {
    it("does not throw for an unrecognised use type", () => {
      expect(() =>
        compareToBenchmark(200, "warehouse", "2000s"),
      ).not.toThrow();
    });

    it("uses a default peer group (office) when use type is unknown", () => {
      const result = compareToBenchmark(200, "warehouse", "2000s");
      expect(result.peerGroup.useType).toBe("office");
    });

    it("still returns a valid performance classification", () => {
      const result = compareToBenchmark(200, "warehouse", "2000s");
      const valid = [
        "excellent",
        "good",
        "average",
        "below-average",
        "poor",
      ];
      expect(valid).toContain(result.performance);
    });
  });

  describe("insight string", () => {
    it("contains meaningful comparison text with percentile", () => {
      const result = compareToBenchmark(220, "office", "2000s");
      expect(result.insight).toMatch(/percentile/i);
      expect(result.insight).toMatch(/\d+%/);
    });

    it("mentions the use type", () => {
      const result = compareToBenchmark(220, "office", "2000s");
      expect(result.insight).toMatch(/office/i);
    });

    it("mentions the era", () => {
      const result = compareToBenchmark(220, "office", "2000s");
      expect(result.insight).toMatch(/2000s/);
    });

    it("reflects efficient performance in the text", () => {
      const result = compareToBenchmark(80, "office", "2010s");
      expect(result.insight).toMatch(/more efficient/i);
    });

    it("reflects poor performance in the text", () => {
      const result = compareToBenchmark(400, "office", "2000s");
      expect(result.insight).toMatch(/less efficient/i);
    });
  });

  describe("residential benchmarks", () => {
    it("2010s residential at p50 → average", () => {
      const result = compareToBenchmark(100, "residential", "2010s");
      expect(result.performance).toBe("average");
      expect(result.p50).toBe(100);
    });
  });

  describe("percentile is clamped to [0, 100]", () => {
    it("never exceeds 100 for very high demand", () => {
      const result = compareToBenchmark(10000, "office", "2000s");
      expect(result.percentile).toBeLessThanOrEqual(100);
    });

    it("never goes below 0 for zero demand", () => {
      const result = compareToBenchmark(0, "office", "2000s");
      expect(result.percentile).toBeGreaterThanOrEqual(0);
    });
  });
});
