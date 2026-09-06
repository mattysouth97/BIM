/**
 * The Duplex Apartment as energy-engine input — the third of these files.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE QUOTING ANY NUMBER FROM THIS FILE
 *
 *  Unlike `schependomlaan-energy.ts`, this file is in the MEASURED state:
 *  `DUPLEX_INPUT_STATE` says so and `DUPLEX_PENDING_MEASUREMENTS` is empty.
 *  Every envelope area behind these numbers — wall by orientation, glazing
 *  by orientation, exterior doors, roof, ground slab, ground perimeter,
 *  volumes, floor areas and storey datums — is read from the committed
 *  manifest. This is the first building here whose per-orientation glazing
 *  is measured rather than spread pro rata.
 *
 *  It is NOT a building without doubt. What is uncertain here is uncertain
 *  about the CONSTRUCTIONS, not the geometry: the file states no
 *  conductivity and no U-value anywhere, so every λ is a mapping this repo
 *  chose (`A-LAYER-LAMBDAS`), the stud cavity is modelled as air because the
 *  model names nothing in it (`A-STUD-CAVITY`), and the roof's 286 mm joist
 *  zone is solved as solid timber because that is the layer the model
 *  states (`A-JOIST-ZONE`). Those three, not the areas, are what a kWh
 *  figure out of this file rests on.
 *
 *  One measured area IS knowingly short: the two roof skylights, 1.49 m² of
 *  real glazing that the opening walk cannot place because their host is an
 *  IfcRoof rather than a wall (`A-SKYLIGHTS`). It is named as an omission
 *  rather than carried as a placeholder, because a placeholder would put an
 *  invented number in the aperture and this one is simply absent.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Same discipline and the same four exports as the two siblings. Every number
 * is either MEASURED (and says which extraction produced it) or ASSUMED (and
 * is in `DUPLEX_ASSUMPTIONS` with the reason it cannot be measured).
 *
 * Sources of the measurements:
 *   - `public/reference-buildings/duplex-apartment/manifest.json`, generated
 *     by `scripts/build-reference-building.mjs` from the buildingSMART
 *     Community Sample Test Files Duplex Apartment set (CC BY 4.0).
 *   - `public/reference-buildings/duplex-apartment/spaces.json`, 37 IfcSpace
 *     rows — 18 rooms, 18 analytical duplicates and one roof plane.
 *   - `public/reference-buildings/duplex-apartment/openings.json`, 36 rows.
 *
 * ── The trap this building set, and what it cost ──────────────────────────
 * Its rooms model states every room TWICE: once as an architectural Room and
 * once as the authoring tool's analytical Space, same Name, same LongName,
 * same plan position, two GlobalIds. All 37 rows sum to 799.76 m²; the
 * ROOF-name rule already took that to 529.46, and de-duplicating the
 * analytical copies takes it to the building's real 284.98. The extractor's
 * own config comment had recorded a conclusion from those inflated numbers —
 * that the architectural file held "one dwelling's rooms" — which was wrong:
 * both dwellings are in both files. `classifyAnalyticalSpace` in
 * `scripts/lib/ifc-envelope.mjs` is the fix and carries the full account.
 *
 * Floor area is the denominator of every intensity, so 529.46 — the figure
 * that would actually have shipped — would have published this building
 * reading 46 % better than it is. `A-FLOOR-AREA` states what is counted.
 */

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import { getRecipe } from "@/lib/procedural/recipe";
import { slabOnGroundUValue, slabOnGroundUValueRange } from "@/lib/energy-standards/ground-coupling";
import { calculateAssembly } from "@/lib/energy-standards/assembly";
import { genericMaterialById } from "@/lib/energy-standards/materials";

// ── Which state this file is in ───────────────────────────────────────────

/**
 * `"measured"` because no envelope input here is a stand-in. The type keeps
 * the sibling's shape so a consumer can ask the same question of any of the
 * three buildings; `DUPLEX_PENDING_MEASUREMENTS` is empty and a test pins
 * that the two agree.
 */
export type DuplexInputState = "awaiting_measurements" | "measured";
export const DUPLEX_INPUT_STATE: DuplexInputState = "measured";

export type PendingMeasurement = Readonly<{
  manifestField: string;
  constant: string;
  placeholderValue: number;
  unit: "m2" | "m";
  derivedFrom: string;
  biasDirection: string;
}>;

/**
 * Empty, and exported anyway.
 *
 * The registry reads `pendingMeasurements` to decide whether to badge a page
 * "awaiting measurement", and an absent export and an empty one are different
 * claims: absent means nobody built the table, empty means somebody checked.
 * The skylights in `A-SKYLIGHTS` are deliberately NOT a row here — a pending
 * measurement is a number standing in for another number, and there is no
 * number standing in for the skylights. They are missing, and saying so in an
 * assumption is the honest shape.
 */
export const DUPLEX_PENDING_MEASUREMENTS: readonly PendingMeasurement[] =
  Object.freeze([]);

// ── Measured geometry, from the committed manifest ────────────────────────

/**
 * Two occupied storeys and a roof datum. `manifest.storeys[]`.
 *
 * `spaceCount` in the manifest is EVERY IfcSpace on the storey (15 and 20)
 * and `spacesCountingAsFloor` is the room subset (8 and 10) — the gap is the
 * analytical duplicates. The room counts are the ones quoted here, because
 * the areas beside them are the rooms' areas.
 */
const STOREY_1_F2F_M = 3.1;
const STOREY_2_F2F_M = 2.9;
const ROOF_DATUM_M = 6.0;

export const DUPLEX_STOREYS = Object.freeze({
  groundFloor: Object.freeze({ id: "storey-level-1", name: "Level 1", elevationM: 0, floorToFloorM: STOREY_1_F2F_M, floorAreaSqm: 141.792, roomCount: 8, spaceCount: 15 }),
  firstFloor: Object.freeze({ id: "storey-level-2", name: "Level 2", elevationM: 3.1, floorToFloorM: STOREY_2_F2F_M, floorAreaSqm: 143.183, roomCount: 10, spaceCount: 20 }),
  /** A datum with two ROOF spaces and no floor. */
  roofDatumM: ROOF_DATUM_M,
});

/**
 * `areas.totalFloorAreaSqm`. 141.792 + 143.183 = 284.975, which the manifest
 * rounds to 284.98 — note that the storeys' own 2-dp rows (141.79 + 143.18)
 * give 284.97, so a card or a test must reproduce this from the 3-dp figures
 * or from the plan total, never from the rounded rows.
 */
export const DUPLEX_TOTAL_FLOOR_AREA_SQM = 284.98;

/**
 * `areas.areaPlanTotalSqm` — every IfcSpace row summed, 799.76 m². Recorded
 * because it is the number this building's file hands a careless reader, and
 * the difference between it and the floor area is the whole finding. NOT an
 * input to anything.
 */
export const DUPLEX_AREA_PLAN_TOTAL_SQM = 799.76;

/** Exterior wall NET of openings — `areas.exteriorWallNetSqm`. */
const EXTERIOR_WALL_NET_SQM = 267.16;

