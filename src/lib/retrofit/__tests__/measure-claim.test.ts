// Every chip on the measure row carries one line saying what that work does
// to this building. This file exists to stop that line drifting from the
// measure it names — AGENTS.md, "The label lies while the number is right":
// a test that merely asserted the words appeared would pass happily while the
// sentence contradicted the delta two rows below it.
//
// So each test PARSES the rendered line back into numbers and checks each
// against the source it was built from.

import { describe, it, expect } from "vitest";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { RetrofitMeasure } from "../retrofit-types";
import { SEOUL_CLIMATE } from "@/lib/energy/climate-data";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { computeRetrofitDelta } from "../retrofit-delta";
import { engineEnvelopeAreasFrom } from "@/hooks/use-retrofit-scenario";
import { formatKrw } from "@/lib/twin-formatters";
import {
  buildMeasureClaim,
  splitMeasureClaimLine,
  claimAreaSqm,
  measureDisplayName,
} from "../measure-claim";

function makeMaterials(): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 1995,
    envelope: {
      walls: (["N", "S", "E", "W"] as const).map((orientation) => ({
        orientation,
        uValue: 0.58,
        rValue: 1 / 0.58,
        layers: [],
        thermalBridge: 0,
        surfaceArea: 100,
      })),
      roof: { uValue: 0.6, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.7, layers: [], groundContactResistance: 0.4 },
      windows: {
        uValue: 2.1,
        shgc: 0.6,
        vlt: 0.7,
        glassType: "double",
        coating: "low-e",
        gasFill: "air",
        frameMaterial: "aluminum",
        airLeakageRate: 4,
        shadingCoefficient: 0.7,
        windowToWallRatio: { N: 0.3, S: 0.3, E: 0.3, W: 0.3 },
      },
      foundation: { perimeterInsulationUValue: 0.5, groundTemperature: 13, moistureBarrier: "none" },
      airtightness: { ach50: 8, equivalentLeakageArea: 120, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: 0.8, capacity: 100 },
      cooling: { systemType: "split", efficiency: 2.8, capacity: 80 },
      ventilation: { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.5 },
      dhw: { systemType: "gas-boiler", efficiency: 0.75, storageVolume: 200 },
    },
    lighting: { lightingPowerDensity: 18, controlType: "manual", lampType: "fluorescent" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.04, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 3, hotWaterDemand: 40 },
  };
}

function makeRecipe(floorCount = 5): BuildingRecipe {
  const floorHeight = 3;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * floorHeight,
    height: floorHeight,
    isGroundFloor: i === 0,
  }));
  return {
    footprintWidth: 20,
    footprintDepth: 15,
    floors,
    totalHeight: floorCount * floorHeight,
    wallThickness: 0.3,
    era: "1990-1999",
    strctCd: "21",
    mainPurpsCd: "14000",
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.3, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 40,
    siteDepth: 30,
    buildingName: "Claim Test Building",
    address: "Seoul",
  };
}

function measure(id: string, over: Partial<RetrofitMeasure> = {}): RetrofitMeasure {
  return {
    id,
    name: id,
    category: "envelope",
    description: id,
    estimatedCost: 41_000_000,
    annualEnergySaving: 1_000,
    annualCostSaving: 100_000,
    co2Reduction: 0.2,
    paybackYears: 10,
    ...over,
  };
}

const MATERIALS = makeMaterials();
const RECIPE = makeRecipe();
const AREAS = engineEnvelopeAreasFrom(
  calculateHeatLoss(MATERIALS, RECIPE, SEOUL_CLIMATE).elements,
  0,
)!;

const ALL_IDS = [
  "envelope-wall-insulation",
  "envelope-window-replacement",
  "envelope-roof-insulation",
  "envelope-floor-insulation",
  "hvac-boiler-upgrade",
  "lighting-led-smart",
  "solar-pv-flat",
];

const DELTA = computeRetrofitDelta({
  materials: MATERIALS,
  recipe: RECIPE,
  climate: SEOUL_CLIMATE,
  measureIds: ALL_IDS,
})!;

const EFFECT = new Map(DELTA.measures.map((e) => [e.measureId, e]));
const TOTAL_FLOOR_AREA = envelopeQuantities(RECIPE).intensityFloorAreaSqm;

function claimFor(id: string, over: Partial<RetrofitMeasure> = {}) {
  return buildMeasureClaim({
    measure: measure(id, over),
    effect: EFFECT.get(id),
    areas: AREAS,
    totalFloorAreaSqm: TOTAL_FLOOR_AREA,
    lang: "ko",
  });
}

