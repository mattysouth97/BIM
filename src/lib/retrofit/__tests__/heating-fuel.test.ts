// src/lib/retrofit/__tests__/heating-fuel.test.ts
// P1-03 — heating fuel threaded into envelope/HVAC generators: pricing, CO2,
// escalation, heat-pump suppression, and the legacy gas default.
// Hand-computed expectations in comments.

import { describe, it, expect } from "vitest";
import {
  resolveHeatingFuel,
  computeFinancials,
} from "../economic-model";
import { generateEnvelopeRetrofits, KOREAN_2020_TARGET_U_VALUES } from "../envelope-retrofits";
import { generateHvacRetrofits } from "../hvac-retrofits";
import { ENERGY_PRICES, CO2_FACTORS, DEFAULT_ECONOMIC_ASSUMPTIONS } from "../cost-database";

const AREAS = { wall: 300, roof: 200, window: 100, floor: 200 };
const HDD = 2400;
const ETA = 0.87;

describe("resolveHeatingFuel (P1-03)", () => {
  it("maps every fuelType branch", () => {
    expect(resolveHeatingFuel({ systemType: "central", fuelType: "gas" })).toBe("gas");
    expect(resolveHeatingFuel({ systemType: "central", fuelType: "district-heat" })).toBe("districtHeating");
    expect(resolveHeatingFuel({ systemType: "central", fuelType: "electric" })).toBe("electricity");
    expect(resolveHeatingFuel({ systemType: "central", fuelType: "heat-pump" })).toBe("electricity");
    // oil → gas is a documented proxy (no oil tariff in ENERGY_PRICES).
    expect(resolveHeatingFuel({ systemType: "central", fuelType: "oil" })).toBe("gas");
  });

  it('systemType "district" corroborates when fuelType is missing/unknown', () => {
    expect(resolveHeatingFuel({ systemType: "district", fuelType: "" })).toBe("districtHeating");
    expect(
      resolveHeatingFuel({ systemType: "district", fuelType: "unknown-value" })
    ).toBe("districtHeating");
  });

  it("defaults to gas only when both signals are absent (legacy)", () => {
    expect(resolveHeatingFuel({ systemType: "", fuelType: "" })).toBe("gas");
  });
});

describe("district-heated envelope measures (P1-03)", () => {
  const measures = generateEnvelopeRetrofits(
    { wall: 0.26, roof: 0.1, window: 0.5, floor: 0.1 },
    KOREAN_2020_TARGET_U_VALUES,
    AREAS,
    HDD,
    ETA,
    "districtHeating"
  );
  const wall = measures.find((m) => m.id === "envelope-wall-insulation")!;
  // energy = (0.26−0.15)×300×2400×24/1000/0.87 = 2184.8276 kWh — fuel-independent physics
  const energy = (0.11 * 300 * 2400 * 24) / 1000 / 0.87;

  it("prices at 90 KRW/kWh and CO2 at 0.3200 tCO2/MWh", () => {
    expect(wall.annualEnergySaving).toBeCloseTo(energy, 6);
    expect(wall.annualCostSaving).toBeCloseTo(energy * ENERGY_PRICES.districtHeating, 4);
    expect(wall.co2Reduction).toBeCloseTo((energy * CO2_FACTORS.districtHeating) / 1000, 8);
    expect(wall.fuel).toBe("districtHeating");
  });

  it("escalation follows the explicit fuel via computeFinancials", () => {
    const fin = computeFinancials(wall, DEFAULT_ECONOMIC_ASSUMPTIONS);
    expect(fin.resolvedFuel).toBe("districtHeating");
  });

  it("kWh savings are identical across fuels — fuel changes price, not physics", () => {
    const gasWall = generateEnvelopeRetrofits(
      { wall: 0.26, roof: 0.1, window: 0.5, floor: 0.1 },
      KOREAN_2020_TARGET_U_VALUES,
      AREAS,
      HDD,
      ETA,
      "gas"
    ).find((m) => m.id === "envelope-wall-insulation")!;
    expect(gasWall.annualEnergySaving).toBeCloseTo(wall.annualEnergySaving, 10);
    expect(gasWall.annualCostSaving).toBeCloseTo(energy * ENERGY_PRICES.gas, 4);
  });
});

describe("district-heated HVAC measures (P1-03)", () => {
  const D = 100_000;
  const measures = generateHvacRetrofits(
    { heatingType: "central", heatingEfficiency: 0.65 },
    1000,
    D,
    30_000,
    "districtHeating"
  );

  it("heat pump displaces district heat at 90 KRW/kWh vs electricity at 140", () => {
    const hp = measures.find((m) => m.id === "hvac-heat-pump")!;
    // (100,000/0.65)×90 − (100,000/3.5)×140 = 13,846,153.85 − 4,000,000
    expect(hp.annualCostSaving).toBeCloseTo((D / 0.65) * 90 - (D / 3.5) * 140, 2);
  });

  it("boiler upgrade and HRV are priced at district-heating rates with explicit fuel", () => {
    const boiler = measures.find((m) => m.id === "hvac-boiler-upgrade")!;
    // energy = 100,000 × (1 − 0.65/0.95) = 31,578.95 kWh → × 90 KRW
    expect(boiler.annualCostSaving).toBeCloseTo(D * (1 - 0.65 / 0.95) * 90, 2);
    expect(boiler.fuel).toBe("districtHeating");

    const hrv = measures.find((m) => m.id === "hvac-hrv")!;
    expect(hrv.annualCostSaving).toBeCloseTo(0.15 * D * 90, 4);
    expect(hrv.fuel).toBe("districtHeating");
  });
});

describe("electric heating suppresses the heat-pump conversion (P1-03)", () => {
  it("emits no hvac-heat-pump when heating fuel resolves to electricity", () => {
    const measures = generateHvacRetrofits(
      { heatingType: "individual", heatingEfficiency: 0.6, age: 20 },
      1000,
      100_000,
      30_000,
      "electricity"
    );
    // Nothing to switch FROM — the building already heats electrically.
    expect(measures.find((m) => m.id === "hvac-heat-pump")).toBeUndefined();
  });
});

describe("legacy default (P1-03 regression guard)", () => {
  it("omitting the fuel argument is byte-identical to explicit gas", () => {
    const legacy = generateHvacRetrofits(
      { heatingType: "central", heatingEfficiency: 0.7 },
      1000,
      100_000,
      30_000
    );
    const explicit = generateHvacRetrofits(
      { heatingType: "central", heatingEfficiency: 0.7 },
      1000,
      100_000,
      30_000,
      "gas"
    );
    expect(JSON.stringify(legacy)).toBe(JSON.stringify(explicit));
  });
});
