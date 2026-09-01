/**
 * Versioned, source-traceable contracts shared by drawing extraction, the
 * energy-engine adapter, persistence, and spatial result overlays.
 *
 * Deliberately data-only: source bytes never belong in a canonical record.
 */

export const CANONICAL_ENERGY_MODEL_VERSION = "1.0.0" as const;

export type CanonicalEnergyModelVersion =
  typeof CANONICAL_ENERGY_MODEL_VERSION;

/**
 * Deterministic fingerprint of the model inputs that can affect readiness,
 * simulation, or spatial result mapping. This is deliberately distinct from
 * `schemaVersion`: changing model content must change this value even when the
 * persisted data contract itself is unchanged.
 */
export type ModelContentFingerprint = string;

export type IsoDateTime = string;
export type Point2D = readonly [x: number, y: number];
export type Polygon2D = readonly Point2D[];
export type BoundingBox2D = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type EvidenceStatus =
  | "verified"
  | "user_confirmed"
  | "extracted"
  | "inferred"
  | "defaulted"
  | "conflicted"
  | "missing";

export type ExtractionMethod =
  | "vector_geometry"
  | "drawing_text"
  | "schedule_table"
  | "symbol_recognition"
  | "user_input"
  | "rule_inference"
  | "project_default"
  | "engine_default";

/** Ordered authority used when deterministic candidates disagree. */
export type EvidenceAuthority =
  | "user_confirmed_project_value"
  | "explicit_schedule_or_specification"
  | "dimensioned_vector_geometry"
  | "drawing_annotation"
  | "repeated_graphical_evidence"
  | "deterministic_rule_inference"
  | "project_template"
  | "regional_or_engine_default";

export type SourceReference = Readonly<{
  id: string;
  documentId: string;
  pageNumber?: number;
  sheetId?: string;
  cadLayer?: string;
  boundingBox?: BoundingBox2D;
  geometryRef?: string;
  originalText?: string;
  entityRef?: string;
  drawingRevision: string;
  extractionRunId: string;
  previewCoordinates?: Polygon2D;
  linked3dObjectId?: string;
}>;

