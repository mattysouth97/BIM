/* @vitest-environment node */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ReferenceBuildingManifest } from "../manifest";

/**
 * Roof and ground-slab areas, pinned against the Clinic's committed figures.
 *
 * These run against the shipped `manifest.json`, not a fixture, because the
 * point is that the extractor reproduces what `bs-medical-dental-clinic-energy.ts`
 * carries as hand-derived constants. Where it does NOT reproduce a committed
 * figure, the test says so with the arithmetic rather than widening a
 * tolerance until it passes — two such cases are below, both explained.
 */

const read = (id: string) =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), "public/reference-buildings", id, "manifest.json"),
      "utf8",
    ),
  ) as ReferenceBuildingManifest;

const clinic = read("bs-medical-dental-clinic");
const apartment = read("schependomlaan");

const EPDM = "Basic Roof:EPDM Membrane on Rigid Insul on Metal Deck";
const SEAM = "Basic Roof:Standing Seam Metal Roof";

/** Committed in bs-medical-dental-clinic-energy.ts (CLINIC_MEASURED_ENVELOPE). */
const COMMITTED = Object.freeze({
  roofEpdmSqm: 2286.93,
  roofStandingSeamSqm: 382.28,
  /** The unprojected face sum the 382.28 was halved from — the trap, not a target. */
  roofStandingSeamFaceSumSqm: 764.56,
  groundSlabSqm: 2621.08,
  groundPerimeterM: 217.01,
  exteriorPavingSqm: 167.32,
});

