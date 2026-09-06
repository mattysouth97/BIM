import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KIT_OFFICE_ASSUMPTIONS, KIT_OFFICE_GROUND_FLOOR, KIT_OFFICE_MATERIALS, KIT_OFFICE_MEASURED_ENVELOPE, KIT_OFFICE_RECIPE, KIT_OFFICE_TOTAL_FLOOR_AREA_SQM } from "../kit-office-energy";
import { referenceBuildingEnergyInputs } from "../energy-inputs";
import { GALLERY_ITEMS } from "@/lib/landing/gallery";
import { calculateHeatLoss, VENTILATION_ELEMENT_NAME } from "@/lib/energy/heat-loss";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { buildingTypeForGrade, deliveredFromDemand } from "@/lib/energy/delivered-from-demand";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import { buildReferenceEnergyZones, classifySpaceProgram } from "../zones";
import { solveConstructions } from "../constructions";
import type { ReferenceBuildingManifest, ReferenceBuildingRoofPlanes, ReferenceBuildingSpace } from "../manifest";

const artifact = <T,>(file: string): T => JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings/kit-office", file), "utf8"));
const manifest = artifact<ReferenceBuildingManifest>("manifest.json");
const spaces = artifact<{ spaces: ReferenceBuildingSpace[] }>("spaces.json").spaces;
const roof = artifact<ReferenceBuildingRoofPlanes>("roof-planes.json");
const card = GALLERY_ITEMS.find((c) => c.id === "kit-office")!;
const energy = referenceBuildingEnergyInputs("kit-office")!;

describe("KIT Office: source and displayed identity", () => {
  it("is explicitly a fictional validation example with the source's reuse grant and full attribution", () => {
    expect(manifest.summary.en).toContain("fictional");
    expect(card.enUse).toContain("Fictional");
    expect(manifest.site.locationNote).toContain("No real site");
    expect(manifest.site.locationIsAuthoringDefault).toBe(true);
    expect(manifest.licence).toBe("KIT/IAI unrestricted use (attribution required)");
    expect(card.attribution).toBe(manifest.attribution);
    expect(card.licence).toBe(manifest.licence);
    expect(manifest.sourceFiles[0].sha256).toBe("cfb2124497b25d9a72101075e84be0feb44ff669cb1bd3251be11efebeea945c");
    expect(card.href).toBe("/models/kit-office");
    expect(manifest.serviceLayers).toHaveLength(0);
  });

  it("reconciles the card's area, room explanation and section bars with the IFC quantities", () => {
    const area = spaces.reduce((sum, s) => sum + (s.floorAreaSqm ?? 0), 0);
    expect(area).toBeCloseTo(KIT_OFFICE_TOTAL_FLOOR_AREA_SQM, 2);
    expect(KIT_OFFICE_TOTAL_FLOOR_AREA_SQM).toBe(manifest.areas.totalFloorAreaSqm);
    expect(card.datums.reduce((sum, d) => sum + d.roomAreaSqm, 0)).toBeCloseTo(area, 2);
    expect(card.datums.reduce((sum, d) => sum + d.rooms, 0)).toBe(spaces.length);
    const rooms = card.figures.find((f) => f.id === "rooms")!;
    const [stated, basement, offices, attic] = [...rooms.read.matchAll(/\d+/g)].map((m) => Number(m[0]));
    expect(basement + offices + attic).toBe(stated);
    expect(stated).toBe(Number(rooms.value));
    expect(stated).toBe(manifest.counts.spacesFloor);
    const displayedArea = Number(card.figures.find((f) => f.id === "floor-area")!.value.replace(/[^\d.]/g, ""));
    expect(displayedArea).toBeCloseTo(area, 1);
  });
});

