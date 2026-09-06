import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { meanWindowToWallRatio } from "@/lib/energy/heat-loss";
import type { MaterialProperties } from "@/lib/material-types";
import type { ReferenceBuildingManifest } from "../manifest";
import { REFERENCE_BUILDING_IDS } from "../manifest";
import { referenceBuildingEnergyInputs } from "../energy-inputs";
import { layerMappingsFor, envelopeConstructions } from "../constructions";
import { classifySpaceProgram } from "../zones";
import {
  DUPLEX_ASSUMPTIONS,
  DUPLEX_AREA_PLAN_TOTAL_SQM,
  DUPLEX_DOOR_BY_SECTOR_SQM,
  DUPLEX_EXTERIOR_WALL,
  DUPLEX_EXTERIOR_WALL_STUD_INSULATED,
  DUPLEX_GLAZING_BY_SECTOR_SQM,
  DUPLEX_GROUND_FLOOR,
  DUPLEX_GROUND_FLOOR_RANGE,
  DUPLEX_INPUT_STATE,
  DUPLEX_MATERIALS,
  DUPLEX_MEASURED_ENVELOPE,
  DUPLEX_PENDING_MEASUREMENTS,
  DUPLEX_RECIPE,
  DUPLEX_ROOF,
  DUPLEX_ROOF_AREA_SQM,
  DUPLEX_ROOF_JOIST_ZONE_AS_CAVITY,
  DUPLEX_STOREYS,
  DUPLEX_TOTAL_FLOOR_AREA_SQM,
  DUPLEX_WALL_BY_SECTOR_SQM,
  DUPLEX_WWR_AREA_WEIGHTED,
  DUPLEX_WWR_BY_SECTOR,
  DUPLEX_WWR_UNWEIGHTED_MEAN,
} from "../duplex-apartment-energy";

const DIR = "public/reference-buildings/duplex-apartment";
const readJson = (relative: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), DIR, relative), "utf8"));

const manifest = readJson("manifest.json") as ReferenceBuildingManifest;

type SpaceRow = {
  name: string;
  longName: string | null;
  storeyId: string | null;
  floorAreaSqm: number | null;
  countsAsFloorArea: boolean;
  excludedFromFloorAreaReason: string | null;
};
const spaces = readJson("spaces.json") as { spaces: SpaceRow[] };
const openings = readJson("openings.json") as {
  summary: { windowCount: number; doorCount: number; unresolvedSqm: number };
  unresolved: { type: string; areaSqm: number }[];
};

const ANALYTICAL = /analytical space/;
const ROOF_BY_NAME = /roof surface modelled as a space/;

describe("the file says which state it is in", () => {
  it("declares the measured state", () => {
    expect(DUPLEX_INPUT_STATE).toBe("measured");
  });

  it("the state and the pending table agree, so neither can drift", () => {
    const pending = DUPLEX_PENDING_MEASUREMENTS.length > 0;
    expect(pending).toBe(DUPLEX_INPUT_STATE !== "measured");
  });

  it("every envelope field claims a manifest provenance, none a placeholder", () => {
    const kinds = new Set(Object.values(DUPLEX_MEASURED_ENVELOPE.provenance));
    expect(kinds).toEqual(new Set(["manifest", "derived_from_manifest"]));
  });
});

describe("the published building is reachable and wired", () => {
  it("is in the id list, which means its manifest is committed", () => {
    expect(REFERENCE_BUILDING_IDS).toContain("duplex-apartment");
    expect(manifest.id).toBe("duplex-apartment");
  });

  it("has energy inputs, a layer table and an envelope list", () => {
    const inputs = referenceBuildingEnergyInputs("duplex-apartment");
    expect(inputs).not.toBeNull();
    expect(inputs!.measurementState).toBe("complete");
    expect(inputs!.climate.assumptionId).toBe("A-CLIMATE");
    expect(layerMappingsFor("duplex-apartment").length).toBeGreaterThan(0);
    expect(envelopeConstructions(manifest)).toHaveLength(3);
  });

  it("lists the three assemblies the energy path prices, and not the entrance pad", () => {
    const names = envelopeConstructions(manifest).map((c) => c.name);
    expect(names).toContain("Basic Wall:Exterior - Brick on Block");
    expect(names).toContain("Basic Roof:Live Roof over Wood Joist Flat Roof");
    expect(names).toContain("Floor:127mm Slab on Grade");
    // This one matches the Clinic's keyword rule twice over and is NOT
    // envelope: no room stands on it, which is why the ground extraction
    // excluded both its elements.
    expect(names).not.toContain("Floor:150mm Exterior Slab on Grade");
  });
});

