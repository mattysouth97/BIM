// src/lib/energy/co2-factors.ts
// P2-02 — canonical CO2 emission factors for the whole app (tCO2/MWh).
// This is the SINGLE definition; retrofit/cost-database.ts re-exports it so
// there is exactly one source of truth. Pure data, no React.

export const CO2_FACTORS = {
  /** Korean national grid, 2023 average. */
  electricity: 0.4594,
  /** Natural gas combustion. */
  gas: 0.2018,
  /** District heating (CHP-weighted Korean average). */
  districtHeating: 0.3200,
} as const;

export type Co2FuelKey = keyof typeof CO2_FACTORS;
