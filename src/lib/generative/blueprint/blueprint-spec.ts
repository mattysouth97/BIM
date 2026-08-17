// src/lib/generative/blueprint/blueprint-spec.ts
//
// The BlueprintSpec is the schematic layer that sits ABOVE BuildingSpec:
//
//   schematic input → BlueprintSpec → BuildingSpec → BIMGraph → geometry
//
// It captures architectural INTENT read off a drawing (or drawn natively):
// where the outline runs, what is fixed, what is merely preferred, what the
// reader was unsure about. It is design authority — generation fills what is
// ABSENT and must never erase what is PRESENT.
//
// UNITS
// -----
// Millimetres, integers, XZ plane (+X right, +Z forward), angles in radians.
// Same convention as BuildingSpec, so no conversion happens between the two
// layers; mm→m still happens at exactly one boundary further downstream
// (`src/lib/generative/compile/spec-to-recipe.ts`).
//
// CURVE REPRESENTATION
// --------------------
// Every segment carries EXPLICIT endpoints. Closure of a loop is therefore a
// pure endpoint-chaining check with no trigonometry, and a reader never has to
// reconstruct a start point from angles. Arcs add `centerMm` + `sweep`;
// radius and the start/end angles are DERIVED from centre↔endpoint vectors
// rather than stored, because storing both invites the two to disagree.
//
// PROVENANCE
// ----------
// Anything the reader inferred rather than read literally — a classification,
// a dimension, a scale — is wrapped in the same `Provenanced<T>` used by
// BuildingSpec, so the Assumptions panel and the "what will be preserved"
// panel read one contract, not two.

import { z } from "zod";

import { provenanced, SpaceType, ValueSource } from "../spec/building-spec";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .describe("Stable slug, unique across every object in the blueprint.");

const mm = (min: number, max: number, describe: string) =>
  z.number().int().min(min).max(max).describe(`${describe} (millimetres)`);

/** Signed plan coordinate. ±100 km is far past any plausible site. */
const coordMm = (describe: string) =>
  z
    .number()
    .int()
    .min(-100_000_000)
    .max(100_000_000)
    .describe(`${describe} (millimetres, XZ plane)`);

const RadiansSchema = z
  .number()
  .min(-Math.PI * 2)
  .max(Math.PI * 2)
  .describe("Radians, measured atan2(z, x) in the XZ plane.");

const Confidence01 = z.number().min(0).max(1);

const WeightSchema = z
  .number()
  .min(0)
  .max(1)
  .describe("Relative importance when a soft constraint has to give way.");

/**
 * Signed storey number: -1 = B1, 1 = ground. There is no storey 0 — the same
 * rule BuildingSpec enforces, restated here so a blueprint cannot introduce a
 * level the compiler would silently drop.
 */
export const FloorNoSchema = z
  .number()
  .int()
  .min(-8)
  .max(120)
  .refine((n) => n !== 0, {
    message: "There is no storey 0 — use -1 for B1 and 1 for the ground floor.",
  });

export const PointMmSchema = z.object({
  xMm: coordMm("X"),
  zMm: coordMm("Z"),
});
export type PointMm = z.infer<typeof PointMmSchema>;

/* ------------------------------------------------------------------ */
/* Curves + loops                                                      */
/* ------------------------------------------------------------------ */

export const LineSegmentSchema = z.object({
  kind: z.literal("line"),
  startMm: PointMmSchema,
  endMm: PointMmSchema,
});

/**
 * Arc by centre + explicit endpoints + sweep direction. Radius = |centre→start|
 * and the angles are derived; `sweep` disambiguates the two possible arcs
 * between the endpoints. start === end means a full circle.
 */
export const ArcSegmentSchema = z.object({
  kind: z.literal("arc"),
  startMm: PointMmSchema,
  endMm: PointMmSchema,
  centerMm: PointMmSchema,
  sweep: z.enum(["cw", "ccw"]),
});

export const PolylineSegmentSchema = z.object({
  kind: z.literal("polyline"),
  pointsMm: z.array(PointMmSchema).min(2).max(512),
});

/** Cubic Bézier. Quadratics are elevated to cubic by the producer. */
export const BezierSegmentSchema = z.object({
  kind: z.literal("bezier"),
  startMm: PointMmSchema,
  control1Mm: PointMmSchema,
  control2Mm: PointMmSchema,
  endMm: PointMmSchema,
});

export const CurveSegmentSchema = z.discriminatedUnion("kind", [
  LineSegmentSchema,
  ArcSegmentSchema,
  PolylineSegmentSchema,
  BezierSegmentSchema,
]);
export type CurveSegment = z.infer<typeof CurveSegmentSchema>;

