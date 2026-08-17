// src/lib/generative/spec/building-spec.ts
//
// The BuildingSpec is the contract between the reasoning layer (Claude) and the
// deterministic procedural engine. Claude decides WHAT should exist, WHY, WHERE,
// and under WHICH constraints. It never emits geometry — no vertices, no meshes,
// no triangles. Everything here is parametric and dimensioned.
//
// UNITS
// -----
// This schema is authored in MILLIMETRES, per the product brief ("prefer
// millimetres for BIM geometry"). The existing geometry engine
// (`BuildingRecipe`, the R3F viewer, `hydrateBimModel`) works in METRES and is
// not being rewritten — so mm→m conversion happens at exactly ONE boundary:
// `src/lib/generative/compile/spec-to-recipe.ts`. Nothing else converts.
//
// PROVENANCE
// ----------
// Every value the user did not literally supply is wrapped in `Provenanced<T>`
// so the UI can show "AI inferred · confidence 0.82" and let the user Accept /
// Modify / Lock it. This is the difference between a plausible building and an
// honest one, and it is not optional — the Assumptions panel reads it directly.

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export const ValueSource = z.enum([
  /** Stated explicitly by the user in the prompt or an optional field. */
  "USER_PROVIDED",
  /** Claude chose it from architectural judgement. */
  "INFERRED",
  /** Computed from other values (e.g. height = floors × floorToFloor). */
  "DERIVED",
  /** Fell through to a library default in `defaults.ts`. */
  "DEFAULT",
]);
export type ValueSource = z.infer<typeof ValueSource>;

/**
 * Wraps a value with where it came from. `confidence` is only meaningful for
 * INFERRED values; USER_PROVIDED is always 1.
 */
export function provenanced<T extends z.ZodType>(inner: T, describe: string) {
  return z
    .object({
      value: inner,
      source: ValueSource,
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("0-1. Use 1.0 for USER_PROVIDED. Be honest for INFERRED."),
      reason: z
        .string()
        .max(240)
        .describe("One short sentence of architectural justification."),
    })
    .describe(describe);
}

export type Provenanced<T> = {
  value: T;
  source: ValueSource;
  confidence: number;
  reason: string;
};

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

/* ------------------------------------------------------------------ */
/* Project + intent                                                    */
/* ------------------------------------------------------------------ */

export const BuildingUse = z.enum([
  "office",
  "residential",
  "retail",
  "research",
  "education",
  "industrial",
  "healthcare",
  "hospitality",
  "civic",
  "mixed-use",
]);
export type BuildingUse = z.infer<typeof BuildingUse>;

export const ProjectSchema = z.object({
  name: z.string().min(1).max(120).describe("Short project name."),
  use: BuildingUse,
  description: z
    .string()
    .max(600)
    .describe("One paragraph describing the building in architectural terms."),
});

export const DesignIntentSchema = z.object({
  /**
   * Free-text intent restated in the system's own words. Shown to the user as
   * "what I understood", NOT as chain-of-thought.
   */
  summary: z.string().max(600),
  /**
   * Qualitative intent translated into machine-checkable preferences. This is
   * how "make it efficient and inexpensive" becomes real geometry rather than
   * a label — see brief §73/§74.
   */
  priorities: z
    .array(
      z.object({
        goal: z.enum([
          "maximize_usable_area",
          "minimize_circulation",
          "structural_regularity",
          "daylight_access",
          "construction_economy",
          "program_flexibility",
          "facade_expression",
        ]),
        weight: z.number().min(0).max(1),
      }),
    )
    .max(7),
});

/* ------------------------------------------------------------------ */
/* Orientation + site                                                  */
/* ------------------------------------------------------------------ */

export const OrientationSchema = z.object({
  /** Degrees clockwise from true north for the building's +Z ("front") axis. */
  northAngleDeg: provenanced(
    z.number().min(-180).max(180),
    "Building rotation relative to north.",
  ),
  primaryEntranceFacade: z.enum(["north", "south", "east", "west"]),
});

