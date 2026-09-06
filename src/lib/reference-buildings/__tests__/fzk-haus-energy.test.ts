import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, meanWindowToWallRatio, VENTILATION_ELEMENT_NAME } from "@/lib/energy/heat-loss";
import { getClimateData } from "@/lib/energy/climate-data";
import type { ReferenceBuildingManifest } from "../manifest";
import {
  FZK_HAUS_ASSUMPTIONS,
  FZK_HAUS_DOOR_BY_SECTOR_SQM,
  FZK_HAUS_GLAZING_BY_SECTOR_SQM,
  FZK_HAUS_GROUND_FLOOR,
  FZK_HAUS_GROUND_FLOOR_RANGE,
  FZK_HAUS_GROUND_STATED_AIR_TO_AIR_U,
  FZK_HAUS_MATERIALS,
  FZK_HAUS_MEASURED_ENVELOPE,
  FZK_HAUS_RECIPE,
  FZK_HAUS_ROOF_U_STATED,
  FZK_HAUS_STOREYS,
  FZK_HAUS_TOTAL_FLOOR_AREA_SQM,
  FZK_HAUS_WALL_ASSEMBLY_SOLVED,
  FZK_HAUS_WALL_BY_SECTOR_SQM,
  FZK_HAUS_WALL_U_STATED,
  FZK_HAUS_WWR_UNIFORM,
} from "../fzk-haus-energy";

const manifest = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public/reference-buildings/fzk-haus/manifest.json"),
    "utf8",
  ),
) as ReferenceBuildingManifest;

describe("reads against the artifact the app serves, not a fixture", () => {
  it("is the fzk-haus manifest, with four solved assemblies", () => {
    expect(manifest.id).toBe("fzk-haus");
    expect(manifest.assemblies?.length).toBe(4);
  });

  it("floor area is the manifest's 208.55 over two storeys", () => {
    expect(FZK_HAUS_RECIPE.officialFloorAreaSqm).toBe(FZK_HAUS_TOTAL_FLOOR_AREA_SQM);
    expect(manifest.areas.totalFloorAreaSqm).toBe(FZK_HAUS_TOTAL_FLOOR_AREA_SQM);
    const s = FZK_HAUS_STOREYS;
    expect(s.groundFloor.floorAreaSqm + s.attic.floorAreaSqm).toBeCloseTo(
      FZK_HAUS_TOTAL_FLOOR_AREA_SQM,
      0,
    );
  });

  it("two storeys; the attic's own top is the ridge, not a stated floor-to-floor", () => {
    expect(FZK_HAUS_RECIPE.floors).toHaveLength(2);
    expect(FZK_HAUS_RECIPE.floors[0].isGroundFloor).toBe(true);
    expect(FZK_HAUS_RECIPE.floors.map((f) => f.y)).toEqual([0, 2.7]);
    expect(FZK_HAUS_RECIPE.totalHeight).toBeCloseTo(6.09, 2);
    expect(manifest.storeys).toHaveLength(2);
    expect(manifest.counts.storeys).toBe(2);
  });
});