/** Ordered segments that chain end→start and close back on the first point. */
export const BoundaryLoopSchema = z.object({
  id: IdSchema,
  segments: z.array(CurveSegmentSchema).min(1).max(256),
});
export type BoundaryLoop = z.infer<typeof BoundaryLoopSchema>;

/** Uniform endpoint access — the only reason every segment stores endpoints. */
export function segmentStart(segment: CurveSegment): PointMm {
  return segment.kind === "polyline" ? segment.pointsMm[0] : segment.startMm;
}

export function segmentEnd(segment: CurveSegment): PointMm {
  return segment.kind === "polyline"
    ? segment.pointsMm[segment.pointsMm.length - 1]
    : segment.endMm;
}

/**
 * Where a spatial object lives. Three ways to say it because a schematic reader
 * has three levels of certainty: a traced loop, a pointer to a loop already in
 * the blueprint, or "roughly this rectangle".
 *
 * `rect` is centred on `originMm` and rotated about that centre.
 */
export const RegionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("loop"), loop: BoundaryLoopSchema }),
  z.object({ kind: z.literal("loopRef"), loopId: IdSchema }),
  z.object({
    kind: z.literal("rect"),
    originMm: PointMmSchema,
    widthMm: mm(1, 1_000_000, "Rect X extent"),
    depthMm: mm(1, 1_000_000, "Rect Z extent"),
    rotationRad: RadiansSchema,
  }),
]);
export type Region = z.infer<typeof RegionSchema>;

/** Points at one segment of one loop — how a facade or setback names an edge. */
export const LoopEdgeRefSchema = z.object({
  loopId: IdSchema,
  segmentIndex: z.number().int().min(0).max(255),
});

/* ------------------------------------------------------------------ */
/* Fidelity + holds                                                    */
/* ------------------------------------------------------------------ */

/**
 * How literally the blueprint is to be obeyed.
 *   exact       — geometry is followed to the millimetre, nothing may move.
 *   guided      — hard constraints hold; soft ones may move within tolerance.
 *   exploratory — everything is a suggestion the generator may reinterpret.
 */
export const FidelityMode = z.enum(["exact", "guided", "exploratory"]);
export type FidelityMode = z.infer<typeof FidelityMode>;

/**
 * Hard means fixed unless the user unlocks it. Soft means preferred, and a soft
 * hold MUST state how far it may travel — which is why this is a discriminated
 * union rather than an enum plus an optional number nobody fills in.
 */
export const HoldSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("hard") }),
  z.object({
    mode: z.literal("soft"),
    toleranceMm: mm(0, 1_000_000, "Permitted deviation"),
  }),
]);
export type Hold = z.infer<typeof HoldSchema>;

export const FidelityOverrideSchema = z.object({
  targetId: IdSchema,
  mode: FidelityMode,
  reason: z.string().max(240),
});

/* ------------------------------------------------------------------ */
/* Coordinate system + provenance of scale                             */
/* ------------------------------------------------------------------ */

export const BlueprintSource = z.enum([
  "native-editor",
  "dxf",
  "svg",
  "image",
  "traced",
]);
export type BlueprintSource = z.infer<typeof BlueprintSource>;

export const ScaleMethod = z.enum([
  /** A dimension string on the drawing was read and trusted. */
  "explicit-dimension",
  /** A known element (door leaf, parking bay) was used as a ruler. */
  "known-element",
  /** Paper size plus a stated ratio. */
  "paper-size",
  /** Nothing to go on — the numbers are relative, not absolute. */
  "assumed",
  /** Drawn natively in millimetres; no calibration needed. */
  "native",
]);

export const CoordinateSystemSchema = z.object({
  units: z.literal("mm"),
  /**
   * Denominator of the source drawing ratio (100 for 1:100). 1 for anything
   * authored natively in millimetres.
   */
  sourceScaleRatio: provenanced(
    z.number().min(1).max(20_000),
    "Drawing scale denominator (1:N).",
  ),
  method: ScaleMethod,
  /** False ⇒ every dimension downstream is proportional, not absolute. */
  calibrated: z.boolean(),
  calibrationConfidence: Confidence01,
});

/* ------------------------------------------------------------------ */
/* Boundaries + voids                                                  */
/* ------------------------------------------------------------------ */

export const BoundaryRole = z.enum(["outline", "podium", "tower", "wing", "roof"]);

