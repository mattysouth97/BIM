// src/hooks/__tests__/use-energy-breakdown.test.ts
// Vitest + @testing-library/react renderHook tests for useEnergyBreakdown.
// Covers: null-return, referential stability (Pitfall 1 guard), recomputation on change,
// and perFloor array length contract.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEnergyBreakdown } from "../use-energy-breakdown";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

// ── Test fixtures (copied from src/lib/energy/__tests__/system-breakdown.test.ts) ──

function makeMaterials(heatingEff = 87, coolingEff = 3.5): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2015,
    envelope: {
      walls: [
        { orientation: "N", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "S", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "E", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
        { orientation: "W", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
      ],
      roof: { uValue: 0.15, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.22, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: 1.5,
        shgc: 0.35,
        vlt: 0.5,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 1.5,
        shadingCoefficient: 0.4,
        windowToWallRatio: { N: 0.4, S: 0.4, E: 0.4, W: 0.4 },
      },
      foundation: { perimeterInsulationUValue: 0.3, groundTemperature: 13.5, moistureBarrier: "polyethylene" },
      airtightness: { ach50: 1.5, equivalentLeakageArea: 50, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: heatingEff, capacity: 20 },
      cooling: { systemType: "split", efficiency: coolingEff, capacity: 10 },
      ventilation: { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.5 },
      dhw: { systemType: "gas-boiler", efficiency: 85, storageVolume: 100 },
    },
    lighting: { lightingPowerDensity: 6, controlType: "manual", lampType: "led" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.04, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 3, hotWaterDemand: 40 },
  };
}

function makeRecipe(floorCount = 10, mainPurpsCd = "02000"): BuildingRecipe {
  const w = 11.2;
  const d = 7.5;
  const fh = 2.9;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * fh,
    height: fh,
    isGroundFloor: i === 0,
  }));

  return {
    footprintWidth: w,
    footprintDepth: d,
    floors,
    totalHeight: floorCount * fh,
    wallThickness: 0.332,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd,
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.35, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.582 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 20,
    siteDepth: 15,
    buildingName: "Test Building",
    address: "Seoul",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

const TEST_PK = "TEST-PK-23-02";

describe("useEnergyBreakdown", () => {
  beforeEach(() => {
    // Reset both Zustand stores between tests
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  it("returns null when materials are missing", () => {
    useRecipeStore.setState({ baseRecipes: { [TEST_PK]: makeRecipe() } });
    const { result } = renderHook(() => useEnergyBreakdown(TEST_PK));
    expect(result.current).toBeNull();
  });

  it("returns null when recipe is missing", () => {
    useMaterialStore.setState({ properties: { [TEST_PK]: makeMaterials() } });
    const { result } = renderHook(() => useEnergyBreakdown(TEST_PK));
    expect(result.current).toBeNull();
  });

  it("returns a SystemBreakdown when both stores are populated", () => {
    useMaterialStore.setState({ properties: { [TEST_PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [TEST_PK]: makeRecipe() } });
    const { result } = renderHook(() => useEnergyBreakdown(TEST_PK));
    expect(result.current).not.toBeNull();
    expect(result.current!.hvac).toBeGreaterThan(0);
    expect(result.current!.hvacDataSource).toBe("estimated-ratio");
  });

  it("returns the same reference across unrelated re-renders (stability)", () => {
    useMaterialStore.setState({ properties: { [TEST_PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [TEST_PK]: makeRecipe() } });
    const { result, rerender } = renderHook(
      ({ pk }) => useEnergyBreakdown(pk),
      { initialProps: { pk: TEST_PK } }
    );
    const first = result.current;
    rerender({ pk: TEST_PK });
    // Referential equality (===), not just deep equality — critical Pitfall 1 guard
    expect(result.current).toBe(first);
  });

  it("returns a new reference after a material change", () => {
    useMaterialStore.setState({ properties: { [TEST_PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [TEST_PK]: makeRecipe() } });
    const { result, rerender } = renderHook(() => useEnergyBreakdown(TEST_PK));
    const first = result.current;
    // Mutate materials via setState with a NEW object reference (different HVAC efficiencies)
    useMaterialStore.setState({
      properties: { [TEST_PK]: makeMaterials(90, 4.0) },
    });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current!.hvac).toBeGreaterThan(0);
  });

  it("perFloor length equals above-grade floor count", () => {
    useMaterialStore.setState({ properties: { [TEST_PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [TEST_PK]: makeRecipe(8) } });
    const { result } = renderHook(() => useEnergyBreakdown(TEST_PK));
    expect(result.current!.perFloor).toHaveLength(8);
  });
});
