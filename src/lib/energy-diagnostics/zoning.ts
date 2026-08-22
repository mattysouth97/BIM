import { createEnergyFact } from "./facts";
import { stableId } from "./ids";
import type {
  EnergyFact,
  SourceReference,
  Space,
  ThermalZone,
} from "./types";

export type OrientationBand = NonNullable<
  ThermalZone["orientationBand"]["value"]
>;

export type ThermalZoningOptions = Readonly<{
  createdAt: string;
  orientationBySpaceId?: Readonly<Record<string, OrientationBand>>;
  scheduleKeyBySpaceId?: Readonly<Record<string, string>>;
  hvacServiceKeyBySpaceId?: Readonly<Record<string, string>>;
}>;

/**
 * Groups rooms by energy behavior, not merely by floor or room count. Atriums
 * stay independent; perimeter orientation, conditioning, use, schedule, and
 * HVAC service all participate in the stable grouping key.
 */
export function suggestThermalZones(
  spaces: readonly Space[],
  options: ThermalZoningOptions,
): readonly ThermalZone[] {
  const groups = new Map<string, Space[]>();

  for (const space of [...spaces].sort((a, b) => a.id.localeCompare(b.id))) {
    const orientation = resolveOrientation(space, options.orientationBySpaceId);
    const signature = [
      space.storeyId,
      space.conditioned.value === true ? "conditioned" : "unconditioned",
      space.spaceType.value ?? "missing-use",
      options.scheduleKeyBySpaceId?.[space.id] ?? "unassigned-schedule",
      options.hvacServiceKeyBySpaceId?.[space.id] ?? "unassigned-hvac",
      space.isAtrium ? `atrium:${space.id}` : orientation,
    ].join("|");
    const group = groups.get(signature) ?? [];
    group.push(space);
    groups.set(signature, group);
  }

  return Object.freeze(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([signature, group], index) =>
        createZoneFromSpaces(group, signature, index + 1, options),
      ),
  );
}

export function mergeThermalZones(input: Readonly<{
  zones: readonly ThermalZone[];
  name: string;
  createdAt: string;
}>): ThermalZone {
  if (input.zones.length < 2) throw new Error("At least two zones are required to merge.");
  const ids = input.zones.map((zone) => zone.id).sort();
  const conditionedValues = new Set(input.zones.map((zone) => zone.conditioned.value));
  if (conditionedValues.size !== 1) {
    throw new Error("Conditioned and unconditioned zones cannot be merged.");
  }
  const sourceRefs = uniqueSourceRefs(
    input.zones.flatMap((zone) => [
      ...zone.floorAreaSqm.sourceRefs,
      ...zone.volumeM3.sourceRefs,
    ]),
  );
  const orientationValues = new Set(
    input.zones.map((zone) => zone.orientationBand.value),
  );
  const stableKey = `user-merge:${ids.join("+")}`;

  return Object.freeze({
    id: stableId("zone", stableKey),
    name: userFact("zone.name", input.name, input.createdAt),
    sourceSpaceIds: Object.freeze(
      [...new Set(input.zones.flatMap((zone) => zone.sourceSpaceIds))].sort(),
    ),
    storeyIds: Object.freeze(
      [...new Set(input.zones.flatMap((zone) => zone.storeyIds))].sort(),
    ),
    conditioned: userFact(
      "zone.conditioned",
      input.zones[0].conditioned.value === true,
      input.createdAt,
    ),
    floorAreaSqm: derivedFact(
      "zone.floorAreaSqm",
      sumFacts(input.zones.map((zone) => zone.floorAreaSqm)),
      "m2",
      sourceRefs,
      input.createdAt,
    ),
    volumeM3: derivedFact(
      "zone.volumeM3",
      sumFacts(input.zones.map((zone) => zone.volumeM3)),
      "m3",
      sourceRefs,
      input.createdAt,
    ),
    orientationBand: userFact<OrientationBand>(
      "zone.orientationBand",
      orientationValues.size === 1
        ? (input.zones[0].orientationBand.value ?? "mixed")
        : "mixed",
      input.createdAt,
    ),
    usageProfileId: sharedValue(input.zones.map((zone) => zone.usageProfileId)),
    hvacSystemIds: Object.freeze(
      [...new Set(input.zones.flatMap((zone) => zone.hvacSystemIds))].sort(),
    ),
    stableKey,
  });
}

