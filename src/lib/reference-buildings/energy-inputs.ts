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
  // NOT complete. Six envelope areas are stand-ins awaiting bim-bf's
  // extractor pass, and the frame this registry feeds will happily render
  // them as though they were measured unless something says otherwise.
  measurementState: "awaiting_measurement",
  pendingMeasurements: SCHEPENDOMLAAN_PENDING_MEASUREMENTS,
});

const ENERGY_INPUTS: Readonly<Record<ReferenceBuildingId, ReferenceBuildingEnergyInputs | null>> =
  Object.freeze({
    "bs-medical-dental-clinic": CLINIC,
    schependomlaan: SCHEPENDOMLAAN,
  });

export function referenceBuildingEnergyInputs(
  id: ReferenceBuildingId,
): ReferenceBuildingEnergyInputs | null {
  return ENERGY_INPUTS[id] ?? null;
}
