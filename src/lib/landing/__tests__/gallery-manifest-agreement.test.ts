/* @vitest-environment node */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GALLERY_ITEMS, type GalleryItem } from "../gallery";

/**
 * The gallery card's figures are literals in `gallery.ts`, and the generated
 * manifest is the thing that actually knows. This file is the join between
 * them.
 *
 * Why a test rather than reading the manifest at render time: the manifest
 * does not yet carry the per-storey rows or the space-exclusion breakdown that
 * the section diagram and the `read` strings need. Sourcing only the three
 * figures it *does* carry would move those out of drift's reach and leave the
 * storey bars and every provenance line still hand-typed — while making them
 * look generated, which is worse than leaving them honestly literal. So every
 * literal stays where it is and this test refuses to let one disagree with the
 * manifest. When the manifest gains those fields the wiring becomes trivial,
 * and the invariants below are already the contract it has to satisfy.
 *
 * What made this necessary: on 2026-09-04 the card said 4,394.3 m² for an hour
 * after the extraction said 4,314.2, and — separately — shipped a `read` line
 * of "IfcSpace − 6 ROOF − 3 OPEN TO BELOW" under a value of 259, which does
 * not subtract to 259. The existing test asserted that the words "ROOF" and
 * "OPEN TO BELOW" *appeared* in that string. An existence check cannot catch a
 * wrong number, and it reads like coverage while catching nothing.
 */

type Manifest = {
  counts: { spacesTotal: number; spacesFloor: number; storeys: number };
  areas: { totalFloorAreaSqm: number; areaPlanTotalSqm: number };
  licence: string;
  attribution: string;
};

const MANIFEST_PATH = path.join(
  process.cwd(),
  "public/reference-buildings/bs-medical-dental-clinic/manifest.json",
);

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
}

/** "4,314.2 m²" -> 4314.2; "259" -> 259. The card renders formatted strings. */
function figureNumber(item: GalleryItem, id: string): number {
  const figure = item.figures.find((f) => f.id === id);
  if (!figure) throw new Error(`no figure "${id}" on ${item.id}`);
  const parsed = Number(figure.value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    throw new Error(`figure "${id}" is not numeric: ${figure.value}`);
  }
  return parsed;
}

/**
 * Pull the exclusions back out of the provenance line the card actually shows,
 * e.g. "IfcSpace − 6 ROOF − 3 OPEN TO BELOW − 1 MECH. YARD" -> [6, 3, 1].
 *
 * Reading the rendered string rather than a private constant is the point: it
 * is the string a person reads off the card, so it is the string that has to
 * be arithmetically true.
 */
function excludedCountsFrom(read: string): number[] {
  return [...read.matchAll(/[−-]\s*(\d+)\s+[A-Z]/g)].map((m) => Number(m[1]));
}

