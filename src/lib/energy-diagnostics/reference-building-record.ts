/**
 * The extracted-BIM record: the contract between the build-time IFC extractor
 * (`scripts/build-reference-building.mjs`) and the runtime source producer
 * (`reference-building-source.ts`).
 *
 * Why a record rather than the IFC itself: the discipline models for one
 * building run to tens of megabytes, and parsing them needs a WASM reader. Both
 * costs belong at build time. The app ships this record — small, reviewable in
 * a diff, and reproducible from the cited source files by re-running the script
 * against the recorded SHA-256s.
 *
 * The rule that makes the record honest: **every extracted value carries the
 * IFC entity it came from** (`ref`, an `ifc://<file>#<expressID>` URI). A field
 * with no `ref` is a field nobody can check, so the type does not allow one.
 * That is what lets the builder mint real `SourceReference`s instead of
 * asserting provenance it does not have.
 *
 * What this record deliberately does NOT carry: U-values, conductivities,
 * airtightness, HVAC, lighting, occupancy, or a climate. A coordination model
 * states none of them — it routinely has no `IfcThermalTransmittance` at all
 * and an `IfcMaterial` that is a bare name — so they stay assumptions named by
 * the builder rather than numbers smuggled in through the source boundary.
 */

/** `ifc://<fileName>#<expressID>` — the entity a value was read from. */
export type IfcEntityRef = string;

export type ReferenceBuildingFileRole = "architectural" | "structural";

export type ReferenceBuildingSourceFile = Readonly<{
  role: ReferenceBuildingFileRole;
  fileName: string;
  /** Lower-case hex. The fixture-integrity test re-hashes and compares. */
  sha256: string;
  byteLength: number;
  ifcSchema: string;
}>;

export type ReferenceBuildingProvenance = Readonly<{
  /** e.g. "CC BY 4.0" */
  licence: string;
  /** The attribution string the licence requires, rendered verbatim in the UI. */
  attribution: string;
  sourceUrl: string;
  files: readonly ReferenceBuildingSourceFile[];
  extractedWith: Readonly<{ tool: string; version: string }>;
  /** ISO-8601. Passed into the script, never read from a clock inside it. */
  generatedAt: string;
}>;

/**
 * What the model *declares* about its site — recorded, never trusted.
 *
 * An authoring tool stamps a default site on every new project, so a populated
 * `IfcSite` is not evidence of a location. `locationIsAuthoringDefault` is the
 * flag that keeps the builder from treating one as though it were: when it is
 * true the coordinates are recorded for the audit trail and nothing else, and
 * the climate becomes a stated assumption.
 */
export type ReferenceBuildingSite = Readonly<{
  declaredSiteName: string | null;
  declaredLatitudeDeg: number | null;
  declaredLongitudeDeg: number | null;
  locationIsAuthoringDefault: boolean;
  /** Why the flag above is set, shown in the assumption ledger. */
  locationNote: string;
  /** Degrees clockwise from +Y, or null when the model leaves it at default. */
  trueNorthDeg: number | null;
  ref: IfcEntityRef;
}>;

export type ReferenceBuildingStorey = Readonly<{
  id: string;
  name: string;
  elevationM: number;
  floorToFloorHeightM: number;
  /** False for a roof datum or a footing datum — no spaces, not a storey. */
  occupied: boolean;
  ref: IfcEntityRef;
}>;

export type ReferenceBuildingSpace = Readonly<{
  id: string;
  name: string;
  longName: string | null;
  storeyId: string;
  floorAreaSqm: number;
  /** Null when the model carries no volume quantity; the builder derives it. */
  volumeM3: number | null;
  conditioned: boolean;
  /** Why `conditioned` is false, so the rule is visible rather than buried. */
  unconditionedReason: string | null;
  spaceType: string;
  /** The quantity set the area was read from, e.g. "GSA BIM Area". */
  areaQuantityName: string;
  ref: IfcEntityRef;
}>;

export type ReferenceBuildingSurfaceKind =
  | "exterior_wall"
  | "roof"
  | "ground_floor";