describe("buildMeasureClaim — the line reproduces its own numbers", () => {
  it("leads a wall measure with the U-value the delta actually applied", () => {
    const claim = claimFor("envelope-wall-insulation");
    const [change] = splitMeasureClaimLine(claim.line);

    const parsed = /^외벽 U (\d+\.\d+) → (\d+\.\d+) W\/m²·K$/.exec(change);
    expect(parsed).not.toBeNull();
    const [, before, after] = parsed!;

    // The numbers in the sentence are the ones apply-phase wrote.
    expect(Number(before)).toBeCloseTo(0.58, 2);
    expect(Number(after)).toBeCloseTo(0.15, 2);
    // And they are the same pair the delta reports for this measure.
    const deltaChange = EFFECT.get("envelope-wall-insulation")!.changes.find(
      (c) => c.field === "envelope.walls[].uValue",
    )!;
    expect(change).toBe(deltaChange.summaryKo);
  });

  it("states the area the ENGINE priced, not a footprint standing in for it", () => {
    const wall = claimFor("envelope-wall-insulation");
    const roof = claimFor("envelope-roof-insulation");

    const areaOf = (line: string) => {
      const part = splitMeasureClaimLine(line)[1];
      const m = /^([\d,]+) m²$/.exec(part);
      expect(m).not.toBeNull();
      return Number(m![1].replace(/,/g, ""));
    };

    const window = claimFor("envelope-window-replacement");
    const floor = claimFor("envelope-floor-insulation");

    expect(areaOf(wall.line)).toBe(Math.round(AREAS.opaqueWallSqm));
    expect(areaOf(roof.line)).toBe(Math.round(AREAS.roofSqm));
    expect(areaOf(window.line)).toBe(Math.round(AREAS.windowSqm));
    expect(areaOf(floor.line)).toBe(Math.round(AREAS.groundFloorSqm));
    // The roof is priced at the roof surface, never at the plan area — those
    // differ the moment a building is not a single flat-topped box.
    expect(AREAS.roofSqm).toBeGreaterThan(0);
  });

  it("each envelope measure reads a DIFFERENT area field", () => {
    // On a 50 % WWR curtain wall the opaque wall and the aperture are equal by
    // arithmetic, and on a flat-topped prism the roof and the ground slab are
    // too — so equal numbers on screen prove nothing about the mapping. This
    // fixture is built with a WWR of 0.3 precisely so the four are distinct
    // and a switch branch pointing at the wrong field cannot hide.
    expect(AREAS.opaqueWallSqm).not.toBeCloseTo(AREAS.windowSqm, 1);
    expect(claimAreaSqm("envelope-wall-insulation", AREAS, 0)).toBe(
      AREAS.opaqueWallSqm,
    );
    expect(claimAreaSqm("envelope-window-replacement", AREAS, 0)).toBe(
      AREAS.windowSqm,
    );
    expect(claimAreaSqm("envelope-roof-insulation", AREAS, 0)).toBe(AREAS.roofSqm);
    expect(claimAreaSqm("envelope-floor-insulation", AREAS, 0)).toBe(
      AREAS.groundFloorSqm,
    );
  });

  it("states the cost the user would pay under the chosen financing", () => {
    // effectiveCapex carries the subsidy; without financials it falls back to
    // the unsubsidised estimate rather than inventing a discount.
    const unsubsidised = claimFor("envelope-wall-insulation");
    expect(splitMeasureClaimLine(unsubsidised.line).at(-1)).toBe(
      formatKrw(41_000_000, "ko"),
    );

    const subsidised = claimFor("envelope-wall-insulation", {
      financials: {
        npv: 1,
        irr: null,
        discountedPayback: 9,
        cashFlow: [],
        effectiveCapex: 12_300_000,
        subsidyValue: 28_700_000,
        resolvedFuel: "gas",
      },
    });
    expect(splitMeasureClaimLine(subsidised.line).at(-1)).toBe(
      formatKrw(12_300_000, "ko"),
    );
    expect(subsidised.costKrw).toBe(12_300_000);
  });

  it("every generated measure's line parses into the parts it claims", () => {
    for (const id of ALL_IDS) {
      const claim = claimFor(id);
      const parts = splitMeasureClaimLine(claim.line);
      // Cost is always last and always present.
      expect(parts.at(-1)).toBe(formatKrw(claim.costKrw, "ko"));
      // The change, when present, is verbatim from the delta.
      if (claim.change) {
        const effect = EFFECT.get(id)!;
        const summaries = effect.changes.map((c) => c.summaryKo);
        expect(summaries).toContain(claim.change);
        expect(parts[0]).toBe(claim.change);
      }
      // The area, when present, round-trips.
      if (claim.areaSqm !== undefined) {
        expect(parts).toContain(
          `${Math.round(claim.areaSqm).toLocaleString("en-US")} m²`,
        );
      }
    }
  });
});

