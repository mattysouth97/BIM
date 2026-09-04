import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type {
  ReferenceBuildingManifest,
  ReferenceBuildingSpace,
  ReferenceBuildingSpaces,
} from "../manifest";
import {
  buildReferenceEnergyZones,
  classifySpaceProgram,
  OTHER_PROGRAM,
} from "../zones";

const dir = path.join(process.cwd(), "public", "reference-buildings", "schependomlaan");
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as ReferenceBuildingManifest;
const spacesDoc = JSON.parse(readFileSync(path.join(dir, "spaces.json"), "utf8")) as ReferenceBuildingSpaces;
const spaces = spacesDoc.spaces;

const clinicSpaces = (
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), "public", "reference-buildings", "bs-medical-dental-clinic", "spaces.json"),
      "utf8",
    ),
  ) as ReferenceBuildingSpaces
).spaces;

const space = (name: string): Pick<ReferenceBuildingSpace, "name" | "longName"> => ({
  name,
  longName: name,
});

describe("the Dutch rows classify what the model actually contains", () => {
  it.each([
    ["WOONKAMER", "dwelling"],
    ["SLAAPKAMER 1", "dwelling"],
    ["SLAAPKAMER 2", "dwelling"],
    ["SLAAPKAMER", "dwelling"],
    ["KEUKEN", "kitchen"],
    ["BADKAMER", "sanitary"],
    ["TOILET", "sanitary"],
    ["ENTREE", "circulation"],
    ["GANG", "circulation"],
    ["OVERLOOP", "circulation"],
    ["BERGING", "storage"],
    ["KAST", "storage"],
    ["MK", "plant"],
    ["INSTAL. RUIMTE", "plant"],
  ])("%s → %s", (name, key) => {
    expect(classifySpaceProgram(space(name)).key).toBe(key);
  });

  it("ONBEN. RUIMTE has no row and lands in 기타, which is the honest answer", () => {
    // "Onbenoemde ruimte" — an unallocated space. The model declines to say
    // what it is for, so the table declines to guess.
    const p = classifySpaceProgram(space("ONBEN. RUIMTE"));
    expect(p).toBe(OTHER_PROGRAM);
    expect(p.labelKo).toMatch(/표에 없는/);
  });

  it("pins the model's 15 distinct names: exactly one falls to 기타, and which", () => {
    const names = new Set(spaces.map((s) => (s.longName ?? s.name).toUpperCase().trim()));
    expect(names.size).toBe(15);
    const other = [...names].filter((n) => classifySpaceProgram(space(n)) === OTHER_PROGRAM).sort();
    expect(other).toEqual(["ONBEN. RUIMTE"]);
  });

  it("does not move a single Clinic room", () => {
    // The Dutch keywords join existing rows, so this is the assertion that
    // matters: adding them must not reclassify anything in the other
    // building. Only TOILET is shared, and it was already sanitary.
    const names = new Set(clinicSpaces.map((s) => (s.longName ?? s.name).toUpperCase().trim()));
    const dutch = [
      /\bWOONKAMER\b/, /\bSLAAPKAMER\b/, /\bKEUKEN\b/, /\bBADKAMER\b/,
      /\bENTREE\b/, /\bGANG\b/, /\bOVERLOOP\b/, /\bBERGING\b/, /\bKAST\b/,
      /\bMK\b/, /\bINSTAL\.?/,
    ];
    for (const pattern of dutch) {
      expect([...names].filter((n) => pattern.test(n)), String(pattern)).toEqual([]);
    }
  });
});

describe("buildReferenceEnergyZones on Schependomlaan's own spaces", () => {
  const storeys = manifest.storeys!;
  const zones = buildReferenceEnergyZones(spaces, storeys, 100_000);

  it("covers exactly the floor-counting area and every floor-counting room", () => {
    const area = zones.reduce((sum, z) => sum + z.areaSqm, 0);
    expect(area).toBeCloseTo(manifest.areas.totalFloorAreaSqm, 0);
    const rooms = zones.reduce((sum, z) => sum + z.rooms.length, 0);
    expect(rooms).toBe(manifest.counts.spacesFloor);
  });

  it("apportions the whole demand by area share and nothing is lost", () => {
    const demand = zones.reduce((sum, z) => sum + z.demandKwhPerYear, 0);
    expect(demand).toBeCloseTo(100_000, 3);
    for (const z of zones) {
      expect(z.resultStatus).toBe("area_apportioned_approximation");
      expect(z.intensityKwhPerSqm).toBeCloseTo(100_000 / manifest.areas.totalFloorAreaSqm, 3);
    }
  });

  it("zones are storey × program over the four occupied storeys only", () => {
    const floorNos = zones.map((z) => z.floorNo);
    expect([...floorNos]).toEqual([...floorNos].sort((a, b) => a - b));
    expect(new Set(zones.map((z) => z.key)).size).toBe(zones.length);
    // The -1 fundering and 04 dak datums carry no space, so no zone.
    expect(zones.some((z) => z.levelId === "storey-1-fundering")).toBe(false);
    expect(zones.some((z) => z.levelId === "storey-04-dak")).toBe(false);
    expect(new Set(zones.map((z) => z.levelId)).size).toBe(4);
  });

  it("the residential programs are present and are the bulk of the floor area", () => {
    const byProgram = new Map<string, number>();
    for (const z of zones) byProgram.set(z.programKey, (byProgram.get(z.programKey) ?? 0) + z.areaSqm);
    expect(byProgram.has("dwelling")).toBe(true);
    expect(byProgram.has("kitchen")).toBe(true);
    const total = manifest.areas.totalFloorAreaSqm;
    expect((byProgram.get("dwelling") ?? 0) / total).toBeGreaterThan(0.4);
  });

  it("ten dwellings' worth of rooms, which is what the occupancy assumption rests on", () => {
    const count = (name: string) =>
      spaces.filter((s) => (s.longName ?? s.name).toUpperCase().trim() === name).length;
    expect(count("WOONKAMER")).toBe(10);
    expect(count("KEUKEN")).toBe(10);
    expect(count("BADKAMER")).toBe(10);
    expect(count("MK")).toBe(10);
  });
});