export type WallSector = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/**
 * `areas.exteriorWallByOrientationSqm`, all eight sectors. The four diagonals
 * are 0 by measurement: `manifest.orientation` reports `offCardinalCount: 0`
 * over all 12 exterior walls, so nothing is mis-binned into a cardinal.
 */
export const DUPLEX_WALL_BY_SECTOR_SQM: Readonly<Record<WallSector, number>> =
  Object.freeze({ N: 34.67, NE: 0, E: 100.46, SE: 0, S: 33.12, SW: 0, W: 98.91, NW: 0 });

/**
 * `areas.glazingByOrientationSqm`. MEASURED, per opening, from 22 IfcWindow
 * at OverallWidth × OverallHeight with each one's host wall resolved through
 * IfcRelFillsElement — not a pro-rata spread of a total. The N/S pair carries
 * 20.32 m² each and the E/W pair 11.91 m² each, which is the plan: the two
 * dwellings are mirrored about a party wall and their living-room glazing
 * faces the short elevations.
 */
export const DUPLEX_GLAZING_BY_SECTOR_SQM: Readonly<Record<WallSector, number>> =
  Object.freeze({ N: 20.32, NE: 0, E: 11.91, SE: 0, S: 20.32, SW: 0, W: 11.91, NW: 0 });

/** `areas.exteriorDoorByOrientationSqm`. 4 exterior IfcDoor, measured. */
export const DUPLEX_DOOR_BY_SECTOR_SQM: Readonly<Record<WallSector, number>> =
  Object.freeze({ N: 1.97, NE: 0, E: 2.51, SE: 0, S: 1.97, SW: 0, W: 2.51, NW: 0 });

const SECTORS = Object.keys(DUPLEX_WALL_BY_SECTOR_SQM) as readonly WallSector[];

const GLAZING_APERTURE_SQM = 64.46;
const EXTERIOR_DOOR_SQM = 8.96;

/**
 * `areas.groundSlabSqm`: the union of the 8 counted slab shadows a
 * conditioned space stands on. Two `150mm Exterior Slab on Grade` pieces of
 * 25.42 m² each are excluded — no room stands on them, they are the entrance
 * pads outdoors. The ten candidates' shadows sum to 256.22 m² and union to
 * 129.69, because the build-up layers (slab on grade, finish floor, tile)
 * stack on one another and count once.
 */
const GROUND_SLAB_SQM = 129.69;

/** `areas.groundPerimeterM`: the outline's outer ring, no hole rings added. */
const GROUND_PERIMETER_M = 69.1;

/**
 * The roof, from `roofs[]` — ONE element, and the simplest roof of the three
 * buildings. `Basic Roof:Live Roof over Wood Joist Flat Roof`, projected
 * 132.93 m², surface 132.93 m², `tiltDeg` 0. Flat, so its surface IS its
 * plan and there is no pitched-versus-plan question to resolve; there is
 * also only one roof family, so nothing to double-count.
 *
 * `roofProjectedSqm`, `roofUnionSqm` and `roofSurfaceSqm` are all 132.93 and
 * that agreement is the check, not a coincidence to quote three times.
 */
export const DUPLEX_ROOF_AREA_SQM = 132.93;

/**
 * The roof is a GREEN roof as modelled: its outermost layer is 64 mm of
 * `Site - Grass`. That is stated by the assembly and is why `greenRoofCoverage`
 * below is 1 rather than 0. The substrate's own thermal effect is NOT counted
 * — see `A-GREEN-ROOF`.
 */
export const DUPLEX_ROOF_IS_GREEN = true;

/**
 * `provenance` says where each field came from. Every row here reads
 * "manifest" or "derived_from_manifest" — there is no "placeholder" row, and
 * that is the difference between this building and Schependomlaan.
 */
export const DUPLEX_MEASURED_ENVELOPE = Object.freeze({
  exteriorWallNetSqm: EXTERIOR_WALL_NET_SQM,
  exteriorWallByOrientationSqm: DUPLEX_WALL_BY_SECTOR_SQM,
  exteriorWallBelowRoofSqm: 211.61,
  exteriorWallAboveRoofSqm: 55.56,
  northAssumed: true,
  glazingApertureSqm: GLAZING_APERTURE_SQM,
  glazingByOrientationSqm: DUPLEX_GLAZING_BY_SECTOR_SQM,
  exteriorDoorSqm: EXTERIOR_DOOR_SQM,
  exteriorDoorByOrientationSqm: DUPLEX_DOOR_BY_SECTOR_SQM,
  /** Opaque wall + glazing + doors: the whole exterior wall plane. */
  grossWallSqm: EXTERIOR_WALL_NET_SQM + GLAZING_APERTURE_SQM + EXTERIOR_DOOR_SQM,
  roofProjectedSqm: DUPLEX_ROOF_AREA_SQM,
  roofUnionSqm: DUPLEX_ROOF_AREA_SQM,
  roofAreaSqm: DUPLEX_ROOF_AREA_SQM,
  roofTiltDeg: 0,
  groundSlabSqm: GROUND_SLAB_SQM,
  groundPerimeterM: GROUND_PERIMETER_M,
  /** `areas.conditionedVolumeGrossM3` — inside the air barrier. */
  conditionedVolumeGrossM3: 854.79,
  /** `areas.roomVolumeNetM3` — the 18 room solids summed. Recorded, not used. */
  roomVolumeNetM3: 639.88,
  provenance: Object.freeze({
    exteriorWallNetSqm: "manifest",
    exteriorWallByOrientationSqm: "manifest",
    exteriorWallBelowRoofSqm: "manifest",
    exteriorWallAboveRoofSqm: "manifest",
    glazingApertureSqm: "manifest",
    glazingByOrientationSqm: "manifest",
    exteriorDoorSqm: "manifest",
    exteriorDoorByOrientationSqm: "manifest",
    grossWallSqm: "derived_from_manifest",
    roofProjectedSqm: "manifest",
    roofUnionSqm: "manifest",
    roofAreaSqm: "manifest",
    roofTiltDeg: "manifest",
    groundSlabSqm: "manifest",
    groundPerimeterM: "manifest",
    conditionedVolumeGrossM3: "manifest",
    roomVolumeNetM3: "manifest",
  }),
});

// ── Constructions, solved from the model's own layer sets ─────────────────

const lambda = (id: string): number => {
  const material = genericMaterialById(id);
  const value = material?.conductivityWPerMK;
  if (value === undefined) {
    throw new Error(`generic material ${id} states no conductivity`);
  }
  return value;
};

const fixedR = (id: string): number => {
  const material = genericMaterialById(id);
  const value = material?.fixedResistanceM2KPerW;
  if (value === undefined) {
    throw new Error(`generic material ${id} states no fixed resistance`);
  }
  return value;
};

/**
 * `Basic Wall:Exterior - Brick on Block`, all six layers as the model states
 * them, outside-in. Unlike Schependomlaan's cavity wall this IS one stated
 * `IfcMaterialLayerSet`, so no composite is inferred — the assembly is the
 * model's, and only the λ per layer is this repo's.
 *
 * The 25 mm `Misc. Air Layers - Air Space` is the one layer that lands
 * exactly on its library entry: `air-iso-h25` is ISO 6946 Table 2's 25 mm
 * horizontal-flow cavity, and the model states 25 mm.
 */
