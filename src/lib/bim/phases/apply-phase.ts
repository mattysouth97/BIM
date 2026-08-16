// Apply a twin phase to material properties.
// existing = as-measured / inferred. retrofit = 2020 그린리모델링 envelope targets
// for measures that are in the selected set (or all envelope targets when
// `measureIds` is omitted — autonomous design-intent phase).

import type { MaterialProperties } from "@/lib/material-types";
import { KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";

export type TwinPhaseId = "existing" | "retrofit";

export const ENVELOPE_PHASE_MEASURES = [
  "envelope-wall-insulation",
  "envelope-window-replacement",
  "envelope-roof-insulation",
  "envelope-floor-insulation",
] as const;

export function applyPhaseToMaterials(
  materials: MaterialProperties,
  phase: TwinPhaseId,
  measureIds?: Iterable<string>,
): MaterialProperties {
  if (phase === "existing") return materials;

  const ids = measureIds
    ? new Set(measureIds)
    : new Set<string>(ENVELOPE_PHASE_MEASURES);

  if (ids.size === 0) return materials;

  const next: MaterialProperties = structuredClone(materials);

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

  return next;
}
