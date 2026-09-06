// Pins on the shipped `roof-planes.json` of every published building — the
// stage-1 regressions of the PV placement methodology. These read the
// artifact the app serves, so they go red when the extraction moves, which
// is the point: a plane count or a tilt that drifts is a roof that changed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  REFERENCE_BUILDING_IDS,
  type ReferenceBuildingManifest,
  type ReferenceBuildingRoofPlanes,
} from "../manifest";

function read<T>(id: string, file: string): T {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "reference-buildings", id, file), "utf8"),
  ) as T;
}

const planesOf = (id: string) => read<ReferenceBuildingRoofPlanes>(id, "roof-planes.json");
const manifestOf = (id: string) => read<ReferenceBuildingManifest>(id, "manifest.json");
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const ringArea2 = (pts: readonly (readonly [number, number])[]) => {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return s;
};
function centreInside(
  plan: readonly (readonly [number, number])[],
  ring: readonly (readonly [number, number])[],
): boolean {
  const cx = plan.reduce((s, q) => s + q[0], 0) / plan.length;
  const cz = plan.reduce((s, q) => s + q[1], 0) / plan.length;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > cz !== zj > cz && cx < ((xj - xi) * (cz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

describe("every published building ships roof planes that reconcile with its manifest", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    describe(id, () => {
      const file = planesOf(id);
      const manifest = manifestOf(id);

      it("is the contract, with the union and occlusion counts stated", () => {
        expect(file.kind).toBe("bimfit_reference_building_roof_planes");
        expect(file.id).toBe(id);
        expect(file.planes.length).toBeGreaterThan(0);
        expect(file.occludedPlanes).toBeGreaterThanOrEqual(0);
        expect(file.note).toMatch(/sky sees/);
      });

      it("sum of projected = what the sky sees = the manifest's roof union, within 1 %", () => {
        const projected = sum(file.planes.map((p) => p.projectedSqm));
        expect(Math.abs(projected - file.skyUnionSqm) / file.skyUnionSqm).toBeLessThan(0.01);
        const union = manifest.areas.roofUnionSqm;
        expect(union).toBeDefined();
        expect(Math.abs(file.skyUnionSqm - (union as number)) / (union as number)).toBeLessThan(
          0.01,
        );
      });

      it("sum of surface stays near the manifest's roof surface: lower layers and verges are heat, not roof", () => {
        const surface = sum(file.planes.map((p) => p.surfaceSqm));
        const total = manifest.areas.roofSurfaceSqm as number;
        // Merged strips overlap by their rib heights, so a family can read
        // slightly above its one-sheet surface; 7 % is the apartment's
        // measured over-read (733.64 vs 692.04), the widest of the four.
        expect(surface).toBeLessThanOrEqual(total * 1.07);
      });

      it("every family's visible plan area is within its manifest union, never above it", () => {
        const byFamily = manifest.areas.roofProjectedByFamilySqm ?? {};
        for (const [family, union] of Object.entries(byFamily)) {
          const visible = sum(
            file.planes.filter((p) => p.family === family).map((p) => p.projectedSqm),
          );
          expect(visible, family).toBeLessThanOrEqual(union * 1.005);
        }
      });

      it("rings are tagged, closed, outer counter-clockwise and holes clockwise; flat planes carry no azimuth", () => {
        for (const p of file.planes) {
          expect(p.outline.some((r) => r.kind === "outer")).toBe(true);
          for (const ring of p.outline) {
            const pts = ring.points;
            expect(pts.length).toBeGreaterThanOrEqual(4);
            expect(pts[0]).toEqual(pts[pts.length - 1]);
            const a = ringArea2(pts);
            if (ring.kind === "outer") expect(a, p.id).toBeGreaterThan(0);
            else expect(a, p.id).toBeLessThan(0);
          }
          if (p.tiltDeg < 0.5) expect(p.azimuthDeg).toBeNull();
          else expect(p.azimuthDeg).not.toBeNull();
          expect(p.projectedSqm).toBeLessThanOrEqual(p.surfaceSqm + 0.01);
        }
      });

      it("an obstruction sits inside the outer ring of the plane it is attached to", () => {
        for (const p of file.planes) {
          const outer = p.outline.find((r) => r.kind === "outer")?.points ?? [];
          for (const o of p.obstructions) {
            expect(centreInside(o.plan, outer), `${p.id} ${o.elementName}`).toBe(true);
          }
        }
      });
    });
  }
});

describe("the regressions the methodology named, by building", () => {
  it("FZK Haus: exactly two 30° planes facing opposite ways, 71.50 m² each, summing to the manifest exactly", () => {
    const f = planesOf("fzk-haus");
    expect(f.planes).toHaveLength(2);
    const [a, b] = [...f.planes].sort((x, y) => (x.azimuthDeg ?? 0) - (y.azimuthDeg ?? 0));
    expect(a.tiltDeg).toBeCloseTo(30, 1);
    expect(b.tiltDeg).toBeCloseTo(30, 1);
    // Source TrueNorth is 50° clockwise from IFC +Y / world -Z.
    // Independent source-mesh and raw direction checks live in pv-bearing-source.
    expect(f.trueNorthDeg).toBeCloseTo(50, 6);
    expect(a.azimuthDeg).toBe(130);
    expect(b.azimuthDeg).toBe(310);
    expect(a.projectedSqm).toBe(71.5);
    expect(b.projectedSqm).toBe(71.5);
    expect(f.skyUnionSqm).toBe(manifestOf("fzk-haus").areas.roofProjectedSqm);
  });

  it("Duplex: one flat plane, the manifest's 132.93 m², with two skylight holes and the same two as obstructions", () => {
    const d = planesOf("duplex-apartment");
    expect(d.planes).toHaveLength(1);
    const [deck] = d.planes;
    expect(deck.tiltDeg).toBe(0);
    expect(deck.azimuthDeg).toBeNull();
    expect(deck.projectedSqm).toBe(132.93);
    expect(deck.outline.filter((r) => r.kind === "hole")).toHaveLength(2);
    expect(deck.obstructions).toHaveLength(2);
    for (const o of deck.obstructions) {
      expect(o.kind).toBe("opening");
      expect(o.elementName).toMatch(/Skylight/);
      expect(o.areaSqm).toBeCloseTo(1.43, 2);
    }
  });

  it("Schependomlaan: the tiles are a 65° band, not one blended 45° plane, and the flat deck inside them is the largest plane", () => {
    const s = planesOf("schependomlaan");
    const tiles = s.planes.filter((p) => p.family === "sporenkap" && p.projectedSqm >= 2);
    expect(tiles.length).toBeGreaterThanOrEqual(10);
    for (const t of tiles) expect(t.tiltDeg, t.id).toBeCloseTo(65, 0);
    expect(tiles.some((t) => t.mergedElements > 1)).toBe(true);
    const largest = [...s.planes].sort((a, b) => b.projectedSqm - a.projectedSqm)[0];
    expect(largest.family).toBe("dakvloer");
    expect(largest.tiltDeg).toBe(0);
    expect(largest.projectedSqm).toBeGreaterThan(125);
    // Six rooflights sit on tile planes, attached by elevation, not by name:
    // the 52 unresolved openings at 0.78 m whose reason text says "roof" are
    // not among them.
    expect(sum(s.planes.map((p) => p.obstructions.length))).toBe(6);
  });

  it("Clinic: the EPDM decks and the standing-seam barrel stay distinguishable, and the barrel's visible area is its family union", () => {
    const c = planesOf("bs-medical-dental-clinic");
    const m = manifestOf("bs-medical-dental-clinic");
    const epdm = c.planes.filter((p) => p.family?.includes("EPDM"));
    const seam = c.planes.filter((p) => p.family?.includes("Standing Seam"));
    expect(epdm.length).toBeGreaterThan(0);
    expect(seam.length).toBeGreaterThan(0);
    for (const p of epdm) expect(p.tiltDeg).toBe(0);
    const seamVisible = sum(seam.map((p) => p.projectedSqm));
    const seamUnion = m.areas.roofProjectedByFamilySqm?.[
      "Basic Roof:Standing Seam Metal Roof"
    ] as number;
    expect(Math.abs(seamVisible - seamUnion) / seamUnion).toBeLessThan(0.005);
    // A segmented barrel: its facets face south (180) or north (0/360), never
    // east or west.
    const bearings = new Set(
      seam
        .filter((p) => p.azimuthDeg != null && p.tiltDeg >= 2)
        .map((p) => Math.round(p.azimuthDeg as number) % 360),
    );
    for (const b of bearings) {
      expect([0, 180, 360].some((x) => Math.abs(b - x) <= 15), String(b)).toBe(true);
    }
    // The largest single plane in the building is an EPDM deck over 1,500 m².
    const largest = [...c.planes].sort((a, b) => b.projectedSqm - a.projectedSqm)[0];
    expect(largest.family).toContain("EPDM");
    expect(largest.projectedSqm).toBeGreaterThan(1500);
  });
});