/**
 * One external envelope surface.
 *
 * For walls these come from `.PHYSICAL. + .EXTERNAL.` space boundaries, which
 * is what makes the extraction safe: a boundary exists only where a real
 * element bounds a real space, so fences, interior storefronts, interior
 * vision panels and exterior paving drop out without needing a rule that names
 * them. Roofs and ground floors have no such boundary in a typical
 * architectural model and come from element geometry instead — recorded here
 * with `viaSpaceBoundary: false` so the weaker route stays visible.
 */
export type ReferenceBuildingSurface = Readonly<{
  id: string;
  kind: ReferenceBuildingSurfaceKind;
  /** The IFC entity class, e.g. "IfcWallStandardCase" — kept for auditing. */
  elementType: string;
  elementName: string;
  /** Null for surfaces derived from element geometry rather than a boundary. */
  spaceId: string | null;
  storeyId: string;
  areaSqm: number;
  /** Clockwise from north. Null when the surface is horizontal. */
  azimuthDeg: number | null;
  /** 90 for a wall, 0 for a flat roof or floor. */
  tiltDeg: number;
  /**
   * The plan trace, world metres. For a wall this is the open polyline the
   * boundary swept, which is exactly the shape `Surface.geometry` wants.
   */
  planTraceM: readonly (readonly [number, number])[];
  assemblyId: string | null;
  viaSpaceBoundary: boolean;
  ref: IfcEntityRef;
}>;

export type ReferenceBuildingOpeningType = "window" | "door" | "curtain_wall";

export type ReferenceBuildingOpening = Readonly<{
  id: string;
  type: ReferenceBuildingOpeningType;
  /**
   * The surface this opening sits in, resolved through
   * `IfcRelFillsElement` → `IfcOpeningElement` → `IfcRelVoidsElement`.
   * Null when the host could not be resolved — the builder must then refuse or
   * assume explicitly, never silently attach it to an arbitrary wall.
   */
  hostSurfaceId: string | null;
  areaSqm: number;
  /**
   * Glazed sub-area, for a curtain wall whose plates and mullions the model
   * distinguishes. Null when the model states no split; the builder then
   * treats the whole area as glazed and says so.
   */
  glazedAreaSqm: number | null;
  widthM: number | null;
  heightM: number | null;
  sillHeightM: number | null;
  assemblyId: string | null;
  elementName: string;
  ref: IfcEntityRef;
}>;

/**
 * A material layer as the model states it: a name and a thickness.
 *
 * There is no conductivity here, and that absence is the point. IFC allows
 * `IfcMaterialProperties`, but authoring tools overwhelmingly do not write
 * them, so a field for λ would be null in every real record and would invite a
 * default to be quietly filled in. The builder maps `name` onto the generic
 * material library and records that mapping as a named assumption.
 */
export type ReferenceBuildingLayer = Readonly<{
  name: string;
  thicknessM: number;
  ref: IfcEntityRef;
}>;

export type ReferenceBuildingAssembly = Readonly<{
  id: string;
  name: string;
  kind: "opaque" | "window" | "door";
  /** ISO-6946 heat-flow direction, from what the assembly is used for. */
  direction: "horizontal" | "upward" | "downward";
  /** Empty when the model states no layer set — then the builder must assume. */
  layers: readonly ReferenceBuildingLayer[];
  ref: IfcEntityRef;
}>;

/**
 * Counts the extractor observed, asserted by the fixture-integrity test.
 *
 * These exist so that a silent change in extraction — a traversal that starts
 * resolving fewer boundaries, say — fails a test instead of quietly shrinking
 * the building.
 */
export type ReferenceBuildingCounts = Readonly<{
  storeys: number;
  spaces: number;
  surfaces: number;
  openings: number;
  assemblies: number;
  externalPhysicalBoundaries: number;
  externalVirtualBoundaries: number;
  /** Boundaries whose geometry could not be resolved. Must be 0. */
  unresolvedBoundaries: number;
  totalFloorAreaSqm: number;
  totalEnvelopeAreaSqm: number;
}>;

