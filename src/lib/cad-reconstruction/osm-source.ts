// src/lib/cad-reconstruction/osm-source.ts
//
// OpenStreetMap as a reconstruction source.
//
// What OSM contributes and what it does not, kept strictly apart:
//
//   GEOMETRY — an outline traced from aerial imagery by a contributor. That is
//   an observation of the real roof, the same class of evidence as the VWorld
//   outline, so it enters at B-OBSERVED. It is not a survey and it is not a
//   government record, so it sits BELOW VWorld in the authority order and its
//   limitations are named in the evidence register.
//
//   TAGS — `building:levels`, `height`, `roof:shape` and friends are assertions
//   a contributor typed, with no stated provenance. They are D-INFERRED here no
//   matter how confident they look, and they are never allowed to overwrite a
//   register value. Their real worth is as a CROSS-CHECK: an OSM storey count
//   that disagrees with 건축물대장 is a disagreement worth showing the user.
//
// Pure. No fetching — the proxy lives at /api/osm/building.

import type { OsmBuildingInput } from "./types";

export type { OsmBuildingInput };

export interface OsmTagFacts {
  storeysAbove: number | null;
  storeysBelow: number | null;
  heightM: number | null;
  /** Normalised to the vocabulary the reconstruction already uses. */
  roofForm: "flat" | "gable" | "hip" | "sloped" | null;
  name: string | null;
  material: string | null;
}

/** The evidence-register id for this source. */
export const OSM_SOURCE_ID = "SRC-OSM-BLDG" as const;

/** OSM roof:shape values that map onto a form this pipeline can draw. */
const ROOF_SHAPES: Record<string, OsmTagFacts["roofForm"]> = {
  flat: "flat",
  gabled: "gable",
  "side_hipped": "gable",
  hipped: "hip",
  "half-hipped": "hip",
  pyramidal: "hip",
  skillion: "sloped",
  "lean_to": "sloped",
  "shed": "sloped",
  "mono_pitched": "sloped",
};

/**
 * A whole, positive storey count. A zero, a negative or a fractional value is
 * a tagging error, and reading it as data would put a fabricated floor count
 * into the model.
 */
function wholeCount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Metres, tolerating the unit suffix OSM permits ("12", "12m", "12 m"). */
function metres(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*m?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function osmTagFacts(tags: Record<string, string>): OsmTagFacts {
  const shape = tags["roof:shape"]?.trim().toLowerCase();
  return {
    storeysAbove: wholeCount(tags["building:levels"]),
    storeysBelow: wholeCount(tags["building:levels:underground"]),
    heightM: metres(tags.height),
    roofForm: shape ? (ROOF_SHAPES[shape] ?? null) : null,
    // A Korean name is what the rest of the app displays.
    name: tags["name:ko"]?.trim() || tags.name?.trim() || null,
    material: tags["building:material"]?.trim() || null,
  };
}

/**
 * The outer ring, or null when OSM had nothing usable.
 *
 * An errored response is treated as ABSENT, never as "no building here" — the
 * distinction is the whole point of the `available` flag in the evidence
 * register, and collapsing it would let an outage read as a finding.
 */
export function osmOutlineRing(osm: OsmBuildingInput | null): number[][] | null {
  if (!osm || osm.error) return null;
  const outer = osm.polygon?.[0];
  if (!outer || outer.length < 4) return null;
  const clean = outer.filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  return clean.length >= 4 ? clean : null;
}

/** A citable reference for the outline, e.g. "OSM way/198561926". */
export function osmReference(osm: OsmBuildingInput | null): string | null {
  if (!osm?.osmType || typeof osm.osmId !== "number") return null;
  return `OSM ${osm.osmType}/${osm.osmId}`;
}