describe("floor area counts rooms, not the analytical duplicates", () => {
  it("matches the shipped manifest", () => {
    expect(DUPLEX_TOTAL_FLOOR_AREA_SQM).toBe(manifest.areas.totalFloorAreaSqm);
    expect(DUPLEX_AREA_PLAN_TOTAL_SQM).toBe(manifest.areas.areaPlanTotalSqm);
  });

  it("the two storeys' measured areas reproduce the total", () => {
    const summed =
      DUPLEX_STOREYS.groundFloor.floorAreaSqm + DUPLEX_STOREYS.firstFloor.floorAreaSqm;
    expect(Math.round(summed * 100) / 100).toBe(DUPLEX_TOTAL_FLOOR_AREA_SQM);
  });

  it("18 rooms of the file's 37 IfcSpace rows, and every other row says why", () => {
    const rows = spaces.spaces;
    expect(rows).toHaveLength(37);
    const rooms = rows.filter((s) => s.countsAsFloorArea);
    expect(rooms).toHaveLength(18);
    for (const s of rows.filter((r) => !r.countsAsFloorArea)) {
      expect(s.excludedFromFloorAreaReason).toBeTruthy();
    }
    const analytical = rows.filter((s) => ANALYTICAL.test(s.excludedFromFloorAreaReason ?? ""));
    const roofByName = rows.filter((s) => ROOF_BY_NAME.test(s.excludedFromFloorAreaReason ?? ""));
    expect(analytical).toHaveLength(18);
    expect(roofByName).toHaveLength(1);
    expect(rooms.length + analytical.length + roofByName.length).toBe(37);
  });

  it("the rooms' own areas sum to the stated floor area", () => {
    const summed = spaces.spaces
      .filter((s) => s.countsAsFloorArea)
      .reduce((total, s) => total + (s.floorAreaSqm ?? 0), 0);
    expect(Math.round(summed * 100) / 100).toBe(DUPLEX_TOTAL_FLOOR_AREA_SQM);
  });

  it("every analytical row pairs with a kept room of the same name, except A104", () => {
    // The pairing is the evidence that this de-duplicates rather than
    // deleting a set of real rooms. A104 Bathroom 1 has a Room and no
    // analytical Space, which is why the Room half is the half kept.
    const rows = spaces.spaces;
    const kept = new Set(rows.filter((s) => s.countsAsFloorArea).map((s) => s.name));
    const analyticalNames = rows
      .filter((s) => ANALYTICAL.test(s.excludedFromFloorAreaReason ?? ""))
      .map((s) => s.name);
    for (const name of analyticalNames) {
      // The one analytical ROOF row's twin is the ROOF row excluded by name,
      // which is not floor either, so it has no kept partner by design.
      if (name === "A/B") continue;
      expect(kept.has(name)).toBe(true);
    }
    expect([...kept].filter((n) => !analyticalNames.includes(n))).toEqual(["A104"]);
  });

  it("reproduces the three totals A-FLOOR-AREA distinguishes", () => {
    const all = spaces.spaces.reduce((t, s) => t + (s.floorAreaSqm ?? 0), 0);
    expect(Math.round(all * 100) / 100).toBe(DUPLEX_AREA_PLAN_TOTAL_SQM);
    // 799.76 every row; 529.46 once the ROOF rule runs; 284.98 de-duplicated.
    // The middle figure is the one that would have shipped.
    const nonRoof = spaces.spaces
      .filter((s) => !ROOF_BY_NAME.test(s.excludedFromFloorAreaReason ?? ""))
      .filter((s) => (s.longName ?? "").toUpperCase() !== "ROOF")
      .reduce((t, s) => t + (s.floorAreaSqm ?? 0), 0);
    expect(Math.round(nonRoof * 100) / 100).toBe(529.46);
    // And it would have made the building read 46 % better, as claimed.
    const overstatement = 1 - DUPLEX_TOTAL_FLOOR_AREA_SQM / 529.46;
    expect(Math.round(overstatement * 100)).toBe(46);
  });
});