describe("gallery card agrees with the generated manifest", () => {
  const clinic = GALLERY_ITEMS.find((i) => i.id === "clinic");

  it("has a clinic card to check", () => {
    expect(clinic).toBeDefined();
  });

  it("states the manifest's floor area, not the area-plan total", () => {
    const manifest = loadManifest();
    expect(figureNumber(clinic!, "floor-area")).toBe(
      manifest.areas.totalFloorAreaSqm,
    );

    // The area-plan total is the number an obvious extraction produces and it
    // is 61% higher. It must never be the one on the card.
    expect(figureNumber(clinic!, "floor-area")).not.toBe(
      manifest.areas.areaPlanTotalSqm,
    );
  });

  it("states the manifest's room count", () => {
    const manifest = loadManifest();
    expect(figureNumber(clinic!, "rooms")).toBe(manifest.counts.spacesFloor);
  });

  it("subtracts to the number it prints", () => {
    // The defect this file exists for. Whatever exclusions the card claims,
    // they have to take spacesTotal to spacesFloor — otherwise the line
    // explaining the figure contradicts the figure.
    const manifest = loadManifest();
    const rooms = clinic!.figures.find((f) => f.id === "rooms")!;
    const excluded = excludedCountsFrom(rooms.read);

    expect(excluded.length).toBeGreaterThan(0);
    const total = excluded.reduce((sum, n) => sum + n, 0);
    expect(manifest.counts.spacesTotal - total).toBe(
      manifest.counts.spacesFloor,
    );
  });

  it("keeps the storey bars summing to the stated totals", () => {
    // The section diagram is drawn from these, so a drift here is a drift in
    // the picture as well as in the numbers.
    const manifest = loadManifest();
    const rooms = clinic!.datums.reduce((t, d) => t + d.rooms, 0);
    const area = clinic!.datums.reduce((t, d) => t + d.roomAreaSqm, 0);

    expect(rooms).toBe(manifest.counts.spacesFloor);
    expect(area).toBeCloseTo(manifest.areas.totalFloorAreaSqm, 1);

    const excluded = clinic!.datums.reduce((t, d) => t + d.excludedSpaces, 0);
    expect(rooms + excluded).toBe(manifest.counts.spacesTotal);
  });

  it("carries the licence and the full credit the manifest specifies", () => {
    // CC BY attaches to showing the building at all, and the credit includes
    // the source URI. A trimmed credit is a breach, not a style choice.
    const manifest = loadManifest();
    expect(clinic!.licence).toBe(manifest.licence);
    expect(clinic!.attribution).toBe(manifest.attribution);
    expect(clinic!.attribution).toContain("http");
  });

  it("names a storey count the manifest recognises", () => {
    const manifest = loadManifest();
    const occupied = clinic!.datums.filter((d) => d.rooms > 0);
    expect(occupied).toHaveLength(manifest.counts.storeys);
  });
});

/**
 * Schependomlaan has no generated manifest yet, so there is nothing to agree
 * WITH. What can still be pinned is the card's internal arithmetic — and that
 * is where this building's figures actually go wrong, because its raw element
 * counts are placeholders rather than answers.
 */
describe("schependomlaan card is arithmetically consistent with itself", () => {
  const item = GALLERY_ITEMS.find((i) => i.id === "schependomlaan");

  it("is in the gallery", () => {
    expect(item).toBeDefined();
  });

  it("sums its storeys to the totals it prints", () => {
    const rooms = item!.datums.reduce((t, d) => t + d.rooms, 0);
    const area = item!.datums.reduce((t, d) => t + d.roomAreaSqm, 0);
    expect(rooms).toBe(figureNumber(item!, "rooms"));
    expect(area).toBeCloseTo(figureNumber(item!, "floor-area"), 1);
  });

  it("subtracts to the window and door counts it prints", () => {
    // The trap: 259 IfcWindow and 205 IfcDoor are placeholders — 182 windows
    // and 65 doors are `stelkozijn`, rough frames rather than openings. A
    // read line here has to arrive at the printed number, and one earlier
    // draft of the door line read "205 − 65 − 36", which is 104, not 20.
    for (const id of ["windows", "doors"]) {
      const figure = item!.figures.find((f) => f.id === id)!;
      const numbers = [...figure.read.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      expect(numbers.length).toBeGreaterThanOrEqual(2);
      const [base, ...subtracted] = numbers;
      expect(base - subtracted.reduce((a, b) => a + b, 0)).toBe(
        figureNumber(item!, id),
      );
    }
  });

  it("gives no credit rather than an unverified one", () => {
    // LICENSE.MD grants CC BY 4.0 but names the holder only as "original
    // owners", while the IFC header names ROOT bv as author. Under CC BY the
    // credit is a condition, so a wrong name is worse than none.
    expect(item!.licence).toBe("CC BY 4.0");
    expect(item!.attribution).toBeNull();
  });

  it("states no U-value, because all 97 in the file are zero", () => {
    // The reason this building was selected. All 97
    // IfcThermalTransmittanceMeasure occurrences carry the value 0. and sit
    // only on windows and doors. A documented zero means unavailable here, so
    // no figure may claim one.
    const text = item!.figures.map((f) => `${f.ko} ${f.en} ${f.read}`).join(" ");
    expect(text).not.toMatch(/u-?value|열관류|transmittance/i);
  });
});
