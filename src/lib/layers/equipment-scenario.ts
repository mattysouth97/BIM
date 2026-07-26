// src/lib/layers/equipment-scenario.ts
// Green-retrofit equipment scenario: maps the knapsack-selected retrofit
// measures (scenario-store) to the physical hardware the 3D layers render.
// This is the point of green remodeling — selecting measures visibly SWAPS
// the building's utilities/equipment, not just the financial numbers.
// Pure TS, no React/Three.

/** Which hardware generation each subsystem renders. */
export interface EquipmentScenario {
  /** Heating plant: legacy fire-tube boiler, condensing cascade, or ASHP array. */
  heating: "baseline" | "condensing" | "heat-pump";
  /** Lighting: legacy fluorescent troffers vs slim LED panels. */
  lightingLed: boolean;
  /** Rooftop PV + BESS + inverters present. */
  solarPv: boolean;
}

/** Showcase default: no scenario published yet — render the full kit. */
export const SHOWCASE_EQUIPMENT_SCENARIO: EquipmentScenario = {
  heating: "baseline",
  lightingLed: false,
  solarPv: true,
};

/**
 * Derive the hardware scenario from selected retrofit measure ids
 * (hvac-retrofits / lighting-retrofits / solar-potential id conventions).
 *
 * Pass `null` when no scenario has been published (no building/budget yet):
 * returns the showcase default so the twin still demonstrates the full kit.
 */
export function deriveEquipmentScenario(
  selectedMeasureIds: readonly string[] | null
): EquipmentScenario {
  if (selectedMeasureIds === null) return SHOWCASE_EQUIPMENT_SCENARIO;

  const ids = new Set(selectedMeasureIds);
  const has = (prefix: string) => {
    for (const id of ids) if (id.startsWith(prefix)) return true;
    return false;
  };

  return {
    // Heat pump conversion supersedes a boiler upgrade when both fit budget
    heating: has("hvac-heat-pump")
      ? "heat-pump"
      : has("hvac-boiler-upgrade")
        ? "condensing"
        : "baseline",
    lightingLed: has("lighting-led"),
    solarPv: has("solar-pv"),
  };
}

/** Stable key for React dependency arrays / memoization. */
export function equipmentScenarioKey(s: EquipmentScenario): string {
  return `${s.heating}|${s.lightingLed ? "led" : "fl"}|${s.solarPv ? "pv" : "nopv"}`;
}
