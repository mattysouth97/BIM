// src/lib/energy/eco2-hvac-codes.ts
// Lookup table mapping every HVAC systemType/fuelType enum value the
// codebase can emit (materials.hvac.*, see src/lib/material-types.ts
// HVACProperties and src/lib/material-inference.ts) to a provisional
// ECO2/KS F 1900-style code string + Korean label.
//
// PROVISIONAL — pending GX auditor sign-off (plan risk R3); KS F 1900 is
// paywalled. Do not treat these codes as validated against the standard
// until a GX auditor sign-off is recorded (see
// .omc/plans/bim-fidelity-strategy-plan.md Step 3). Unknown values consumed
// by buildSubSystems()/lookup helpers below must map to "UNKNOWN" and
// surface a warning, not a silent pass.

import type { HVACProperties } from "@/lib/material-types";

export interface Eco2HvacCode {
  /** Provisional KS F 1900-style code string */
  code: string;
  /** Korean label for the system/fuel type */
  labelKo: string;
}

const UNKNOWN_CODE: Eco2HvacCode = { code: "UNKNOWN", labelKo: "미상" };

/** materials.hvac.heating.systemType → provisional code + Korean label */
export const HEATING_SYSTEM_TYPE_CODES: Record<
  HVACProperties["heating"]["systemType"],
  Eco2HvacCode
> = {
  individual: { code: "HTG-IND", labelKo: "개별난방" },
  central: { code: "HTG-CEN", labelKo: "중앙난방" },
  district: { code: "HTG-DST", labelKo: "지역난방" },
};

/** materials.hvac.heating.fuelType → provisional code + Korean label */
export const HEATING_FUEL_TYPE_CODES: Record<
  HVACProperties["heating"]["fuelType"],
  Eco2HvacCode
> = {
  gas: { code: "FUEL-GAS", labelKo: "가스" },
  electric: { code: "FUEL-ELEC", labelKo: "전기" },
  oil: { code: "FUEL-OIL", labelKo: "유류" },
  "district-heat": { code: "FUEL-DST", labelKo: "지역난방열" },
  "heat-pump": { code: "FUEL-HP", labelKo: "히트펌프" },
};

/** materials.hvac.cooling.systemType → provisional code + Korean label */
export const COOLING_SYSTEM_TYPE_CODES: Record<
  HVACProperties["cooling"]["systemType"],
  Eco2HvacCode
> = {
  split: { code: "CLG-SPLIT", labelKo: "분리형 에어컨" },
  "central-chiller": { code: "CLG-CHILLER", labelKo: "중앙 냉동기" },
  vrf: { code: "CLG-VRF", labelKo: "가변냉매유량(VRF)" },
  none: { code: "CLG-NONE", labelKo: "냉방설비 없음" },
};

/** materials.hvac.ventilation.type → provisional code + Korean label */
export const VENTILATION_TYPE_CODES: Record<
  HVACProperties["ventilation"]["type"],
  Eco2HvacCode
> = {
  natural: { code: "VENT-NAT", labelKo: "자연환기" },
  "mechanical-exhaust": { code: "VENT-EXH", labelKo: "기계배기" },
  "mechanical-supply": { code: "VENT-SUP", labelKo: "기계급기" },
  "heat-recovery": { code: "VENT-HRV", labelKo: "열회수환기" },
};

/** materials.hvac.dhw.systemType → provisional code + Korean label */
export const DHW_SYSTEM_TYPE_CODES: Record<
  HVACProperties["dhw"]["systemType"],
  Eco2HvacCode
> = {
  "gas-boiler": { code: "DHW-GASB", labelKo: "가스보일러" },
  electric: { code: "DHW-ELEC", labelKo: "전기온수기" },
  "heat-pump": { code: "DHW-HP", labelKo: "히트펌프 급탕" },
  "solar-thermal": { code: "DHW-SOLAR", labelKo: "태양열 급탕" },
};

function lookup<T extends string>(
  table: Record<T, Eco2HvacCode>,
  value: string
): Eco2HvacCode {
  return (table as Record<string, Eco2HvacCode>)[value] ?? UNKNOWN_CODE;
}

export function getHeatingSystemTypeCode(
  systemType: string
): Eco2HvacCode {
  return lookup(HEATING_SYSTEM_TYPE_CODES, systemType);
}

export function getHeatingFuelTypeCode(fuelType: string): Eco2HvacCode {
  return lookup(HEATING_FUEL_TYPE_CODES, fuelType);
}

export function getCoolingSystemTypeCode(
  systemType: string
): Eco2HvacCode {
  return lookup(COOLING_SYSTEM_TYPE_CODES, systemType);
}

export function getVentilationTypeCode(type: string): Eco2HvacCode {
  return lookup(VENTILATION_TYPE_CODES, type);
}

export function getDhwSystemTypeCode(systemType: string): Eco2HvacCode {
  return lookup(DHW_SYSTEM_TYPE_CODES, systemType);
}
