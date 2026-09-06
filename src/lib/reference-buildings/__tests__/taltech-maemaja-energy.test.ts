import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Vector3, Quaternion } from "three";
import { GALLERY_ITEMS } from "@/lib/landing/gallery";
import { layoutRoofPlanes, rectangleFits, usableAreaFor, type RoofPlaneSet } from "@/lib/retrofit/pv-layout";
import { buildReferenceEnergyDataset } from "../energy-dataset";
import { referenceBuildingEnergyInputs } from "../energy-inputs";
import { TALTECH_EXISTING_PV, TALTECH_GROUND_FLOOR, TALTECH_MATERIALS, TALTECH_MEASURED_ENVELOPE, TALTECH_RECIPE, TALTECH_STATED_THERMAL } from "../taltech-maemaja-energy";
import type { ReferenceBuildingManifest, ReferenceBuildingSpace } from "../manifest";

type Property = { setName: string; name: string; value: number | string; scope: string; propertyRef: string; typeRef?: string };
type Physics = { selectedWalls: { ref: string; netFaceAreaSqm: number }[]; elements: { ref: string; type: string; properties: Property[] }[];
  unitAssignments: { type: string; name: string; prefix: string | null; elements: { name: string; prefix: string | null; exponent: number }[] }[] };
const bytes = (file: string) => readFileSync(`public/reference-buildings/taltech-maemaja/${file}`);
const read = <T,>(file: string): T => JSON.parse(bytes(file).toString());
const manifest = read<ReferenceBuildingManifest>("manifest.json");
const spaces = read<{ spaces: ReferenceBuildingSpace[] }>("spaces.json").spaces;
const physics = read<Physics>("source-physics.json");
const properties = new Map(physics.elements.map((row) => [row.ref, row.properties]));
const property = (ref: string, set: string, name: string) => properties.get(ref)!.find((p) => p.setName === set && p.name === name)!;
const roof = read<RoofPlaneSet & { equipment: { rows: { ref: string; type: string; planeIds: string[] }[] } }>("roof-planes.json");

describe("TalTech source identity and quantities", () => {
  it("publishes the real research model with licence, source digest and separate source property download", () => {
    const card = GALLERY_ITEMS.find((row) => row.id === "taltech-maemaja")!;
    expect(card.href).toBe("/models/taltech-maemaja");
    expect(card.licence).toBe("CC BY 4.0");
    expect(card.attribution).toBe(manifest.attribution);
    expect(manifest.sourceUrl).toBe("https://zenodo.org/records/15782433");
    expect(manifest.sourceFiles[0].sha256).toBe("05919eee0701b955d3d08501c4889c879d9c486e2389a6a1a5cdaad32a5d10ba");
    expect(manifest.sourceFiles[0].byteLength).toBe(38728810);
    expect(manifest.site.locationIsAuthoringDefault).toBe(false);
    expect(manifest.site.declaredLatitudeDeg).toBeCloseTo(59.39499282833333, 6);
    expect(manifest.sourcePhysics!.sha256).toBe(createHash("sha256").update(bytes("source-physics.json")).digest("hex"));
    expect(new Set(manifest.assemblies!.map((a) => a.id)).size).toBe(manifest.assemblies!.length);
    expect(new Set(roof.planes.map((p) => p.id)).size).toBe(roof.planes.length);
  });
  it("reconciles the room, floor and gallery figures without claiming mesh fallback for stated volumes", () => {
    expect(spaces).toHaveLength(115);
    expect(spaces.reduce((sum, s) => sum + (s.floorAreaSqm ?? 0), 0)).toBeCloseTo(3486.12, 2);
    const card = GALLERY_ITEMS.find((row) => row.id === "taltech-maemaja")!;
    expect(card.datums.reduce((sum, d) => sum + d.rooms, 0)).toBe(115);
    expect(card.datums.reduce((sum, d) => sum + d.roomAreaSqm, 0)).toBeCloseTo(3486.12, 2);
    expect(manifest.areas.volumeNote).toContain("115 from stated volume quantity");
    expect(manifest.areas.volumeNote).not.toContain("failed the closed-mesh test and are counted");
    expect(TALTECH_RECIPE.officialFloorAreaSqm).toBe(manifest.areas.totalFloorAreaSqm);
    expect(TALTECH_RECIPE.measuredEnvelope!.volumeM3).toBe(manifest.areas.conditionedVolumeGrossM3);
    expect(TALTECH_MEASURED_ENVELOPE.roofAreaSqm).toBeCloseTo(roof.planes.reduce((s, p) => s + p.surfaceSqm, 0), 6);
  });
});