describe("the measured envelope is the manifest's", () => {
  it("reads wall, glazing, door, roof, ground and volume from the shipped file", () => {
    const a = manifest.areas;
    expect(DUPLEX_MEASURED_ENVELOPE.exteriorWallNetSqm).toBe(a.exteriorWallNetSqm);
    expect(DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm).toBe(a.glazingApertureSqm);
    expect(DUPLEX_MEASURED_ENVELOPE.exteriorDoorSqm).toBe(a.exteriorDoorSqm);
    expect(DUPLEX_MEASURED_ENVELOPE.roofAreaSqm).toBe(a.roofProjectedSqm);
    expect(DUPLEX_MEASURED_ENVELOPE.groundSlabSqm).toBe(a.groundSlabSqm);
    expect(DUPLEX_MEASURED_ENVELOPE.groundPerimeterM).toBe(a.groundPerimeterM);
    expect(DUPLEX_MEASURED_ENVELOPE.conditionedVolumeGrossM3).toBe(a.conditionedVolumeGrossM3);
    expect(DUPLEX_MEASURED_ENVELOPE.roomVolumeNetM3).toBe(a.roomVolumeNetM3);
  });

  it("the per-sector splits sum to their own totals", () => {
    const sum = (r: Readonly<Record<string, number>>) =>
      Math.round(Object.values(r).reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum(DUPLEX_WALL_BY_SECTOR_SQM)).toBe(DUPLEX_MEASURED_ENVELOPE.exteriorWallNetSqm);
    expect(sum(DUPLEX_GLAZING_BY_SECTOR_SQM)).toBe(DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm);
    expect(sum(DUPLEX_DOOR_BY_SECTOR_SQM)).toBe(DUPLEX_MEASURED_ENVELOPE.exteriorDoorSqm);
  });

  it("the roof is flat and states one surface, so plan and surface agree", () => {
    expect(manifest.roofs).toHaveLength(1);
    expect(manifest.roofs![0].tiltDeg).toBe(0);
    expect(DUPLEX_ROOF_AREA_SQM).toBe(manifest.areas.roofProjectedSqm);
    expect(DUPLEX_ROOF_AREA_SQM).toBe(manifest.areas.roofSurfaceSqm);
  });

  it("net never exceeds gross, and gross is exactly its three parts", () => {
    const e = DUPLEX_MEASURED_ENVELOPE;
    expect(e.grossWallSqm).toBeCloseTo(
      e.exteriorWallNetSqm + e.glazingApertureSqm + e.exteriorDoorSqm,
      6,
    );
    expect(e.exteriorWallNetSqm).toBeLessThanOrEqual(e.grossWallSqm);
    expect(e.roomVolumeNetM3).toBeLessThanOrEqual(e.conditionedVolumeGrossM3);
  });

  it("hands the engine the measured envelope, not the recipe's square", () => {
    const q = envelopeQuantities(DUPLEX_RECIPE);
    expect(q.source).toBe("measured");
    expect(q.grossWallAreaSqm).toBeCloseTo(DUPLEX_MEASURED_ENVELOPE.grossWallSqm, 6);
    expect(q.roofAreaSqm).toBeCloseTo(DUPLEX_ROOF_AREA_SQM, 6);
  });

  it("the skylights A-SKYLIGHTS names are the rows the file leaves unresolved", () => {
    // The assumption claims 2 skylights, 1.49 m², excluded from the aperture.
    // Parsed back out of the openings file rather than restated.
    expect(openings.summary.windowCount).toBe(22);
    expect(openings.summary.doorCount).toBe(4);
    expect(openings.unresolved).toHaveLength(2);
    const unresolvedSqm =
      Math.round(openings.unresolved.reduce((t, o) => t + o.areaSqm, 0) * 100) / 100;
    expect(unresolvedSqm).toBe(1.49);
    expect(openings.summary.unresolvedSqm).toBe(1.49);
  });
});