/**
 * Where the site actually is. Present ONLY when a real place was named — a
 * generated building with no stated location has no region, and the energy
 * model then discloses its Seoul default rather than borrowing a fabricated
 * one. `sigunguCd` accepts the 5-digit 시군구 code or its 2-digit 시도 prefix
 * because that is the honest granularity a prompt usually supports; both
 * downstream readers (regional climate, ground temperature) key on the first
 * two digits, so padding a province out to five digits would invent a district.
 */
export const SiteRegionSchema = z.object({
  sigunguCd: z
    .string()
    .regex(/^\d{2}(\d{3})?$/)
    .describe(
      'Korean 시군구 code ("11110") or its 시도 prefix ("11"). Only when the user named a real Korean location.',
    ),
  label: z.string().max(60).describe("Place name as the user gave it.").optional(),
});
export type SiteRegion = z.infer<typeof SiteRegionSchema>;

export const SiteSchema = z.object({
  widthMm: provenanced(mm(5_000, 1_000_000, "Site width"), "Site X extent."),
  depthMm: provenanced(mm(5_000, 1_000_000, "Site depth"), "Site Z extent."),
  /**
   * Omit unless the prompt names a location. Never infer a region from a
   * building type, a language, or a plausible guess: an invented site code
   * silently reroutes the whole energy model to another climate.
   */
  region: provenanced(
    SiteRegionSchema,
    "Site location, only when the user named one.",
  ).optional(),
});

/* ------------------------------------------------------------------ */
/* Massing                                                             */
/* ------------------------------------------------------------------ */

export const MassingStrategy = z.enum([
  "rectangle",
  "l-shape",
  "u-shape",
  "courtyard",
  "bar",
  "cross",
  "podium-tower",
  "twin-bar",
  "atrium",
  "stepped",
  /**
   * Free-form footprint supplied as explicit polygons in `massing.customPlates`.
   * The only strategy whose outline is not derived from width/depth/parameters,
   * so it is the ingestion path for a traced or drawn plan; `widthMm`/`depthMm`
   * degrade to the bounding box of the largest plate.
   */
  "custom",
]);
export type MassingStrategy = z.infer<typeof MassingStrategy>;

/**
 * One ring of a plate outline: `[x, z]` pairs in millimetres, XZ plane, OPEN
 * (the closing edge is implied). Winding is normalised by the massing pass, so
 * a producer need not get outer-CCW / hole-CW right.
 */
const RingMmSchema = z
  .array(z.tuple([coordMm("Ring vertex X"), coordMm("Ring vertex Z")]))
  .min(3)
  .max(512);

/**
 * An explicit footprint and the levels it governs. `polygonMm` is
 * `[outer, ...holes]` — the same shape as `BuildingRecipe.footprintPolygon`,
 * in millimetres rather than metres.
 *
 * A level named by no entry inherits the nearest named level's plate, so a
 * blueprint that traced only the ground floor still builds a whole building.
 */
export const CustomPlateSchema = z.object({
  floorNos: z.array(z.number().int().min(-8).max(120)).min(1).max(128),
  polygonMm: z.array(RingMmSchema).min(1).max(16),
});
export type CustomPlate = z.infer<typeof CustomPlateSchema>;

