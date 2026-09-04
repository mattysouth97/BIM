// src/components/energy-diagnostics/scene-object-ids.ts
//
// Canonical model objects → the Three.js object ids that represent them.
//
// Selection and the diagnostic overlay both need this translation, and neither
// needs React to do it. The fallback chain matters: an object with an explicit
// mapping uses it, one without falls back to the shared envelope shell, and an
// opening with no host geometry falls back to the shell's window group rather
// than highlighting nothing.

import type { CanonicalEnergyModel } from "@/lib/energy-diagnostics/types";

export function sceneObjectIds(model: CanonicalEnergyModel, canonicalId: string): readonly string[] {
  const mapped = model.mappings.find(
    (mapping) => mapping.canonicalObjectId === canonicalId,
  )?.threeObjectIds ?? [];
  if (mapped.length > 0) return mapped;
  const surface = model.geometry.surfaces.find(
    (candidate) => candidate.id === canonicalId,
  );
  if (surface?.threeObjectId) return [surface.threeObjectId];
  const opening = model.geometry.openings.find(
    (candidate) => candidate.id === canonicalId,
  );
  return opening?.threeObjectId ? [opening.threeObjectId] : [];
}

export function diagnosticOverlayObjectIds(
  model: CanonicalEnergyModel,
  canonicalIds: readonly string[],
): readonly string[] {
  const ids = new Set<string>();
  for (const canonicalId of canonicalIds) {
    if (canonicalId === model.building.id) {
      ids.add("envelope-shell:Walls");
      ids.add("envelope-shell:Windows");
      ids.add("envelope-shell:Roof");
      ids.add("envelope-shell:Ground Floor");
      continue;
    }
    const surface = model.geometry.surfaces.find(
      (candidate) => candidate.id === canonicalId,
    );
    if (surface) {
      if (sceneObjectIds(model, surface.id).length > 0) continue;
      if (surface.type === "exterior_wall") ids.add("envelope-shell:Walls");
      if (surface.type === "roof") ids.add("envelope-shell:Roof");
      if (surface.type === "ground_floor") {
        ids.add("envelope-shell:Ground Floor");
      }
      continue;
    }
    const opening = model.geometry.openings.find(
      (candidate) => candidate.id === canonicalId,
    );
    if (opening) {
      const hostIds = sceneObjectIds(model, opening.hostSurfaceId);
      if (hostIds.length > 0) {
        for (const hostId of hostIds) ids.add(hostId);
      } else {
        ids.add("envelope-shell:Windows");
      }
    }
  }
  return [...ids];
}

export function mappingsForSourceIds(
  model: CanonicalEnergyModel,
  sourceIds: readonly string[],
) {
  const ids = new Set(sourceIds);
  return model.mappings.filter((mapping) =>
    mapping.sourceEntityRefs.some((source) => ids.has(source.id)),
  );
}
