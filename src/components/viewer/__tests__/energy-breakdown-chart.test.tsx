// src/components/viewer/__tests__/energy-breakdown-chart.test.tsx
// P1-07 (d) — chart palette must use the oklch --chart-N tokens directly.
// hsl(var(--chart-N)) was invalid CSS (bars fell back to black).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { chartConfig, EnergyBreakdownChart } from "../energy-breakdown-chart";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useAppStore } from "@/store/app-store";
import { makeRecipe } from "@/hooks/__tests__/test-fixtures";
import { inferMaterialProperties } from "@/lib/material-inference";
import type { BrTitleInfo } from "@/lib/types";
import { calculateSystemBreakdown } from "@/lib/energy/system-breakdown";
import { SEOUL_CLIMATE } from "@/lib/energy/climate-data";

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

describe("rendered lighting explanation", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it.each(["ko", "en"] as const)("%s: the displayed equation reproduces the lighting kWh", (language) => {
    const pk = "lighting-caption";
    const recipe = { ...makeRecipe(), mainPurpsCd: "14000" };
    const materials = inferMaterialProperties({ mainPurpsCd: "14000", pmsDay: "20000101" } as BrTitleInfo, []);
    useAppStore.setState({ language });
    useRecipeStore.setState({ baseRecipes: { [pk]: recipe }, overrides: {} });
    useMaterialStore.setState({ properties: { [pk]: materials } });
    const { container: element } = render(<EnergyBreakdownChart buildingPk={pk} />);
    const explanation = element.querySelector('[data-testid="lighting-load-explanation"]')!;
    const equation = explanation.querySelector("p")!.textContent!;
    const numbers = equation.match(/([\d.]+) W\/m² × ([\d.]+) m² × ([\d.]+) (?:시간\/년|h\/yr) ÷ 1000 = ([\d.]+) kWh\/yr/);
    expect(numbers).not.toBeNull();
    const [, lpd, area, hours, kwh] = numbers!.map(Number);
    expect(lpd).toBe(materials.lighting.lightingPowerDensity);
    expect(lpd * area * hours / 1000).toBe(kwh);
    expect(kwh).toBe(calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE).lighting);
    expect(explanation.textContent).not.toContain("ASHRAE");
    const assumption = explanation.querySelectorAll("p")[1].textContent!;
    expect(Number(/(?:조명전력밀도|LPD) ([\d.]+) W\/m²/.exec(assumption)![1])).toBe(lpd);
    expect(assumption).toContain("14000");
    useAppStore.setState({ language: "ko" });
  });
});