/**
 * One plan, the levels it governs. A single traced plan commonly maps to a run
 * of levels (2–4), so the mapping lives here as an explicit floor list rather
 * than in a separate table — `loop.id` IS the boundary's identity for refs.
 */
export const BlueprintBoundarySchema = z.object({
  loop: BoundaryLoopSchema,
  floorNos: z.array(FloorNoSchema).min(1).max(128),
  role: BoundaryRole,
  fidelity: FidelityMode.optional(),
});
export type BlueprintBoundary = z.infer<typeof BlueprintBoundarySchema>;

export const VoidKind = z.enum(["atrium", "courtyard", "shaft"]);

export const VoidIntentSchema = z.object({
  id: IdSchema,
  kind: provenanced(VoidKind, "What the hole in the plate is for."),
  label: z.string().max(60).optional(),
  region: RegionSchema,
  /** Levels the void punches through. */
  floorNos: z.array(FloorNoSchema).min(1).max(128),
});
export type VoidIntent = z.infer<typeof VoidIntentSchema>;

/* ------------------------------------------------------------------ */
/* Cores + anchors + axes                                              */
/* ------------------------------------------------------------------ */

export const CoreContent = z.enum([
  "stair",
  "elevator",
  "shaft",
  "restroom",
  "lobby",
]);

export const CoreIntentSchema = z.object({
  id: IdSchema,
  label: z.string().max(60).optional(),
  region: RegionSchema,
  hold: HoldSchema,
  floorNos: z.array(FloorNoSchema).min(1).max(128),
  contents: z.array(CoreContent).max(8),
});
export type CoreIntent = z.infer<typeof CoreIntentSchema>;

export const AnchorKind = z.enum([
  "entrance",
  "core",
  "atrium",
  "courtyard",
  "stair",
  "lobby",
  "view-axis",
  "landmark-corner",
  "facade",
  "circulation-node",
  "service-core",
]);
export type AnchorKind = z.infer<typeof AnchorKind>;

/**
 * A point the design hangs off. `hold` is the whole point of the object: hard
 * anchors survive every regeneration, soft anchors are a preference with a
 * stated radius.
 */
export const DesignAnchorSchema = z.object({
  id: IdSchema,
  kind: provenanced(AnchorKind, "What this anchor represents."),
  label: z.string().max(60).optional(),
  positionMm: PointMmSchema,
  hold: HoldSchema,
  /** Empty ⇒ applies to every level. */
  floorNos: z.array(FloorNoSchema).max(128),
});
export type DesignAnchor = z.infer<typeof DesignAnchorSchema>;

export const AxisKind = z.enum([
  "primary",
  "secondary",
  "symmetry",
  "view",
  "circulation",
  "grid",
]);

export const DesignAxisSchema = z.object({
  id: IdSchema,
  kind: AxisKind,
  label: z.string().max(60).optional(),
  originMm: PointMmSchema,
  directionRad: RadiansSchema,
});
export type DesignAxis = z.infer<typeof DesignAxisSchema>;

/* ------------------------------------------------------------------ */
/* Circulation graph                                                   */
/* ------------------------------------------------------------------ */

export const CirculationNodeKind = z.enum([
  "entrance",
  "exit",
  "lobby",
  "junction",
  "corridor-node",
  "stair",
  "elevator",
  "ramp",
]);

export const CirculationNodeSchema = z.object({
  id: IdSchema,
  kind: CirculationNodeKind,
  positionMm: PointMmSchema,
  floorNos: z.array(FloorNoSchema).max(128),
});
export type CirculationNode = z.infer<typeof CirculationNodeSchema>;

/** "direct" is a straight run; the other two carry the drawn path. */
export const EdgeGeometrySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("direct") }),
  z.object({
    mode: z.literal("polyline"),
    pointsMm: z.array(PointMmSchema).min(2).max(128),
  }),
  z.object({
    mode: z.literal("curve"),
    segments: z.array(CurveSegmentSchema).min(1).max(64),
  }),
]);

export const CirculationEdgeSchema = z.object({
  id: IdSchema,
  fromNodeId: IdSchema,
  toNodeId: IdSchema,
  kind: z.enum(["horizontal", "vertical"]),
  geometry: EdgeGeometrySchema,
  widthMm: mm(600, 30_000, "Clear circulation width").optional(),
});
export type CirculationEdge = z.infer<typeof CirculationEdgeSchema>;

export const CirculationGraphSchema = z.object({
  nodes: z.array(CirculationNodeSchema).max(256),
  edges: z.array(CirculationEdgeSchema).max(512),
});

