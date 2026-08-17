// src/lib/generative/blueprint/from-cad.ts
//
// Bridge from the CAD document model (`src/lib/cad/doc`, already-parsed
// DXF/DWG geometry — see its README) into the blueprint interpretation seam.
// Two paths, both pure and deterministic:
//
//   cadDocumentToInterpretRequest — segments + labels, ready to hand to ANY
//     BIMReasoningProvider.interpretBlueprint({kind:"segments", ...}) —
//     Claude for a richer read, or the heuristic provider offline.
//
//   fromCadDocument — skips the provider entirely and calls the SAME
//     loop-detection core (`from-segments.ts`) directly, with an explicit
//     layer→role mapping the UI collects once per drawing convention
//     ("A-WALL" → boundary, "A-CORE" → core, "A-ROOM-OFFICE" → office-open).
//
// `CadDocument.entities` coordinates are already real-world METRES (the DXF
// unit scale is applied once, in `map-dxf-to-doc.ts`); this file only
// converts metres → millimetres, never re-applies `unitScaleToMeters`.

import type { CadDocument } from "@/lib/cad/doc/types";
import { entityToChains } from "@/lib/cad/doc/entity-geometry";
import type { SpaceType } from "../spec/building-spec";
import {
  interpretSegmentsToBlueprint,
  type InterpretSegmentsOptions,
  type LabelInputMm,
  type SegmentInputMm,
} from "./from-segments";
import type { BlueprintSpec } from "./blueprint-spec";

/** UX-facing layer convention, e.g. `{ boundary: ["A-WALL"], core: ["A-CORE"] }`. */
export interface CadLayerMapping {
  boundary?: string[];
  core?: string[];
  /** Layer name → the zone program it always means, e.g. `{"A-ROOM-OFFICE": "office-open"}`. */
  zone?: Record<string, SpaceType>;
}

const M_TO_MM = 1000;

/** Extract every measured edge + text label from a CadDocument, in millimetres. */
export function cadDocumentToSegments(doc: CadDocument): {
  segments: SegmentInputMm[];
  labels: LabelInputMm[];
} {
  const segments: SegmentInputMm[] = [];
  const labels: LabelInputMm[] = [];

  for (const entity of doc.entities) {
    if (entity.kind === "text") {
      labels.push({
        text: entity.text,
        positionMm: {
          xMm: Math.round(entity.position.x * M_TO_MM),
          zMm: Math.round(entity.position.y * M_TO_MM),
        },
        heightMm: Math.round(entity.height * M_TO_MM),
      });
      continue;
    }

    for (const chain of entityToChains(entity)) {
      for (let i = 0; i < chain.length - 1; i += 1) {
        segments.push({
          startMm: {
            xMm: Math.round(chain[i].x * M_TO_MM),
            zMm: Math.round(chain[i].y * M_TO_MM),
          },
          endMm: {
            xMm: Math.round(chain[i + 1].x * M_TO_MM),
            zMm: Math.round(chain[i + 1].y * M_TO_MM),
          },
          layer: entity.layer,
        });
      }
    }
  }

  return { segments, labels };
}

/**
 * The provider-request shape (`BlueprintSegmentsInput` minus `kind`/`signal`)
 * — vector geometry is serialised as text for the model, never rasterised.
 */
export function cadDocumentToInterpretRequest(
  doc: CadDocument,
  prompt?: string,
): { segments: SegmentInputMm[]; labels: LabelInputMm[]; prompt?: string } {
  const { segments, labels } = cadDocumentToSegments(doc);
  return { segments, labels, ...(prompt ? { prompt } : {}) };
}

/**
 * Direct CAD → BlueprintSpec conversion, no reasoning provider involved.
 * Reuses `interpretSegmentsToBlueprint`'s loop detection; `layerMapping`
 * only narrows classification confidence upward, it never invents a loop
 * that geometry does not contain.
 */
export function fromCadDocument(
  doc: CadDocument,
  layerMapping: CadLayerMapping = {},
  options: InterpretSegmentsOptions = {},
): BlueprintSpec {
  const { segments, labels } = cadDocumentToSegments(doc);
  return interpretSegmentsToBlueprint(segments, labels, {
    ...options,
    source: options.source ?? "dxf",
    layerRoles: {
      boundary: layerMapping.boundary,
      core: layerMapping.core,
      zoneProgramByLayer: layerMapping.zone,
    },
  });
}