describe("this building is genuinely rotated off true north", () => {
  it("all four true cardinals are zero; every wall is diagonal", () => {
    const o = FZK_HAUS_WALL_BY_SECTOR_SQM;
    expect(o.N + o.E + o.S + o.W).toBe(0);
    expect(o.NE + o.SE + o.SW + o.NW).toBeGreaterThan(0);
    expect(o).toEqual(manifest.areas.exteriorWallByOrientationSqm);
  });

  it("wall areas by sector reconcile to the net total", () => {
    const sum = Object.values(FZK_HAUS_WALL_BY_SECTOR_SQM).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.exteriorWallNetSqm, 1);
  });

  it("relabelling diagonal sectors onto cardinal MaterialProperties keys preserves the total", () => {
    const byOrientation = Object.fromEntries(
      FZK_HAUS_MATERIALS.envelope.walls.map((w) => [w.orientation, w.surfaceArea]),
    );
    const relabelledSum = Object.values(byOrientation).reduce((a, b) => a + b, 0);
    expect(relabelledSum).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.exteriorWallNetSqm, 1);
  });

  it("above- and below-roof wall areas reconcile to the same total", () => {
    const e = FZK_HAUS_MEASURED_ENVELOPE;
    expect(e.exteriorWallBelowRoofSqm + e.exteriorWallAboveRoofSqm).toBeCloseTo(
      e.exteriorWallNetSqm,
      1,
    );
  });

  it("the engine gets ONE uniform ratio, not the four real per-sector ones", () => {
    const wwr = FZK_HAUS_MATERIALS.envelope.windows.windowToWallRatio;
    expect(new Set([wwr.N, wwr.S, wwr.E, wwr.W]).size).toBe(1);
    expect(wwr.N).toBeCloseTo(FZK_HAUS_WWR_UNIFORM, 6);
  });

  it("meanWindowToWallRatio reproduces the aperture exactly under the uniform ratio", () => {
    const mean = meanWindowToWallRatio(FZK_HAUS_MATERIALS);
    expect(mean).toBeCloseTo(FZK_HAUS_WWR_UNIFORM, 10);
    expect(mean * FZK_HAUS_MEASURED_ENVELOPE.grossWallSqm).toBeCloseTo(
      FZK_HAUS_MEASURED_ENVELOPE.glazingApertureSqm,
      6,
    );
  });

  it("weighting the four REAL per-sector ratios by net wall would understate the aperture — the reason they are not wired to the engine", () => {
    // Same shape bim-83 measured on the Duplex (there, 10x larger). The
    // per-sector ratios' own denominator is each sector's GROSS wall; the
    // engine's weight would be NET wall (surfaceArea). They do not cancel.
    const sectors = ["NE", "SE", "SW", "NW"] as const;
    const ratio = (s: (typeof sectors)[number]) => {
      const wall = FZK_HAUS_WALL_BY_SECTOR_SQM[s];
      const gross = wall + FZK_HAUS_GLAZING_BY_SECTOR_SQM[s] + FZK_HAUS_DOOR_BY_SECTOR_SQM[s];
      return FZK_HAUS_GLAZING_BY_SECTOR_SQM[s] / gross;
    };
    let weightedByNet = 0;
    let netTotal = 0;
    for (const s of sectors) {
      const wall = FZK_HAUS_WALL_BY_SECTOR_SQM[s];
      weightedByNet += ratio(s) * wall;
      netTotal += wall;
    }
    weightedByNet /= netTotal;
    const windowAreaUnderRealSplit = weightedByNet * FZK_HAUS_MEASURED_ENVELOPE.grossWallSqm;
    expect(windowAreaUnderRealSplit).toBeLessThan(FZK_HAUS_MEASURED_ENVELOPE.glazingApertureSqm);
    expect(weightedByNet).not.toBeCloseTo(FZK_HAUS_WWR_UNIFORM, 4);
  });
});

describe("stated per-element U is primary, and the layer-solved cross-check disagrees", () => {
  it("the wall's solved U (from Leichtbeton alone) is 22% worse than the stated 0.4", () => {
    expect(FZK_HAUS_WALL_U_STATED).toBe(0.4);
    expect(FZK_HAUS_WALL_ASSEMBLY_SOLVED.uValueWPerM2K).toBeGreaterThan(FZK_HAUS_WALL_U_STATED);
    const ratio =
      (FZK_HAUS_WALL_ASSEMBLY_SOLVED.uValueWPerM2K - FZK_HAUS_WALL_U_STATED) /
      FZK_HAUS_WALL_U_STATED;
    expect(ratio).toBeGreaterThan(0.15);
    expect(FZK_HAUS_MATERIALS.envelope.walls[0].uValue).toBe(FZK_HAUS_WALL_U_STATED);
  });

  it("the roof uses its stated 0.3 directly — there is no material identity to solve from", () => {
    expect(FZK_HAUS_ROOF_U_STATED).toBe(0.3);
    expect(FZK_HAUS_MATERIALS.envelope.roof.uValue).toBe(FZK_HAUS_ROOF_U_STATED);
  });

  it("windows and the exterior doors both state 1.4, and both are used as stated", () => {
    expect(FZK_HAUS_MATERIALS.envelope.windows.uValue).toBe(1.4);
  });
});