/* ------------------------------------------------------------------ */
/* Zones + grids                                                       */
/* ------------------------------------------------------------------ */

/**
 * A region with a program tag. `program` reuses BuildingSpec's `SpaceType` on
 * purpose — a blueprint zone must name something the downstream solver can
 * actually place, not a private vocabulary that needs translating.
 *
 * `memberIds` are the blueprint objects the author considers inside this zone;
 * fidelity resolution walks it, so it is declared rather than computed.
 */
export const SpatialZoneSchema = z.object({
  id: IdSchema,
  program: provenanced(SpaceType, "Program read off the schematic."),
  label: z.string().max(60).optional(),
  region: RegionSchema,
  floorNos: z.array(FloorNoSchema).min(1).max(128),
  memberIds: z.array(IdSchema).max(64),
  fidelity: FidelityMode.optional(),
});
export type SpatialZone = z.infer<typeof SpatialZoneSchema>;

/**
 * A grid that applies to a region, not the whole building — a podium and a
 * tower routinely disagree about origin, rotation and bay size. Spacings are
 * per-bay distances in order, not a repeat count.
 */
export const LocalGridSystemSchema = z.object({
  id: IdSchema,
  label: z.string().max(60).optional(),
  /** Omitted ⇒ the grid governs the whole plan. */
  regionLoopId: IdSchema.optional(),
  originMm: PointMmSchema,
  rotationRad: RadiansSchema,
  xSpacingsMm: z.array(mm(1, 200_000, "Bay along X")).min(1).max(64),
  zSpacingsMm: z.array(mm(1, 200_000, "Bay along Z")).min(1).max(64),
});
export type LocalGridSystem = z.infer<typeof LocalGridSystemSchema>;

/* ------------------------------------------------------------------ */
/* Vertical + facade intent                                            */
/* ------------------------------------------------------------------ */

export const VerticalRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("atrium-span"),
    id: IdSchema,
    voidId: IdSchema,
    fromFloorNo: FloorNoSchema,
    toFloorNo: FloorNoSchema,
  }),
  z.object({
    kind: z.literal("setback"),
    id: IdSchema,
    floorNo: FloorNoSchema,
    edge: LoopEdgeRefSchema,
    distanceMm: mm(1, 200_000, "Setback distance"),
  }),
  z.object({
    kind: z.literal("double-height"),
    id: IdSchema,
    targetId: IdSchema,
    floorNo: FloorNoSchema,
    heightMultiplier: z.number().min(1.5).max(6),
  }),
  z.object({
    kind: z.literal("podium-tower"),
    id: IdSchema,
    podiumLoopId: IdSchema,
    podiumFloorNos: z.array(FloorNoSchema).min(1).max(128),
    towerLoopId: IdSchema,
    towerFloorNos: z.array(FloorNoSchema).min(1).max(128),
  }),
]);
export type VerticalRule = z.infer<typeof VerticalRuleSchema>;

export const FacadeTreatment = z.enum([
  "window-band",
  "solid",
  "entrance",
  "glazed-full",
]);

/** Deliberately thin: which edge, what it does, and how high. */
export const FacadeRuleSchema = z.object({
  id: IdSchema,
  edge: LoopEdgeRefSchema,
  treatment: provenanced(FacadeTreatment, "Facade character on this edge."),
  floorNos: z.array(FloorNoSchema).max(128),
  sillHeightMm: mm(0, 3_000, "Sill above finished floor").optional(),
  headHeightMm: mm(600, 8_000, "Head above finished floor").optional(),
});
export type FacadeRule = z.infer<typeof FacadeRuleSchema>;

/* ------------------------------------------------------------------ */
/* Relationships + dimensions                                          */
/* ------------------------------------------------------------------ */

export const RelationshipKind = z.enum([
  "CONNECTED_TO",
  "ADJACENT_TO",
  "REQUIRES_ADJACENCY",
  "PREFER_ADJACENCY",
  "AVOID_ADJACENCY",
  "REQUIRES_EXTERIOR",
  "FACES",
  "ALIGNED_WITH",
  "CENTERED_ON",
  "STACKED_WITH",
  "CONTAINS",
  "INSIDE",
  "OPENS_TO",
]);
export type RelationshipKind = z.infer<typeof RelationshipKind>;

/** `toId` is omitted only for unary kinds such as REQUIRES_EXTERIOR. */
export const DesignRelationshipSchema = z.object({
  id: IdSchema,
  kind: RelationshipKind,
  fromId: IdSchema,
  toId: IdSchema.optional(),
  weight: WeightSchema,
  note: z.string().max(200).optional(),
});
export type DesignRelationship = z.infer<typeof DesignRelationshipSchema>;

