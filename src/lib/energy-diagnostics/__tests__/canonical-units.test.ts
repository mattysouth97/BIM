import { describe, expect, it } from "vitest";

import { getEnergyDiagnosticFixture } from "../fixtures";
import type {
  CanonicalEnergyModel,
  EnergyFact,
  ValidationCategory,
} from "../index";
import {
  assertCanonicalEnergyModelReady,
  ModelReadinessError,
  validateCanonicalEnergyModel,
} from "../validation";

type ModelMutation = (model: CanonicalEnergyModel) => CanonicalEnergyModel;

type SupportedUnitCase = Readonly<{
  label: string;
  rejectedCode: string;
  mutate: ModelMutation;
}>;

type RejectedUnitCase = Readonly<{
  label: string;
  code: string;
  category: ValidationCategory;
  mutate: ModelMutation;
  factId: (model: CanonicalEnergyModel) => string;
  objectId?: (model: CanonicalEnergyModel) => string;
}>;

function withUnit<T>(fact: EnergyFact<T>, unit: string): EnergyFact<T> {
  return { ...fact, unit };
}

function withFloorAreaUnit(unit: string): ModelMutation {
  return (model) => ({
    ...model,
    geometry: {
      ...model.geometry,
      floorPlates: model.geometry.floorPlates.map((plate, index) =>
        index === 0
          ? { ...plate, areaSqm: withUnit(plate.areaSqm, unit) }
          : plate,
      ),
    },
  });
}

function withUValueUnit(unit: string): ModelMutation {
  return (model) => ({
    ...model,
    envelope: {
      ...model.envelope,
      constructions: model.envelope.constructions.map((construction, index) =>
        index === 0
          ? {
              ...construction,
              uValueWPerM2K: withUnit(construction.uValueWPerM2K, unit),
            }
          : construction,
      ),
    },
  });
}

function withInfiltrationUnit(unit: string): ModelMutation {
  return (model) => ({
    ...model,
    envelope: {
      ...model.envelope,
      infiltrationAirChangesPerHour: withUnit(
        model.envelope.infiltrationAirChangesPerHour,
        unit,
      ),
    },
  });
}

function withSetpointUnit(
  kind: "heatingSetpointC" | "coolingSetpointC",
  unit: string,
): ModelMutation {
  return (model) => ({
    ...model,
    usageProfiles: model.usageProfiles.map((profile, index) =>
      index === 0
        ? { ...profile, [kind]: withUnit(profile[kind], unit) }
        : profile,
    ),
  });
}

function withCoolingCopUnit(unit: string): ModelMutation {
  return (model) => ({
    ...model,
    systems: {
      ...model.systems,
      hvac: model.systems.hvac.map((system, index) =>
        index === 0
          ? { ...system, coolingCop: withUnit(system.coolingCop, unit) }
          : system,
      ),
    },
  });
}

const SUPPORTED_UNITS: readonly SupportedUnitCase[] = [
  {
    label: "a trimmed, case-insensitive area alias",
    rejectedCode: "UNIT_FLOOR_AREA",
    mutate: withFloorAreaUnit(" SQM "),
  },
  {
    label: "a spaced canonical U-value expression",
    rejectedCode: "UNIT_U_VALUE",
    mutate: withUValueUnit(" W / ( m² · K ) "),
  },
  {
    label: "inverse-hours infiltration notation",
    rejectedCode: "UNIT_INFILTRATION",
    mutate: withInfiltrationUnit(" h⁻¹ "),
  },
  {
    label: "a case-insensitive temperature alias",
    rejectedCode: "USAGE_INVALID_HEATING_SETPOINT",
    mutate: withSetpointUnit("heatingSetpointC", " degC "),
  },
  {
    label: "a dimensionless COP alias",
    rejectedCode: "UNIT_COOLING_COP",
    mutate: withCoolingCopUnit(" Ratio "),
  },
];

const REJECTED_UNITS: readonly RejectedUnitCase[] = [
  {
    label: "floor area expressed in ft2",
    code: "UNIT_FLOOR_AREA",
    category: "geometry",
    mutate: withFloorAreaUnit("ft2"),
    factId: (model) => model.geometry.floorPlates[0].areaSqm.id,
    objectId: (model) => model.geometry.floorPlates[0].id,
  },
  {
    label: "U-value expressed in imperial units",
    code: "UNIT_U_VALUE",
    category: "envelope",
    mutate: withUValueUnit("Btu/(h·ft2·F)"),
    factId: (model) => model.envelope.constructions[0].uValueWPerM2K.id,
    objectId: (model) => model.envelope.constructions[0].id,
  },
  {
    label: "infiltration expressed as airflow",
    code: "UNIT_INFILTRATION",
    category: "envelope",
    mutate: withInfiltrationUnit("L/s"),
    factId: (model) => model.envelope.infiltrationAirChangesPerHour.id,
  },
  {
    label: "a heating setpoint expressed in kelvin",
    code: "USAGE_INVALID_HEATING_SETPOINT",
    category: "usage",
    mutate: withSetpointUnit("heatingSetpointC", "K"),
    factId: (model) => model.usageProfiles[0].heatingSetpointC.id,
    objectId: (model) => model.usageProfiles[0].id,
  },
  {
    label: "a cooling setpoint expressed in fahrenheit",
    code: "USAGE_INVALID_COOLING_SETPOINT",
    category: "usage",
    mutate: withSetpointUnit("coolingSetpointC", "F"),
    factId: (model) => model.usageProfiles[0].coolingSetpointC.id,
    objectId: (model) => model.usageProfiles[0].id,
  },
  {
    label: "cooling COP expressed as power",
    code: "UNIT_COOLING_COP",
    category: "systems",
    mutate: withCoolingCopUnit("kW"),
    factId: (model) => model.systems.hvac[0].coolingCop.id,
    objectId: (model) => model.systems.hvac[0].id,
  },
];

describe("canonical energy-model unit validation", () => {
  it.each(SUPPORTED_UNITS)("accepts $label", ({ rejectedCode, mutate }) => {
    const model = mutate(getEnergyDiagnosticFixture("fixture-a").model);
    const validation = validateCanonicalEnergyModel(model);

    expect(validation.issues.map((issue) => issue.code)).not.toContain(
      rejectedCode,
    );
    expect(
      validation.validForSimulation,
      validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"),
    ).toBe(true);
  });

  it.each(REJECTED_UNITS)(
    "blocks $label with traceable issue metadata",
    ({ code, category, mutate, factId, objectId }) => {
      const model = mutate(getEnergyDiagnosticFixture("fixture-a").model);
      const validation = validateCanonicalEnergyModel(model);
      const issue = validation.issues.find((candidate) => candidate.code === code);

      expect(validation.validForSimulation).toBe(false);
      expect(issue).toMatchObject({ severity: "error", category });
      expect(issue?.factIds).toContain(factId(model));
      if (objectId) expect(issue?.affectedObjectIds).toContain(objectId(model));
      expect(validation.blockingIssueIds).toContain(issue?.id);
    },
  );

  it("surfaces an incompatible canonical unit through the readiness assertion", () => {
    const model = withInfiltrationUnit("cfm")(
      getEnergyDiagnosticFixture("fixture-a").model,
    );

    expect(() => assertCanonicalEnergyModelReady(model)).toThrow(
      ModelReadinessError,
    );
    try {
      assertCanonicalEnergyModelReady(model);
    } catch (error) {
      expect(error).toBeInstanceOf(ModelReadinessError);
      expect((error as ModelReadinessError).validation.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "UNIT_INFILTRATION" }),
        ]),
      );
    }
  });
});
