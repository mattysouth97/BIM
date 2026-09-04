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
});

const ENERGY_INPUTS: Readonly<Record<ReferenceBuildingId, ReferenceBuildingEnergyInputs | null>> =
  Object.freeze({
    "bs-medical-dental-clinic": CLINIC,
    // Built and published 2026-09-04; its recipe/materials pair is not yet
    // written. Null renders the page without the frame rather than with a
    // frame full of defaults.
    schependomlaan: null,
  });

export function referenceBuildingEnergyInputs(
  id: ReferenceBuildingId,
): ReferenceBuildingEnergyInputs | null {
  return ENERGY_INPUTS[id] ?? null;
}