describe("KIT Office: measured geometry reaches the energy engine", () => {
  it("reproduces the manifest's wall, aperture, ground and volume readings", () => {
    const measured = KIT_OFFICE_MEASURED_ENVELOPE;
    for (const key of ["exteriorWallNetSqm", "glazingApertureSqm", "exteriorDoorSqm", "groundSlabSqm", "groundPerimeterM", "conditionedVolumeGrossM3", "roomVolumeNetM3"] as const) {
      expect(measured[key], key).toBe(manifest.areas[key]);
    }
    expect(manifest.counts.exteriorWalls).toBe(44);
    expect(manifest.areas.exteriorWallNote).toContain("44 walls selected by IfcRelSpaceBoundary PHYSICAL/EXTERNAL");
    expect(manifest.areas.exteriorWallNote).toContain("stated NetSideArea");
    expect(manifest.counts.windows).toBe(206);
    expect(manifest.counts.exteriorDoors).toBe(1);
    expect(measured.grossWallSqm).toBeCloseTo(measured.exteriorWallNetSqm + measured.glazingApertureSqm + measured.exteriorDoorSqm, 8);
  });

  it("prices the non-overlapping exposed roof instead of summing overlapping curved strips", () => {
    const exposed = roof.planes.reduce((sum, p) => sum + p.surfaceSqm, 0);
    expect(exposed).toBeCloseTo(KIT_OFFICE_MEASURED_ENVELOPE.roofAreaSqm, 3);
    expect(exposed).toBeLessThan(manifest.areas.roofSurfaceSqm!);
    expect(roof.planes.reduce((sum, p) => sum + p.projectedSqm, 0)).toBeCloseTo(manifest.areas.roofUnionSqm!, 0);
    expect(new Set(roof.planes.map((p) => Math.round(p.tiltDeg))).size).toBeGreaterThan(3);
    expect(energy.roof).toBeUndefined();
  });

  it("preserves measured aperture, roof, ground and ventilation volume through the real heat-loss calculation", () => {
    const result = calculateHeatLoss(KIT_OFFICE_MATERIALS, KIT_OFFICE_RECIPE, getClimateData("11"));
    const row = (name: string) => result.elements.find((e) => e.element === name)!;
    expect(row("Windows").area).toBeCloseTo(manifest.areas.glazingApertureSqm!, 6);
    expect(row("Walls").area).toBeCloseTo(manifest.areas.exteriorWallNetSqm + manifest.areas.exteriorDoorSqm!, 6);
    expect(row("Roof").area).toBe(659.54);
    expect(row("Ground Floor").area).toBe(516);
    expect(row("Ground Floor").uValue).toBe(KIT_OFFICE_GROUND_FLOOR.uValueWPerM2K);
    expect(row(VENTILATION_ELEMENT_NAME).area).toBe(6227.27);
    expect(row(VENTILATION_ELEMENT_NAME).uValue).toBeCloseTo(KIT_OFFICE_MATERIALS.envelope.airtightness.ach50 / 20, 8);
    expect(result.totalHeatLoss).toBeGreaterThan(0);
  });

  it("reproduces the published baseline under the stated assumptions on the office grade table", () => {
    const climate = getClimateData("11");
    const demand = calculateAnnualDemand(calculateHeatLoss(energy.materials, energy.recipe, climate), energy.materials, energy.recipe, climate);
    const category = buildingTypeForGrade(energy.materials, energy.recipe.mainPurpsCd);
    const rating = calculateEfficiencyRating(deliveredFromDemand(demand), KIT_OFFICE_TOTAL_FLOOR_AREA_SQM, category);
    expect(category).toBe("non-residential");
    expect(demand.demandPerSqm).toBeCloseTo(269.1336833912164, 6);
    expect(rating.grade).toBe("5");
  });

  it("resolves each named layer with an explicit generic-material mapping", () => {
    const solved = solveConstructions(manifest);
    expect(solved).toHaveLength(manifest.assemblies!.length);
    for (const assembly of solved) {
      expect(assembly.layers.every((layer) => layer.mapping?.basis === "generic_material")).toBe(true);
    }
  });

  it("keeps thermal and operating assumptions separate from the measured geometry", () => {
    expect(KIT_OFFICE_MATERIALS.confidence).toBe("estimated");
    expect(energy.measurementState).toBe("complete");
    const ids = KIT_OFFICE_ASSUMPTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["A-CONDITIONED-SPACES", "A-GROUND-BASEMENT", "A-ROOF-UNINSULATED", "A-WALL-CONDUCTIVITY", "A-WINDOWS", "A-HVAC", "A-LPD", "A-OCCUPANCY", "A-AIRTIGHT", "A-CLIMATE"]) expect(ids).toContain(id);
    expect(KIT_OFFICE_ASSUMPTIONS.find((a) => a.id === "A-ROOF-UNINSULATED")!.why).toContain("OVERSTATE");
    expect(KIT_OFFICE_ASSUMPTIONS.find((a) => a.id === "A-CONDITIONED-SPACES")!.why).toContain("understate intensity");
    const quotedAttic = Number(energy.scopeNotice!.en.match(/([\d.]+) m² attic storey/)![1]);
    expect(quotedAttic).toBe(manifest.storeys!.find((s) => s.name === "Dachgeschoss")!.floorAreaSqm);
    expect(energy.scopeNotice!.en).toContain("stair/circulation");
    expect(energy.scopeNotice!.en).toContain("understate energy intensity");
    expect(energy.scopeNotice!.en).toContain("overstate roof-retrofit savings");
  });
});

describe("KIT Office: names classify zones without inventing an attic use", () => {
  it.each([
    ["Buero Meier", "office"], ["Besprechungsraum I", "office"], ["Seminarraum", "office"],
    ["Technikraum I", "plant"], ["Labor K1", "lab"], ["WC Herren", "sanitary"], ["Flur 2.OG Ost", "circulation"],
    ["Dachboden-1", "other"],
  ])("%s → %s", (longName, key) => {
    expect(classifySpaceProgram({ name: "", longName }).key).toBe(key);
  });

  it("accounts for every enclosed space and the entire apportioned demand", () => {
    const zones = buildReferenceEnergyZones(spaces, manifest.storeys!, 100_000);
    expect(zones.reduce((sum, z) => sum + z.rooms.length, 0)).toBe(82);
    expect(zones.reduce((sum, z) => sum + z.areaSqm, 0)).toBeCloseTo(2266.66, 2);
    expect(zones.reduce((sum, z) => sum + z.demandKwhPerYear, 0)).toBeCloseTo(100_000, 6);
    expect(zones.filter((z) => z.programKey === "other").flatMap((z) => z.rooms)).toHaveLength(2);
  });
});
