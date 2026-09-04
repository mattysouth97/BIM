// src/components/energy-diagnostics/improvement-scenario-draft.ts
//
// The improvement-scenario draft: the five numeric fields the user edits in
// the comparison stage (window U-value, infiltration ACH, heating COP, window
// SHGC, opening-area scale), and the round trip between that draft and an
// EnergyScenario's deltas.
//
// This lived inside energy-diagnosis-workspace.tsx, where none of it could be
// exercised without mounting the whole workspace. It is pure model logic —
// no React, no I/O — so it belongs beside the component rather than inside it.
//
// Two behaviours here are deliberate and easy to "tidy" into bugs:
//
//   * A field reads back as "" (absent) rather than a number whenever the
//     scenario does not pin it. `improvementDraftForScenario` must clear a
//     value the restored scenario does not carry, not retain the previous
//     draft's.
//   * `openingAreaScale` is only recovered when EVERY opening moved by the
//     same ratio. A scenario that scaled openings unevenly has no single
//     scale to show, so the field reads "" instead of guessing one.
//
// Float comparisons use a relative tolerance because these values survive a
// multiply/divide round trip through the scenario deltas.

import type {
  CanonicalEnergyModel,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";

export type ImprovementScenarioDraft = Readonly<{
  windowUValueWPerM2K: number | "";
  infiltrationAch: number | "";
  heatingCop: number | "";
  windowShgc: number | "";
  openingAreaScale: number | "";
}>;

export const EMPTY_IMPROVEMENT_SCENARIO_DRAFT: ImprovementScenarioDraft = {
  windowUValueWPerM2K: "",
  infiltrationAch: "",
  heatingCop: "",
  windowShgc: "",
  openingAreaScale: "",
};

function numericReplacement(
  scenario: EnergyScenario,
  path: string,
): number | "" {
  const value = scenario.deltas.find((delta) => delta.path === path)
    ?.replacement.value;
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

export function improvementDraftForScenario(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario,
): ImprovementScenarioDraft {
  const windowIndex = model.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  const openingAreaDeltas = scenario.deltas.filter((delta) =>
    /^geometry\.openings\.\d+\.areaSqm$/.test(delta.path),
  );
  const openingAreaScales = openingAreaDeltas.flatMap((delta) => {
    const baselineValue = model.geometry.openings
      .map((opening) => opening.areaSqm)
      .find((fact) => fact.id === delta.baselineFactId)?.value;
    const replacementValue = delta.replacement.value;
    return typeof baselineValue === "number" &&
      Number.isFinite(baselineValue) &&
      baselineValue > 0 &&
      typeof replacementValue === "number" &&
      Number.isFinite(replacementValue)
      ? [replacementValue / baselineValue]
      : [];
  });
  const firstAreaScale = openingAreaScales[0];
  const areaScaleIsConsistent =
    openingAreaDeltas.length > 0 &&
    openingAreaScales.length === openingAreaDeltas.length &&
    firstAreaScale != null &&
    openingAreaScales.every(
      (candidate) =>
        Math.abs(candidate - firstAreaScale) <=
        Math.max(1, Math.abs(firstAreaScale)) * 1e-9,
    );

  return {
    windowUValueWPerM2K:
      windowIndex < 0
        ? ""
        : numericReplacement(
            scenario,
            `envelope.constructions.${windowIndex}.uValueWPerM2K`,
          ),
    infiltrationAch: numericReplacement(
      scenario,
      "envelope.infiltrationAirChangesPerHour",
    ),
    heatingCop: numericReplacement(
      scenario,
      "systems.hvac.0.heatingEfficiency",
    ),
    windowShgc:
      windowIndex < 0
        ? ""
        : numericReplacement(
            scenario,
            `envelope.constructions.${windowIndex}.shgc`,
          ),
    openingAreaScale: areaScaleIsConsistent ? firstAreaScale : "",
  };
}

export function initialImprovementScenarioDraft(
  model: CanonicalEnergyModel | null,
): ImprovementScenarioDraft {
  if (!model) return EMPTY_IMPROVEMENT_SCENARIO_DRAFT;
  const run = model.simulationRuns.findLast(
    (candidate) =>
      candidate.scenarioId !== "baseline" && candidate.status === "succeeded",
  );
  const scenario = run
    ? model.scenarios.find((candidate) => candidate.id === run.scenarioId)
    : undefined;
  return scenario
    ? improvementDraftForScenario(model, scenario)
    : EMPTY_IMPROVEMENT_SCENARIO_DRAFT;
}

function finiteDraftValue(value: number | ""): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function expectedScenarioReplacements(
  model: CanonicalEnergyModel,
  draft: ImprovementScenarioDraft,
): ReadonlyMap<string, number> | null {
  const replacements = new Map<string, number>();
  const windowIndex = model.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  if (finiteDraftValue(draft.windowUValueWPerM2K)) {
    if (windowIndex < 0) return null;
    replacements.set(
      `envelope.constructions.${windowIndex}.uValueWPerM2K`,
      draft.windowUValueWPerM2K,
    );
  } else if (draft.windowUValueWPerM2K !== "") {
    return null;
  }
  if (finiteDraftValue(draft.windowShgc)) {
    if (windowIndex < 0) return null;
    replacements.set(
      `envelope.constructions.${windowIndex}.shgc`,
      draft.windowShgc,
    );
  } else if (draft.windowShgc !== "") {
    return null;
  }
  if (finiteDraftValue(draft.infiltrationAch)) {
    replacements.set(
      "envelope.infiltrationAirChangesPerHour",
      draft.infiltrationAch,
    );
  } else if (draft.infiltrationAch !== "") {
    return null;
  }
  if (finiteDraftValue(draft.heatingCop)) {
    replacements.set("systems.hvac.0.heatingEfficiency", draft.heatingCop);
  } else if (draft.heatingCop !== "") {
    return null;
  }
  const openingAreaScale = draft.openingAreaScale;
  if (finiteDraftValue(openingAreaScale)) {
    model.geometry.openings.forEach((opening, index) => {
      const baselineValue = opening.areaSqm.value;
      if (typeof baselineValue !== "number" || !Number.isFinite(baselineValue)) {
        return;
      }
      replacements.set(
        `geometry.openings.${index}.areaSqm`,
        baselineValue * openingAreaScale,
      );
    });
  } else if (openingAreaScale !== "") {
    return null;
  }
  return replacements;
}

export function scenarioMatchesImprovementDraft(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario,
  draft: ImprovementScenarioDraft,
): boolean {
  const expected = expectedScenarioReplacements(model, draft);
  if (!expected || expected.size !== scenario.deltas.length) return false;
  return scenario.deltas.every((delta) => {
    const expectedValue = expected.get(delta.path);
    const evaluatedValue = delta.replacement.value;
    return (
      expectedValue != null &&
      typeof evaluatedValue === "number" &&
      Number.isFinite(evaluatedValue) &&
      Math.abs(expectedValue - evaluatedValue) <=
        Math.max(1, Math.abs(evaluatedValue)) * 1e-9
    );
  });
}