export const DUPLEX_EXTERIOR_WALL = calculateAssembly(
  [
    { id: "Masonry - Brick (outer leaf)", thicknessM: 0.092, conductivityWPerMK: lambda("st-redbrick") },
    { id: "Misc. Air Layers - Air Space", thicknessM: 0.025, fixedResistanceM2KPerW: fixedR("air-iso-h25") },
    { id: "Insulation / Thermal Barriers - Rigid insulation", thicknessM: 0.05, conductivityWPerMK: lambda("ins-polyiso") },
    { id: "Masonry - Concrete Block", thicknessM: 0.193, conductivityWPerMK: lambda("st-brick") },
    { id: "Metal - Stud Layer", thicknessM: 0.041, fixedResistanceM2KPerW: fixedR("air-iso-h25") },
    { id: "Plasterboard", thicknessM: 0.016, conductivityWPerMK: lambda("fin-gypsum") },
  ],
  "horizontal",
);

/**
 * The same wall with the 41 mm stud cavity insulated instead of read as air —
 * the counterfactual `A-STUD-CAVITY` quotes, exported so the claim in that
 * assumption can be checked rather than believed.
 */
export const DUPLEX_EXTERIOR_WALL_STUD_INSULATED = calculateAssembly(
  [
    { id: "Masonry - Brick (outer leaf)", thicknessM: 0.092, conductivityWPerMK: lambda("st-redbrick") },
    { id: "Misc. Air Layers - Air Space", thicknessM: 0.025, fixedResistanceM2KPerW: fixedR("air-iso-h25") },
    { id: "Insulation / Thermal Barriers - Rigid insulation", thicknessM: 0.05, conductivityWPerMK: lambda("ins-polyiso") },
    { id: "Masonry - Concrete Block", thicknessM: 0.193, conductivityWPerMK: lambda("st-brick") },
    { id: "Metal - Stud Layer (as mineral wool)", thicknessM: 0.041, conductivityWPerMK: lambda("ins-mw") },
    { id: "Plasterboard", thicknessM: 0.016, conductivityWPerMK: lambda("fin-gypsum") },
  ],
  "horizontal",
);

/**
 * `Basic Roof:Live Roof over Wood Joist Flat Roof`, UPWARD surface
 * resistances. Four of its six stated layers are solved; two are dropped:
 *
 *   Site - Grass          64 mm  dropped — see A-GREEN-ROOF
 *   Roofing - Barrier      6 mm  dropped — see A-ROOF-BARRIER
 *   Roofing - EPDM Membrane 6 mm  mb-epdm
 *   Rigid insulation      76 mm  ins-polyiso
 *   Wood - Sheathing plywood 19 mm wd-plywood
 *   Wood - Dimensional Lumber 286 mm wd-structural — see A-JOIST-ZONE
 *
 * Dropping a layer is the conservative direction: it removes resistance, so
 * the roof reads worse than modelled rather than better.
 */
export const DUPLEX_ROOF = calculateAssembly(
  [
    { id: "Roofing - EPDM Membrane", thicknessM: 0.006, conductivityWPerMK: lambda("mb-epdm") },
    { id: "Insulation / Thermal Barriers - Rigid insulation", thicknessM: 0.076, conductivityWPerMK: lambda("ins-polyiso") },
    { id: "Wood - Sheathing - plywood", thicknessM: 0.019, conductivityWPerMK: lambda("wd-plywood") },
    { id: "Wood - Dimensional Lumber (joist zone)", thicknessM: 0.286, conductivityWPerMK: lambda("wd-structural") },
  ],
  "upward",
);

/**
 * The same roof with the 286 mm joist zone read as a cavity rather than as
 * solid timber — the counterfactual `A-JOIST-ZONE` quotes. Exported for the
 * same reason as the wall's.
 */
export const DUPLEX_ROOF_JOIST_ZONE_AS_CAVITY = calculateAssembly(
  [
    { id: "Roofing - EPDM Membrane", thicknessM: 0.006, conductivityWPerMK: lambda("mb-epdm") },
    { id: "Insulation / Thermal Barriers - Rigid insulation", thicknessM: 0.076, conductivityWPerMK: lambda("ins-polyiso") },
    { id: "Wood - Sheathing - plywood", thicknessM: 0.019, conductivityWPerMK: lambda("wd-plywood") },
    { id: "joist zone as an unventilated cavity", thicknessM: 0.286, fixedResistanceM2KPerW: fixedR("air-20") },
  ],
  "upward",
);

/**
 * `Floor:127mm Slab on Grade` — the floor construction's own resistance R_f,
 * layers only, EXCLUDING surface resistances, which is what ISO 13370 wants.
 *
 * ONE layer: 127 mm of concrete. The model states no insulation under this
 * slab at all, and none is invented. That is the single largest difference
 * between this building and the other two, and it is a statement of the file
 * rather than a gap in it — a 2011 US duplex on an uninsulated slab is an
 * ordinary thing to have drawn.
 */
const GROUND_FLOOR_RESISTANCE_M2KW = 0.127 / lambda("st-rc");

/** The exterior wall's stated total thickness at the slab edge, 417 mm. */
const WALL_THICKNESS_AT_SLAB_M = 0.417;

const groundInputs = {
  areaSqm: GROUND_SLAB_SQM,
  exposedPerimeterM: GROUND_PERIMETER_M,
  wallThicknessM: WALL_THICKNESS_AT_SLAB_M,
  floorResistanceM2KPerW: GROUND_FLOOR_RESISTANCE_M2KW,
} as const;

/**
 * 129.69 m² over 69.1 m. This slab is UNINSULATED, so unlike the other two
 * buildings d_t stays well under B' and ISO 13370's uninsulated branch
 * applies — the branch where the soil, not the floor, is most of the
 * resistance. `DUPLEX_GROUND_FLOOR_RANGE` carries the soil sensitivity, and
 * on an uninsulated slab that range is wide: soil is the dominant term.
 */
export const DUPLEX_GROUND_FLOOR = slabOnGroundUValue(groundInputs);
export const DUPLEX_GROUND_FLOOR_RANGE = slabOnGroundUValueRange(groundInputs);

// ── Window-to-wall ratio: derived from its parts, against GROSS wall ──────

/**
 * The engine computes `windows = grossWall × wwr` and prices `grossWall −
 * windows` as opaque wall, so the ratio is quoted against the same gross the
 * engine is handed — opaque + glazing + doors. Against the net 267.16 the
 * windows would land right and 73.42 m² of real wall would be priced as
 * nothing.
 */
const WWR_AGAINST_GROSS_WALL =
  DUPLEX_MEASURED_ENVELOPE.glazingApertureSqm /
  DUPLEX_MEASURED_ENVELOPE.grossWallSqm;

