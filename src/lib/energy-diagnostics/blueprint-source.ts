import { loopToRingMm } from "@/lib/generative/blueprint/compile";
import type { BlueprintSpec } from "@/lib/generative/blueprint/blueprint-spec";

import type { DrawingSourceInput } from "./ingestion";

function safeFileStem(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || "created-building";
}

/**
 * Adapts user-authored schematic geometry to the canonical drawing-ingestion
 * boundary. The source remains a BIMFIT schematic document; it is never
 * relabelled as measured survey data or silently promoted to an energy model.
 *
 * Multiple outline loops are retained. The Tier-1 builder will stop at the
 * normal `ambiguous_boundary` review state until the intended outline is
 * resolved, which is safer than choosing a loop on the user's behalf.
 */
export function diagnosticSourceFromBlueprint(
  blueprint: BlueprintSpec,
): DrawingSourceInput {
  const vectorBoundaries = blueprint.boundaries.flatMap((boundary) => {
    const ring = loopToRingMm(boundary.loop);
    if (!ring) return [];
    return [
      {
        polygon: ring.map(
          ([xMm, zMm]) => [xMm / 1_000, zMm / 1_000] as const,
        ),
        cadLayer: "BIMFIT_USER_GEOMETRY",
        entityRef: boundary.loop.id,
        confidence: 1,
      },
    ];
  });

  return Object.freeze({
    fileName: `${safeFileStem(blueprint.name)}.bimfit-schematic.json`,
    mimeType: "application/json",
    content: JSON.stringify({
      kind: "bimfit_user_authored_schematic",
      schemaVersion: 1,
      blueprint,
    }),
    formatHint: "bimfit_schematic",
    revision: "user-draft",
    userDocumentType: "floor_plan",
    textSample: "BIMFIT USER AUTHORED FLOOR PLAN",
    units: "m",
    drawingScale: 1,
    vectorBoundaries: Object.freeze(vectorBoundaries),
  });
}
