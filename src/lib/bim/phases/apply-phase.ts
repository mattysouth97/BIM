// Apply a twin phase to material properties.
// existing = as-measured / inferred. retrofit = the post-measure state for
// the measures in the selected set (or all envelope targets when `measureIds`
// is omitted — autonomous design-intent phase).
//
// This is the ONE before/after seam. `retrofit-delta.ts` runs the energy
// engine on the output of this function, and the twin and model-page visuals
// read the same measure ids. Do not write a second post-retrofit builder.
//
// ## Which measure id changes which field
//
//   envelope-wall-insulation    envelope.walls[].uValue                     min(current, 0.15)
//   envelope-window-replacement envelope.windows.uValue/glassType/coating   min(current, 0.9), triple, low-e
//   envelope-roof-insulation    envelope.roof.uValue                        min(current, 0.15)
//   envelope-floor-insulation   envelope.groundFloor.uValue                 min(current, 0.18)
//   hvac-boiler-upgrade         hvac.heating.efficiency                     max(eta, 0.95)
//   hvac-heat-pump              hvac.heating.efficiency/fuelType/systemType max(eta, COP 3.5), heat-pump, individual
//   hvac-hrv                    hvac.ventilation.type/heatRecoveryEfficiency  heat-recovery, max(eta, 0.75)
//   lighting-led                lighting.lightingPowerDensity/lampType      min(LPD, 8), led
//   lighting-led-smart          + lighting.controlType                      min(LPD, 6), led, combined
//   solar-pv-<roofType>         renewable.solarPV.*                         sized by calculateSolarPotential
//
// Every target above is the SAME number the corresponding measure generator
// prices its saving against — 0.95, COP 3.5 and 75 % from hvac-retrofits.ts,
// 8 and 6 W/m2 from lighting-retrofits.ts, KOREAN_2020_TARGET_U_VALUES for the
// envelope — so the materials this function returns and the economics the
// knapsack ran on describe one building, not two.
//
// NOT EVERY FIELD WRITTEN HERE REACHES THE ENERGY ENGINE. The degree-day run
// reads the envelope U-values, the ventilation term, and the heating
// efficiency/fuel. It does NOT read lightingPowerDensity (delivered-from-
// demand.ts fixes the lighting share at 15 % of total) and does NOT read
// renewable.solarPV (that module hard-codes `renewable: 0`). Writing them here
// is still right — they are the true post-measure state — but a caller must
// not imply a kWh movement the run never made. retrofit-delta.ts reports, per
// change, whether the current engine prices it.