describe("gross x wwr reproduces the measured aperture", () => {
  it("the engine ratio is aperture over gross wall, on all four faces", () => {
    const wwr = DUPLEX_MATERIALS.envelope.windows.windowToWallRatio;
    const expected =
      DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm / DUPLEX_MEASURED_ENVELOPE.grossWallSqm;
    for (const face of ["N", "S", "E", "W"] as const) {
      expect(wwr[face]).toBeCloseTo(expected, 12);
      // The whole point: gross x wwr gives the measured aperture back.
      expect(DUPLEX_MEASURED_ENVELOPE.grossWallSqm * wwr[face]).toBeCloseTo(
        DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm,
        6,
      );
    }
  });

  it("the area-weighted mean IS the whole-building ratio; the unweighted one is not", () => {
    expect(DUPLEX_WWR_AREA_WEIGHTED).toBeCloseTo(
      DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm / DUPLEX_MEASURED_ENVELOPE.grossWallSqm,
      12,
    );
    // A-WWR-ENGINE-MEAN's claim, checked rather than restated: the engine's
    // unweighted mean of four measured ratios prices 23 % more window than
    // this building has, i.e. 14.93 m² that is really opaque wall.
    expect(DUPLEX_WWR_UNWEIGHTED_MEAN).toBeGreaterThan(DUPLEX_WWR_AREA_WEIGHTED);
    const inflation = DUPLEX_WWR_UNWEIGHTED_MEAN / DUPLEX_WWR_AREA_WEIGHTED - 1;
    expect(Math.round(inflation * 100)).toBe(23);
    const wouldPrice = DUPLEX_MEASURED_ENVELOPE.grossWallSqm * DUPLEX_WWR_UNWEIGHTED_MEAN;
    expect(wouldPrice - DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm).toBeCloseTo(14.93, 1);
  });

  it("the engine's own window area IS the measured aperture", () => {
    // The engine is handed ONE ratio on all four cardinals
    // (A-WWR-DENOMINATOR), so the plain mean is exact and the answer has to
    // be the aperture the openings walk counted. `meanWindowToWallRatio` is
    // called without weights here because that is how `calculateHeatLoss`
    // calls it — a MeasuredEnvelope carries no per-sector gross.
    const mean = meanWindowToWallRatio(DUPLEX_MATERIALS);
    const q = envelopeQuantities(DUPLEX_RECIPE);
    expect(q.grossWallAreaSqm * mean).toBeCloseTo(
      DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm,
      6,
    );
    // What the engine prices as opaque is gross − window = net wall + doors:
    // the doors are INSIDE the opaque figure, at the wall U, by A-DOORS. It
    // is deliberately NOT gross − aperture − doors (267.16), which would
    // leave 8.96 m² of envelope priced as nothing.
    const opaque = q.grossWallAreaSqm - q.grossWallAreaSqm * mean;
    expect(opaque).toBeCloseTo(
      DUPLEX_MEASURED_ENVELOPE.exteriorWallNetSqm + DUPLEX_MEASURED_ENVELOPE.exteriorDoorSqm,
      6,
    );
    expect(opaque).toBeCloseTo(276.12, 2);
  });

  it("handing the engine the per-sector ratios, unweighted, would GAIN glazing it does not have", () => {
    // A-WWR-ENGINE-MEAN's measurement, pinned so the "obvious improvement"
    // cannot be made silently. `calculateHeatLoss` has no per-sector gross to
    // weight by, so four genuinely different ratios reach it as a plain
    // arithmetic mean and the engine prices 79.39 m² against a measured
    // 64.46 — 23 % of glazing the building does not have.
    //
    // (Between 222bf4a and its correction the function weighted by the NET
    // opaque wall when a recipe carried a measuredEnvelope, which erred the
    // other way and priced 57.78. Both are wrong; only the gross-weighted
    // mean below is the aperture, and it is what the uniform ratio already
    // gives.)
    const perSector: MaterialProperties = {
      ...DUPLEX_MATERIALS,
      envelope: {
        ...DUPLEX_MATERIALS.envelope,
        windows: {
          ...DUPLEX_MATERIALS.envelope.windows,
          windowToWallRatio: {
            N: DUPLEX_WWR_BY_SECTOR.N,
            S: DUPLEX_WWR_BY_SECTOR.S,
            E: DUPLEX_WWR_BY_SECTOR.E,
            W: DUPLEX_WWR_BY_SECTOR.W,
          },
        },
      },
    };
    const q = envelopeQuantities(DUPLEX_RECIPE);
    const mean = meanWindowToWallRatio(perSector);
    expect(mean).toBeCloseTo(DUPLEX_WWR_UNWEIGHTED_MEAN, 12);
    const window = q.grossWallAreaSqm * mean;
    expect(window - DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm).toBeCloseTo(14.93, 1);

    // Weighted by the areas the ratios are quoted against, the same four
    // ratios land back on the aperture exactly.
    const grossBySector = {
      N: DUPLEX_WALL_BY_SECTOR_SQM.N + DUPLEX_GLAZING_BY_SECTOR_SQM.N + DUPLEX_DOOR_BY_SECTOR_SQM.N,
      E: DUPLEX_WALL_BY_SECTOR_SQM.E + DUPLEX_GLAZING_BY_SECTOR_SQM.E + DUPLEX_DOOR_BY_SECTOR_SQM.E,
      S: DUPLEX_WALL_BY_SECTOR_SQM.S + DUPLEX_GLAZING_BY_SECTOR_SQM.S + DUPLEX_DOOR_BY_SECTOR_SQM.S,
      W: DUPLEX_WALL_BY_SECTOR_SQM.W + DUPLEX_GLAZING_BY_SECTOR_SQM.W + DUPLEX_DOOR_BY_SECTOR_SQM.W,
    };
    const weighted = meanWindowToWallRatio(perSector, grossBySector);
    expect(q.grossWallAreaSqm * weighted).toBeCloseTo(
      DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm,
      6,
    );
  });

  it("weighting per-sector ratios by GROSS wall is an identity, not an improvement", () => {
    // The version that DOES reproduce the aperture returns exactly what the
    // uniform ratio returns: Σ(rᵢ·grossᵢ)/Σgrossᵢ ≡ Σglazing/Σgross. So no
    // wiring of the measured split can move the whole-building mean, which
    // is why it is not wired in.
    const sectors = ["N", "E", "S", "W"] as const;
    let weighted = 0;
    let total = 0;
    for (const s of sectors) {
      const gross =
        DUPLEX_WALL_BY_SECTOR_SQM[s] +
        DUPLEX_GLAZING_BY_SECTOR_SQM[s] +
        DUPLEX_DOOR_BY_SECTOR_SQM[s];
      weighted += DUPLEX_WWR_BY_SECTOR[s] * gross;
      total += gross;
    }
    expect(weighted / total).toBeCloseTo(meanWindowToWallRatio(DUPLEX_MATERIALS), 12);
  });

  it("the per-sector ratios are the measured split, not one number repeated", () => {
    // If the glazing were ever spread pro rata again, these four collapse to
    // one value and this fails.
    const cardinals = (["N", "E", "S", "W"] as const).map((s) => DUPLEX_WWR_BY_SECTOR[s]);
    expect(new Set(cardinals.map((r) => r.toFixed(3))).size).toBe(4);
    expect(DUPLEX_WWR_BY_SECTOR.N).toBeCloseTo(0.3567, 3);
    expect(DUPLEX_WWR_BY_SECTOR.E).toBeCloseTo(0.1037, 3);
    expect(DUPLEX_WWR_BY_SECTOR.S).toBeCloseTo(0.3667, 3);
    expect(DUPLEX_WWR_BY_SECTOR.W).toBeCloseTo(0.1051, 3);
  });
});