export const MassingSchema = z.object({
  strategy: provenanced(MassingStrategy, "Parametric massing family."),
  widthMm: provenanced(mm(6_000, 400_000, "Footprint width"), "Overall X extent."),
  depthMm: provenanced(mm(6_000, 400_000, "Footprint depth"), "Overall Z extent."),
  /**
   * Strategy-specific parameters. Only the keys relevant to `strategy` are
   * read; the compiler ignores the rest. Kept flat (not a discriminated union)
   * because Claude reliably fills a flat optional record, and the compiler
   * validates the combination it actually needs.
   */
  parameters: z
    .object({
      /** courtyard / atrium: void opening. */
      voidWidthMm: mm(2_000, 200_000, "Courtyard/atrium width").optional(),
      voidDepthMm: mm(2_000, 200_000, "Courtyard/atrium depth").optional(),
      /** l-shape / u-shape / cross / twin-bar: arm thickness. */
      wingDepthMm: mm(6_000, 100_000, "Wing depth").optional(),
      /** podium-tower: podium extent and how many levels it spans. */
      podiumWidthMm: mm(6_000, 400_000, "Podium width").optional(),
      podiumDepthMm: mm(6_000, 400_000, "Podium depth").optional(),
      podiumLevels: z.number().int().min(1).max(10).optional(),
      /** stepped: how much each setback pulls in, and every how many levels. */
      setbackMm: mm(1_000, 50_000, "Per-step setback").optional(),
      setbackEveryLevels: z.number().int().min(1).max(20).optional(),
      /** twin-bar: gap between the two bars. */
      gapMm: mm(2_000, 100_000, "Gap between bars").optional(),
    })
    .describe("Only the keys used by the chosen strategy need values."),
  /**
   * Read ONLY when `strategy` is "custom"; every parametric strategy ignores it.
   * Provenanced as a whole rather than per plate because the plates share one
   * origin — a traced plan, a drawn outline or an imported footprint is one act
   * of authorship, not one per level.
   */
  customPlates: provenanced(
    z.array(CustomPlateSchema).min(1).max(128),
    "Explicit per-level footprint polygons for the 'custom' strategy.",
  ).optional(),
});

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

export const LevelUsage = z.enum([
  "occupied",
  "lobby",
  "mechanical",
  "parking",
  "retail",
  "amenity",
  "roof",
]);

export const LevelSchema = z.object({
  /**
   * Signed storey number: -1 = B1, 1 = ground/L01. There is no storey 0.
   *
   * Enforced, not merely documented: the compiler splits levels into below-
   * grade (< 0) and above-grade (> 0), so a level numbered 0 would fall through
   * both branches and vanish from the building without an error.
   */
  floorNo: z
    .number()
    .int()
    .min(-8)
    .max(120)
    .refine((n) => n !== 0, {
      message: "There is no storey 0 — use -1 for B1 and 1 for the ground floor.",
    }),
  name: z.string().min(1).max(24).describe('e.g. "L03", "B1", "Roof"'),
  floorToFloorMm: mm(2_200, 12_000, "Floor-to-floor height"),
  usage: LevelUsage,
});

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

export const StructuralSystem = z.enum([
  "rc-frame",
  "steel-frame",
  "bearing-wall",
  "hybrid",
]);

/**
 * A grid that governs a REGION rather than the building — the thing a rotated
 * wing needs and `gridXMm`/`gridZMm` cannot express, because those describe one
 * lattice aligned to the world axes.
 *
 * `originMm` + `rotationRad` are the region's local frame; the lines sit at the
 * cumulative sums of `xSpacingsMm` / `zSpacingsMm` FROM that origin along the
 * frame's own axes. Spacings are per-bay distances in order, not a repeat count,
 * and the sequence is not extended to fill the region: the author declared the
 * bays they wanted.
 */
export const LocalGridSchema = z.object({
  id: z.string().min(1).max(48).describe('Stable slug, e.g. "wing-north".'),
  /**
   * Rings the grid claims, `[outer, ...holes]` in millimetres. Omitted ⇒ the
   * grid claims the whole plate, which suppresses the global grid entirely.
   */
  regionPolygonMm: z.array(RingMmSchema).min(1).max(16).optional(),
  originMm: z.object({ x: coordMm("Grid origin X"), z: coordMm("Grid origin Z") }),
  rotationRad: z
    .number()
    .min(-Math.PI * 2)
    .max(Math.PI * 2)
    .describe("Radians, +X towards +Z — the same sense as geom/frame."),
  xSpacingsMm: z.array(mm(600, 200_000, "Bay along local X")).min(1).max(64),
  zSpacingsMm: z.array(mm(600, 200_000, "Bay along local Z")).min(1).max(64),
});
export type LocalGrid = z.infer<typeof LocalGridSchema>;

