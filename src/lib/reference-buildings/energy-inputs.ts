// src/lib/reference-buildings/energy-inputs.ts
//
// What a reference building hands the demo's energy path — the same two
// objects `/building/demo` seeds (`BuildingRecipe` + `MaterialProperties`),
// plus the things a register row would have supplied and an authored model
// cannot: a climate (chosen, never read from a redacted site) and the list of
// every assumption behind the numbers.
//
// A building without an entry here renders its model page without the energy
// frame. That is the honest state for one whose inputs have not been built:
// the frame appearing with defaults would be a number nobody derived.

import type { BuildingRecipe } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import type { ReferenceBuildingId } from "./manifest";
import { REFERENCE_BUILDING_PK_PREFIX } from "./pk";
import {
  CLINIC_ASSUMPTIONS,
  CLINIC_MATERIALS,
  CLINIC_MEASURED_ENVELOPE,
  CLINIC_RECIPE,
} from "./bs-medical-dental-clinic-energy";
import {
  SCHEPENDOMLAAN_ASSUMPTIONS,
  SCHEPENDOMLAAN_MATERIALS,
  SCHEPENDOMLAAN_MEASURED_ENVELOPE,
  SCHEPENDOMLAAN_PENDING_MEASUREMENTS,
  SCHEPENDOMLAAN_RECIPE,
} from "./schependomlaan-energy";
import {
  DUPLEX_ASSUMPTIONS,
  DUPLEX_DOOR_BY_SECTOR_SQM,
  DUPLEX_GLAZING_BY_SECTOR_SQM,
  DUPLEX_MATERIALS,
  DUPLEX_MEASURED_ENVELOPE,
  DUPLEX_RECIPE,
  DUPLEX_WALL_BY_SECTOR_SQM,
} from "./duplex-apartment-energy";
import {
  FZK_HAUS_ASSUMPTIONS,
  FZK_HAUS_DOOR_BY_SECTOR_SQM,
  FZK_HAUS_GLAZING_BY_SECTOR_SQM,
  FZK_HAUS_MATERIALS,
  FZK_HAUS_MEASURED_ENVELOPE,
  FZK_HAUS_RECIPE,
  FZK_HAUS_WALL_BY_SECTOR_SQM,
} from "./fzk-haus-energy";

export type Orientation = "N" | "S" | "E" | "W";