/**
 * Per-sector WWR against each sector's own gross wall.
 *
 * **This building is the one that makes the engine's mean matter.** Its
 * measured ratios are genuinely uneven — the short N and S elevations are
 * glazed about 0.36 and the long E and W elevations about 0.10 — because the
 * two mirrored dwellings put their living rooms on the ends. The unweighted
 * arithmetic mean of the four is 0.2331 while the area-weighted mean is
 * 0.1893, a 23 % gap; on Schependomlaan the same comparison shows nothing
 * because its per-sector glazing is a uniform placeholder, and on the Clinic
 * it moves the windows by 2.7 %.
 *
 * So this file hands the engine ONE ratio — the whole-building 0.1893, which
 * IS the area-weighted mean — on all four cardinals, exactly as the Clinic
 * does. That reproduces the measured aperture. The eight honest ratios live
 * here for the legend. See `A-WWR-ENGINE-MEAN`.
 */
export const DUPLEX_WWR_BY_SECTOR: Readonly<Record<WallSector, number>> =
  Object.freeze(
    Object.fromEntries(
      SECTORS.map((s) => {
        const wall = DUPLEX_WALL_BY_SECTOR_SQM[s];
        const glazing = DUPLEX_GLAZING_BY_SECTOR_SQM[s];
        const doors = DUPLEX_DOOR_BY_SECTOR_SQM[s];
        const gross = wall + glazing + doors;
        return [s, gross > 0 ? glazing / gross : 0];
      }),
    ) as Record<WallSector, number>,
  );

/**
 * The area-weighted mean of the per-sector ratios, computed from the parts.
 * It equals `WWR_AGAINST_GROSS_WALL` by construction — Σ(gross_i × wwr_i) /
 * Σgross_i is Σglazing_i / Σgross_i — and is exported so a test can assert
 * that identity rather than a reader having to take it on trust.
 */
export const DUPLEX_WWR_AREA_WEIGHTED = (() => {
  let glazing = 0;
  let gross = 0;
  for (const s of SECTORS) {
    glazing += DUPLEX_GLAZING_BY_SECTOR_SQM[s];
    gross +=
      DUPLEX_WALL_BY_SECTOR_SQM[s] +
      DUPLEX_GLAZING_BY_SECTOR_SQM[s] +
      DUPLEX_DOOR_BY_SECTOR_SQM[s];
  }
  return gross > 0 ? glazing / gross : 0;
})();

/** The unweighted mean `heat-loss.ts:109` would take. Recorded, never used. */
export const DUPLEX_WWR_UNWEIGHTED_MEAN =
  (["N", "E", "S", "W"] as const).reduce((sum, s) => sum + DUPLEX_WWR_BY_SECTOR[s], 0) / 4;

// ── The recipe: shape and metadata only ───────────────────────────────────

const floors: FloorSpec[] = [
  { floorNo: 1, label: "1F — Level 1", type: "above", y: 0, height: STOREY_1_F2F_M, isGroundFloor: true, useCode: "02000" },
  { floorNo: 2, label: "2F — Level 2", type: "above", y: 3.1, height: STOREY_2_F2F_M, isGroundFloor: false, useCode: "02000" },
];

/**
 * The footprint the recipe carries is a SQUARE of the measured ground slab.
 * It is not a measurement of the building's shape and nothing in the energy
 * path reads it: `measuredEnvelope` short-circuits `envelopeQuantities`. See
 * `A-NO-FOOTPRINT`.
 */
const FOOTPRINT_SIDE_M = Math.round(Math.sqrt(GROUND_SLAB_SQM) * 100) / 100;

/**
 * Era 2010-2019: the IFC header is dated 2011-09-07 and the authoring tool is
 * Autodesk Revit Architecture 2011, so the era is evidence. What it does NOT
 * do is decide any number here — the era selects Korean code-table defaults
 * for values not overridden, and every U-value, WWR and airtightness figure
 * below is overridden explicitly.
 */
const defaults = getRecipe("22", "2010-2019", "02000", false);

export const DUPLEX_RECIPE: BuildingRecipe = {
  ...defaults,
  era: "2010-2019",
  buildingName: "Duplex Apartment",
  address:
    "Not stated. IfcSite is an unfilled Revit template — Name 'Default', postal address line still the placeholder 'Enter address here', RefElevation a signed zero — so its Chicago, IL coordinate is the template's and not this building's.",
  footprintWidth: FOOTPRINT_SIDE_M,
  footprintDepth: FOOTPRINT_SIDE_M,
  officialFloorAreaSqm: DUPLEX_TOTAL_FLOOR_AREA_SQM,
  floors,
  totalHeight: ROOF_DATUM_M,
  wallThickness: WALL_THICKNESS_AT_SLAB_M,
  mainPurpsCd: "02000",
  strctCd: "22",
  siteWidth: FOOTPRINT_SIDE_M,
  siteDepth: FOOTPRINT_SIDE_M,
  measuredEnvelope: {
    planAreaSqm: DUPLEX_MEASURED_ENVELOPE.groundSlabSqm,
    wallLengthM: DUPLEX_MEASURED_ENVELOPE.groundPerimeterM,
    grossWallAreaSqm: DUPLEX_MEASURED_ENVELOPE.grossWallSqm,
    roofAreaSqm: DUPLEX_MEASURED_ENVELOPE.roofAreaSqm,
    volumeM3: DUPLEX_MEASURED_ENVELOPE.conditionedVolumeGrossM3,
    derivedFloorAreaSqm: DUPLEX_TOTAL_FLOOR_AREA_SQM,
    basis:
      "MEASURED. Wall areas by orientation, glazing by orientation (per opening, " +
      "22 IfcWindow at OverallWidth × OverallHeight with the host wall resolved " +
      "through IfcRelFillsElement), exterior doors (4 IfcDoor), the single flat " +
      "roof element's upward faces, the union of the ground-slab shadows a " +
      "conditioned room stands on and its outer ring, storey datums, room floor " +
      "areas and both volumes are read from the Duplex IFC set by " +
      "scripts/build-reference-building.mjs. Floor area counts the 18 " +
      "architectural Rooms, not the 18 analytical Spaces stated over them " +
      "(A-FLOOR-AREA). Known omission: 2 roof skylights, 1.49 m² of glazing " +
      "whose host is an IfcRoof and which the wall-hosted opening walk cannot " +
      "place (A-SKYLIGHTS).",
  },
};

// ── Materials ─────────────────────────────────────────────────────────────

const wallLayers = [
  { name: "Masonry - Brick (outer leaf)", thickness: 0.092, thermalConductivity: lambda("st-redbrick"), density: 1700, specificHeat: 880 },
  { name: "Misc. Air Layers - Air Space", thickness: 0.025, thermalConductivity: 0.14, density: 1.2, specificHeat: 1005 },
  { name: "Insulation / Thermal Barriers - Rigid insulation", thickness: 0.05, thermalConductivity: lambda("ins-polyiso"), density: 30, specificHeat: 1400 },
  { name: "Masonry - Concrete Block", thickness: 0.193, thermalConductivity: lambda("st-brick"), density: 1800, specificHeat: 880 },
  { name: "Metal - Stud Layer (modelled as air)", thickness: 0.041, thermalConductivity: 0.23, density: 1.2, specificHeat: 1005 },
  { name: "Plasterboard", thickness: 0.016, thermalConductivity: lambda("fin-gypsum"), density: 900, specificHeat: 1000 },
];