export const StructureSchema = z.object({
  system: provenanced(StructuralSystem, "Primary structural system."),
  gridXMm: provenanced(mm(3_000, 20_000, "Grid spacing along X"), "Bay size X."),
  gridZMm: provenanced(mm(3_000, 20_000, "Grid spacing along Z"), "Bay size Z."),
  columnMm: provenanced(mm(200, 1_600, "Square column size"), "Column section."),
  slabThicknessMm: provenanced(mm(120, 600, "Slab thickness"), "Floor slab."),
  beamDepthMm: provenanced(mm(200, 1_500, "Beam depth"), "Primary beam depth."),
  /**
   * Rotated per-region grids layered over the global `gridXMm`/`gridZMm`
   * lattice. The global grid keeps whatever area no local region claims, so
   * omitting this field leaves the single-lattice behaviour untouched.
   */
  localGrids: provenanced(
    z.array(LocalGridSchema).max(32),
    "Per-region structural grids for rotated wings.",
  ).optional(),
});

/* ------------------------------------------------------------------ */
/* Core                                                                */
/* ------------------------------------------------------------------ */

export const CoreStrategy = z.enum([
  "central",
  "offset",
  "dual",
  "end",
  "perimeter-split",
]);

export const CoreSchema = z.object({
  strategy: provenanced(CoreStrategy, "Where the vertical core sits."),
  widthMm: provenanced(mm(3_000, 60_000, "Core width"), "Core X extent."),
  depthMm: provenanced(mm(3_000, 60_000, "Core depth"), "Core Z extent."),
  /** Footprint-local offset from the plate centre. Zero for `central`. */
  offsetXMm: z.number().int().min(-200_000).max(200_000),
  offsetZMm: z.number().int().min(-200_000).max(200_000),
  elevators: provenanced(
    z.number().int().min(0).max(24),
    "Passenger elevator count.",
  ),
  stairs: provenanced(
    z.number().int().min(1).max(12),
    "Egress stair count — at least 1, normally 2 for multi-storey.",
  ),
  shafts: z
    .array(z.enum(["mechanical", "electrical", "plumbing", "telecom", "refuse"]))
    .max(8),
});

/* ------------------------------------------------------------------ */
/* Program (space graph)                                               */
/* ------------------------------------------------------------------ */

export const SpaceType = z.enum([
  "office-open",
  "office-cellular",
  "meeting",
  "lobby",
  "reception",
  "corridor",
  "restroom",
  "pantry",
  "storage",
  "mechanical",
  "electrical",
  "laboratory",
  "classroom",
  "retail",
  "residential-unit",
  "atrium",
  "circulation",
  "service",
]);
export type SpaceType = z.infer<typeof SpaceType>;

export const AdjacencyKind = z.enum([
  "REQUIRES_ADJACENCY",
  "PREFER_ADJACENCY",
  "AVOID_ADJACENCY",
  "REQUIRES_EXTERIOR",
  "REQUIRES_CORE",
  "REQUIRES_CORRIDOR",
]);

/**
 * A programmatic requirement, NOT a placed room. The solver decides geometry;
 * Claude only declares intent and topology (brief §12/§13).
 */
export const ProgramItemSchema = z.object({
  id: z.string().min(1).max(48).describe('Stable slug, e.g. "open-office".'),
  type: SpaceType,
  label: z.string().min(1).max(60),
  /** Which levels this program appears on, by floorNo. */
  levels: z.array(z.number().int().min(-8).max(120)).min(1),
  /** Target area PER LEVEL listed above, in m² (areas stay m² — mm² is absurd). */
  targetAreaSqmPerLevel: z.number().min(1).max(20_000),
  /** Split the target across this many discrete rooms per level. */
  countPerLevel: z.number().int().min(1).max(200),
  minAreaSqm: z.number().min(1).max(20_000),
  preferredAspectRatio: z
    .number()
    .min(1)
    .max(6)
    .describe("Long side ÷ short side. 1 = square."),
  adjacency: z
    .array(
      z.object({
        kind: AdjacencyKind,
        /** Target program id, or omitted for EXTERIOR/CORE/CORRIDOR kinds. */
        targetId: z.string().max(48).optional(),
      }),
    )
    .max(8),
  priority: z
    .enum(["P0", "P1", "P2", "P3"])
    .describe("P0 cannot be violated; P3 is a soft optimisation."),
});