export type ReferenceBuildingEnergyInputs = Readonly<{
  /**
   * Store key. Prefixed so it can never collide with a 건축물대장
   * 관리번호 (`mgmBldrgstPk`), and so anything that inspects the key can
   * tell an authored model from a register row.
   */
  buildingPk: string;
  recipe: BuildingRecipe;
  materials: MaterialProperties;
  assumptions: readonly Readonly<{ id: string; assumes: string; why: string }>[];
  /**
   * The climate the numbers are computed in. `sigunguCd` is what the
   * engine's regional lookup reads (the first two digits select the 시도);
   * `assumptionId` names the entry in `assumptions` that says why this
   * climate and not the building's own.
   */
  climate: Readonly<{
    sigunguCd: string;
    labelKo: string;
    labelEn: string;
    assumptionId: string;
  }>;
  /** Measured opaque wall by compass sector, m². Sums to the net wall. */
  wallByOrientationSqm: Readonly<Record<Orientation, number>>;
  /** True when the model states no true north and the split uses project north. */
  northAssumed: boolean;
  /**
   * GROSS exterior wall per cardinal sector, m² — opaque + glazing + doors.
   *
   * The area each per-orientation WWR is quoted AGAINST, and therefore the
   * only correct weighting for `meanWindowToWallRatio` and the only correct
   * denominator for a per-orientation legend row. Absent where a building has
   * measured its opaque wall per sector but not its openings; the legend then
   * apportions the whole gross by each sector's opaque share, which is exact
   * while the ratios are uniform and is the reason they must be.
   */
  grossWallByOrientationSqm?: Readonly<Record<Orientation, number>>;
  /**
   * Roof typology, and the roof rows it was read from.
   *
   * This exists because `roofType` decides two user-visible things and was
   * hard-coded `"flat"` for every building until 2026-09-06: the PV measure's
   * roof-utilisation factor (flat 0.7, gable 0.5, hip 0.4, sawtooth 0.3) and
   * the measure's own NAME, which renders as "Solar PV (flat roof, 373 kWp)".
   * A tiled 63° roof described as a flat roof on screen is the label lying
   * about the number beside it.
   *
   * Optional, and an absence is RENDERED as an absence rather than defaulted:
   * a building whose file states no typology says so in the retrofit basis
   * line instead of quietly being called flat.
   */
  roof?: Readonly<{
    type: "flat" | "gable" | "hip" | "sawtooth";
    /** The manifest rows and the area-weighted tilt behind the choice. */
    read: string;
  }>;
  /**
   * Measured exterior door aperture, m².
   *
   * The engine knows walls and windows and nothing between, so it prices
   * doors at the wall U (A-DOORS) and its "Walls" element is `gross −
   * aperture`, doors included. A wall-INSULATION measure is a different
   * question: nobody insulates a door. Stating the door area here is what
   * lets the measure be sized at `gross − aperture − doors` while the
   * engine's own element stays intact. Absent means the file states no door
   * area, and the measure then covers the whole wall element and says so.
   */
  exteriorDoorSqm?: number;
  /**
   * Absent, or `"complete"`, when every envelope area behind these numbers is
   * measured. `"awaiting_measurement"` when some are stand-ins — and then
   * `pendingMeasurements` says which, what they stand in for and which way
   * each one is wrong.
   *
   * This exists because `envelopeQuantities` reports `source: "measured"` for
   * anything travelling on `recipe.measuredEnvelope`, placeholder or not: it
   * refuses a zero or a NaN, so a stand-in has to be a real positive number
   * and is indistinguishable from a measurement once it is inside the object.
   * Nothing downstream can tell the difference unless the registry says so.
   */
  measurementState?: "complete" | "awaiting_measurement";
  pendingMeasurements?: readonly Readonly<{
    manifestField: string;
    constant: string;
    placeholderValue: number;
    unit: "m2" | "m";
    derivedFrom: string;
    biasDirection: string;
    /**
     * Which way this stand-in moves the MODELLED ENVELOPE, as a value rather
     * than as prose.
     *
     * `summarisePendingBias` used to sniff `biasDirection` for a leading
     * "Understates". On the apartment that matched the per-sector glazing
     * row, whose text is "Understates the spread" — a statement about how
     * glazing is DISTRIBUTED between elevations, not about how much envelope
     * there is — and the badge turned it into "1 understates the envelope, so
     * the grade will likely fall". Right instinct, wrong noun, in a sentence
     * that predicts a grade.
     *
     * `"distribution"` is the row whose error is in the split and not the
     * magnitude; it is counted as neither direction.
     */
    envelopeBias: "understates" | "overstates" | "neutral" | "unknown" | "distribution";
  }>[];
}>;

export function referenceBuildingPk(id: ReferenceBuildingId): string {
  return `${REFERENCE_BUILDING_PK_PREFIX}${id}`;
}

const CLINIC: ReferenceBuildingEnergyInputs = Object.freeze({
  buildingPk: referenceBuildingPk("bs-medical-dental-clinic"),
  recipe: CLINIC_RECIPE,
  materials: CLINIC_MATERIALS,
  assumptions: CLINIC_ASSUMPTIONS,
  climate: Object.freeze({
    // "11" is 서울특별시's 시도 code, which is all `getClimateData` reads.
    // Not a 시군구: the building has no district, and inventing one would
    // put a real 구 name on a US building.
    sigunguCd: "11",
    labelKo: "서울 기후 (가정)",
    labelEn: "Seoul climate (assumed)",
    assumptionId: "A-CLIMATE",
  }),
  wallByOrientationSqm: CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm,
  northAssumed: CLINIC_MEASURED_ENVELOPE.northAssumed,
  // Flat, and not because everything on it is flat. The 12 `roofs` rows split
  // two ways: EPDM deck at tiltDeg 0.0 and standing-seam barrel at an
  // area-weighted 17.9°. Over the 2,667.38 m² the engine actually prices
  // (CLINIC_ROOF_AREA_SQM: the exposed EPDM plus the barrels) that is a mean
  // of 3.05°, so the flat-deck utilisation factor is the right one of the
  // four and the 17 % of barrel is the error that choice carries.
  roof: Object.freeze({
    type: "flat" as const,
    read: "12 roof rows · EPDM deck 2,212.38 m² at 0.0° + standing seam 455.00 m² at 17.9° → area-weighted 3.05° over the 2,667.38 m² priced",
  }),
  exteriorDoorSqm: CLINIC_MEASURED_ENVELOPE.exteriorDoorSqm,
  measurementState: "complete",
});