export function splitThermalZone(input: Readonly<{
  zone: ThermalZone;
  spaces: readonly Space[];
  groups: readonly Readonly<{ name: string; sourceSpaceIds: readonly string[] }>[];
  createdAt: string;
}>): readonly ThermalZone[] {
  const expected = [...input.zone.sourceSpaceIds].sort();
  const assigned = input.groups.flatMap((group) => group.sourceSpaceIds).sort();
  if (new Set(assigned).size !== assigned.length || expected.join("|") !== assigned.join("|")) {
    throw new Error("Split groups must assign each source space exactly once.");
  }
  const spaceById = new Map(input.spaces.map((space) => [space.id, space]));
  return Object.freeze(
    input.groups.map((group, index) => {
      const selectedSpaces = group.sourceSpaceIds.map((id) => {
        const space = spaceById.get(id);
        if (!space) throw new Error(`Unknown split space ${id}.`);
        return space;
      });
      const split = createZoneFromSpaces(
        selectedSpaces,
        `user-split:${input.zone.stableKey}:${[...group.sourceSpaceIds].sort().join("+")}`,
        index + 1,
        { createdAt: input.createdAt },
      );
      return Object.freeze({
        ...split,
        name: userFact("zone.name", group.name, input.createdAt),
      });
    }),
  );
}

function createZoneFromSpaces(
  spaces: readonly Space[],
  signature: string,
  sequence: number,
  options: ThermalZoningOptions,
): ThermalZone {
  const sourceRefs = uniqueSourceRefs(
    spaces.flatMap((space) => [
      ...space.boundary.sourceRefs,
      ...space.spaceType.sourceRefs,
      ...space.conditioned.sourceRefs,
    ]),
  );
  const orientationValues = new Set(
    spaces.map((space) => resolveOrientation(space, options.orientationBySpaceId)),
  );
  const orientation: OrientationBand =
    orientationValues.size === 1 ? [...orientationValues][0] : "mixed";
  const conditioned = spaces.every((space) => space.conditioned.value === true);
  const zoneId = stableId("zone", signature);
  const displayUse = spaces[0]?.spaceType.value ?? "Zone";

  return Object.freeze({
    id: zoneId,
    name: derivedFact(
      `zone.${zoneId}.name`,
      `${displayUse} ${orientation} ${sequence}`,
      undefined,
      sourceRefs,
      options.createdAt,
    ),
    sourceSpaceIds: Object.freeze(spaces.map((space) => space.id).sort()),
    storeyIds: Object.freeze([...new Set(spaces.map((space) => space.storeyId))].sort()),
    conditioned: derivedFact(
      `zone.${zoneId}.conditioned`,
      conditioned,
      undefined,
      sourceRefs,
      options.createdAt,
    ),
    floorAreaSqm: derivedFact(
      `zone.${zoneId}.floorAreaSqm`,
      sumFacts(spaces.map((space) => space.floorAreaSqm)),
      "m2",
      sourceRefs,
      options.createdAt,
    ),
    volumeM3: derivedFact(
      `zone.${zoneId}.volumeM3`,
      sumFacts(spaces.map((space) => space.volumeM3)),
      "m3",
      sourceRefs,
      options.createdAt,
    ),
    orientationBand: derivedFact(
      `zone.${zoneId}.orientationBand`,
      orientation,
      undefined,
      sourceRefs,
      options.createdAt,
    ),
    usageProfileId: null,
    hvacSystemIds: Object.freeze([]),
    stableKey: signature,
  });
}

function resolveOrientation(
  space: Space,
  orientationBySpaceId?: Readonly<Record<string, OrientationBand>>,
): OrientationBand {
  if (space.isCore) return "core";
  return orientationBySpaceId?.[space.id] ?? "mixed";
}

function sumFacts(facts: readonly EnergyFact<number>[]): number {
  return facts.reduce((total, fact) => total + (fact.value ?? 0), 0);
}

function sharedValue<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null;
  return values.every((value) => value === values[0]) ? values[0] : null;
}

function derivedFact<T>(
  key: string,
  value: T,
  unit: string | undefined,
  sourceRefs: readonly SourceReference[],
  createdAt: string,
): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "inferred",
    confidence: 0.9,
    sourceRefs,
    extractionMethod: "rule_inference",
    authority: "deterministic_rule_inference",
    assumptionId: stableId("assumption", key, "zoning-rule-v1"),
    reviewedByUser: false,
    createdAt,
  });
}

function userFact<T>(key: string, value: T, createdAt: string): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    status: "user_confirmed",
    confidence: 1,
    sourceRefs: [],
    extractionMethod: "user_input",
    authority: "user_confirmed_project_value",
    reviewedByUser: true,
    createdAt,
  });
}

function uniqueSourceRefs(
  sources: readonly SourceReference[],
): readonly SourceReference[] {
  return Object.freeze(
    [...new Map(sources.map((source) => [source.id, source])).values()].sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
  );
}