const within = (actual: number, expected: number, share: number) =>
  Math.abs(actual - expected) <= expected * share;

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("Clinic roofs", () => {
  const areas = clinic.areas;
  const roofs = clinic.roofs ?? [];

  it("keeps the two roof types apart, with the EPDM within 1 % of the committed 2,286.93", () => {
    const byFamily = areas.roofProjectedByFamilySqm ?? {};
    expect(Object.keys(byFamily)).toHaveLength(2);
    expect(within(byFamily[EPDM], COMMITTED.roofEpdmSqm, 0.01)).toBe(true);
    expect(byFamily[EPDM]).toBeCloseTo(2282.54, 2);
  });

  it("projects the standing seam: plan coverage within 1 % of 382.28, nowhere near the 764.56 face sum", () => {
    const byFamily = areas.roofProjectedByFamilySqm ?? {};
    expect(within(byFamily[SEAM], COMMITTED.roofStandingSeamSqm, 0.01)).toBe(true);
    expect(byFamily[SEAM]).toBeCloseTo(384.44, 2);
    expect(byFamily[SEAM]).toBeLessThan(COMMITTED.roofStandingSeamFaceSumSqm * 0.6);
  });

  it("the standing-seam ELEMENTS sum to more than their coverage, because consecutive sections overlap in plan", () => {
    // Five barrel sections telescope ~1.8 m along the spine; each element's
    // own shadow is right, and adding them counts the overhang strips twice.
    // 432.66 − 384.44 = 48.22 m² of overlap. A reader who takes the element
    // rows as the total gets 13 % more roof than the sky sees.
    const seamRows = roofs.filter((r) => r.family === SEAM);
    expect(seamRows).toHaveLength(5);
    // Rows are rounded to 0.01 each, so a sum of five can sit 0.01 off.
    expect(sum(seamRows.map((r) => r.projectedSqm))).toBeCloseTo(432.66, 1);
    expect(sum(seamRows.map((r) => r.projectedSqm))).toBeGreaterThan(
      (areas.roofProjectedByFamilySqm ?? {})[SEAM] + 40,
    );
  });

  it("standing-seam meshes present their top face twice; EPDM slabs once", () => {
    // The surface models have both sheets wound upward, so Σ area × n_y is
    // exactly 2× the shadow. That ratio is what would have made the naive
    // formula 865 m² for a 433 m² roof.
    for (const r of roofs.filter((r) => r.family === SEAM)) {
      expect(r.upFacingProjectedSqm / r.projectedSqm).toBeGreaterThan(1.95);
      expect(r.upFacingProjectedSqm / r.projectedSqm).toBeLessThan(2.05);
      expect(r.elementType).toBe("IfcRoof");
      expect(r.tiltDeg).toBeGreaterThan(10);
    }
    for (const r of roofs.filter((r) => r.family === EPDM)) {
      expect(r.upFacingProjectedSqm).toBeCloseTo(r.projectedSqm, 2);
      expect(r.elementType).toBe("IfcSlab");
      expect(r.predefinedType).toBe("ROOF");
      expect(r.tiltDeg).toBe(0);
      // Each EPDM part is aggregated under a geometry-less IfcRoof shell.
      expect(r.partOf).toMatch(/^ifc:\/\/Clinic_Structural\.ifc#\d+$/);
    }
  });

  it("surface: EPDM decks equal their shadow; the barrels exceed both their shadow sum and the 382.28", () => {
    // Heat crosses the surface, not the shadow. A flat deck's surface is its
    // shadow; a pitched roof's is larger by 1/cos(tilt). The standing seam's
    // one-sheet surface must therefore exceed its 432.66 m² element-shadow
    // sum — and the 382.28 the doc called "projected", which was the
    // near-horizontal faces of one sheet with the flanks left out.
    const bySurface = areas.roofSurfaceByFamilySqm ?? {};
    for (const r of roofs.filter((r) => r.family === EPDM)) {
      expect(within(r.surfaceSqm, r.projectedSqm, 0.01)).toBe(true);
      expect(r.surfaceBasis).toBe("upward faces of a closed solid");
    }
    expect(within(bySurface[EPDM], (areas.roofProjectedByFamilySqm ?? {})[EPDM], 0.01)).toBe(true);
    const seamRows = roofs.filter((r) => r.family === SEAM);
    expect(bySurface[SEAM]).toBeGreaterThanOrEqual(sum(seamRows.map((r) => r.projectedSqm)));
    expect(bySurface[SEAM]).toBeGreaterThan(COMMITTED.roofStandingSeamSqm);
    expect(bySurface[SEAM]).toBeCloseTo(sum(seamRows.map((r) => r.surfaceSqm)), 1);
    for (const r of seamRows) {
      expect(r.surfaceSqm).toBeGreaterThan(r.projectedSqm);
      expect(r.surfaceBasis).toMatch(/÷ 2: surface model with no downward face/);
      // Surface / shadow is 1 / cos(mean tilt), to the tolerance a facetted barrel allows.
      expect(r.surfaceSqm / r.projectedSqm).toBeCloseTo(1 / Math.cos((r.tiltDeg! * Math.PI) / 180), 1);
    }
    expect(areas.roofSurfaceSqm).toBeCloseTo(sum(Object.values(bySurface)), 1);
    expect(areas.roofSurfaceSqm!).toBeGreaterThan(areas.roofElementSumSqm!);
    expect(areas.roofNote).toMatch(/764\.56 ÷ 2/);
  });

  it("the three totals nest: element sum ≥ Σ family coverage ≥ union", () => {
    expect(areas.roofElementSumSqm).toBeCloseTo(sum(roofs.map((r) => r.projectedSqm)), 1);
    expect(areas.roofProjectedSqm).toBeCloseTo(
      sum(Object.values(areas.roofProjectedByFamilySqm ?? {})),
      1,
    );
    expect(areas.roofElementSumSqm!).toBeGreaterThanOrEqual(areas.roofProjectedSqm!);
    expect(areas.roofProjectedSqm!).toBeGreaterThanOrEqual(areas.roofUnionSqm!);
    expect(areas.roofProjectedSqm).toBeCloseTo(2666.98, 2);
    expect(areas.roofUnionSqm).toBeCloseTo(2592.43, 2);
  });

  it("the roof note's counts and figures are the ones in the rows", () => {
    // Assert what the sentence claims, not that it appears.
    const note = areas.roofNote ?? "";
    const elements = Number(/(\d+) elements —/.exec(note)?.[1]);
    expect(elements).toBe(roofs.length);
    const doubled = Number(/(\d+) element\(s\) present their top face more than once/.exec(note)?.[1]);
    expect(doubled).toBe(roofs.filter((r) => r.upFacingProjectedSqm > r.projectedSqm * 1.05).length);
    const elementSum = Number(/sum to ([\d.]+) m²/.exec(note)?.[1]);
    expect(elementSum).toBeCloseTo(areas.roofElementSumSqm!, 2);
    const union = Number(/cover ([\d.]+) m²/.exec(note)?.[1]);
    expect(union).toBeCloseTo(areas.roofUnionSqm!, 2);
    const shells = Number(/(\d+) IfcRoof carry no geometry/.exec(note)?.[1]);
    expect(shells).toBe(roofs.filter((r) => r.partOf !== null).length);
  });
});

describe("Clinic ground", () => {
  const areas = clinic.areas;
  const slabs = clinic.groundSlabs ?? [];
  const counted = slabs.filter((s) => s.countsAsGround);
  const excluded = slabs.filter((s) => !s.countsAsGround);

  it("reproduces the committed exposed perimeter, 217.01 m, as the outline's outer ring", () => {
    expect(areas.groundPerimeterM).toBeCloseTo(COMMITTED.groundPerimeterM, 2);
    expect(within(areas.groundPerimeterM!, COMMITTED.groundPerimeterM, 0.01)).toBe(true);
  });

  it("excludes the 167.32 m² exterior paving, and says so on its row", () => {
    const paving = slabs.find((s) => s.name === "Floor:150mm Exterior Slab on Grade:240432");
    expect(paving?.projectedSqm).toBeCloseTo(COMMITTED.exteriorPavingSqm, 2);
    expect(paving?.countsAsGround).toBe(false);
    expect(paving?.evidence).toBeNull();
    expect(paving?.excludedReason).toMatch(/no conditioned space stands on it/);
  });

  it("does NOT reproduce 2,621.08: the rule also drops a 43.66 m² pad the committed figure kept", () => {
    // `Floor:150mm Slab on Grade:221475` sits beyond the exterior wall line
    // (z > 0.4 m) inside foundation walls and a chain-link panel, with an
    // exterior door opening onto it and no IfcSpace over it. The committed
    // figure kept it only because its name lacks "Exterior". So the
    // extractor's figure is the committed one less exactly that slab, and the
    // test states the arithmetic instead of loosening the tolerance to 2 %.
    const pad = slabs.find((s) => s.name === "Floor:150mm Slab on Grade:221475");
    expect(pad?.projectedSqm).toBeCloseTo(43.66, 2);
    expect(pad?.countsAsGround).toBe(false);
    expect(areas.groundSlabSqm).toBeCloseTo(2577.42, 2);
    expect(areas.groundSlabSqm! + pad!.projectedSqm).toBeCloseTo(COMMITTED.groundSlabSqm, 2);
    expect(within(areas.groundSlabSqm!, COMMITTED.groundSlabSqm, 0.01)).toBe(false);
    expect(within(areas.groundSlabSqm!, COMMITTED.groundSlabSqm, 0.02)).toBe(true);
  });

  it("counts the main slab and the lift-pit slab, each with its evidence", () => {
    expect(counted.map((s) => s.name).sort()).toEqual([
      "Floor:150mm Slab on Grade:164090",
      "Floor:150mm Slab on Grade:235000",
    ]);
    for (const s of counted) {
      expect(s.evidence).toMatch(/under \d+ conditioned space footprint/);
      expect(s.excludedReason).toBeNull();
    }
    expect(excluded).toHaveLength(2);
    // No layering on this model: the union equals the sum.
    expect(areas.groundSlabSumSqm).toBeCloseTo(sum(counted.map((s) => s.projectedSqm)), 2);
    expect(areas.groundSlabSqm).toBeCloseTo(areas.groundSlabSumSqm!, 2);
  });

  it("the ground note's counts, names and figures are the ones in the rows", () => {
    const note = areas.groundNote ?? "";
    const m = /(\d+) counted, (\d+) excluded/.exec(note);
    expect(Number(m?.[1])).toBe(counted.length);
    expect(Number(m?.[2])).toBe(excluded.length);
    const candidates = Number(/(\d+) candidate\(s\)/.exec(note)?.[1]);
    expect(candidates).toBe(slabs.length);
    // Every excluded slab is named in the note with its own area.
    for (const s of excluded) {
      const pair = new RegExp(`"${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" ([\\d.]+) m²`).exec(note);
      expect(Number(pair?.[1])).toBeCloseTo(s.projectedSqm, 2);
    }
    const slabSum = Number(/sum to ([\d.]+) m²/.exec(note)?.[1]);
    expect(slabSum).toBeCloseTo(areas.groundSlabSumSqm!, 2);
    expect(note).not.toMatch(/hole ring/);
    expect(areas.groundHolePerimeterM).toBe(0);
  });
});

describe("Schependomlaan", () => {
  const areas = apartment.areas;
  const roofs = apartment.roofs ?? [];
  const slabs = apartment.groundSlabs ?? [];

  it("includes the FLOOR-typed roof decks by declared name, and says which basis each row has", () => {
    const declared = roofs.filter((r) => r.basis === "declared roof slab name");
    expect(new Set(declared.map((r) => r.family))).toEqual(new Set(["dakvloer", "plat dak", "lifttop"]));
    for (const r of declared) {
      expect(r.elementType).toBe("IfcSlab");
      expect(r.predefinedType).toBe("FLOOR");
    }
    expect(roofs.filter((r) => r.basis === "IfcSlab.PredefinedType=ROOF").length).toBeGreaterThan(0);
    expect(areas.roofNote).toMatch(/declared roof by name/);
  });

  it("totals nest, and the roof figure is a four-storey block's, not 136 m²", () => {
    // Ten families rounded to 0.01 each against one rounded total: ±0.05.
    expect(areas.roofProjectedSqm).toBeCloseTo(sum(Object.values(areas.roofProjectedByFamilySqm ?? {})), 1);
    expect(areas.roofElementSumSqm!).toBeGreaterThanOrEqual(areas.roofProjectedSqm!);
    expect(areas.roofProjectedSqm!).toBeGreaterThanOrEqual(areas.roofUnionSqm!);
    expect(areas.roofProjectedSqm!).toBeGreaterThan(300);
  });

  it("surface: the 64° sporenkap is normalised for its stacked layers, flat decks equal their shadow", () => {
    const sporenkap = roofs.filter((r) => r.family === "sporenkap" && r.projectedSqm > 0.5);
    expect(sporenkap.length).toBeGreaterThan(0);
    // Some panels are one solid, most are a stacked build-up; both bases are
    // legitimate, and the stacked ones must exist or the normalisation is idle.
    expect(sporenkap.some((r) => /stacked layer solids/.test(r.surfaceBasis))).toBe(true);
    for (const r of sporenkap) {
      expect(r.surfaceBasis).toMatch(/cover its shadow|closed solid/);
      expect(r.surfaceSqm).toBeGreaterThan(r.projectedSqm);
      // A ~64° pitch: surface ≈ 2.3× shadow — not 3 × 2.3× as three stacked layers would give.
      expect(r.surfaceSqm / r.projectedSqm).toBeLessThan(3);
    }
    for (const r of roofs.filter((r) => r.family === "dakvloer" && r.projectedSqm > 1)) {
      expect(within(r.surfaceSqm, r.projectedSqm, 0.02)).toBe(true);
    }
    expect(areas.roofSurfaceSqm).toBeCloseTo(sum(Object.values(areas.roofSurfaceByFamilySqm ?? {})), 1);
  });

  it("counts every ground candidate — 29 of the 32 ground-storey rooms were placed by their FootPrint curve — and unions the layered floor once", () => {
    expect(slabs.length).toBeGreaterThan(50);
    expect(slabs.every((s) => s.countsAsGround)).toBe(true);
    expect(areas.groundNote).toMatch(/29 footprint/);
    expect(areas.groundNote).toMatch(/3 solid/);
    // dekvloer (screed) over vloer_V0 (structural): the sum is about twice the union.
    expect(areas.groundSlabSumSqm!).toBeGreaterThan(areas.groundSlabSqm! * 1.8);
    expect(areas.groundSlabSqm).toBeCloseTo(345.81, 2);
    expect(areas.groundPerimeterM).toBeCloseTo(90.08, 2);
    const holes = /(\d+) hole ring\(s\) totalling ([\d.]+) m/.exec(areas.groundNote ?? "");
    expect(Number(holes?.[2])).toBeCloseTo(areas.groundHolePerimeterM!, 2);
  });
});