const SCHEPENDOMLAAN: ReferenceBuildingEnergyInputs = Object.freeze({
  buildingPk: referenceBuildingPk("schependomlaan"),
  recipe: SCHEPENDOMLAAN_RECIPE,
  materials: SCHEPENDOMLAAN_MATERIALS,
  assumptions: SCHEPENDOMLAAN_ASSUMPTIONS,
  climate: Object.freeze({
    // Seoul again, and for a sharper reason than the Clinic's. The Clinic's
    // location is unknown; this building's is KNOWN — Nijmegen is stated on
    // both IfcSite and IfcBuilding — and simply cannot be used, because
    // `getClimateData` reads a Korean 시도 code and has no Netherlands row.
    // A sourced KNMI degree-day entry for Nijmegen is the fix. See A-CLIMATE.
    sigunguCd: "11",
    labelKo: "서울 기후 (가정)",
    labelEn: "Seoul climate (assumed)",
    assumptionId: "A-CLIMATE",
  }),
  // The four cardinals. The manifest also carries NE/SE/SW/NW and all four
  // are 0 by measurement, not by omission — every one of this model's 122
  // inner-leaf walls is cardinal. `SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM` keeps
  // the full eight, which is the shape Lane B's glazing split arrives in.
  wallByOrientationSqm: Object.freeze({
    N: SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.N,
    E: SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.E,
    S: SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.S,
    W: SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.W,
  }),
  northAssumed: SCHEPENDOMLAAN_MEASURED_ENVELOPE.northAssumed,
  // Pitched, and the `roofing` layer on this page is 기와 — 4,293 tile
  // elements. Of the 542.96 m² the engine prices (A-ROOF-STACK), 306.00 m² is
  // the tiled sporenkap whose 44 rows carry an area-weighted 63.2° tilt, and
  // 236.96 m² is flat deck; over the priced surface that is a mean of 35.6°.
  // "gable" is the only pitched typology the solar model offers and its 0.5
  // utilisation is the nearest of the four — NOT a claim that the roof is a
  // simple two-sided gable, which the 78 roof rows do not say.
  roof: Object.freeze({
    type: "gable" as const,
      read: "78 roof rows · tiled sporenkap 306.00 m² at 63.2° + flat deck 236.96 m² at 0.0° → area-weighted 35.62° over the 542.96 m² priced",
  }),
  exteriorDoorSqm: SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorDoorSqm,
  // NOT complete. Three envelope areas — glazing, per-sector glazing and
  // doors — are stand-ins awaiting bim-bf's extractor pass (roof and ground
  // landed 2026-09-04), and the frame this registry feeds will happily
  // render them as though they were measured unless something says otherwise.
  measurementState: "awaiting_measurement",
  pendingMeasurements: SCHEPENDOMLAAN_PENDING_MEASUREMENTS,
});

