import { describe, it, expect } from "vitest";
import {
  HEATING_SYSTEM_TYPE_CODES,
  HEATING_FUEL_TYPE_CODES,
  COOLING_SYSTEM_TYPE_CODES,
  VENTILATION_TYPE_CODES,
  DHW_SYSTEM_TYPE_CODES,
  getHeatingSystemTypeCode,
  getHeatingFuelTypeCode,
  getCoolingSystemTypeCode,
  getVentilationTypeCode,
  getDhwSystemTypeCode,
} from "../eco2-hvac-codes";
import type { HVACProperties } from "@/lib/material-types";

// Every enum value the codebase can emit (src/lib/material-types.ts HVACProperties).
const HEATING_SYSTEM_TYPES: HVACProperties["heating"]["systemType"][] = [
  "individual",
  "central",
  "district",
];
const HEATING_FUEL_TYPES: HVACProperties["heating"]["fuelType"][] = [
  "gas",
  "electric",
  "oil",
  "district-heat",
  "heat-pump",
];
const COOLING_SYSTEM_TYPES: HVACProperties["cooling"]["systemType"][] = [
  "split",
  "central-chiller",
  "vrf",
  "none",
];
const VENTILATION_TYPES: HVACProperties["ventilation"]["type"][] = [
  "natural",
  "mechanical-exhaust",
  "mechanical-supply",
  "heat-recovery",
];
const DHW_SYSTEM_TYPES: HVACProperties["dhw"]["systemType"][] = [
  "gas-boiler",
  "electric",
  "heat-pump",
  "solar-thermal",
];

describe("eco2-hvac-codes — every enum value has a mapping", () => {
  it("maps every heating systemType", () => {
    for (const t of HEATING_SYSTEM_TYPES) {
      expect(HEATING_SYSTEM_TYPE_CODES[t]).toBeDefined();
      expect(getHeatingSystemTypeCode(t).code).not.toBe("UNKNOWN");
    }
  });

  it("maps every heating fuelType", () => {
    for (const t of HEATING_FUEL_TYPES) {
      expect(HEATING_FUEL_TYPE_CODES[t]).toBeDefined();
      expect(getHeatingFuelTypeCode(t).code).not.toBe("UNKNOWN");
    }
  });

  it("maps every cooling systemType", () => {
    for (const t of COOLING_SYSTEM_TYPES) {
      expect(COOLING_SYSTEM_TYPE_CODES[t]).toBeDefined();
      expect(getCoolingSystemTypeCode(t).code).not.toBe("UNKNOWN");
    }
  });

  it("maps every ventilation type", () => {
    for (const t of VENTILATION_TYPES) {
      expect(VENTILATION_TYPE_CODES[t]).toBeDefined();
      expect(getVentilationTypeCode(t).code).not.toBe("UNKNOWN");
    }
  });

  it("maps every dhw systemType", () => {
    for (const t of DHW_SYSTEM_TYPES) {
      expect(DHW_SYSTEM_TYPE_CODES[t]).toBeDefined();
      expect(getDhwSystemTypeCode(t).code).not.toBe("UNKNOWN");
    }
  });

  it("falls back to UNKNOWN for an unrecognized value", () => {
    expect(getHeatingSystemTypeCode("not-a-real-type")).toEqual({
      code: "UNKNOWN",
      labelKo: "미상",
    });
  });
});

describe("eco2-hvac-codes — mapping table snapshot", () => {
  it("matches the recorded snapshot (fails CI if the table changes silently)", () => {
    expect({
      heating: HEATING_SYSTEM_TYPE_CODES,
      heatingFuel: HEATING_FUEL_TYPE_CODES,
      cooling: COOLING_SYSTEM_TYPE_CODES,
      ventilation: VENTILATION_TYPE_CODES,
      dhw: DHW_SYSTEM_TYPE_CODES,
    }).toMatchSnapshot();
  });
});
