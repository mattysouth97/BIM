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
  SPACE_PROGRAMS,
} from "../zones";

const dir = path.join(process.cwd(), "public", "reference-buildings", "bs-medical-dental-clinic");
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as ReferenceBuildingManifest;
const spacesDoc = JSON.parse(readFileSync(path.join(dir, "spaces.json"), "utf8")) as ReferenceBuildingSpaces;
const spaces = spacesDoc.spaces;

const space = (name: string): Pick<ReferenceBuildingSpace, "name" | "longName"> => ({
  name,
  longName: name,
});

describe("classifySpaceProgram", () => {
  it.each([
    ["CORRIDOR", "circulation"],
    ["STAIR", "circulation"],
    ["ELEV. EQUIP.", "circulation"],
    ["STAFF TOILET", "sanitary"],
    ["JAN. CL.", "sanitary"],
    ["MAIN MECHANICAL ROOM", "plant"],
    ["ELEC. CL.", "plant"],
    ["GEN. DENT. DTR #7", "dental"],
    ["DENTAL WAITING", "dental"],
    ["PROSTH. LAB", "dental"],
    ["SPECIMEN COLL. LAB", "lab"],
    ["X-RAY ALCOVE", "lab"],
    ["PHARM. DISP.", "lab"],
    ["INTERACTION STATION", "clinical"],
    ["OPT. EXAM / OFF.", "clinical"],
    ["TRMT RM. DIRTY PROC.", "clinical"],
    ["CENTRAL WAITING", "waiting"],
    ["PATIENT ADMIN. RECEPT.", "waiting"],
    ["RECEIVING / STORAGE", "storage"],
    ["CENT. STO.", "storage"],
    ["TRICARE OFFICE", "office"],
    ["TECH. WORK ROOM", "office"],
    ["LIBRARY / CONF. ROOM", "office"],
    ["SUPER / NCOIC", "office"],
  ])("%s → %s", (name, key) => {
    expect(classifySpaceProgram(space(name)).key).toBe(key);
  });

  it("does not guess: an unknown name is 기타, labelled as such", () => {
    const p = classifySpaceProgram(space("ZORBLAT"));
    expect(p).toBe(OTHER_PROGRAM);
    expect(p.labelKo).toMatch(/표에 없는/);
  });

  it("keys are unique and every program has at least one pattern", () => {
    const keys = SPACE_PROGRAMS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of SPACE_PROGRAMS) expect(p.patterns.length).toBeGreaterThan(0);
  });

  it("pins the Clinic's 158 distinct names: how many fall to 기타, and which", () => {
    const names = new Set(spaces.map((s) => (s.longName ?? s.name).toUpperCase().trim()));
    expect(names.size).toBe(158);
    const other = [...names].filter((n) => classifySpaceProgram(space(n)) === OTHER_PROGRAM).sort();
    // What the table does not name, listed so a change to the table changes
    // this list visibly rather than moving rooms between rows in silence.
    // Only the two non-floor names remain unnamed, and neither becomes a
    // zone: `buildReferenceEnergyZones` skips spaces that are not floor.
    expect(other).toEqual(["OPEN TO BELOW", "ROOF"]);
  });
});

describe("buildReferenceEnergyZones on the Clinic's own spaces", () => {
  const storeys = manifest.storeys!;
  const zones = buildReferenceEnergyZones(spaces, storeys, 100_000);

  it("covers exactly the floor-counting area, no ROOF, no void, no yard", () => {
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
      expect(z.resultValueKwhPerYear).toBe(z.demandKwhPerYear);
      expect(z.intensityKwhPerSqm).toBeCloseTo(100_000 / manifest.areas.totalFloorAreaSqm, 3);
    }
  });

  it("zones are storey × program, storeys in elevation order", () => {
    const floorNos = zones.map((z) => z.floorNo);
    expect([...floorNos]).toEqual([...floorNos].sort((a, b) => a - b));
    const keys = zones.map((z) => z.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(zones.some((z) => z.levelId === "storey-first-floor" && z.programKey === "corridor")).toBe(false);
    expect(zones.some((z) => z.levelId === "storey-first-floor" && z.programKey === "circulation")).toBe(true);
  });

  it("with no demand, every zone reads zero rather than a fabricated share", () => {
    for (const z of buildReferenceEnergyZones(spaces, storeys, 0)) {
      expect(z.demandKwhPerYear).toBe(0);
      expect(z.color).toBeDefined();
    }
  });
});