describe("source thermal claims are weighted, not invented", () => {
  it("confirms declared SI thermal and power units", () => {
    const unit = physics.unitAssignments.find((u) => u.type === "THERMALTRANSMITTANCEUNIT")!;
    expect(unit.elements.map((e) => [e.prefix, e.name, e.exponent])).toEqual([["KILO", "GRAM", 1], [null, "SECOND", -3], [null, "KELVIN", -1]]);
    expect(physics.unitAssignments.find((u) => u.type === "POWERUNIT")).toMatchObject({ name: "WATT", prefix: null });
  });
  it("reproduces typed wall and roof UA from individually referenced properties", () => {
    expect(physics.selectedWalls).toHaveLength(40);
    const area = physics.selectedWalls.reduce((sum, wall) => sum + wall.netFaceAreaSqm, 0);
    const ua = physics.selectedWalls.reduce((sum, wall) => {
      const p = property(wall.ref, "Pset_WallCommon", "ThermalTransmittance");
      expect(p.scope).toBe("type"); expect(p.propertyRef).toMatch(/^ifc:\/\//); expect(p.typeRef).toMatch(/^ifc:\/\//);
      return sum + wall.netFaceAreaSqm * Number(p.value);
    }, 0);
    expect(area).toBeCloseTo(TALTECH_STATED_THERMAL.wallAreaSqm, 6);
    expect(ua).toBeCloseTo(TALTECH_STATED_THERMAL.wallUaWPerK, 6);
    const roofUa = roof.planes.reduce((sum, p) => sum + p.surfaceSqm * Number(property((p as unknown as { elementRef: string }).elementRef, "Pset_RoofCommon", "ThermalTransmittance").value), 0);
    expect(roofUa).toBeCloseTo(TALTECH_STATED_THERMAL.roofUaWPerK, 6);
    expect(TALTECH_MATERIALS.envelope.walls[0].uValue).toBeCloseTo(ua / area, 10);
  });
  it("keeps alternate source values, unknown curtain U and ground conversion explicit", () => {
    expect(physics.elements.some((e) => {
      const typed = e.properties.find((p) => p.name === "ThermalTransmittance");
      const text = e.properties.find((p) => p.name === "Soojusläbivus");
      return typed && text && Number(typed.value) !== Number(String(text.value).replace(",", "."));
    })).toBe(true);
    const inputs = referenceBuildingEnergyInputs("taltech-maemaja")!;
    expect(inputs.assumptions.find((a) => a.id === "A-CURTAIN-U")!.assumes).toContain("1.4");
    expect(TALTECH_MATERIALS.envelope.groundFloor.uValue).toBe(TALTECH_GROUND_FLOOR.uValueWPerM2K);
    expect(TALTECH_MATERIALS.envelope.groundFloor.uValue).not.toBe(TALTECH_STATED_THERMAL.groundAirToAirUValue);
    expect(inputs.assumptions.find((a) => a.id === "A-GROUND-BASEMENT")!.why).toContain("fragmentation");
  });
});

describe("existing PV and modeled operation remain distinct", () => {
  it("reconstructs the roof summary from its independently published plane areas and slopes", () => {
    const read = referenceBuildingEnergyInputs("taltech-maemaja")!.roof!.read;
    const parts = [...read.matchAll(/([\d,]+\.\d\d) m² at ([\d.]+)°/g)].map((match) => ({ area: Number(match[1].replaceAll(",", "")), tilt: Number(match[2]) }));
    const first = roof.planes.find((plane) => plane.id === "basic-roof-kl-02-plane-0")!;
    const second = roof.planes.find((plane) => plane.id === "basic-roof-kl-03-plane-0")!;
    const remaining = roof.planes.filter((plane) => plane !== first && plane !== second);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ area: first.surfaceSqm, tilt: first.tiltDeg });
    expect(parts[1]).toEqual({ area: second.surfaceSqm, tilt: second.tiltDeg });
    const area = remaining.reduce((sum, plane) => sum + plane.surfaceSqm, 0);
    const mean = remaining.reduce((sum, plane) => sum + plane.surfaceSqm * plane.tiltDeg, 0) / area;
    expect(parts[2].area).toBeCloseTo(area, 8);
    expect(parts[2].tilt).toBeCloseTo(mean, 2);
    expect(Number(read.match(/remaining (\d+) patches/)?.[1])).toBe(remaining.length);
    expect(read).toContain("full solar shading is not modeled");
  });
  it("sums per-array ratings and module counts while retaining conflicting power fields", () => {
    const pv = physics.elements.filter((p) => p.type === "IfcSolarDevice");
    expect(pv).toHaveLength(48);
    expect(pv.reduce((sum, e) => sum + Number(property(e.ref, "Other", "RatedElectricPowerOutput").value), 0)).toBe(TALTECH_EXISTING_PV.ratedCapacityKw * 1000);
    expect(pv.reduce((sum, e) => sum + Number(property(e.ref, "Data", "Total Number of Modules").value), 0)).toBe(192);
    expect(pv.every((e) => Number(property(e.ref, "Data", "Total Power Watt Peak").value).toFixed(2) === "430.06")).toBe(true);
    expect(pv.every((e) => Number(property(e.ref, "Other", "Inclination").value) === TALTECH_EXISTING_PV.statedTypeInclinationDeg)).toBe(true);
    expect(TALTECH_MATERIALS.renewable.solarPV.installed).toBe(true);
    expect(TALTECH_MATERIALS.renewable.solarPV.capacity).toBe(63.36);
  });
  it("blocks every existing array and the associated rooftop chiller from new module footprints", () => {
    expect(roof.equipment.rows).toHaveLength(52);
    const arrays = roof.equipment.rows.filter((e) => e.type === "IfcSolarDevice");
    expect(arrays).toHaveLength(48);
    expect(arrays.every((e) => e.planeIds.length > 0)).toBe(true);
    expect(roof.equipment.rows.filter((e) => e.type === "IfcChiller" && e.planeIds.length)).toHaveLength(1);
    const layout = layoutRoofPlanes(roof);
    expect(layout.totalModules).toBeGreaterThan(0);
    expect(layout.latitudeDeg).toBeCloseTo(manifest.site.declaredLatitudeDeg!, 8);
    const seoulSpacing = layoutRoofPlanes(roof, 37.57);
    expect(layout.rackRowPitchM).toBeGreaterThan(seoulSpacing.rackRowPitchM);
    expect(layout.totalModules).toBeLessThan(seoulSpacing.totalModules);
    let accountingSnapM = 0;
    for (const result of layout.planes) {
      const plane = roof.planes.find((p) => p.id === result.planeId)!;
      const usable = usableAreaFor(plane);
      accountingSnapM = Math.max(accountingSnapM, usable.accountingSnapM);
      for (const panel of result.modules) {
        const corners = [[-.85, -.5], [.85, -.5], [.85, .5], [-.85, .5]].map(([x, z]) => {
          const p = new Vector3(x, 0, z).applyQuaternion(new Quaternion(...panel.quaternion)).add(new Vector3(...panel.centre));
          return [p.x, p.z] as [number, number];
        });
        expect(usable.regions.some((region) => rectangleFits(corners, region, usable.blocked))).toBe(true);
      }
    }
    expect(accountingSnapM).toBeGreaterThan(0);
    expect(accountingSnapM).toBeLessThanOrEqual(1e-6);
  });
  it("selects stated plant parameters explicitly and names the unsupported district-DHW mapping", () => {
    expect(TALTECH_MATERIALS.hvac.heating.fuelType).toBe("district-heat");
    expect(TALTECH_MATERIALS.hvac.heating.efficiency).toBe(Number(property("ifc://DS3_TalTech_V4.ifc#463195", "Data", "efficiency").value));
    expect(TALTECH_MATERIALS.hvac.cooling.efficiency).toBe(Number(property("ifc://DS3_TalTech_V4.ifc#433162", "Other", "efficiency").value));
    expect(TALTECH_MATERIALS.hvac.ventilation.heatRecoveryEfficiency).toBe(Number(property("ifc://DS3_TalTech_V4.ifc#497528", "Data", "heat_recovery_efficiency").value));
    expect(referenceBuildingEnergyInputs("taltech-maemaja")!.assumptions.find((a) => a.id === "A-DHW-MAPPING")!.why).toContain("source explicitly names District Heating DHW");
  });
  it("exports a real-building context with modeled, uncalibrated Seoul output and partial opening scope", () => {
    const inputs = referenceBuildingEnergyInputs("taltech-maemaja")!;
    const dataset = buildReferenceEnergyDataset(manifest, inputs);
    expect(dataset.building.modelContext.classification).toBe("real_building_model");
    expect(dataset.meteredEnergy).toBeNull(); expect(dataset.isMetered).toBe(false);
    expect(dataset.modeledEnergy!.hvac.totalDeliveredKWhPerYear).toBeGreaterThan(0);
    expect(dataset.modeledEnergy!.climate.sigunguCd).toBe("11");
    expect(dataset.measuredEnvelope.glazingApertureArea.coverage).toBe("partial_scope_requires_review");
    expect(dataset.source.statedPhysics!.url).toBe("/reference-buildings/taltech-maemaja/source-physics.json");
    expect(inputs.assumptions.some((a) => a.id === "A-ERA-USE" && a.why.includes("not a verified construction year"))).toBe(true);
    expect(inputs.scopeNotice!.en).toContain("separate measurement archive");
    expect(inputs.assumptions.find((a) => a.id === "A-HVAC")!.why).toContain("not calibrated");
  });
});
