import { describe, expect, it } from "vitest";

import {
  REFERENCE_BUILDING_CATALOG,
  findReferenceBuilding,
  referenceBuildingManifestUrl,
  referenceBuildingRecordUrl,
  type ReferenceBuildingCatalogEntry,
} from "@/data/reference-buildings";

/** Every leaf value in an entry, so the no-numbers rule can be enforced. */
function leafValues(value: unknown): unknown[] {
  if (value === null || typeof value !== "object") return [value];
  return Object.values(value as Record<string, unknown>).flatMap(leafValues);
}

describe("registered-building catalog", () => {
  it("carries no numeric value in any entry", () => {
    // The invariant this file exists to keep: figures come from the generated
    // manifest, never from hand-authored copy. A number here would be one that
    // no extraction can correct and no test can catch drifting.
    for (const entry of REFERENCE_BUILDING_CATALOG) {
      const numbers = leafValues(entry).filter(
        (leaf) => typeof leaf === "number",
      );
      expect(numbers, `${entry.id} must carry no figures`).toEqual([]);
    }
  });

  it("gives every entry a unique, URL-safe id", () => {
    const ids = REFERENCE_BUILDING_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, `${id} must be safe in a path and a query param`).toMatch(
        /^[a-z0-9][a-z0-9-]*$/,
      );
      expect(encodeURIComponent(id)).toBe(id);
    }
  });

  it("names every entry in both languages and attributes it", () => {
    for (const entry of REFERENCE_BUILDING_CATALOG) {
      expect(entry.name.ko.trim()).not.toBe("");
      expect(entry.name.en.trim()).not.toBe("");
      expect(entry.summary.ko.trim()).not.toBe("");
      expect(entry.summary.en.trim()).not.toBe("");
      // CC BY 4.0 obliges attribution wherever the work appears, and the
      // catalog list renders before any manifest has been fetched — so the
      // string has to be here, not only in the manifest.
      expect(entry.attribution.trim(), `${entry.id} needs attribution`).not.toBe(
        "",
      );
    }
  });

  it("derives record and manifest URLs from the id", () => {
    expect(referenceBuildingRecordUrl("clinic")).toBe(
      "/reference-buildings/clinic/model.json",
    );
    expect(referenceBuildingManifestUrl("clinic")).toBe(
      "/reference-buildings/clinic/manifest.json",
    );
  });

  it("looks an entry up, and refuses an unknown or absent id", () => {
    const first = REFERENCE_BUILDING_CATALOG[0] as ReferenceBuildingCatalogEntry;
    expect(findReferenceBuilding(first.id)).toBe(first);
    expect(findReferenceBuilding("no-such-building")).toBeNull();
    expect(findReferenceBuilding(undefined)).toBeNull();
  });
});