export const DimensionMeasure = z.enum([
  "width",
  "depth",
  "height",
  "radius",
  "clearance",
  "spacing",
]);

export const DimensionSubjectSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("between"), fromId: IdSchema, toId: IdSchema }),
  z.object({
    mode: z.literal("absolute"),
    targetId: IdSchema,
    measure: DimensionMeasure,
  }),
]);

export const DimensionConstraintSchema = z.object({
  id: IdSchema,
  subject: DimensionSubjectSchema,
  valueMm: provenanced(
    mm(1, 100_000_000, "Constrained dimension"),
    "The dimension the design must hit.",
  ),
  hold: HoldSchema,
  weight: WeightSchema,
});
export type DimensionConstraint = z.infer<typeof DimensionConstraintSchema>;

/* ------------------------------------------------------------------ */
/* Assumptions + uncertainty                                           */
/* ------------------------------------------------------------------ */

/** Same shape as BuildingSpec assumptions so one panel renders both. */
export const BlueprintAssumptionSchema = z.object({
  id: IdSchema,
  label: z.string().max(120),
  statement: z.string().max(240),
  source: ValueSource,
  confidence: Confidence01,
});

export const UncertaintyEvidence = z.enum([
  /** Seen in the image/linework. */
  "visual",
  /** Read from a text label on the drawing. */
  "label",
  /** Deduced from geometry (closed room, wall thickness, alignment). */
  "geometry",
  /** No direct support — an architectural guess. */
  "inferred",
]);

/**
 * What the reader was unsure about, named against the object it doubts. This is
 * the difference between a confident wrong plan and an honest one.
 */
export const InterpretationUncertaintySchema = z.object({
  targetId: IdSchema,
  interpretation: z.string().max(240),
  confidence: Confidence01,
  evidence: UncertaintyEvidence,
});
export type InterpretationUncertainty = z.infer<
  typeof InterpretationUncertaintySchema
>;

/* ------------------------------------------------------------------ */
/* The blueprint                                                       */
/* ------------------------------------------------------------------ */

export const BlueprintSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: z.string().min(1).max(120),
  source: BlueprintSource,
  coordinateSystem: CoordinateSystemSchema,

  /** Global fidelity; `fidelityOverrides` and zone fidelity narrow it. */
  fidelityMode: FidelityMode,
  fidelityOverrides: z.array(FidelityOverrideSchema).max(64),

  boundaries: z.array(BlueprintBoundarySchema).max(128),
  voids: z.array(VoidIntentSchema).max(64),
  cores: z.array(CoreIntentSchema).max(16),
  anchors: z.array(DesignAnchorSchema).max(128),
  axes: z.array(DesignAxisSchema).max(32),
  circulation: CirculationGraphSchema,
  zones: z.array(SpatialZoneSchema).max(128),
  gridSystems: z.array(LocalGridSystemSchema).max(32),
  verticalRules: z.array(VerticalRuleSchema).max(64),
  facadeRules: z.array(FacadeRuleSchema).max(128),
  relationships: z.array(DesignRelationshipSchema).max(256),
  dimensions: z.array(DimensionConstraintSchema).max(256),

  assumptions: z.array(BlueprintAssumptionSchema).max(64),
  uncertainty: z.array(InterpretationUncertaintySchema).max(64),
});

export type BlueprintSpec = z.infer<typeof BlueprintSpecSchema>;
export type BlueprintAssumption = BlueprintSpec["assumptions"][number];

/* ------------------------------------------------------------------ */
/* JSON Schema emission (Claude tool contract)                         */
/* ------------------------------------------------------------------ */

/**
 * Mirrors `toolInputSchema()` in building-spec.ts: one Zod schema both
 * validates the reply and defines the tool `input_schema`, so they cannot
 * drift. Emitted in the output direction because only that direction sets
 * `additionalProperties: false` — the thing that stops the model inventing
 * keys. Nothing in this file uses `.default()` or a transform, so input and
 * output shapes are identical; if a `.default()` is ever added, switch to
 * `io: "input"` and re-check strictness.
 */
export function blueprintToolInputSchema(
  schema: z.ZodType = BlueprintSpecSchema,
): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
}

/** Never execute unvalidated model output. */
export function parseBlueprintSpec(raw: unknown): BlueprintSpec {
  return BlueprintSpecSchema.parse(raw);
}

export function safeParseBlueprintSpec(raw: unknown) {
  return BlueprintSpecSchema.safeParse(raw);
}
