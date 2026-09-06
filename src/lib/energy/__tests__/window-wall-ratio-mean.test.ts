// The one window-to-wall mean, and the area it must be weighted by.
//
// Each cardinal ratio is quoted against its own sector's GROSS wall, so the
// only mean that reproduces the building's aperture is the one weighted by
// those same gross areas:
//
//     Σ(rᵢ·gᵢ) / Σgᵢ  ≡  Σglazingᵢ / Σgᵢ
//
// This file exists because the first version of the function weighted by the
// NET opaque wall instead, which looks like the same idea and is not: on a
// real split it under-priced glazing by 10 %.

import { describe, it, expect } from "vitest";
import { calculateHeatLoss, meanWindowToWallRatio } from "../heat-loss";
import { envelopeQuantities } from "../envelope-quantities";
import { SEOUL_CLIMATE } from "../climate-data";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import {
  DUPLEX_DOOR_BY_SECTOR_SQM,
  DUPLEX_GLAZING_BY_SECTOR_SQM,
  DUPLEX_MEASURED_ENVELOPE,
  DUPLEX_WALL_BY_SECTOR_SQM,
  DUPLEX_WWR_BY_SECTOR,
} from "@/lib/reference-buildings/duplex-apartment-energy";
import type { MaterialProperties } from "@/lib/material-types";

/** The formula that stood in both callers before this function existed. */
function unweightedMean(m: MaterialProperties): number {
  const w = m.envelope.windows.windowToWallRatio;
  return (w.N + w.S + w.E + w.W) / 4;
}

/**
 * The Duplex's measured per-orientation split — the first building with
 * genuinely different ratios, and the one that showed the weighting bug.
 *
 * Read from `duplex-apartment-energy.ts` rather than typed, so the fixture IS
 * the building. It was four invented numbers until 2026-09-06: the ratios
 * were the Duplex's and the gross areas were a plausible split I made up
 * summing to 341.00 m², which then travelled into `heat-loss.ts`'s doc
 * comment under the word "measured". Nothing was arithmetically wrong and the
 * sentence was still a claim about a building nobody had computed it on.
 */
const WWR = {
  N: DUPLEX_WWR_BY_SECTOR.N,
  E: DUPLEX_WWR_BY_SECTOR.E,
  S: DUPLEX_WWR_BY_SECTOR.S,
  W: DUPLEX_WWR_BY_SECTOR.W,
} as const;

const grossOf = (o: "N" | "E" | "S" | "W") =>
  DUPLEX_WALL_BY_SECTOR_SQM[o] + DUPLEX_GLAZING_BY_SECTOR_SQM[o] + DUPLEX_DOOR_BY_SECTOR_SQM[o];

/** The measured per-sector gross: 340.58 m² in total, glazing 64.46 m². */
const GROSS = {
  N: grossOf("N"),
  E: grossOf("E"),
  S: grossOf("S"),
  W: grossOf("W"),
} as const;

function materialsWith(wwr: Record<"N" | "S" | "E" | "W", number>): MaterialProperties {
  const energy = referenceBuildingEnergyInputs("bs-medical-dental-clinic")!;
  return {
    ...energy.materials,
    envelope: {
      ...energy.materials.envelope,
      windows: { ...energy.materials.envelope.windows, windowToWallRatio: { ...wwr } },
    },
  };
}

describe("weighting by gross reproduces the aperture; nothing else does", () => {
  const materials = materialsWith(WWR);
  const grossTotal = GROSS.N + GROSS.E + GROSS.S + GROSS.W;
  const aperture =
    GROSS.N * WWR.N + GROSS.E * WWR.E + GROSS.S * WWR.S + GROSS.W * WWR.W;

  it("the fixture is the building, and reconciles with what the file states", () => {
    expect(grossTotal).toBeCloseTo(DUPLEX_MEASURED_ENVELOPE.grossWallSqm, 2);
    expect(grossTotal).toBeCloseTo(340.58, 2);
    expect(aperture).toBeCloseTo(DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm, 2);
    expect(aperture).toBeCloseTo(64.46, 2);
  });

  it("gross-weighted × gross === the measured aperture, exactly", () => {
    const mean = meanWindowToWallRatio(materials, GROSS);
    expect(mean).toBeCloseTo(aperture / grossTotal, 12);
    expect(mean).toBeCloseTo(0.189265, 6);
    expect(grossTotal * mean).toBeCloseTo(aperture, 8);
  });

  it("weighting by the NET opaque wall does NOT — this was the bug", () => {
    // The building's OWN net opaque wall, which is gross less glazing AND
    // doors — not gross × (1 − wwr), which leaves the doors in and is a
    // different number. This is the array `aggregateWalls` reads, and
    // therefore exactly what the broken version weighted by.
    const net = {
      N: DUPLEX_WALL_BY_SECTOR_SQM.N,
      E: DUPLEX_WALL_BY_SECTOR_SQM.E,
      S: DUPLEX_WALL_BY_SECTOR_SQM.S,
      W: DUPLEX_WALL_BY_SECTOR_SQM.W,
    };
    const byNet = meanWindowToWallRatio(materials, net);
    expect(byNet).toBeCloseTo(0.16965, 5);
    expect(grossTotal * byNet).toBeCloseTo(57.78, 2);
    // 6.68 m² of measured glazing priced as opaque wall.
    expect(aperture - grossTotal * byNet).toBeCloseTo(6.68, 2);
  });

  it("the unweighted mean does not either, and errs the other way", () => {
    const plain = meanWindowToWallRatio(materials);
    expect(plain).toBeCloseTo(unweightedMean(materials), 12);
    expect(plain).toBeCloseTo(0.233057, 5);
    expect(grossTotal * plain).toBeCloseTo(79.37, 2);
    expect(grossTotal * plain - aperture).toBeCloseTo(14.91, 1);
  });

  it("falls back to the stated ratio when the weights are unusable, not to zero", () => {
    expect(meanWindowToWallRatio(materials, { N: 0, E: 0, S: 0, W: 0 })).toBeCloseTo(
      unweightedMean(materials),
      12,
    );
  });
});

describe("no building's number moves: both callers pass no weights", () => {
  it("the plain mean is exact whenever the four ratios are equal", () => {
    // Which is the invariant A-WWR-DENOMINATOR maintains, and why the
    // engine can be handed one ratio and still reproduce the aperture.
    const materials = materialsWith({ N: 0.2, E: 0.2, S: 0.2, W: 0.2 });
    expect(meanWindowToWallRatio(materials)).toBeCloseTo(0.2, 12);
    expect(meanWindowToWallRatio(materials, GROSS)).toBeCloseTo(0.2, 12);
  });

  for (const id of ["bs-medical-dental-clinic", "schependomlaan"] as const) {
    it(`${id}: the engine's window area is the file's measured aperture`, () => {
      const { materials, recipe } = referenceBuildingEnergyInputs(id)!;
      const gross = envelopeQuantities(recipe).grossWallAreaSqm;
      const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const windows = result.elements.find((e) => e.element === "Windows")!;

      expect(windows.area).toBeCloseTo(gross * meanWindowToWallRatio(materials), 8);
      // And that is the plain mean — unchanged from before any of this.
      expect(meanWindowToWallRatio(materials)).toBe(unweightedMean(materials));
    });
  }
});