describe("the constructions reproduce what the assumptions claim about them", () => {
  it("the wall solves to the U A-STUD-CAVITY quotes, and so does its counterfactual", () => {
    expect(DUPLEX_EXTERIOR_WALL.uValueWPerM2K).toBeCloseTo(0.3404, 4);
    expect(DUPLEX_EXTERIOR_WALL.totalResistanceM2KPerW).toBeCloseTo(2.937, 3);
    expect(DUPLEX_EXTERIOR_WALL_STUD_INSULATED.uValueWPerM2K).toBeCloseTo(0.2607, 4);
    const better =
      1 - DUPLEX_EXTERIOR_WALL_STUD_INSULATED.uValueWPerM2K / DUPLEX_EXTERIOR_WALL.uValueWPerM2K;
    expect(Math.round(better * 100)).toBe(23);
  });

  it("the roof solves to the U A-JOIST-ZONE quotes, and the joist zone is 38 % of it", () => {
    expect(DUPLEX_ROOF.uValueWPerM2K).toBeCloseTo(0.1871, 4);
    expect(DUPLEX_ROOF_JOIST_ZONE_AS_CAVITY.uValueWPerM2K).toBeCloseTo(0.2879, 4);
    const worse = DUPLEX_ROOF_JOIST_ZONE_AS_CAVITY.uValueWPerM2K / DUPLEX_ROOF.uValueWPerM2K - 1;
    expect(Math.round(worse * 100)).toBe(54);
    const joist = DUPLEX_ROOF.layers.find((l) => l.id.includes("Dimensional Lumber"))!;
    expect(joist.resistanceM2KPerW).toBeCloseTo(2.043, 3);
    expect(Math.round(joist.shareOfTotal * 100)).toBe(38);
  });

  it("the ground slab is uninsulated, so ISO 13370's uninsulated branch applies", () => {
    expect(DUPLEX_GROUND_FLOOR.regime).toBe("uninsulated");
    expect(DUPLEX_GROUND_FLOOR.equivalentThicknessM).toBeLessThan(
      DUPLEX_GROUND_FLOOR.characteristicDimensionM,
    );
    expect(DUPLEX_GROUND_FLOOR.uValueWPerM2K).toBeCloseTo(0.8159, 4);
    // A-SOIL's spread, checked. An uninsulated slab is soil-dominated.
    expect(DUPLEX_GROUND_FLOOR_RANGE.low.uValueWPerM2K).toBeCloseTo(0.6518, 4);
    expect(DUPLEX_GROUND_FLOOR_RANGE.high.uValueWPerM2K).toBeCloseTo(1.2142, 4);
  });

  it("the materials carry the solved constructions, not separate literals", () => {
    for (const w of DUPLEX_MATERIALS.envelope.walls) {
      expect(w.uValue).toBe(DUPLEX_EXTERIOR_WALL.uValueWPerM2K);
    }
    expect(DUPLEX_MATERIALS.envelope.roof.uValue).toBe(DUPLEX_ROOF.uValueWPerM2K);
    expect(DUPLEX_MATERIALS.envelope.groundFloor.uValue).toBe(DUPLEX_GROUND_FLOOR.uValueWPerM2K);
  });

  it("the wall surface areas are the measured per-sector split", () => {
    const byFace = Object.fromEntries(
      DUPLEX_MATERIALS.envelope.walls.map((w) => [w.orientation, w.surfaceArea]),
    );
    for (const face of ["N", "E", "S", "W"] as const) {
      expect(byFace[face]).toBe(DUPLEX_WALL_BY_SECTOR_SQM[face]);
    }
  });
});