/* ------------------------------------------------------------------ */
/* Facade                                                              */
/* ------------------------------------------------------------------ */

export const FacadeSystem = z.enum([
  "punched-window",
  "curtain-wall",
  "ribbon-window",
  "solid",
]);

export const FacadeSideSchema = z.object({
  side: z.enum(["north", "south", "east", "west"]),
  system: FacadeSystem,
  glazingRatio: z.number().min(0).max(0.95).describe("Window-to-wall ratio."),
  moduleMm: mm(600, 6_000, "Facade module width"),
  windowWidthMm: mm(300, 6_000, "Window width"),
  sillHeightMm: mm(0, 2_000, "Sill height above finished floor"),
  headHeightMm: mm(1_200, 6_000, "Head height above finished floor"),
});

export const FacadeSchema = z.object({
  /** Exactly four entries — one per side. */
  sides: z.array(FacadeSideSchema).min(4).max(4),
  spandrelMm: mm(300, 2_500, "Spandrel height between vision bands"),
});

/* ------------------------------------------------------------------ */
/* Roof + envelope                                                     */
/* ------------------------------------------------------------------ */

export const RoofSchema = z.object({
  type: provenanced(
    z.enum(["flat", "gable", "hip", "shed", "sawtooth", "terrace"]),
    "Roof form.",
  ),
  parapetMm: mm(0, 2_500, "Parapet height"),
  pitchDeg: z.number().min(0).max(60).describe("0 for flat roofs."),
});

/* ------------------------------------------------------------------ */
/* Envelope of dimensional standards                                   */
/* ------------------------------------------------------------------ */

export const DimensionsSchema = z.object({
  exteriorWallMm: provenanced(mm(100, 800, "Exterior wall thickness"), "Ext wall."),
  interiorWallMm: provenanced(mm(60, 400, "Interior partition thickness"), "Partition."),
  doorWidthMm: provenanced(mm(700, 2_400, "Standard door leaf width"), "Door width."),
  doorHeightMm: provenanced(mm(1_900, 3_000, "Standard door height"), "Door height."),
  corridorWidthMm: provenanced(mm(1_200, 6_000, "Corridor clear width"), "Corridor."),
});

/* ------------------------------------------------------------------ */
/* Constraints + MEP                                                   */
/* ------------------------------------------------------------------ */

export const ConstraintSchema = z.object({
  id: z.string().min(1).max(48),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  statement: z.string().max(200).describe("Human-readable design rule."),
  /** Machine-checkable form, when one exists. */
  rule: z
    .object({
      kind: z.enum([
        "max_circulation_ratio",
        "min_space_area",
        "require_exterior",
        "require_core_adjacency",
        "fixed_grid",
        "locked_element",
      ]),
      target: z.string().max(48).optional(),
      numeric: z.number().optional(),
    })
    .optional(),
});

export const MepSchema = z.object({
  strategy: z.enum(["central-ahu", "distributed-vrf", "packaged-rooftop", "none"]),
  /** Levels that host plant, by floorNo. */
  mechanicalLevels: z.array(z.number().int().min(-8).max(120)).max(20),
  ceilingPlenumMm: mm(0, 2_000, "Ceiling/service plenum depth"),
});

/* ------------------------------------------------------------------ */
/* The spec                                                            */
/* ------------------------------------------------------------------ */