export type ReferenceBuildingRecord = Readonly<{
  kind: "bimfit_reference_building_record";
  schemaVersion: 1;
  id: string;
  name: Readonly<{ ko: string; en: string }>;
  /** One line the UI shows under the name. */
  summary: Readonly<{ ko: string; en: string }>;
  useType: string;
  provenance: ReferenceBuildingProvenance;
  site: ReferenceBuildingSite;
  storeys: readonly ReferenceBuildingStorey[];
  spaces: readonly ReferenceBuildingSpace[];
  surfaces: readonly ReferenceBuildingSurface[];
  openings: readonly ReferenceBuildingOpening[];
  assemblies: readonly ReferenceBuildingAssembly[];
  counts: ReferenceBuildingCounts;
  /**
   * Anything the extractor could not establish, carried forward verbatim so it
   * reaches the assumption ledger instead of being lost between the script and
   * the app.
   */
  unresolved: readonly string[];
}>;

export const REFERENCE_BUILDING_RECORD_KIND =
  "bimfit_reference_building_record" as const;

/**
 * The small, public face of a record: what a gallery card or catalog row needs
 * without loading the whole model.
 *
 * It is a pure PROJECTION of the record — `referenceBuildingManifest` is the
 * only way one is made — so a card and the model it opens cannot disagree
 * about how big the building is. The alternative, a hand-maintained card with
 * its own figures, goes quietly wrong the first time extraction changes and
 * nothing catches it.
 *
 * Editorial copy (display names, one-line summaries) lives in the catalog
 * index instead, which carries no numbers at all. Words are reviewed by a
 * person; figures are derived. Neither should be doing the other's job.
 */
export type ReferenceBuildingManifest = Readonly<{
  id: string;
  schemaVersion: 1;
  name: Readonly<{ ko: string; en: string }>;
  summary: Readonly<{ ko: string; en: string }>;
  useType: string;
  storeyCount: number;
  spaceCount: number;
  totalFloorAreaSqm: number;
  totalEnvelopeAreaSqm: number;
  licence: string;
  /**
   * Must be rendered wherever the building is shown. The Clinic is CC BY 4.0
   * and attribution is a licence condition, not a courtesy — a card that omits
   * it is a breach, so it travels with the figures rather than living in some
   * separate place a redesign can drop.
   */
  attribution: string;
  sourceUrl: string;
  sourceFiles: readonly Readonly<{ fileName: string; sha256: string }>[];
  generatedAt: string;
}>;

export function referenceBuildingManifest(
  record: ReferenceBuildingRecord,
): ReferenceBuildingManifest {
  return Object.freeze({
    id: record.id,
    schemaVersion: record.schemaVersion,
    name: record.name,
    summary: record.summary,
    useType: record.useType,
    storeyCount: record.counts.storeys,
    spaceCount: record.counts.spaces,
    totalFloorAreaSqm: record.counts.totalFloorAreaSqm,
    totalEnvelopeAreaSqm: record.counts.totalEnvelopeAreaSqm,
    licence: record.provenance.licence,
    attribution: record.provenance.attribution,
    sourceUrl: record.provenance.sourceUrl,
    sourceFiles: Object.freeze(
      record.provenance.files.map((file) =>
        Object.freeze({ fileName: file.fileName, sha256: file.sha256 }),
      ),
    ),
    generatedAt: record.provenance.generatedAt,
  });
}

/**
 * Narrow an unknown parsed JSON payload to a record.
 *
 * Deliberately shallow: this guards the fetch boundary against a 404 page or a
 * stale schema, not against a malicious payload — the file is served from our
 * own origin and is committed to the repository.
 */
export function isReferenceBuildingRecord(
  value: unknown,
): value is ReferenceBuildingRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ReferenceBuildingRecord>;
  return (
    record.kind === REFERENCE_BUILDING_RECORD_KIND &&
    record.schemaVersion === 1 &&
    typeof record.id === "string" &&
    Array.isArray(record.storeys) &&
    Array.isArray(record.spaces) &&
    Array.isArray(record.surfaces) &&
    Array.isArray(record.assemblies)
  );
}