describe("the services layers are reported as they measure", () => {
  const byId = Object.fromEntries((manifest.serviceLayers ?? []).map((l) => [l.id, l]));

  it("two of the three declare no distribution ports at all", () => {
    expect(byId.hvac.flow!.ports).toBe(0);
    expect(byId.electrical.flow!.ports).toBe(0);
    expect(byId.plumbing.flow!.ports).toBe(970);
  });

  it("the plumbing direction has no plant to be traced from - A-FLOW-DIRECTION", () => {
    const f = byId.plumbing.flow!;
    expect(f.connections).toBe(485);
    expect(f.drawnEdges).toBe(190);
    expect(f.bidirectionalEdges).toBe(295);
    expect(f.drawnEdges + f.bidirectionalEdges).toBe(f.connections);
    // The finding: direction exists and the plant does not, so the whole
    // supply/return split fell to one side by default rather than by trace.
    expect(f.plantNodes).toBe(0);
    expect(f.supplySegments).toBe(0);
    expect(f.returnSegments).toBe(f.drawnEdges);
  });

  it("the element counts the gallery card cites are the manifest's", () => {
    expect(byId.hvac.elements).toBe(924);
    expect(byId.electrical.elements).toBe(100);
    expect(byId.plumbing.elements).toBe(498);
    expect(byId.hvac.elements + byId.electrical.elements + byId.plumbing.elements).toBe(1522);
  });
});