const DUPLEX: ReferenceBuildingEnergyInputs = Object.freeze({
  buildingPk: referenceBuildingPk("duplex-apartment"),
  recipe: DUPLEX_RECIPE,
  materials: DUPLEX_MATERIALS,
  assumptions: DUPLEX_ASSUMPTIONS,
  climate: Object.freeze({
    // Seoul a third time, and here for the strongest reason of the three.
    // The Clinic's location is unknown and Schependomlaan's is known but
    // unusable; this model states NO location — its IfcSite is an unfilled
    // Revit template whose postal address line still reads the placeholder
    // "Enter address here". Its Chicago coordinate is the template's, not
    // the building's. See A-CLIMATE.
    sigunguCd: "11",
    labelKo: "서울 기후 (가정)",
    labelEn: "Seoul climate (assumed)",
    assumptionId: "A-CLIMATE",
  }),
  // The four cardinals. The other four sectors are 0 by measurement, not by
  // omission: `manifest.orientation` reports offCardinalCount 0 over all 12
  // exterior walls. `DUPLEX_WALL_BY_SECTOR_SQM` keeps the full eight.
  wallByOrientationSqm: Object.freeze({
    N: DUPLEX_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.N,
    E: DUPLEX_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.E,
    S: DUPLEX_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.S,
    W: DUPLEX_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.W,
  }),
  northAssumed: DUPLEX_MEASURED_ENVELOPE.northAssumed,
  // Flat, and unambiguously so: the manifest carries ONE roof row, "Live Roof
  // over Wood Joist Flat Roof", 132.93 m² at tiltDeg 0.00. No weighting to
  // do and no barrel to disclose.
  roof: Object.freeze({
    type: "flat" as const,
    read: "1 roof row · Live Roof over Wood Joist Flat Roof 132.93 m² at 0.00° → area-weighted 0.00° over the 132.93 m² priced",
  }),
  exteriorDoorSqm: DUPLEX_MEASURED_ENVELOPE.exteriorDoorSqm,
  // The first building that can state this: its glazing and doors ARE
  // measured per sector, so each legend row gets its own true denominator
  // instead of the whole gross apportioned by opaque share.
  grossWallByOrientationSqm: Object.freeze({
    N: DUPLEX_WALL_BY_SECTOR_SQM.N + DUPLEX_GLAZING_BY_SECTOR_SQM.N + DUPLEX_DOOR_BY_SECTOR_SQM.N,
    E: DUPLEX_WALL_BY_SECTOR_SQM.E + DUPLEX_GLAZING_BY_SECTOR_SQM.E + DUPLEX_DOOR_BY_SECTOR_SQM.E,
    S: DUPLEX_WALL_BY_SECTOR_SQM.S + DUPLEX_GLAZING_BY_SECTOR_SQM.S + DUPLEX_DOOR_BY_SECTOR_SQM.S,
    W: DUPLEX_WALL_BY_SECTOR_SQM.W + DUPLEX_GLAZING_BY_SECTOR_SQM.W + DUPLEX_DOOR_BY_SECTOR_SQM.W,
  }),
  // Complete, and this is the first building here whose per-orientation
  // GLAZING is measured rather than spread pro rata — so the per-sector WWR
  // legend on this page shows the building's real asymmetry (N 0.36 / E 0.10
  // / S 0.37 / W 0.11) instead of one ratio repeated four times.
  //
  // "Complete" is a claim about the AREAS, not about the building. Its
  // constructions carry three large stated assumptions (A-STUD-CAVITY,
  // A-JOIST-ZONE, A-GROUND-UNINSULATED) and one measured area is knowingly
  // short by 1.49 m² of skylight (A-SKYLIGHTS). Those are in the assumption
  // ledger, which is where a reader is meant to find them.
  measurementState: "complete",
});