const wall = (orientation: "N" | "S" | "E" | "W", surfaceArea: number) => ({
  orientation,
  uValue: DUPLEX_EXTERIOR_WALL.uValueWPerM2K,
  rValue: DUPLEX_EXTERIOR_WALL.totalResistanceM2KPerW,
  layers: wallLayers,
  thermalBridge: 0,
  surfaceArea,
});

export const DUPLEX_MATERIALS: MaterialProperties = {
  source: "ifc-model",
  confidence: "estimated",
  codeYear: 2011,
  envelope: {
    walls: [
      wall("N", DUPLEX_WALL_BY_SECTOR_SQM.N),
      wall("E", DUPLEX_WALL_BY_SECTOR_SQM.E),
      wall("S", DUPLEX_WALL_BY_SECTOR_SQM.S),
      wall("W", DUPLEX_WALL_BY_SECTOR_SQM.W),
    ],
    roof: {
      uValue: DUPLEX_ROOF.uValueWPerM2K,
      layers: [
        { name: "Roofing - EPDM Membrane", thickness: 0.006, thermalConductivity: lambda("mb-epdm"), density: 1150, specificHeat: 1000 },
        { name: "Insulation / Thermal Barriers - Rigid insulation", thickness: 0.076, thermalConductivity: lambda("ins-polyiso"), density: 30, specificHeat: 1400 },
        { name: "Wood - Sheathing - plywood", thickness: 0.019, thermalConductivity: lambda("wd-plywood"), density: 500, specificHeat: 1600 },
        { name: "Wood - Dimensional Lumber (joist zone)", thickness: 0.286, thermalConductivity: lambda("wd-structural"), density: 500, specificHeat: 1600 },
      ],
      /**
       * A planted roof, not a membrane one: the assembly's outermost stated
       * layer is 64 mm of `Site - Grass`. Vegetation is dark and damp, so the
       * reflectance is low and the emissivity high; see A-GREEN-ROOF for what
       * is and is not counted.
       */
      solarReflectance: 0.2,
      emissivity: 0.95,
      greenRoofCoverage: 1,
    },
    groundFloor: {
      uValue: DUPLEX_GROUND_FLOOR.uValueWPerM2K,
      layers: [
        { name: "Concrete (127mm slab on grade)", thickness: 0.127, thermalConductivity: lambda("st-rc"), density: 2400, specificHeat: 880 },
      ],
      /** ISO 13370's soil path is already inside the U above; nothing to add. */
      groundContactResistance: 0,
    },
    windows: {
      uValue: 2.8,
      shgc: 0.7,
      vlt: 0.78,
      glassType: "double",
      coating: "none",
      gasFill: "air",
      frameMaterial: "aluminum",
      airLeakageRate: 0.5,
      shadingCoefficient: 0.8,
      windowToWallRatio: {
        N: WWR_AGAINST_GROSS_WALL,
        S: WWR_AGAINST_GROSS_WALL,
        E: WWR_AGAINST_GROSS_WALL,
        W: WWR_AGAINST_GROSS_WALL,
      },
    },
    foundation: {
      perimeterInsulationUValue: 0,
      groundTemperature: 13.5,
      moistureBarrier: "none",
    },
    airtightness: {
      ach50: 7.0,
      equivalentLeakageArea: 0,
      testMethod: "estimated",
    },
  },
  hvac: {
    heating: { systemType: "individual", fuelType: "gas", efficiency: 0.8, capacity: 0 },
    cooling: { systemType: "split", efficiency: 3.0, capacity: 0 },
    ventilation: { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0 },
    dhw: { systemType: "gas-boiler", efficiency: 0.8, storageVolume: 0 },
  },
  lighting: {
    lightingPowerDensity: 6,
    controlType: "manual",
    lampType: "fluorescent",
  },
  renewable: {
    solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 0, orientation: 0, area: 0 },
    solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
    geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
  },
  occupancy: {
    occupancyDensity: 0.025,
    weekdaySchedule: [1, 1, 1, 1, 1, 1, 0.9, 0.7, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.6, 0.8, 0.9, 1, 1, 1, 1, 1],
    weekendSchedule: [1, 1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1, 1],
    internalHeatGain: 3,
    hotWaterDemand: 40,
  },
};

// ── Every assumption, named ───────────────────────────────────────────────

export type DuplexAssumption = Readonly<{ id: string; assumes: string; why: string }>;