export const BuildingSpecSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.literal("mm"),
  /** Deterministic regeneration: same prompt + params + seed ⇒ same geometry. */
  generationSeed: z.number().int().min(0).max(2_147_483_647),

  project: ProjectSchema,
  designIntent: DesignIntentSchema,
  orientation: OrientationSchema,
  site: SiteSchema,
  massing: MassingSchema,
  levels: z.array(LevelSchema).min(1).max(120),
  structure: StructureSchema,
  core: CoreSchema,
  program: z.array(ProgramItemSchema).min(1).max(60),
  facade: FacadeSchema,
  roof: RoofSchema,
  dimensions: DimensionsSchema,
  mep: MepSchema,
  constraints: z.array(ConstraintSchema).max(40),

  /**
   * Plain-language assumptions surfaced in the Assumptions panel. These must
   * correspond to real INFERRED/DEFAULT values elsewhere in the spec — the
   * panel cross-references them, so inventing entries here shows up as a bug.
   */
  assumptions: z
    .array(
      z.object({
        id: z.string().min(1).max(48),
        label: z.string().max(120),
        statement: z.string().max(240),
        source: ValueSource,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(40),
});

export type BuildingSpec = z.infer<typeof BuildingSpecSchema>;
export type Massing = z.infer<typeof MassingSchema>;
export type LevelSpec = z.infer<typeof LevelSchema>;
export type ProgramItem = z.infer<typeof ProgramItemSchema>;
export type FacadeSide = z.infer<typeof FacadeSideSchema>;
export type CoreSpec = z.infer<typeof CoreSchema>;
export type StructureSpec = z.infer<typeof StructureSchema>;
export type ConstraintSpec = z.infer<typeof ConstraintSchema>;
export type SpecAssumption = BuildingSpec["assumptions"][number];

/* ------------------------------------------------------------------ */
/* Patches (modification + repair)                                     */
/* ------------------------------------------------------------------ */

/**
 * A modification is expressed as a scoped patch, never a whole new spec —
 * this is what makes partial regeneration possible (brief §39/§40). `scope`
 * tells the dependency engine which subtree to rebuild.
 */
export const BuildingPatchSchema = z.object({
  /** Human-readable, becomes the single undo entry + history label. */
  summary: z.string().min(1).max(120),
  rationale: z.string().max(600),
  scope: z.enum([
    "building",
    "massing",
    "levels",
    "structure",
    "core",
    "program",
    "facade",
    "roof",
    "dimensions",
    "mep",
  ]),
  /** Levels the patch touches. Empty ⇒ all levels. */
  affectedFloorNos: z.array(z.number().int().min(-8).max(120)).max(120),
  /**
   * RFC-6902-style ops restricted to the spec tree. Paths are slash-delimited
   * against BuildingSpec, e.g. "/core/offsetXMm" or "/levels/3/floorToFloorMm".
   * Applied and re-validated server-side; never trusted raw.
   */
  operations: z
    .array(
      z.object({
        op: z.enum(["set", "insert", "remove"]),
        path: z.string().min(1).max(200),
        value: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(120),
});
export type BuildingPatch = z.infer<typeof BuildingPatchSchema>;

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

export const BuildingReviewSchema = z.object({
  /** Grounded in the supplied BIMSummary — not free-form architecture prose. */
  explanation: z
    .array(z.string().max(300))
    .max(10)
    .describe("Why the building looks like this, citing real generated state."),
  recommendations: z
    .array(
      z.object({
        title: z.string().max(120),
        detail: z.string().max(400),
        severity: z.enum(["advisory", "warning", "critical"]),
      }),
    )
    .max(12),
});
export type BuildingReview = z.infer<typeof BuildingReviewSchema>;

/* ------------------------------------------------------------------ */
/* JSON Schema emission (Claude tool contract)                         */
/* ------------------------------------------------------------------ */

/**
 * Single source of truth: the same Zod schema validates the response AND
 * defines the tool `input_schema` Claude must satisfy. They cannot drift.
 *
 * Emitted in the default ("output") direction on purpose. No schema in this
 * file uses `.default()` or a transform, so input and output shapes are
 * identical — but only the output direction sets `additionalProperties: false`,
 * which is what stops the model inventing extra keys. If a `.default()` is ever
 * added here, switch to `io: "input"` and re-check strictness, because a
 * defaulted field would otherwise be emitted as optional.
 */
export function toolInputSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
}

/** Never execute unvalidated model output (brief §6, §66). */
export function parseBuildingSpec(raw: unknown): BuildingSpec {
  return BuildingSpecSchema.parse(raw);
}

export function safeParseBuildingSpec(raw: unknown) {
  return BuildingSpecSchema.safeParse(raw);
}