const FZK_HAUS: ReferenceBuildingEnergyInputs = Object.freeze({
  buildingPk: referenceBuildingPk("fzk-haus"),
  recipe: FZK_HAUS_RECIPE,
  materials: FZK_HAUS_MATERIALS,
  assumptions: FZK_HAUS_ASSUMPTIONS,
  climate: Object.freeze({
    // Seoul a fourth time. Unlike the other three, this building's site is
    // both KNOWN and PRECISE — IfcSite states 49.100435N 8.436539E to the
    // arc-second, plotting to Forschungszentrum Karlsruhe / KIT Campus North
    // — and still cannot be used: getClimateData reads a Korean 시도 code and
    // has no Germany row. Karlsruhe is milder in winter and has a smaller
    // cooling load than Seoul. See A-CLIMATE.
    sigunguCd: "11",
    labelKo: "서울 기후 (가정)",
    labelEn: "Seoul climate (assumed)",
    assumptionId: "A-CLIMATE",
  }),
  // The four cardinals — but unlike every other building here, this one's
  // TRUE walls are all diagonal (NE/SE/SW/NW), because the file states a
  // real 50° true-north rotation. These four keys carry the diagonal areas
  // relabelled onto them (NE→N, SE→E, SW→S, NW→W) so the total is preserved;
  // reading them as literal compass directions for THIS building is wrong.
  // See A-NORTH-ROTATED. FZK_HAUS_WALL_BY_SECTOR_SQM carries the true split.
  wallByOrientationSqm: Object.freeze({
    N: FZK_HAUS_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.NE,
    E: FZK_HAUS_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.SE,
    S: FZK_HAUS_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.SW,
    W: FZK_HAUS_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.NW,
  }),
  northAssumed: FZK_HAUS_MEASURED_ENVELOPE.northAssumed,
  // Two equal pitches, unambiguously: Dach-1 and Dach-2, 71.5 m² projected
  // each at 30.0°, so the area-weighted tilt is exactly 30.0° — no barrel,
  // no mixed family to disclose. Priced surface (171.13 m²) is the
  // projected area over cos(30°), same relation as every other building.
  roof: Object.freeze({
    type: "gable" as const,
    read: "2 roof rows · Dach-1 71.5 m² (projected) at 30.0° + Dach-2 71.5 m² (projected) at 30.0° → area-weighted 30.0° over the 171.13 m² priced",
  }),
  exteriorDoorSqm: FZK_HAUS_MEASURED_ENVELOPE.exteriorDoorSqm,
  // The first building after the Duplex whose glazing AND doors are measured
  // per sector — real, not spread pro rata — so this states the true gross
  // denominator per relabelled cardinal, same NE→N/SE→E/SW→S/NW→W mapping
  // as wallByOrientationSqm above.
  grossWallByOrientationSqm: Object.freeze({
    N: FZK_HAUS_WALL_BY_SECTOR_SQM.NE + FZK_HAUS_GLAZING_BY_SECTOR_SQM.NE + FZK_HAUS_DOOR_BY_SECTOR_SQM.NE,
    E: FZK_HAUS_WALL_BY_SECTOR_SQM.SE + FZK_HAUS_GLAZING_BY_SECTOR_SQM.SE + FZK_HAUS_DOOR_BY_SECTOR_SQM.SE,
    S: FZK_HAUS_WALL_BY_SECTOR_SQM.SW + FZK_HAUS_GLAZING_BY_SECTOR_SQM.SW + FZK_HAUS_DOOR_BY_SECTOR_SQM.SW,
    W: FZK_HAUS_WALL_BY_SECTOR_SQM.NW + FZK_HAUS_GLAZING_BY_SECTOR_SQM.NW + FZK_HAUS_DOOR_BY_SECTOR_SQM.NW,
  }),
  // Complete: every envelope figure is read from the manifest or from the
  // file's own stated per-element U-values — the first building here with
  // no placeholder of any kind. Its known gap is the orientation LABEL
  // (A-NORTH-ROTATED), not a missing measurement.
  measurementState: "complete",
});

const ENERGY_INPUTS: Readonly<Record<ReferenceBuildingId, ReferenceBuildingEnergyInputs | null>> =
  Object.freeze({
    "bs-medical-dental-clinic": CLINIC,
    schependomlaan: SCHEPENDOMLAAN,
    "duplex-apartment": DUPLEX,
    "fzk-haus": FZK_HAUS,
  });

export function referenceBuildingEnergyInputs(
  id: ReferenceBuildingId,
): ReferenceBuildingEnergyInputs | null {
  return ENERGY_INPUTS[id] ?? null;
}
