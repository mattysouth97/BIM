import type { ReferenceBuildingRecord } from "@/lib/energy-diagnostics/reference-building-record";

/**
 * The smallest record that satisfies the contract, for tests about the fetch
 * boundary rather than about a building.
 *
 * Deliberately NOT the Clinic: the real record is generated from IFC by
 * `scripts/build-reference-building.mjs` and lives under `public/`. A
 * hand-written copy of it here would be a second source of truth for figures
 * that the extractor owns — the exact drift the catalog's no-numbers rule
 * exists to prevent. These tests only need a well-formed shape.
 */
export function stubReferenceBuildingRecord(
  overrides: Partial<ReferenceBuildingRecord> = {},
): ReferenceBuildingRecord {
  return {
    kind: "bimfit_reference_building_record",
    schemaVersion: 1,
    id: "bs-medical-dental-clinic",
    name: { ko: "스텁 건물", en: "Stub building" },
    summary: { ko: "테스트용 스텁", en: "Test stub" },
    useType: "medical",
    provenance: {
      licence: "CC BY 4.0",
      attribution: "Stub attribution",
      sourceUrl: "https://example.invalid/stub",
      files: [],
      extractedWith: { tool: "stub", version: "0" },
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    site: {
      declaredSiteName: null,
      declaredLatitudeDeg: null,
      declaredLongitudeDeg: null,
      locationIsAuthoringDefault: true,
      locationNote: "Stub site, never trusted.",
      trueNorthDeg: null,
      ref: "ifc://stub.ifc#1",
    },
    storeys: [],
    spaces: [],
    surfaces: [],
    openings: [],
    assemblies: [],
    counts: {
      storeys: 0,
      spaces: 0,
      surfaces: 0,
      openings: 0,
      assemblies: 0,
      externalPhysicalBoundaries: 0,
      externalVirtualBoundaries: 0,
      unresolvedBoundaries: 0,
      totalFloorAreaSqm: 0,
      totalEnvelopeAreaSqm: 0,
    },
    unresolved: [],
    ...overrides,
  };
}
