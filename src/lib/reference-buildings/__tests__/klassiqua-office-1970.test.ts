// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GALLERY_ITEMS } from "@/lib/landing/gallery";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import { deliveredFromDemand } from "@/lib/energy/delivered-from-demand";
import { layoutRoofPlanes, type RoofPlaneSet } from "@/lib/retrofit/pv-layout";
import { buildReferenceEnergyDataset } from "../energy-dataset";
import { referenceBuildingEnergyInputs } from "../energy-inputs";
import { buildReferenceEnergyZones, classifySpaceProgram } from "../zones";
import { KLASSIQUA_ASSUMPTIONS, KLASSIQUA_FLOOR_AREA, KLASSIQUA_MATERIALS, KLASSIQUA_MEASURED, KLASSIQUA_RECIPE, KLASSIQUA_SOURCE } from "../klassiqua-office-1970-energy";
import type { ReferenceBuildingManifest, ReferenceBuildingOpenings, ReferenceBuildingRoofPlanes, ReferenceBuildingSpaces } from "../manifest";

const id = "klassiqua-office-1970";
const read = <T,>(name: string): T => JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings", id, name), "utf8"));
const manifest = read<ReferenceBuildingManifest>("manifest.json");
const spaces = read<ReferenceBuildingSpaces>("spaces.json").spaces;
const roof = read<ReferenceBuildingRoofPlanes>("roof-planes.json");
const openings = read<ReferenceBuildingOpenings>("openings.json");
const card = GALLERY_ITEMS.find((item) => item.id === id)!;
const energy = referenceBuildingEnergyInputs(id)!;
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("Klassiqua 1970: published source and geometry", () => {
  it("is licensed and classified as a synthetic archetype, with reproducible IFC/PDF references", () => {
    expect(manifest.licence).toBe("CC BY 4.0");
    expect(card.licence).toBe(manifest.licence);
    expect(card.attribution).toBe(manifest.attribution);
    expect(card.enUse).toContain("Synthetic");
    expect(manifest.summary.en).toContain("not a constructed building");
    expect(manifest.sourceFiles[0].sha256).toBe("4d77774850b817d8ed9534e19886a1ff7fbcbe734a8f3138eebf2751e4c879fb");
    expect(manifest.documentation![0]).toMatchObject({ url: KLASSIQUA_SOURCE.documentationUrl, sha256: KLASSIQUA_SOURCE.documentationSha256 });
    const dataset = buildReferenceEnergyDataset(manifest, energy);
    expect(dataset.building.modelContext.classification).toBe("synthetic_example");
    expect(dataset.source.documentation).toEqual(manifest.documentation);
    expect(dataset.meteredEnergy).toBeNull();
  });

  it("derives all 48 room areas from geometry and preserves the quantity absence", () => {
    expect(spaces).toHaveLength(48);
    expect(spaces.every((space) => space.areaQuantityName === null && space.floorAreaSource === "solid_plan_union")).toBe(true);
    expect(spaces.every((space) => space.netVolumeSource === "mesh")).toBe(true);
    expect(sum(spaces.map((space) => space.floorAreaSqm!))).toBeCloseTo(KLASSIQUA_FLOOR_AREA, 2);
    expect(KLASSIQUA_FLOOR_AREA).toBe(manifest.areas.totalFloorAreaSqm);
    expect(Math.round(KLASSIQUA_FLOOR_AREA)).toBe(KLASSIQUA_SOURCE.publishedUsableFloorAreaSqm);
    expect(manifest.areas.floorAreaNote).toContain("no area quantity");
    expect(manifest.storeys!.map((storey) => storey.elevationM)).toEqual([0, 3.55, 7.1, 10.65]);
    expect(manifest.storeys!.every((storey) => storey.spaceCount === 12)).toBe(true);
    expect(sum(card.datums.map((datum) => datum.roomAreaSqm))).toBeCloseTo(KLASSIQUA_FLOOR_AREA, 2);
    const [perFloor, floors, total] = [...card.figures.find((figure) => figure.id === "rooms")!.read.matchAll(/\d+/g)].map((match) => Number(match[0]));
    expect(perFloor * floors).toBe(total);
    expect(total).toBe(spaces.length);
  });

  it("counts floor-edge cladding once and excludes upper parapet from conditioned wall area", () => {
    const facade = manifest.areas.opaqueFacade!;
    expect(facade.elements).toHaveLength(16);
    expect(facade).toMatchObject({ fullFaceSqm: 881.33, conditionedFaceSqm: 832.72, excludedFaceSqm: 48.62, fromHeightM: 0, toHeightM: 14 });
    expect(Math.abs(facade.fullFaceSqm - facade.conditionedFaceSqm - facade.excludedFaceSqm)).toBeLessThanOrEqual(0.011);
    expect(manifest.areas.exteriorWallNetSqm).toBe(facade.conditionedFaceSqm);
    expect(manifest.areas.exteriorWallNote).toContain("floor-edge bands");
    expect(sum(Object.values(manifest.areas.exteriorWallByOrientationSqm!))).toBeCloseTo(facade.conditionedFaceSqm, 2);
    expect(KLASSIQUA_ASSUMPTIONS.find((entry) => entry.id === "A-UNIFORM-WALL-U")!.why).toContain("understate heat loss");
  });

  it("keeps 167 whole windows and the exterior door, excluding opaque curtain-wall cladding from glazing", () => {
    const windows = openings.openings.filter((row) => row.included && row.type === "IfcWindow");
    const doors = openings.openings.filter((row) => row.included && row.type === "IfcDoor");
    expect(windows).toHaveLength(167); expect(doors).toHaveLength(1);
    expect(sum(windows.map((row) => row.areaSqm!))).toBeCloseTo(379.925, 4);
    expect(openings.unresolved).toHaveLength(0);
    const cladding = openings.openings.filter((row) => row.type === "IfcCurtainWall");
    expect(cladding).toHaveLength(16);
    expect(cladding.every((row) => !row.included && row.areaSqm === null && row.reason?.startsWith("Opaque"))).toBe(true);
    expect(manifest.areas.openingsNote).toContain("aperture area not measured");
  });

  it("prices the sky-visible roof once and preserves the roof covering's source FLOORING type", () => {
    expect(roof.planes).toHaveLength(2);
    expect(sum(roof.planes.map((plane) => plane.surfaceSqm))).toBe(KLASSIQUA_MEASURED.roofAreaSqm);
    expect(roof.planes.every((plane) => plane.tiltDeg === 0 && !/Attica/.test(plane.elementName))).toBe(true);
    expect(KLASSIQUA_MEASURED.roofAreaSqm).toBeLessThan(manifest.areas.roofSurfaceSqm!);
    expect(manifest.roofs!.find((row) => row.elementType === "IfcCovering")).toMatchObject({ predefinedType: "FLOORING", basis: "declared roof covering name" });
    expect(roof.planes.find((plane) => plane.elementType === "IfcCovering")!.minElevationM).toBe(14.375);
    const pv = layoutRoofPlanes(read<RoofPlaneSet>("roof-planes.json"));
    expect(pv.totalModules).toBe(84);
    expect(pv.totalKWp).toBe(33.6);
    expect(pv.planes.find((plane) => plane.planeId === roof.planes[0].id)!.moduleCount).toBe(0);
  });

  it("publishes actual source conductivity separately from the complete assembly U-values", () => {
    const layers = manifest.assemblies!.flatMap((assembly) => assembly.layers);
    expect(manifest.assemblies).toHaveLength(15);
    expect(layers.find((layer) => layer.name === "Insulation_XPS_Lambda0.045_1970")!.sourceThermalProperties).toMatchObject({ conductivityWPerMK: 0.045 });
    expect(layers.find((layer) => layer.name === "VentilatedAluminiumCladding_54mm")!.sourceThermalProperties).toBeUndefined();
    for (const layer of layers.filter((row) => row.sourceThermalProperties)) expect(layer.sourceThermalProperties!.ref).toMatch(/\.ifc#\d+$/);
  });
});

describe("Klassiqua 1970: energy engine and honest limitations", () => {
  it("prices the measured envelope and source whole-assembly U-values without double ground coupling", () => {
    const result = calculateHeatLoss(KLASSIQUA_MATERIALS, KLASSIQUA_RECIPE, getClimateData("11"));
    const row = (name: string) => result.elements.find((element) => element.element === name)!;
    expect(row("Windows")).toMatchObject({ uValue: 4.18 });
    expect(row("Windows").area).toBeCloseTo(379.92, 6);
    expect(row("Walls").area).toBeCloseTo(832.72 + 2.78, 6);
    expect(row("Walls").uValue).toBeCloseTo(1.05, 10);
    expect(row("Roof")).toMatchObject({ area: 420.94, uValue: 0.62 });
    expect(row("Ground Floor")).toMatchObject({ area: 427.36, uValue: 0.45 });
    expect(KLASSIQUA_MATERIALS.envelope.airtightness.ach50).toBe(10);
  });

  it("models the source T1 case without cooling electricity or a claim of measured comfort", () => {
    const climate = getClimateData("11");
    const demand = calculateAnnualDemand(calculateHeatLoss(energy.materials, energy.recipe, climate), energy.materials, energy.recipe, climate);
    const rating = calculateEfficiencyRating(deliveredFromDemand(demand), KLASSIQUA_FLOOR_AREA, "non-residential");
    expect(demand.coolingDemand).toBe(0);
    expect(demand.heatingDemand).toBeGreaterThan(0);
    expect(energy.scopeNotice!.en).toContain("does not establish comfort");
    expect(energy.scopeNotice!.en).toContain("understate thermal-bridge losses");
    const doorNote = KLASSIQUA_ASSUMPTIONS.find((entry) => entry.id === "A-DOORS")!.why;
    const [, doorU, wallU, area, loss] = doorNote.match(/\(([\d.]+)−([\d.]+)\)×([\d.]+) = ([\d.]+) W\/K/)!;
    expect((Number(doorU) - Number(wallU)) * Number(area)).toBeCloseTo(Number(loss), 8);
    expect(Number(doorU)).toBe(KLASSIQUA_SOURCE.exteriorDoorU);
    expect(energy.orientationLabels).toEqual({ N: "NE", E: "SE", S: "SW", W: "NW" });
    expect(demand.demandPerSqm).toBeCloseTo(177.13117649400806, 6);
    expect(rating.grade).toBe("2");
  });

  it("maps source room names and conserves all areas and apportioned energy", () => {
    for (const [longName, program] of [["OpenPlanOffice", "office"], ["MeetingSpace", "office"], ["TechnicalRoom", "plant"], ["Stairwell", "circulation"]]) expect(classifySpaceProgram({ name: "", longName }).key).toBe(program);
    const zones = buildReferenceEnergyZones(spaces, manifest.storeys!, 100_000);
    expect(sum(zones.map((zone) => zone.rooms.length))).toBe(48);
    expect(sum(zones.map((zone) => zone.areaSqm))).toBeCloseTo(KLASSIQUA_FLOOR_AREA, 2);
    expect(sum(zones.map((zone) => zone.demandKwhPerYear))).toBeCloseTo(100_000, 6);
    expect(zones.some((zone) => zone.programKey === "other")).toBe(false);
  });
});