import type { MaterialProperties } from "@/lib/material-types";
import { KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import { normalizeEfficiency } from "@/lib/energy/annual-demand";

export type TwinPhaseId = "existing" | "retrofit";

export const ENVELOPE_PHASE_MEASURES = [
  "envelope-wall-insulation",
  "envelope-window-replacement",
  "envelope-roof-insulation",
  "envelope-floor-insulation",
] as const;

/** Condensing-boiler efficiency the boiler measure is priced at (hvac-retrofits.ts). */
export const BOILER_UPGRADE_EFFICIENCY = 0.95;
/** Heat-pump seasonal COP the conversion measure is priced at (hvac-retrofits.ts). */
export const HEAT_PUMP_COP = 3.5;
/** HRV sensible effectiveness the HRV measure is priced at (hvac-retrofits.ts). */
export const HRV_EFFECTIVENESS = 0.75;
/** Target LPD (W/m2) per lighting measure — the targets lighting-retrofits.ts prices. */
export const LED_TARGET_LPD = 8;
export const LED_SMART_TARGET_LPD = 6;
/** Fixed array tilt (deg). Matches the 30 deg the twin's solar-panels.tsx renders. */
export const PV_TILT_DEG = 30;
/** Due south, as the plane-of-array gain in solar-potential.ts assumes. */
export const PV_ORIENTATION_DEG = 180;

const PV_ROOF_TYPES = ["flat", "gable", "hip", "sawtooth"] as const;
type PvRoofType = (typeof PV_ROOF_TYPES)[number];

/** Extra facts a measure needs that MaterialProperties does not carry. */
export interface RetrofitPhaseContext {
  /** kWp from the measured-roof layout; the PV measure is sized to it when present. */
  geometricKWp?: number;
  /**
   * Roof surface a PV array may occupy (m2) — the MEASURED roof surface, not
   * the footprint. Without it a `solar-pv-*` id cannot be sized, and the
   * renewable block is left untouched rather than guessed.
   */
  roofAreaSqm?: number;
  /** Region key for solar irradiance (`REGIONAL_IRRADIANCE`). Default "seoul". */
  region?: string;
}

/** The roof type encoded in a `solar-pv-<roofType>` id, or null if it is not one. */
export function pvRoofTypeFromId(measureId: string): PvRoofType | null {
  if (!measureId.startsWith("solar-pv-")) return null;
  const suffix = measureId.slice("solar-pv-".length);
  return (PV_ROOF_TYPES as readonly string[]).includes(suffix)
    ? (suffix as PvRoofType)
    : null;
}

export function applyPhaseToMaterials(
  materials: MaterialProperties,
  phase: TwinPhaseId,
  measureIds?: Iterable<string>,
  context?: RetrofitPhaseContext,
): MaterialProperties {
  if (phase === "existing") return materials;

  const ids = measureIds
    ? new Set(measureIds)
    : new Set<string>(ENVELOPE_PHASE_MEASURES);

  if (ids.size === 0) return materials;

  const next: MaterialProperties = structuredClone(materials);

  // --- Envelope ---------------------------------------------------------

  if (ids.has("envelope-wall-insulation")) {
    const target = KOREAN_2020_TARGET_U_VALUES.wall;
    for (const wall of next.envelope.walls) {
      wall.uValue = Math.min(wall.uValue, target);
    }
  }

  if (ids.has("envelope-window-replacement")) {
    const target = KOREAN_2020_TARGET_U_VALUES.window;
    next.envelope.windows.uValue = Math.min(next.envelope.windows.uValue, target);
    next.envelope.windows.glassType = "triple";
    next.envelope.windows.coating = "low-e";
  }

  if (ids.has("envelope-roof-insulation")) {
    const target = KOREAN_2020_TARGET_U_VALUES.roof;
    next.envelope.roof.uValue = Math.min(next.envelope.roof.uValue, target);
  }

  if (ids.has("envelope-floor-insulation")) {
    const target = KOREAN_2020_TARGET_U_VALUES.floor;
    next.envelope.groundFloor.uValue = Math.min(
      next.envelope.groundFloor.uValue,
      target,
    );
  }

  // --- Plant ------------------------------------------------------------
  // Efficiency is compared and written NORMALIZED (a fraction, or a COP for
  // heat pumps) with the same `normalizeEfficiency` the degree-day engine
  // applies when it reads the field. Materials seeded in percent (85) would
  // otherwise beat 0.95 on a raw Math.max and silently skip the upgrade.

  if (ids.has("hvac-boiler-upgrade")) {
    const current = normalizeEfficiency(next.hvac.heating.efficiency);
    next.hvac.heating.efficiency = Math.max(current, BOILER_UPGRADE_EFFICIENCY);
  }

  if (ids.has("hvac-heat-pump")) {
    const current = normalizeEfficiency(next.hvac.heating.efficiency);
    next.hvac.heating.efficiency = Math.max(current, HEAT_PUMP_COP);
    // The conversion changes the carrier, not only the efficiency — annual-
    // demand splits fuelDemand on fuelType, so leaving it "gas" would price
    // heat-pump electricity at the city-gas CO2 factor.
    next.hvac.heating.fuelType = "heat-pump";
    next.hvac.heating.systemType = "individual";
  }

  // On a naturally-ventilated building this is an ADDITION, not a swap: the
  // engine ignores `airflowRate` while the type is "natural", so switching to
  // heat-recovery makes it read that flow for the first time and the modelled
  // air-exchange loss RISES (by the recovered remainder). That is what the
  // model says — a ventilation system now exists where none was modelled —
  // and it disagrees with the measure's own 15 %-saving assumption, which is
  // not derived from this engine. retrofit-delta.ts reports the rise as a
  // rise. Do not paper over it by skipping the write.
  if (ids.has("hvac-hrv")) {
    next.hvac.ventilation.type = "heat-recovery";
    next.hvac.ventilation.heatRecoveryEfficiency = Math.max(
      normalizeEfficiency(next.hvac.ventilation.heatRecoveryEfficiency),
      HRV_EFFECTIVENESS,
    );
  }

  // --- Lighting ---------------------------------------------------------
  // The two LED ids are alternatives, not a stack: lighting-retrofits.ts
  // returns the smart variant INSTEAD of the plain one above 15 W/m2, so the
  // deeper target wins if both somehow arrive together.

  if (ids.has("lighting-led-smart")) {
    next.lighting.lightingPowerDensity = Math.min(
      next.lighting.lightingPowerDensity,
      LED_SMART_TARGET_LPD,
    );
    next.lighting.lampType = "led";
    next.lighting.controlType = "combined";
  } else if (ids.has("lighting-led")) {
    next.lighting.lightingPowerDensity = Math.min(
      next.lighting.lightingPowerDensity,
      LED_TARGET_LPD,
    );
    next.lighting.lampType = "led";
  }

  // --- Renewable --------------------------------------------------------
  // Sized by the SAME function the measure's economics used, so the kWp on
  // the card and the kWp in the materials are one number. Unsized (no roof
  // area supplied) leaves the block alone — an unsized array is not a fact.

  const pvId = [...ids].find((id) => pvRoofTypeFromId(id) !== null);
  const pvRoofType = pvId ? pvRoofTypeFromId(pvId) : null;
  const roofAreaSqm = context?.roofAreaSqm ?? 0;
  if (pvRoofType && roofAreaSqm > 0) {
    const pv = calculateSolarPotential(
      roofAreaSqm,
      pvRoofType,
      context?.region ?? "seoul",
      // Feed-in tariff drives revenue only; the two fields read below (kWp,
      // roof utilization) are independent of it.
      130,
      undefined,
      // The measured-roof layout's kWp, when a layout exists (sixth argument).
      context?.geometricKWp,
    );
    next.renewable.solarPV = {
      ...next.renewable.solarPV,
      installed: true,
      capacity: pv.systemSizeKWp,
      area: roofAreaSqm * pv.roofUtilization,
      tiltAngle: PV_TILT_DEG,
      orientation: PV_ORIENTATION_DEG,
      panelType: "monocrystalline",
    };
  }

  return next;
}