export type EnergyFact<T = unknown> = Readonly<{
  id: string;
  key: string;
  value: T | null;
  unit?: string;
  status: EvidenceStatus;
  confidence: number | null;
  sourceRefs: readonly SourceReference[];
  extractionMethod: ExtractionMethod;
  authority: EvidenceAuthority;
  assumptionId?: string;
  conflictIds?: readonly string[];
  reviewedByUser: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type DrawingFormat =
  | "dwg"
  | "dxf"
  | "svg"
  | "pdf"
  | "png"
  | "jpeg"
  | "webp"
  | "tiff"
  | "bimfit_schematic"
  | "bimfit_model";

export type DrawingDiscipline =
  | "architectural"
  | "mechanical"
  | "electrical"
  | "plumbing"
  | "controls"
  | "civil"
  | "multidiscipline"
  | "unknown";

export type DrawingDocumentType =
  /**
   * A 건축물대장 (Korean building register) record, not a drawing. Kept
   * outside the plan/elevation/section family on purpose: the register states
   * areas, storey counts, height, use and structure, but it contains no
   * geometry to trace and no envelope or systems data at all.
   */
  | "building_register_record"
  | "site_plan"
  | "floor_plan"
  | "elevation"
  | "section"
  | "window_schedule"
  | "door_schedule"
  | "wall_detail"
  | "roof_detail"
  | "slab_detail"
  | "material_schedule"
  | "construction_schedule"
  | "hvac_equipment_schedule"
  | "hvac_system_diagram"
  | "duct_plan"
  | "hydronic_diagram"
  | "lighting_plan"
  | "lighting_fixture_schedule"
  | "electrical_single_line"
  | "electrical_load_schedule"
  | "domestic_hot_water"
  | "controls_diagram"
  | "bems_document"
  | "photovoltaic_plan"
  | "specification"
  | "unknown";

export type DrawingClassification = Readonly<{
  documentType: DrawingDocumentType;
  discipline: DrawingDiscipline;
  confidence: number;
  method: "filename_and_metadata" | "user_assignment" | "existing_model";
  matchedSignals: readonly string[];
  alternatives: readonly Readonly<{
    documentType: DrawingDocumentType;
    confidence: number;
  }>[];
}>;

export type DrawingPage = Readonly<{
  id: string;
  pageNumber: number;
  label?: string;
  width?: number;
  height?: number;
  unit?: string;
}>;

export type CadLayerInventoryItem = Readonly<{
  name: string;
  entityCount: number | null;
  visible: boolean;
}>;

export type SourceDocument = Readonly<{
  id: string;
  fileName: string;
  format: DrawingFormat;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  revision: string;
  revisionGroupId: string;
  duplicateOfDocumentId?: string;
  supersedesDocumentId?: string;
  classification: DrawingClassification;
  pages: readonly DrawingPage[];
  cadLayers: readonly CadLayerInventoryItem[];
  units: EnergyFact<string>;
  drawingScale: EnergyFact<number>;
  northOrientationDeg: EnergyFact<number>;
  validationStatus: "accepted" | "needs_calibration" | "rejected";
  createdAt: IsoDateTime;
}>;

export type DrawingTier = 1 | 2 | 3;

export type DrawingSet = Readonly<{
  id: string;
  name: string;
  tier: DrawingTier;
  documents: readonly SourceDocument[];
  revisionGroupIds: readonly string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type ExtractionStage =
  | "file_validation"
  | "content_hashing"
  | "revision_detection"
  | "page_extraction"
  | "drawing_classification"
  | "unit_detection"
  | "scale_detection"
  | "north_orientation_detection"
  | "title_block_parsing"
  | "cad_layer_inventory"
  | "text_and_dimension_extraction"
  | "vector_geometry_extraction"
  | "symbol_and_schedule_recognition"
  | "cross_sheet_reconciliation"
  | "energy_fact_generation"
  | "confidence_scoring"
  | "conflict_generation"
  | "visual_overlay_generation"
  | "user_review";

export type UnsupportedStageRecord = Readonly<{
  id: string;
  documentId: string;
  stage: ExtractionStage;
  reasonCode:
    | "adapter_not_available"
    | "calibration_required"
    | "encrypted_document"
    | "unsupported_content"
    | "user_review_required";
  message: string;
  blocking: boolean;
}>;

export type ExtractionRun = Readonly<{
  id: string;
  pipelineVersion: string;
  sourceDocumentIds: readonly string[];
  sourceContentHashes: readonly string[];
  status: "completed" | "completed_with_warnings" | "failed";
  startedAt: IsoDateTime;
  completedAt: IsoDateTime;
  warnings: readonly string[];
  unsupportedStages: readonly UnsupportedStageRecord[];
}>;

export type ConflictCandidate<T = unknown> = Readonly<{
  fact: EnergyFact<T>;
  priority: number;
}>;

export type ConflictRecord<T = unknown> = Readonly<{
  id: string;
  key: string;
  affectedObjectIds: readonly string[];
  candidates: readonly ConflictCandidate<T>[];
  selectedFactId: string | null;
  selectionRationale: string | null;
  resolutionStatus: "unresolved" | "auto_selected_visible" | "user_resolved";
  blocking: boolean;
  downstreamImpact: string;
  createdAt: IsoDateTime;
  resolvedAt?: IsoDateTime;
}>;

export type MissingValueRecord = Readonly<{
  id: string;
  key: string;
  affectedObjectIds: readonly string[];
  requiredFor:
    | "geometry"
    | "envelope"
    | "usage"
    | "systems"
    | "simulation";
  blocking: boolean;
  allowedAssumptionIds: readonly string[];
  message: string;
  createdAt: IsoDateTime;
}>;

export type AssumptionRecord = Readonly<{
  id: string;
  key: string;
  title: string;
  explanation: string;
  trigger: string;
  scopeObjectIds: readonly string[];
  method: "project_default" | "engine_default" | "rule_inference";
  simulationImpact: string;
  reversible: true;
  overriddenByFactId?: string;
}>;

export type BoundaryCondition =
  | "outdoors"
  | "ground"
  | "adjacent_space"
  | "adiabatic"
  | "unconditioned_space";

export type SurfaceType =
  | "exterior_wall"
  | "interior_partition"
  | "ground_floor"
  | "interior_floor"
  | "roof"
  | "ceiling";

export type OpeningType =
  | "window"
  | "door"
  | "curtain_wall"
  | "skylight";

export type Storey = Readonly<{
  id: string;
  name: string;
  elevationM: EnergyFact<number>;
  floorToFloorHeightM: EnergyFact<number>;
  floorPlateIds: readonly string[];
  spaceIds: readonly string[];
}>;

export type FloorPlate = Readonly<{
  id: string;
  storeyId: string;
  boundary: EnergyFact<Polygon2D>;
  areaSqm: EnergyFact<number>;
  voidBoundaries: readonly EnergyFact<Polygon2D>[];
  sourceEntityIds: readonly string[];
}>;

export type Space = Readonly<{
  id: string;
  name: EnergyFact<string>;
  storeyId: string;
  boundary: EnergyFact<Polygon2D>;
  floorAreaSqm: EnergyFact<number>;
  volumeM3: EnergyFact<number>;
  conditioned: EnergyFact<boolean>;
  spaceType: EnergyFact<string>;
  thermalZoneId: string | null;
  adjacentSpaceIds: readonly string[];
  isCore: boolean;
  isAtrium: boolean;
}>;

export type ThermalZone = Readonly<{
  id: string;
  name: EnergyFact<string>;
  sourceSpaceIds: readonly string[];
  storeyIds: readonly string[];
  conditioned: EnergyFact<boolean>;
  floorAreaSqm: EnergyFact<number>;
  volumeM3: EnergyFact<number>;
  orientationBand: EnergyFact<
    "north" | "east" | "south" | "west" | "core" | "mixed"
  >;
  usageProfileId: string | null;
  hvacSystemIds: readonly string[];
  stableKey: string;
}>;

export type Surface = Readonly<{
  id: string;
  type: SurfaceType;
  storeyId: string;
  spaceId: string;
  adjacentSpaceId: string | null;
  boundaryCondition: EnergyFact<BoundaryCondition>;
  geometry: EnergyFact<Polygon2D>;
  areaSqm: EnergyFact<number>;
  azimuthDeg: EnergyFact<number>;
  tiltDeg: EnergyFact<number>;
  constructionId: EnergyFact<string>;
  openingIds: readonly string[];
  threeObjectId?: string;
}>;

export type Opening = Readonly<{
  id: string;
  type: OpeningType;
  hostSurfaceId: string;
  areaSqm: EnergyFact<number>;
  widthM: EnergyFact<number>;
  heightM: EnergyFact<number>;
  sillHeightM: EnergyFact<number>;
  constructionId: EnergyFact<string>;
  geometryRef: EnergyFact<string>;
  threeObjectId?: string;
}>;

export type ShadingDevice = Readonly<{
  id: string;
  hostSurfaceId: string;
  type: EnergyFact<"overhang" | "fin" | "external_obstruction">;
  projectionM: EnergyFact<number>;
  geometry: EnergyFact<Polygon2D>;
}>;

export type GeometryModel = Readonly<{
  coordinateSystem: EnergyFact<string>;
  storeys: readonly Storey[];
  floorPlates: readonly FloorPlate[];
  spaces: readonly Space[];
  thermalZones: readonly ThermalZone[];
  surfaces: readonly Surface[];
  openings: readonly Opening[];
  shadingDevices: readonly ShadingDevice[];
}>;

export type MaterialLayer = Readonly<{
  id: string;
  name: EnergyFact<string>;
  thicknessM: EnergyFact<number>;
  conductivityWPerMK: EnergyFact<number>;
  densityKgPerM3: EnergyFact<number>;
  specificHeatJPerKgK: EnergyFact<number>;
}>;

export type ConstructionAssembly = Readonly<{
  id: string;
  name: EnergyFact<string>;
  kind: "opaque" | "window" | "door";
  layers: readonly MaterialLayer[];
  uValueWPerM2K: EnergyFact<number>;
  rValueM2KPerW: EnergyFact<number>;
  shgc: EnergyFact<number>;
  visibleTransmittance: EnergyFact<number>;
}>;

export type EnvelopeModel = Readonly<{
  constructions: readonly ConstructionAssembly[];
  infiltrationAirChangesPerHour: EnergyFact<number>;
  airTightnessNotes: EnergyFact<string>;
  thermalBridgeNotes: EnergyFact<string>;
}>;

export type ScheduleValue = Readonly<{
  hour: number;
  value: number;
}>;

export type UsageProfile = Readonly<{
  id: string;
  name: EnergyFact<string>;
  spaceType: EnergyFact<string>;
  occupancyDensityPeoplePerSqm: EnergyFact<number>;
  occupancySchedule: EnergyFact<readonly ScheduleValue[]>;
  lightingPowerDensityWPerSqm: EnergyFact<number>;
  lightingSchedule: EnergyFact<readonly ScheduleValue[]>;
  equipmentPowerDensityWPerSqm: EnergyFact<number>;
  equipmentSchedule: EnergyFact<readonly ScheduleValue[]>;
  ventilationLpsPerPerson: EnergyFact<number>;
  heatingSetpointC: EnergyFact<number>;
  coolingSetpointC: EnergyFact<number>;
  operatingHours: EnergyFact<string>;
  holidaySchedule: EnergyFact<readonly string[]>;
}>;

export type HvacSystem = Readonly<{
  id: string;
  name: EnergyFact<string>;
  systemType: EnergyFact<string>;
  servedZoneIds: EnergyFact<readonly string[]>;
  heatingSource: EnergyFact<string>;
  coolingSource: EnergyFact<string>;
  distributionSystem: EnergyFact<string>;
  capacityKw: EnergyFact<number>;
  heatingEfficiency: EnergyFact<number>;
  coolingCop: EnergyFact<number>;
  outdoorAirStrategy: EnergyFact<string>;
  heatRecoveryEfficiency: EnergyFact<number>;
  ventilationLps: EnergyFact<number>;
  controlSchedule: EnergyFact<readonly ScheduleValue[]>;
  threeObjectIds: readonly string[];
}>;

export type DomesticHotWaterSystem = Readonly<{
  id: string;
  name: EnergyFact<string>;
  fuelType: EnergyFact<string>;
  efficiency: EnergyFact<number>;
  demandLitersPerDay: EnergyFact<number>;
  schedule: EnergyFact<readonly ScheduleValue[]>;
}>;

export type RenewableSystem = Readonly<{
  id: string;
  name: EnergyFact<string>;
  type: EnergyFact<"photovoltaic" | "solar_thermal" | "other">;
  capacityKw: EnergyFact<number>;
  orientationDeg: EnergyFact<number>;
  tiltDeg: EnergyFact<number>;
  efficiency: EnergyFact<number>;
  storageCapacityKwh: EnergyFact<number>;
}>;

export type SystemsModel = Readonly<{
  hvac: readonly HvacSystem[];
  domesticHotWater: readonly DomesticHotWaterSystem[];
  renewables: readonly RenewableSystem[];
}>;

export type CanonicalObjectMapping = Readonly<{
  canonicalObjectId: string;
  sourceEntityRefs: readonly SourceReference[];
  threeObjectIds: readonly string[];
}>;

export type ReadinessCategory = Readonly<{
  category: "geometry" | "envelope" | "usage" | "systems" | "simulation";
  status: "ready" | "assumptions_required" | "blocked";
  verifiedCount: number;
  assumedCount: number;
  conflictCount: number;
  missingCount: number;
  blockingRecordIds: readonly string[];
}>;

export type ScenarioDelta = Readonly<{
  id: string;
  /** Dot path into the canonical model; the baseline record is never mutated. */
  path: string;
  key: string;
  baselineFactId: string;
  replacement: EnergyFact<unknown>;
}>;

export type EnergyScenario = Readonly<{
  id: string;
  name: string;
  baselineModelId: string;
  baselineModelVersion: ModelContentFingerprint;
  deltas: readonly ScenarioDelta[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type EngineInputSnapshot = Readonly<{
  schemaVersion: string;
  engineId: string;
  engineVersion: string;
  adapterVersion: string;
  inputHash: string;
  payload: unknown;
}>;

export type MonthlyEnergyResult = Readonly<{
  month: number;
  heatingKwh: number;
  coolingKwh: number;
  lightingKwh: number;
  equipmentKwh: number;
  fansAndPumpsKwh: number | null;
  domesticHotWaterKwh: number | null;
  totalKwh: number;
}>;

export type ZoneEnergyResult = Readonly<{
  zoneId: string;
  annualEnergyKwh: number;
  heatingKwh: number;
  coolingKwh: number;
  /** Null when the selected engine does not calculate zone peak loads. */
  peakHeatingKw: number | null;
  /** Null when the selected engine does not calculate zone peak loads. */
  peakCoolingKw: number | null;
  timeSeries?: readonly Readonly<{
    timestamp: IsoDateTime;
    value: number;
    unit: string;
  }>[];
}>;

/**
 * 1차에너지 (primary energy) summary derived from the delivered result via
 * the published MOTIE/KEMCO conversion factors. Optional and additive: runs
 * stored before this field existed simply lack it. The factor set used is
 * embedded so a displayed number can always name its basis, and `basis`
 * carries the honest caveat that end-use fuel assignment inherits the
 * ratio-estimated lighting/DHW/plug split.
 */
export type PrimaryEnergyResult = Readonly<{
  totalKwh: number;
  perM2Kwh: number;
  deliveredByFuelKwh: Readonly<Record<string, number>>;
  primaryByFuelKwh: Readonly<Record<string, number>>;
  factorsUsed: Readonly<Record<string, number>>;
  /** Standards row backing the factors — see ENERGY_STANDARD_TRACEABILITY.md. */
  basis: string;
}>;

export type CanonicalSimulationResult = Readonly<{
  annualEnergyKwh: number;
  energyUseIntensityKwhPerM2: number;
  annualByEndUseKwh: Readonly<Record<string, number>>;
  monthly: readonly MonthlyEnergyResult[];
  zones: readonly ZoneEnergyResult[];
  /** Absent when the run predates primary-energy support. */
  primary?: PrimaryEnergyResult;
  /** Null is distinct from a real, calculated zero load. */
  peakHeatingKw: number | null;
  /** Null is distinct from a real, calculated zero load. */
  peakCoolingKw: number | null;
  cost?: Readonly<{ value: number; currency: string; tariffFactId: string }>;
  carbon?: Readonly<{
    valueKgCo2e: number;
    emissionsFactorFactId: string;
  }>;
}>;

export type SimulationRun = Readonly<{
  id: string;
  modelId: string;
  scenarioId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  engineInput: EngineInputSnapshot;
  result: CanonicalSimulationResult | null;
  logs: readonly string[];
  warnings: readonly string[];
  error?: Readonly<{
    kind: "model_readiness" | "engine" | "adapter";
    message: string;
  }>;
  startedAt: IsoDateTime;
  completedAt?: IsoDateTime;
}>;

export type CanonicalEnergyModel = Readonly<{
  id: string;
  schemaVersion: CanonicalEnergyModelVersion;
  /** Current deterministic content fingerprint; never a schema version. */
  modelVersion: ModelContentFingerprint;
  project: Readonly<{
    id: string;
    name: string;
    locale: "ko" | "en";
    sourceProjectId?: string;
  }>;
  building: Readonly<{
    id: string;
    name: EnergyFact<string>;
    useType: EnergyFact<string>;
  }>;
  site: Readonly<{
    location: EnergyFact<string>;
    latitudeDeg: EnergyFact<number>;
    longitudeDeg: EnergyFact<number>;
    northOrientationDeg: EnergyFact<number>;
    weatherSource: EnergyFact<string>;
    groundRelationship: EnergyFact<string>;
  }>;
  drawingSet: DrawingSet;
  extractionRuns: readonly ExtractionRun[];
  geometry: GeometryModel;
  envelope: EnvelopeModel;
  usageProfiles: readonly UsageProfile[];
  systems: SystemsModel;
  facts: readonly EnergyFact<unknown>[];
  conflicts: readonly ConflictRecord[];
  missingValues: readonly MissingValueRecord[];
  assumptions: readonly AssumptionRecord[];
  mappings: readonly CanonicalObjectMapping[];
  readiness: readonly ReadinessCategory[];
  scenarios: readonly EnergyScenario[];
  simulationRuns: readonly SimulationRun[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type FixtureExpectation = Readonly<{
  totalFloorAreaSqm: number;
  totalConditionedAreaSqm: number;
  totalZoneVolumeM3: number;
  storeyCount: number;
  thermalZoneCount: number;
  exteriorSurfaceCount: number;
  openingHostPairs: readonly Readonly<{
    openingId: string;
    hostSurfaceId: string;
  }>[];
  simulationExpectations: readonly string[];
}>;

export type EnergyDiagnosticFixture = Readonly<{
  id: "fixture-a" | "fixture-b" | "fixture-c" | "fixture-d" | "fixture-e";
  name: string;
  purpose: readonly string[];
  model: CanonicalEnergyModel;
  expected: FixtureExpectation;
}>;
