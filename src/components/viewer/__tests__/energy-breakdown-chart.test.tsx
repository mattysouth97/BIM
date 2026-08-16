// src/components/viewer/__tests__/energy-breakdown-chart.test.tsx
// P1-07 (d) — chart palette must use the oklch --chart-N tokens directly.
// hsl(var(--chart-N)) was invalid CSS (bars fell back to black).

import { describe, it, expect } from "vitest";
import { chartConfig } from "../energy-breakdown-chart";

describe("energy-breakdown chartConfig (P1-07 d)", () => {
  it("references var(--chart-N) directly, never hsl(var(--chart-N))", () => {
    for (const entry of Object.values(chartConfig)) {
      expect(entry.color).toMatch(/^var\(--chart-\d\)$/);
      expect(entry.color).not.toContain("hsl(");
    }
  });

  it("maps each system to a distinct chart token", () => {
    const colors = Object.values(chartConfig).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
