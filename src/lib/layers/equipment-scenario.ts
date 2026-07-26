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
  /** Windows replaced: high-efficiency thermally-broken mullion profile. */
  windowUpgrade: boolean;
  /** External wall insulation: thicker insulated spandrel/solid panels. */
  wallInsulation: boolean;
}

/**
 * Showcase default: no scenario published yet — render the full kit.
 *
 * The envelope flags are deliberately `false` here (unlike `solarPv`): the
 * baseline envelope is what an un-retrofitted Korean building actually has,
 * and it is the "before" state the window/wall measures visibly upgrade.
 */
export const SHOWCASE_EQUIPMENT_SCENARIO: EquipmentScenario = {
  heating: "baseline",
  lightingLed: false,
  solarPv: true,
  windowUpgrade: false,
  wallInsulation: false,
};

/**
 * Derive the hardware scenario from selected retrofit measure ids
 * (hvac-retrofits / lighting-retrofits / solar-potential / envelope-retrofits
 * id conventions).
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
    // Envelope measures: "envelope-roof-insulation" deliberately matches
    // neither prefix — it changes no facade hardware.
    windowUpgrade: has("envelope-window-replacement"),
    wallInsulation: has("envelope-wall-insulation"),
  };
}

/** Stable key for React dependency arrays / memoization. */
export function equipmentScenarioKey(s: EquipmentScenario): string {
  return [
    s.heating,
    s.lightingLed ? "led" : "fl",
    s.solarPv ? "pv" : "nopv",
    s.windowUpgrade ? "win" : "nowin",
    s.wallInsulation ? "ins" : "noins",
  ].join("|");
}
