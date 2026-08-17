// src/lib/generative/blueprint/apply-placements.ts
//
// Schematic family placements → BIM elements on the generated snapshot.
//
// The engine already lays out a structural column grid. These are the EXTRA
// families the user dropped on the plan (pillars, lights, furniture). They
// stay in BlueprintSpec as design authority and are compiled here, after
// emit, so a regenerate from the same schematic always rebuilds the same
// instances. Coordinates go through `blueprintPlateFrame` — the same shift
// the compiler applies to every other piece of geometry.

import { getAuthoringFamily } from "@/lib/bim/family-catalog";
import { typeFromAuthoringFamily } from "@/lib/bim/model/parameters";
import {
  levelIdForFloor,
  type BimElement,
  type BimKind,
  type BimModelSnapshot,
  type BimSystem,
} from "@/lib/bim/model/types";

import { blueprintPlacements, type BlueprintSpec, type SchematicPlacementTool } from "./blueprint-spec";
import { blueprintPlateFrame } from "./compile";

const round = (n: number, dp = 3) => Number(n.toFixed(dp));

function kindOf(tool: SchematicPlacementTool): BimKind {
  if (tool === "column") return "column";
  if (tool === "lighting") return "lighting";
  return "furniture";
}

function systemOf(tool: SchematicPlacementTool): BimSystem {
  if (tool === "column") return "structure";
  if (tool === "lighting") return "mep";
  return "partitions";
}

export function applySchematicPlacements(input: {
  snapshot: BimModelSnapshot;
  blueprint: BlueprintSpec;
  buildingPk: string;
  generationId: string;
}): BimModelSnapshot {
  const placements = blueprintPlacements(input.blueprint);
  if (placements.length === 0) return input.snapshot;

  const frame = blueprintPlateFrame(input.blueprint);
  if (frame === null) return input.snapshot;

  const types = { ...input.snapshot.types };
  const extra: BimElement[] = [];

  for (const placement of placements) {
    const family = getAuthoringFamily(placement.familyId);
    if (!family) continue;
    const bimType = typeFromAuthoringFamily(family);
    if (types[bimType.id] === undefined) types[bimType.id] = bimType;

    const x = (placement.positionMm.xMm + frame.shiftXMm) / 1000;
    const z = (placement.positionMm.zMm + frame.shiftZMm) / 1000;

    for (const floorNo of placement.floorNos) {
      const levelId = levelIdForFloor(floorNo);
      extra.push({
        id: `sch:${placement.id}:${floorNo}`,
        origin: "generated",
        kind: kindOf(placement.tool),
        category: family.category,
        family: family.family,
        typeId: family.id,
        buildingPk: input.buildingPk,
        levelId,
        hostId: null,
        mark: placement.id,
        instanceParameters: {
          mark: placement.id,
          familyId: family.id,
          schematicPlacementId: placement.id,
          schematicTool: placement.tool,
        },
        placement: {
          x: round(x),
          y: 0,
          z: round(z),
          rotationY: round(placement.rotationRad, 4),
        },
        phaseCreated: "new",
        visible: true,
        system: systemOf(placement.tool),
        locked: false,
        dependsOn: [levelId],
        generationSource: {
          type: "GENERATED",
          generationId: input.generationId,
          version: 1,
        },
      });
    }
  }

  extra.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    ...input.snapshot,
    types,
    elements: [...input.snapshot.elements, ...extra],
  };
}