describe("the room-name table classifies this building's rooms", () => {
  it("puts every room in a named program, none in the fallback", () => {
    for (const s of spaces.spaces.filter((r) => r.countsAsFloorArea)) {
      expect(classifySpaceProgram(s).key).not.toBe("other");
    }
  });

  it("reads the model's own misspelling rather than correcting it", () => {
    // B201 is spelled HALLYWAY on its Room and HALLWAY on its analytical
    // Space. Both must land in circulation, or one hallway sits in the
    // fallback beside its own twin.
    expect(classifySpaceProgram({ name: "B201", longName: "Hallyway" }).key).toBe("circulation");
    expect(classifySpaceProgram({ name: "B201", longName: "Hallway" }).key).toBe("circulation");
  });

  it("a dwelling KITCHEN is not swallowed by the staff KITCHENETTE row", () => {
    expect(classifySpaceProgram({ name: "A103", longName: "Kitchen" }).key).toBe("kitchen");
    expect(classifySpaceProgram({ name: "x", longName: "KITCHENETTE" }).key).toBe("office");
  });

  it("the new patterns move no room in the two existing buildings", () => {
    // Measured before the patterns were added, and pinned here: none of these
    // words occurs in the Clinic's 269 or Schependomlaan's 100 space names,
    // which is what makes it safe to have put UTILITY on the early `plant`
    // row rather than on an appended one.
    for (const id of ["bs-medical-dental-clinic", "schependomlaan"]) {
      const other = readJson(`../${id}/spaces.json`) as { spaces: SpaceRow[] };
      for (const s of other.spaces) {
        const label = (s.longName ?? s.name ?? "").toUpperCase();
        expect(label).not.toMatch(
          /\b(BATHROOM|BEDROOM|FOYER|HALLWAY|HALLYWAY|KITCHEN|LIVING ROOM|UTILITY)\b/,
        );
      }
    }
  });
});

describe("every assumption is declared, and says why", () => {
  it("has an id, a claim and a reason with real content", () => {
    expect(DUPLEX_ASSUMPTIONS.length).toBeGreaterThan(15);
    for (const a of DUPLEX_ASSUMPTIONS) {
      expect(a.id).toMatch(/^A-[A-Z0-9-]+$/);
      expect(a.assumes.length).toBeGreaterThan(20);
      expect(a.why.length).toBeGreaterThan(40);
    }
  });

  it("declares no id twice", () => {
    const ids = DUPLEX_ASSUMPTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every assumption another one cites actually exists", () => {
    const ids = new Set(DUPLEX_ASSUMPTIONS.map((a) => a.id));
    for (const a of DUPLEX_ASSUMPTIONS) {
      for (const ref of a.why.match(/\bA-[A-Z][A-Z0-9-]+/g) ?? []) {
        if (ref === a.id) continue;
        expect(ids.has(ref), `${a.id} cites ${ref}, which does not exist`).toBe(true);
      }
    }
  });

  it("names the climate substitution and the grade that rests on it", () => {
    const ids = DUPLEX_ASSUMPTIONS.map((a) => a.id);
    expect(ids).toContain("A-CLIMATE");
    expect(ids).toContain("A-GRADE-IS-KOREAN");
    // The evidence, not merely the conclusion: this model states no location.
    const climate = DUPLEX_ASSUMPTIONS.find((a) => a.id === "A-CLIMATE")!;
    expect(climate.why).toContain("Enter address here");
  });
});