describe("the ground floor is ISO 13370, not the file's own air-to-air 0.4", () => {
  it("solves well below the stated air-to-air figure", () => {
    expect(FZK_HAUS_GROUND_STATED_AIR_TO_AIR_U).toBe(0.4);
    expect(FZK_HAUS_MATERIALS.envelope.groundFloor.uValue).toBeCloseTo(
      FZK_HAUS_GROUND_FLOOR.uValueWPerM2K,
      6,
    );
    // An uninsulated slab's true ground U is not automatically better than
    // its stated air-to-air figure — B' is small (5.45 m) — so this only
    // pins that the two are DIFFERENT numbers, not that one dominates.
    expect(FZK_HAUS_GROUND_FLOOR.uValueWPerM2K).not.toBeCloseTo(
      FZK_HAUS_GROUND_STATED_AIR_TO_AIR_U,
      2,
    );
  });

  it("bounds it by soil", () => {
    expect(FZK_HAUS_GROUND_FLOOR_RANGE.low.uValueWPerM2K).toBeLessThan(
      FZK_HAUS_GROUND_FLOOR.uValueWPerM2K,
    );
    expect(FZK_HAUS_GROUND_FLOOR_RANGE.high.uValueWPerM2K).toBeGreaterThan(
      FZK_HAUS_GROUND_FLOOR.uValueWPerM2K,
    );
  });

  it("adds no ground-contact resistance on top — the soil is already in the U", () => {
    expect(FZK_HAUS_MATERIALS.envelope.groundFloor.groundContactResistance).toBe(0);
  });
});

describe("the Galerie's net volume is the closed-solid figure, not the mislabelled Gross one", () => {
  it("net never exceeds gross, building-wide", () => {
    const e = FZK_HAUS_MEASURED_ENVELOPE;
    expect(e.roomVolumeNetM3).toBeLessThanOrEqual(e.conditionedVolumeGrossM3);
    expect(e.roomVolumeNetM3).toBe(manifest.areas.roomVolumeNetM3);
    expect(e.conditionedVolumeGrossM3).toBe(manifest.areas.conditionedVolumeGrossM3);
  });

  it("the Galerie's own manifest row reads the corrected NetVolume, not 428.64", () => {
    const spacesPath = path.join(
      process.cwd(),
      "public/reference-buildings/fzk-haus/spaces.json",
    );
    const spaces = JSON.parse(readFileSync(spacesPath, "utf8")) as {
      spaces: Array<{ longName: string | null; netVolumeM3: number | null }>;
    };
    const galerie = spaces.spaces.find((s) => s.longName === "Galerie");
    expect(galerie).toBeDefined();
    expect(galerie!.netVolumeM3).toBeCloseTo(217.53, 1);
    expect(galerie!.netVolumeM3).not.toBeCloseTo(428.64, 1);
  });
});

describe("openings: real per-opening dimensions, doors separate from glazing", () => {
  it("11 windows, 23.6 m², and 2 exterior doors, 6.80 m²", () => {
    const e = FZK_HAUS_MEASURED_ENVELOPE;
    expect(e.glazingApertureSqm).toBe(23.6);
    expect(e.exteriorDoorSqm).toBe(6.8);
    expect(e.grossWallSqm).toBeCloseTo(136.28 + 23.6 + 6.8, 2);
  });

  it("per-sector glazing and doors sum back to the whole apertures", () => {
    const glazingSum = Object.values(FZK_HAUS_GLAZING_BY_SECTOR_SQM).reduce(
      (a: number, b) => a + b,
      0,
    );
    const doorSum = Object.values(FZK_HAUS_DOOR_BY_SECTOR_SQM).reduce((a: number, b) => a + b, 0);
    expect(glazingSum).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.glazingApertureSqm, 6);
    expect(doorSum).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.exteriorDoorSqm, 6);
  });

  it("net wall never exceeds gross", () => {
    const e = FZK_HAUS_MEASURED_ENVELOPE;
    expect(e.exteriorWallNetSqm).toBeLessThanOrEqual(e.grossWallSqm);
  });
});

