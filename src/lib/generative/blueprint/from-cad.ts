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
  interpretSegments,
  type InterpretSegmentsOptions,
  type LabelInputMm,
  type SegmentInterpretationStats,
  type SegmentInputMm,
} from "./from-segments";
import type { BlueprintSpec } from "./blueprint-spec";

/** UX-facing layer convention, e.g. `{ boundary: ["A-WALL"], core: ["A-CORE"] }`. */
export interface CadLayerMapping {
  boundary?: string[];
  core?: string[];
  /** Layers whose loops are holes in the plate; the kind is still read from area. */
  void?: string[];
  /**
   * Layers whose loops are movement space. A schematic circulation GRAPH cannot
   * be read off closed outlines without inventing nodes, so these become zones
   * programmed "circulation" — the honest reading of a drawn corridor outline.
   */
  circulation?: string[];
  /** Layer name → the zone program it always means, e.g. `{"A-ROOM-OFFICE": "office-open"}`. */
  zone?: Record<string, SpaceType>;
  /**
   * Layers whose GEOMETRY is excluded before loop detection — grids,
   * dimensions, title blocks. It never reaches the interpreter, so it can
   * neither form a spurious loop nor be silently absorbed into one. Their TEXT
   * is still read: a label only ever names a loop some other layer drew, and
   * annotation living on its own layer is the normal drafting convention.
   */
  ignore?: string[];
}

const M_TO_MM = 1000;

const lowerSet = (names: string[] | undefined): Set<string> =>
  new Set((names ?? []).map((n) => n.toLowerCase()));

/** Extract every measured edge + text label from a CadDocument, in millimetres. */
export function cadDocumentToSegments(
  doc: CadDocument,
  /** Layer names (case-insensitive) whose GEOMETRY is dropped; text survives. */
  ignoreLayers: string[] = [],
): {
  segments: SegmentInputMm[];
  labels: LabelInputMm[];
} {
  const segments: SegmentInputMm[] = [];
  const labels: LabelInputMm[] = [];
  const ignored = lowerSet(ignoreLayers);

  for (const entity of doc.entities) {
    if (entity.kind !== "text" && ignored.has(entity.layer.toLowerCase())) continue;
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
 * Reuses `interpretSegments`' loop detection; `layerMapping` only narrows
 * classification confidence upward, it never invents a loop that geometry
 * does not contain.
 */
export function interpretCadDocument(
  doc: CadDocument,
  layerMapping: CadLayerMapping = {},
  options: InterpretSegmentsOptions = {},
): { blueprint: BlueprintSpec; stats: SegmentInterpretationStats } {
  const { segments, labels } = cadDocumentToSegments(doc, layerMapping.ignore);

  // Circulation layers ride the zone channel with a fixed program; merged here
  // rather than in `from-segments` so the interpreter keeps one zone concept.
  const zoneProgramByLayer: Record<string, SpaceType> = { ...(layerMapping.zone ?? {}) };
  for (const layer of layerMapping.circulation ?? []) {
    zoneProgramByLayer[layer] = "circulation";
  }

  return interpretSegments(segments, labels, {
    ...options,
    source: options.source ?? "dxf",
    layerRoles: {
      boundary: layerMapping.boundary,
      core: layerMapping.core,
      void: layerMapping.void,
      zoneProgramByLayer,
    },
  });
}

/** The spec alone, for callers that do not report on the reading. */
export function fromCadDocument(
  doc: CadDocument,
  layerMapping: CadLayerMapping = {},
  options: InterpretSegmentsOptions = {},
): BlueprintSpec {
  return interpretCadDocument(doc, layerMapping, options).blueprint;
}