describe("buildMeasureClaim — what the engine cannot price", () => {
  it("marks LED and PV as unpriced, and still says what they do", () => {
    for (const id of ["lighting-led-smart", "solar-pv-flat"]) {
      const claim = claimFor(id);
      expect(claim.pricedByEngine).toBe(false);
      // The work is real even where this engine cannot price it — the chip
      // states the change and carries the caveat separately.
      expect(claim.change).toBeDefined();
      expect(claim.line.length).toBeGreaterThan(0);
    }
  });

  it("marks an envelope measure as priced", () => {
    expect(claimFor("envelope-wall-insulation").pricedByEngine).toBe(true);
  });

  it("leads a window measure with the U-value, not the glazing spec", () => {
    // Both changes exist; the priced one wins, so the line leads with the
    // number the engine acted on.
    const claim = claimFor("envelope-window-replacement");
    expect(claim.change).toMatch(/^창호 U /);
  });
});

describe("measureDisplayName", () => {
  it("names every generated measure in both languages", () => {
    // The generators name in whichever language their author wrote in, so
    // rendering `measure.name` put "Wall Insulation Upgrade" beside
    // "고효율 보일러 교체" on the Korean page (/models/duplex-apartment).
    for (const id of ALL_IDS) {
      const ko = measureDisplayName(id, "ko", "FALLBACK");
      const en = measureDisplayName(id, "en", "FALLBACK");
      expect(ko).not.toBe("FALLBACK");
      expect(en).not.toBe("FALLBACK");
      expect(ko).not.toBe(en);
      // The Korean name carries no Latin letters except a parenthesised
      // acronym (HRV, LED, PV), which is how the generators already write it.
      expect(ko.replace(/\((?:HRV|PV)\)|HRV|LED|PV/g, "")).not.toMatch(/[A-Za-z]/);
    }
  });

  it("keeps the generators' own Korean strings verbatim", () => {
    // So the chip and the side panel name one thing one way.
    expect(measureDisplayName("hvac-boiler-upgrade", "ko", "")).toBe("고효율 보일러 교체");
    expect(measureDisplayName("hvac-hrv", "ko", "")).toBe("열회수환기장치(HRV) 설치");
    expect(measureDisplayName("lighting-led", "ko", "")).toBe("LED 조명 교체");
  });

  it("names every solar roof variant without restating the capacity", () => {
    // The claim line already carries kWp; the chip should not say it twice.
    for (const roof of ["flat", "gable", "hip", "sawtooth"]) {
      expect(measureDisplayName(`solar-pv-${roof}`, "ko", "")).toBe("태양광 발전(PV)");
      expect(measureDisplayName(`solar-pv-${roof}`, "en", "")).toBe("Solar PV");
    }
  });

  it("falls back to the generator's name for an id it does not know", () => {
    // A new measure appears under its real name rather than vanishing, and
    // the missing entry is visible on screen instead of silent.
    expect(measureDisplayName("dhw-solar-thermal", "ko", "Solar DHW")).toBe("Solar DHW");
  });
});

describe("claimAreaSqm", () => {
  it("sizes PV on the panelled area, not the whole roof", () => {
    const pv = claimAreaSqm(
      "solar-pv-flat",
      AREAS,
      TOTAL_FLOOR_AREA,
      EFFECT.get("solar-pv-flat"),
    )!;
    // A flat roof yields 70 % of its surface to panels (solar-potential.ts).
    expect(pv).toBeCloseTo(AREAS.roofSqm * 0.7, 6);
    expect(pv).toBeLessThan(AREAS.roofSqm);
  });

  it("sizes plant and lighting on the conditioned floor area they are priced on", () => {
    expect(claimAreaSqm("hvac-boiler-upgrade", AREAS, TOTAL_FLOOR_AREA)).toBe(
      TOTAL_FLOOR_AREA,
    );
    expect(claimAreaSqm("lighting-led", AREAS, TOTAL_FLOOR_AREA)).toBe(
      TOTAL_FLOOR_AREA,
    );
  });

  it("returns undefined rather than guessing when the areas are absent", () => {
    expect(claimAreaSqm("envelope-roof-insulation", undefined, 0)).toBeUndefined();
  });
});