export const DUPLEX_ASSUMPTIONS: readonly DuplexAssumption[] = Object.freeze([
  // ── What is counted, and what the file makes easy to miscount ──────────
  { id: "A-FLOOR-AREA", assumes: "The floor area is 284.98 m² over 18 rooms — the architectural Rooms only — where the file's 37 IfcSpace rows sum to 799.76 m² and its non-ROOF rows to 529.46 m².", why: "Duplex_M_20111024_ROOMS_AND_SPACES.ifc states every room twice: once as an architectural Room and once as the authoring tool's analytical Space, with the same Name, the same LongName, the same plan position and two different GlobalIds. Measured over all 37 rows, 18 carry all four Revit analysis property sets (Energy Analysis, Mechanical - Airflow, Electrical - Loads, Electrical - Lighting) and 19 carry none, with no partial matches, so the property-set signature separates them cleanly where neither name nor geometry can. The ROOM half is kept because its areas reproduce Duplex_A_20110907.ifc's own GSA BIM Area values exactly, and because A104 Bathroom 1 has a Room and no analytical Space at all — keeping the other half would lose a bathroom. The three totals are worth keeping straight: 799.76 is every row; the ROOF-name rule that already existed removes the two 135.151 m² roof planes and gives 529.46; de-duplicating gives 284.98. 529.46 is the figure that would have shipped, and floor area is the denominator of every intensity, so it would have published this building reading 46 % better than it is. scripts/lib/ifc-envelope.mjs classifyAnalyticalSpace carries the full account and the build asserts the 18/18 split rather than trusting it." },
  { id: "A-SKYLIGHTS", assumes: "The glazing aperture is 64.46 m² and OMITS 2 roof skylights totalling 1.49 m².", why: "Both are M_Skylight 1180 × 1170 mm, and both fill an IfcRoof rather than an IfcWall, so the opening walk — which resolves a host through IfcRelFillsElement and then requires that host to be in the exterior-wall set — cannot place them and reports them unresolved. They are real envelope glazing at a worse orientation than any wall opening, since a horizontal light sees the whole sky. The omission understates the aperture by 2.3 % and understates window loss by about the same, so this building reads marginally better than it is. Carried as a named omission rather than a placeholder because there is no substitute number in play: a placeholder invents a value, and this one is simply absent from the aperture. Fixing it needs the opening walk to accept a roof host and a horizontal sector, which is an extractor change and not this file's." },

  // ── The engine's own limits, disclosed ────────────────────────────────
  { id: "A-WWR-DENOMINATOR", assumes: "WWR 0.1893 against GROSS wall area (opaque 267.16 + glazing 64.46 + doors 8.96 = 340.58 m²).", why: "heat-loss.ts computes windows = gross × WWR and prices the remainder as opaque wall, so the ratio must be quoted against the same gross the engine is handed. Against the net 267.16 the ratio would read 0.2413, the windows would still land right, and 73.42 m² of real wall would be priced as nothing. Derived from the measured parts in code, never typed." },
  { id: "A-WWR-ENGINE-MEAN", assumes: "All four cardinal ratios handed to MaterialProperties are the single whole-building 0.1893, not the four measured per-sector ratios — and this stays true now that heat-loss.ts weights the mean by wall area.", why: "Measured through the real engine on 2026-09-06 after `meanWindowToWallRatio` landed, because the obvious next step turns out to be wrong in both directions. (1) Handing it the four measured per-sector ratios makes the building read BETTER than it is: the weight is `walls[].surfaceArea`, which is the NET opaque wall, while each ratio's denominator is that sector's GROSS wall, so the weighted mean comes out 0.16965 and the engine prices 57.78 m² of window against the 64.46 m² measured — 10 % of the glazing lost, 142.62 → 136.51 kWh/m²·yr. Quoting the ratios against net wall instead swings it the other way, to 82.17 m² and 158.83. (2) Doing it so the aperture IS reproduced — per-sector ratios against gross, weighted by gross — gives 0.189265, 64.46 m², 142.62 kWh/m²·yr: numerically IDENTICAL to the uniform ratio, to the last digit. That is an identity rather than a coincidence, Σ(rᵢ·grossᵢ)/Σgrossᵢ ≡ Σglazing/Σgross, so the measured split cannot move the whole-building mean at all; and it would need `surfaceArea` set to gross, which `aggregateWalls` in use-retrofit-scenario.ts reads as the opaque wall to size the insulation measure — 340.58 m² instead of 267.16. There is also no orientation-dependent consumer to reward the effort: heat-loss.ts collapses the four to one mean, and annual-demand.ts's solar gain uses the single collapsed window area against one whole-sky irradiance, not a per-facade one. So one ratio is applied, it reproduces the measured aperture exactly, and the eight measured ones stay in DUPLEX_WWR_BY_SECTOR for the legend and the ECO2 export, which are the only places a real split can currently say anything." },
  { id: "A-DOORS", assumes: "The 8.96 m² of exterior door leaves are priced at the wall U-value.", why: "The engine knows walls and windows and nothing between. A US residential entrance door is an insulated opaque leaf, so the wall U is the nearer of the two; leaving the doors out entirely would make the modelled envelope smaller than the building, and folding them into glazing would move the WWR denominator. Kept a separate measured field for the same reason the other two buildings keep one." },
  { id: "A-GROUND-DT", assumes: "The engine's 13.5 °C ground temperature and 4,380 h ground season.", why: "ISO 13370's U pairs with the annual-mean external air temperature and the engine applies a fixed 6.5 K drop instead. The mismatch is disclosed rather than reconciled, because reconciling it moves every other building in the app. On this building it matters more than on the other two: an uninsulated slab puts a far larger share of the total loss through the ground, so an error in the ground season is worth more here." },

  // ── Constructions ────────────────────────────────────────────────────
  { id: "A-LAYER-LAMBDAS", assumes: "Every λ behind these U-values is a mapping this repo chose, not a property the file states.", why: "All 97 IfcThermalTransmittanceMeasure in this model are literally 0., and they sit only on 67 windows and 30 doors — never on a wall, floor or roof, so envelope coverage is 0 %. Under this repo's documented-zero rule a recorded zero means unavailable, and a 0 W/m²K would be a perfect insulator, so none of them is read. The model carries no IfcMaterialProperties either, so it states layer names and thicknesses and nothing thermal. DUPLEX_LAYER_MAPPINGS in constructions.ts names one generic-library material per layer name with the reason for each; that table, and the EN 12524:2000 Table 1 design values behind the library, are where these numbers come from. Korean 별표 values are a substitution on a US building and are stated as one — see docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md." },
  { id: "A-STUD-CAVITY", assumes: "The wall's 41 mm Metal - Stud Layer is an unventilated air cavity, giving the exterior wall U 0.3404 W/m²K (R 2.937).", why: "THE LARGEST CONSTRUCTION ASSUMPTION IN THIS BUILDING, and the same one the Clinic makes for the same reason: the model names a stud layer and names nothing in it, so nothing is assumed to be in it. Filling the 41 mm with mineral wool would take the wall to U 0.2607 — 23 % better — and DUPLEX_EXTERIOR_WALL_STUD_INSULATED computes exactly that so the claim can be checked. Steel stud bridging is likewise ignored, which pushes the other way. Note the cavity is only 41 mm here against the Clinic's 152 mm, so the same assumption costs this building far less: the wall's insulation is the 50 mm of rigid board, which the model does state." },
  { id: "A-JOIST-ZONE", assumes: "The roof's 286 mm Wood - Dimensional Lumber layer is solid timber at λ 0.14, giving roof U 0.1871 W/m²K (R 5.346).", why: "It is the layer the model states, and constructions.ts solves assemblies the model states. But a 286 mm dimensional-lumber layer in a joist roof is not 286 mm of wood — it is joists at 400-600 mm centres with air or insulation between them, and ISO 6946 5.3.1's unsubdivided-layer premise does not hold for it. Solid timber gives that layer R 2.043, which is 38 % of the whole assembly's resistance; read instead as an unventilated cavity it gives R 0.17 and the roof lands at U 0.2879, 54 % worse. DUPLEX_ROOF_JOIST_ZONE_AS_CAVITY computes that reading. The stated layer is used and the reader is owed the direction: it is the OPTIMISTIC of the two, and the truth is between them, because a joist bay in a 2011 US roof usually holds batt insulation that this assembly does not name." },
  { id: "A-GREEN-ROOF", assumes: "The roof's outermost stated layer, 64 mm of Site - Grass, contributes NO thermal resistance and is dropped from the assembly.", why: "The assembly is named Live Roof over Wood Joist Flat Roof and its first layer is grass, so this is a planted roof as modelled and greenRoofCoverage is 1 rather than 0. What is not modelled is what the substrate does: a green roof's benefit is mostly evaporative cooling and thermal mass under summer sun, not conduction, and neither the generic material library nor the degree-day engine has a term for either. GENERIC_MATERIALS has no growing-medium row, and inventing a λ for 64 mm of soil would put a number in the stack that no table supports. Dropping it is the conservative direction — it removes resistance, so the roof reads worse than modelled. The reflectance 0.2 and emissivity 0.95 do describe vegetation rather than membrane." },
  { id: "A-ROOF-BARRIER", assumes: "The 6 mm Roofing - Barrier layer is dropped from the roof assembly.", why: "The name states a function and not a material — a vapour or root barrier, both of which are films whose resistance is negligible at 6 mm — and the library has no row for either. Dropping it removes at most about 0.02 m²K/W, 0.4 % of the roof's resistance, and in the direction that makes the roof read worse. Named rather than silently skipped, because a reader comparing the manifest's six stated layers with the four solved here is owed both absences." },
  { id: "A-CONCRETE-BLOCK-LAMBDA", assumes: "The 193 mm Masonry - Concrete Block is the library's concrete-brick entry at λ 0.8 W/m·K.", why: "GENERIC_MATERIALS has no hollow concrete-block row, and a US CMU is hollow: its cores make the real effective λ lower than solid blockwork, so this understates the wall's resistance and the building reads marginally worse than it is. Adding a CMU row belongs to the standards library's own traceability ledger, not to a reference building. The block is 8 % of this wall's resistance either way — the 50 mm of rigid board is 67 % of it — so the error is small against A-STUD-CAVITY and A-JOIST-ZONE." },
  { id: "A-GROUND-UNINSULATED", assumes: "The slab on grade has NO insulation: R_f is 127 mm of concrete alone, 0.0552 m²K/W, giving ground U 0.8159 W/m²K.", why: "That is what the file states — Floor:127mm Slab on Grade is a single Concrete layer and the model names no insulation above, below or at the edge of it. Nothing is added, and a 2011 US duplex on an uninsulated slab is an ordinary thing to have drawn rather than a modelling gap. The consequence is a different ISO 13370 branch from the other two buildings: d_t is 0.947 m against B' 3.754 m, so d_t < B' and the UNINSULATED equation applies, where the soil rather than the floor carries most of the resistance. Schependomlaan's insulated slab reads 0.1695 and the Clinic's 0.2370; this one is 4.8x the first and 3.4x the second, which makes the ground the lossiest element in this building and the one most sensitive to the soil assumption." },
  { id: "A-GROUND-ROW-IS-AIR-TO-AIR", assumes: "The ground floor's row in the 외피 구성 section reads U 4.029 W/m²K, not the 0.8159 the energy path uses.", why: "That section reports what a layer stack resists between inside air and outside air, which is not what a floor on the ground does: 127 mm of concrete is R 0.055, plus 0.193 of surface resistance, giving 4.029. The energy figure is ISO 13370's, where the soil is most of the path. The same split exists on both siblings — the Clinic's slab row reads 3.873 against 0.237, Schependomlaan's 0.2516 against 0.1695 — but here it is the widest of the three at 4.9x, because this slab is uninsulated and has almost nothing of its own to resist with. A reader looking at the section and the strip on the same screen sees 4.029 and 0.8159 and is owed the reason. DUPLEX_GROUND_FLOOR is the figure in the energy numbers; the section's row is the layer stack's own." },
  { id: "A-SOIL", assumes: "Soil conductivity 2.0 W/m·K under the slab, ISO 13370's own default when soil is unknown.", why: "Soil is never in a drawing set. On an insulated slab it moves the answer a few per cent; on this uninsulated one the soil IS most of the resistance, so the same uncertainty is worth several times more — DUPLEX_GROUND_FLOOR_RANGE spans 0.6518 (clay, λ 1.5) to 1.2142 (rock, λ 3.5) around the nominal 0.8159, a spread of −20 % to +49 %. On Schependomlaan's insulated slab the same clay-to-rock spread is only −8 % to +16 % (0.1553-0.1968 around 0.1695), which is the difference insulation makes to how much the soil matters. This range should be quoted whenever this building's ground loss is." },
  { id: "A-SUSPENDED-FLOOR", assumes: "The ground floor is a slab on ground and ISO 13370 §9.3 applies.", why: "The model states Floor:127mm Slab on Grade by name and the 6 Foundation - Concrete walls are below grade around it, so the slab case is what the file describes and there is no crawlspace datum to suggest otherwise. Recorded anyway because ground-coupling.ts implements the slab case only and throws rather than approximating the others, so the choice is also the only one this repo can compute." },

  // ── Openings, systems, people ────────────────────────────────────────
  { id: "A-GLAZING", assumes: "Whole-window U 2.8 W/m²K, SHGC 0.70, uncoated double glazing in an aluminium frame.", why: "The file states a U for its windows and that U is 0., which under the documented-zero rule means unavailable rather than perfect, so nothing is read from it. The windows are M_Fixed and M_Casement families with no glazing specification and no frame material stated. 2.8 is what uncoated double glazing in a thermally unbroken aluminium frame achieves and is the ordinary US 2011 residential window where no better performance is specified; it is far worse than Schependomlaan's 1.6, which is the point — that building states an HR++ frame profile and this one states nothing. The value is a placeholder shaped like the era and is not read from the file. It is the single input a real specification would most improve." },
  { id: "A-AIRTIGHT", assumes: "ACH50 = 7.0 h⁻¹, an era-shaped figure and not a measurement, giving the engine a natural infiltration rate of 0.35 h⁻¹.", why: "No blower-door result exists for this building and none can be inferred from a coordination model. 7.0 h⁻¹ is a typical pre-retrofit US detached or semi-detached dwelling of this era; it is not a code value and not a measurement. The engine divides ACH50 by 20 to reach a natural rate of 0.35 h⁻¹ — that divisor is the one this repo's regression tests protect and it is what makes the figure quotable at all. Against Schependomlaan's derived 2.05 this building is modelled as more than three times leakier, which is the direction a 2011 US masonry-and-stud duplex sits against a 2015 Dutch apartment built to NTA 8800, but the figure itself is an era-shaped assumption and should be argued with." },
  { id: "A-VOLUME", assumes: "The ventilation term uses the gross conditioned volume, 854.79 m³, not the 639.88 m³ the room solids sum to.", why: "The file states no volume quantity; both figures are measured from it. The gross is room floor area × storey floor-to-floor, i.e. everything inside the air barrier, which is what an infiltration rate is defined against. The net is the 18 room solids as modelled, which stop at the ceilings. Choosing the net would cut infiltration loss by 25 % for air that is inside the envelope. Both figures already exclude the 18 analytical duplicates, which would otherwise have doubled each of them." },
  { id: "A-HVAC", assumes: "Individual gas heating at η 0.80, split cooling at COP 3.0, natural ventilation, gas DHW at η 0.80.", why: "This building has THREE services models — Duplex_MEP (924 elements), Duplex_Electrical (100) and Duplex_Plumbing (498) — and they are the reason it was chosen, so what they do and do not state is worth being exact about. They state geometry, position and product type in abundance. They state no efficiency, no capacity, no COP and no fuel for any plant item. Two of the three state no network either: the HVAC and electrical models declare ZERO distribution ports, so their topology cannot be traced at all, and only the plumbing model carries any (970 ports, 485 connections, 190 of them directed and 295 bidirectional). Even there the direction is thin — the model declares no plant node, so all 190 directed segments fall to the default label rather than being traced from a source, and the supply/return split those segments carry is not a measurement (A-FLOW-DIRECTION). So the systems here are era-shaped placeholders exactly as on the other two buildings, and the services models' value is that they can be SEEN, not that they can be read. Cooling is modelled as present, unlike Schependomlaan, because a 2011 US dwelling has it." },
  { id: "A-FLOW-DIRECTION", assumes: "The plumbing layer's 190 directed segments carry NO trustworthy supply/return split, and the two other services layers carry no network at all.", why: "Measured per layer rather than assumed, because the three differ. HVAC: 0 ports, so no topology — the flow note says so and that is the whole truth about it. Electrical: 0 ports, likewise, which matches the Clinic's electrical model. Plumbing: 970 ports and 485 connections, of which 190 state a direction and 295 are declared bidirectional. The part to distrust is the split. This model declares ZERO plant nodes — it is the first layer in this app to have directed edges and no plant, where every directed Clinic layer has at least two — and supply/return is propagated from a plant, so with none to propagate from all 190 segments fall to one side and the manifest reads supplySegments 0, returnSegments 190. Those two numbers are correct counts of a classification that had nothing to classify against. The workspace's flow note renders them as '0 downstream of plant, 190 upstream', which is arithmetically exact and describes a plant this file does not contain; a domestic plumbing model is mostly supply to fixtures and gravity drainage, so 'all return' is not merely unproven but the wrong picture. Not fixed here: reference-building-workspace.tsx belongs to the information-contract lane and this is reported to it rather than patched from this file." },
  { id: "A-LPD", assumes: "Lighting power density 6 W/m², manual control, fluorescent lamps.", why: "The electrical model states 100 elements including luminaires and their positions, and states no wattage for any of them, so the load is not readable from it. Rather than invent a US residential allowance this takes the repo's own 공동주택 row (korean-building-codes.ts:176), the same substitution Schependomlaan makes and stated the same way. The lamp type is the era's rather than the file's: 2011 US residential lighting was predominantly CFL and incandescent, and 'fluorescent' is the nearer of the enum's options to that." },
  { id: "A-OCCUPANCY", assumes: "0.025 persons/m², residential day schedules, and the repo's own 공동주택 figures for internal gain (3) and hot water (40).", why: "No occupancy data exists in a coordination model. Density IS read (delivered-from-demand.ts:41) and this figure puts about 7 people in the building, i.e. 3.6 per dwelling across two 142 m² units — reasonable for a duplex and derived from the room evidence (each unit has a living room, a kitchen, two bedrooms and two bathrooms, so two dwellings of three to four people). Internal gain and hot water are NOT read anywhere in src/lib/energy, and hotWaterDemand has no unit in material-types.ts at all, so both take the repo's own residential row rather than a derived figure whose unit this file would be inventing. The schedules are the generic dwelling shape, the same as Schependomlaan's." },
  { id: "A-CLIMATE", assumes: "A Korean climate (Seoul) for a US building.", why: "This model states NO location, which is a stronger statement than Schependomlaan's unusable one. Three independent tells, all in the file: IfcSite.Name is the literal string 'Default'; IfcPostalAddress.AddressLines is still the authoring tool's placeholder prompt 'Enter address here'; and RefElevation is a signed zero. The 41.8744 N, 87.6394 W coordinate and the 'Chicago', 'IL' town and region are the unfilled Revit 2011 template's own, so no climate may be taken from them — this is the same position as the Clinic, reached by different evidence. The engine's regional table is Korean-only, so Seoul is a substitution and every kWh and every grade from this file is a Korean-climate reading of a US building. Chicago is in fact considerably colder and slightly less humid than Seoul in winter, so a real Chicago run would show MORE heating demand than this file reports — but that is an argument for sourcing a Chicago degree-day row, not for treating the template's coordinate as a location." },
  { id: "A-GRADE-IS-KOREAN", assumes: "Any 건축물 에너지효율등급 shown for this building is a Korean grade computed under a Seoul climate for a US building.", why: "The grade boundaries are Korean primary-energy thresholds and the climate is a substitution (A-CLIMATE), so the letter is not a statement about how this building would be rated where it stands — there is no 'where it stands' (A-CLIMATE again). It is a like-for-like comparison against the other buildings in this app, which is what it is for. Stated as its own assumption because a grade badge is the single most quotable thing on the page and reads as an official rating unless it says otherwise." },

  // ── Scope and shape ──────────────────────────────────────────────────
  { id: "A-WALL-SET-SCOPE", assumes: "267.16 m² of Exterior - Brick on Block is the building's whole opaque wall, from 12 of the model's 57 walls.", why: "IsExternal is true on 23 of the 57 and only 13 of those are envelope, so IsExternal is not the filter — third building, third way it fails. The ten it wrongly includes are 4 Party Wall - CMU Residential Unit Dimising Wall, which separate the two dwellings and are conditioned on both sides so no heat crosses them, and 6 Foundation - Concrete, which are below grade and a different boundary condition with a different U. The set is taken by assembly name instead. What that leaves out: nothing identified so far, but the exterior wall above the roof datum is 55.56 m² of the 267.16 — a fifth of it — which for a two-storey building with a flat roof means parapets and the stair enclosure, and those are envelope on both faces in a way a single-sided area does not capture." },
  { id: "A-NORTH", assumes: "North is the model's −Z, and the four zero diagonal sectors are real.", why: "TrueNorth is absent ($) in BOTH the Model and Plan representation contexts — not the schema default that Schependomlaan carries, but nothing at all — so the model states no orientation and project north is used. manifest.orientation reports offCardinalCount 0 and offCardinalSqm 0 over all 12 exterior walls, so no wall area is being rounded into a cardinal it does not belong to; the building is genuinely rectilinear. Every per-orientation figure in this file, including the measured glazing split that A-WWR-ENGINE-MEAN turns on, rests on the assumption that project north is true north. If the building is rotated, N/S and E/W swap and the uneven glazing swaps with them." },
  { id: "A-NO-FOOTPRINT", assumes: "The recipe's footprint is an 11.39 m square.", why: "The square has the measured ground slab's area and no relation to the building's shape, which is a long rectangle of two mirrored units. Nothing in the energy path reads it: measuredEnvelope short-circuits envelopeQuantities, which is the only reason a shape-free stand-in is admissible at all." },
  { id: "A-ENVELOPE-SOURCE", assumes: "Envelope areas come from the measured manifest, not from the recipe's footprint.", why: "Extruding the square would give 4 × 11.39 × 6.00 = 273 m² of wall against the 340.58 m² this building's own solids measure, and a roof of 129.69 m² against the 132.93 m² the roof element states. The areas travel on the recipe as measuredEnvelope and envelopeQuantities returns them with source 'measured' — and on this building, unlike Schependomlaan, that source string means what it says: every field of DUPLEX_MEASURED_ENVELOPE reads 'manifest' or 'derived_from_manifest' in its provenance map, with the single named exception of the skylights in A-SKYLIGHTS." },
  { id: "A-ERA", assumes: "Era 2010-2019, use code 02000 (공동주택), structure code 22 (조적조).", why: "The IFC header is dated 2011-09-07 and names Autodesk Revit Architecture 2011, so the era is evidence. What it does NOT do is decide any number here: the era selects Korean code-table defaults for values not overridden, and every U-value, WWR and airtightness figure in this file is overridden explicitly, leaving the era's effect on cosmetic recipe fields only. The use code is the register's nearest row — a two-dwelling house is not what 공동주택 usually names, but the alternative 단독주택 rows are single-dwelling and this is two. The structure code is likewise nearest available: brick-on-block cavity walls with wood joist floors have no row in the register's vocabulary, and 조적조 is the closest." },
]);
