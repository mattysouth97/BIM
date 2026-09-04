import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ReferenceBuildingManifest,
  ReferenceBuildingOpenings,
} from "../manifest";
import { CLINIC_MEASURED_ENVELOPE } from "../bs-medical-dental-clinic-energy";

/**
 * The committed artifacts, read as the page reads them. These pin what
 * `scripts/lib/ifc-openings.mjs` resolved on the two reference buildings, so a
 * change to the extractor that moves a figure shows up here rather than on
 * a card — and so the energy file's constants are checked against the
 * manifest they claim to come from.
 */
function load(id: string) {
  const dir = path.join(process.cwd(), "public", "reference-buildings", id);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as ReferenceBuildingManifest;
  const openings = JSON.parse(readFileSync(path.join(dir, "openings.json"), "utf8")) as ReferenceBuildingOpenings;
  return { manifest, openings };
}

const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const sum = (m: Readonly<Record<string, number>> | undefined) =>
  Object.values(m ?? {}).reduce((s, v) => s + v, 0);

describe("Clinic openings, as the manifest carries them", () => {
  const { manifest, openings } = load("bs-medical-dental-clinic");
  const a = manifest.areas;

  it("resolves 58 windows, 15 exterior curtain walls and 13 exterior doors", () => {
    expect(manifest.counts.windows).toBe(58);
    expect(manifest.counts.exteriorCurtainWalls).toBe(15);
    expect(manifest.counts.exteriorDoors).toBe(13);
  });

  it("carries the aperture the energy file uses, and the doors", () => {
    expect(a.glazingApertureSqm).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.glazingApertureSqm, 2);
    expect(a.exteriorDoorSqm).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.exteriorDoorSqm, 2);
  });

  it("splits glazing over the same eight sectors as the wall, summing to the total", () => {
    expect(Object.keys(a.glazingByOrientationSqm ?? {})).toEqual(SECTORS);
    expect(Object.keys(a.exteriorWallByOrientationSqm ?? {})).toEqual(SECTORS);
    expect(sum(a.glazingByOrientationSqm)).toBeCloseTo(a.glazingApertureSqm ?? 0, 1);
    expect(sum(a.exteriorDoorByOrientationSqm)).toBeCloseTo(a.exteriorDoorSqm ?? 0, 1);
    for (const s of ["N", "E", "S", "W"] as const) {
      expect(a.glazingByOrientationSqm?.[s]).toBeCloseTo(
        CLINIC_MEASURED_ENVELOPE.glazingByOrientationSqm[s],
        2,
      );
    }
  });

  it("the note's arithmetic reproduces its own headline", () => {
    // Assert what the string claims, not that it appears: windows + curtain
    // walls in the sentence must add up to the aperture it opens with.
    const note = a.openingsNote ?? "";
    const m = note.match(
      /Glazing aperture ([\d.]+) m² = (\d+) IfcWindow [^(]+\(([\d.]+) m²\) \+ (\d+) exterior IfcCurtainWall [^(]+\(([\d.]+) m²/,
    );
    expect(m, note).not.toBeNull();
    const [, total, windows, windowSqm, curtain, curtainSqm] = m!;
    expect(Number(windows)).toBe(58);
    expect(Number(curtain)).toBe(15);
    expect(Number(windowSqm) + Number(curtainSqm)).toBeCloseTo(Number(total), 1);
    expect(Number(total)).toBeCloseTo(a.glazingApertureSqm ?? 0, 2);
  });

  it("the rows sum to the manifest, and every excluded row says why", () => {
    const included = openings.openings.filter((r) => r.included);
    const glazing = included.filter((r) => r.kind === "glazing").reduce((s, r) => s + (r.areaSqm ?? 0), 0);
    const doors = included.filter((r) => r.kind === "door").reduce((s, r) => s + (r.areaSqm ?? 0), 0);
    expect(glazing).toBeCloseTo(a.glazingApertureSqm ?? 0, 1);
    expect(doors).toBeCloseTo(a.exteriorDoorSqm ?? 0, 1);
    for (const r of openings.openings.filter((r) => !r.included)) {
      expect(r.reason, `#${r.id}`).toBeTruthy();
    }
    expect(openings.unresolved).toHaveLength(0);
  });

  it("removes the atrium screens by geometry, not by IsExternal, and counts the mirrored pair once", () => {
    const byId = new Map(openings.openings.map((r) => [r.id, r]));
    for (const id of [455, 745, 752, 753, 873]) {
      const r = byId.get(id)!;
      expect(r.isExternal, `#${id} is IsExternal in the file`).toBe(true);
      expect(r.included, `#${id}`).toBe(false);
      expect(r.reason).toMatch(/^interior: conditioned space on both sides/);
    }
    expect(byId.get(881)?.included).toBe(false);
    expect(byId.get(881)?.reason).toMatch(/coincident with #879/);
    expect(byId.get(879)?.included).toBe(true);
    // The two fences: by name, with the reason stated.
    for (const id of [748, 749]) {
      expect(byId.get(id)?.included).toBe(false);
      expect(byId.get(id)?.reason).toMatch(/fence/i);
    }
    // The glazed entrance leaf is a door, not glazing.
    expect(byId.get(2251)?.kind).toBe("door");
    expect(byId.get(2251)?.included).toBe(true);
  });

  it("per-element outline reproduces the recovered route A, element by element", () => {
    const byId = new Map(openings.openings.map((r) => [r.id, r]));
    const routeA: Record<number, number> = {
      401: 8.18, 402: 8.17, 403: 6.54, 746: 8.88, 494: 9.16, 549: 12.55, 550: 9.32,
      551: 9.32, 747: 22.92, 750: 7.0, 751: 12.43, 754: 7.0, 755: 12.43, 879: 12.3,
    };
    for (const [id, sqm] of Object.entries(routeA)) {
      expect(byId.get(Number(id))?.areaSqm, `#${id}`).toBeCloseTo(sqm, 1);
    }
    // #742 held its door inside the union there; here the door is separate.
    expect((byId.get(742)?.areaSqm ?? 0) + (byId.get(2251)?.areaSqm ?? 0)).toBeCloseTo(19.95, 1);
  });
});

describe("Schependomlaan openings, as the manifest carries them", () => {
  const { manifest, openings } = load("schependomlaan");
  const a = manifest.areas;

  it("counts 51 of the 77 real windows and 16 of the 20 IsExternal doors, and says which are not", () => {
    expect(manifest.counts.windows).toBe(51);
    expect(manifest.counts.exteriorDoors).toBe(16);
    expect(manifest.counts.exteriorCurtainWalls).toBe(0);
    const note = a.openingsNote ?? "";
    expect(note).toMatch(/marks 20 door\(s\) here; 16 confirm against an exterior wall, 4 do not/);
    for (const id of [77756, 81462, 187290, 189383]) expect(note).toContain(`#${id} merk F-R`);
    // 247 sub-frames: 182 window + 65 door `stelkozijn`.
    expect(openings.openings.filter((r) => r.reason?.startsWith("sub-frame")).length).toBe(247);
    // Real windows: 77 = 51 counted + 12 in walls outside the set + 4 not flat + 10 with no size.
    const realWindows = openings.openings
      .filter((r) => r.type === "IfcWindow" && !r.reason?.startsWith("sub-frame"))
      .length + openings.unresolved.filter((u) => u.type === "IfcWindow").length;
    expect(realWindows).toBe(77);
  });

  it("splits over eight sectors and sums to the totals", () => {
    expect(Object.keys(a.glazingByOrientationSqm ?? {})).toEqual(SECTORS);
    expect(sum(a.glazingByOrientationSqm)).toBeCloseTo(a.glazingApertureSqm ?? 0, 1);
    expect(sum(a.exteriorDoorByOrientationSqm)).toBeCloseTo(a.exteriorDoorSqm ?? 0, 1);
  });

  it("says the probe is inconclusive rather than reading absent rooms as outdoors", () => {
    expect(a.openingsNote).toMatch(/6 of 100 have geometry, so an empty probe is inconclusive/);
  });
});