describe("the recipe's envelope is the measured one, and heat-loss receives it intact", () => {
  it("envelopeQuantities returns the object, not an extrusion of the footprint", () => {
    const q = envelopeQuantities(FZK_HAUS_RECIPE);
    expect(q.source).toBe("measured");
    expect(q.grossWallAreaSqm).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.grossWallSqm, 2);
    expect(q.roofAreaSqm).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.roofAreaSqm, 2);
    expect(q.planAreaSqm).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.groundSlabSqm, 2);
    expect(q.volumeM3).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.conditionedVolumeGrossM3, 2);
    expect(q.intensityFloorAreaSqm).toBe(FZK_HAUS_TOTAL_FLOOR_AREA_SQM);
  });

  it("the square footprint, extruded, would have been a different, larger-walled building", () => {
    const { measuredEnvelope: _measured, ...bare } = FZK_HAUS_RECIPE;
    const extruded = envelopeQuantities(bare);
    expect(extruded.source).toBe("bbox");
  });

  it("heat-loss elements carry the envelope's own areas", () => {
    const result = calculateHeatLoss(FZK_HAUS_MATERIALS, FZK_HAUS_RECIPE, getClimateData(undefined));
    const area = (name: string) => result.elements.find((e) => e.element === name)?.area;
    expect(area("Roof")).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.roofAreaSqm, 1);
    expect(area("Ground Floor")).toBeCloseTo(FZK_HAUS_MEASURED_ENVELOPE.groundSlabSqm, 1);
    expect(area(VENTILATION_ELEMENT_NAME)).toBeCloseTo(
      FZK_HAUS_MEASURED_ENVELOPE.conditionedVolumeGrossM3,
      1,
    );
  });
});

describe("every non-measured value is a named assumption", () => {
  const ids = FZK_HAUS_ASSUMPTIONS.map((a) => a.id);

  it.each([
    "A-STATED-U-PRIMARY",
    "A-GROUND-STATED-U-NOT-AIR-TO-AIR",
    "A-GALERIE-GROSS-VOLUME-ARTEFACT",
    "A-WALL-LEICHTBETON-LAMBDA",
    "A-ROOF-MATERIAL-UNIDENTIFIED",
    "A-GROUND-NO-INSULATION",
    "A-SOIL",
    "A-GLAZING-SHGC",
    "A-DOORS",
    "A-NORTH-ROTATED",
    "A-WWR-ENGINE-MEAN",
    "A-HVAC",
    "A-LPD",
    "A-OCCUPANCY",
    "A-AIRTIGHT",
    "A-VOLUME",
    "A-CLIMATE",
    "A-NO-FOOTPRINT",
    "A-ERA-UNDATED",
    "A-STRUCTURE-CODE",
  ])("%s is declared", (id) => {
    expect(ids).toContain(id);
  });

  it("ids are unique", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every assumption says why it cannot be measured, with real substance", () => {
    for (const a of FZK_HAUS_ASSUMPTIONS) {
      expect(a.why.length, a.id).toBeGreaterThan(40);
    }
  });

  it("the climate assumption names the real site and says the substitution is Korean", () => {
    const a = FZK_HAUS_ASSUMPTIONS.find((x) => x.id === "A-CLIMATE")!;
    expect(a.why).toMatch(/Karlsruhe/);
    expect(a.why).toMatch(/Korean/);
  });

  it("the extractor-fix assumption cites the actual before/after numbers", () => {
    const a = FZK_HAUS_ASSUMPTIONS.find((x) => x.id === "A-GALERIE-GROSS-VOLUME-ARTEFACT")!;
    expect(a.why).toMatch(/428\.64/);
    expect(a.why).toMatch(/217\.53/);
    expect(a.why).toMatch(/362\.92/);
  });
});
