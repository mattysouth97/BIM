// src/components/reference-building/inferred-mep-geometry.tsx
//
// Draws the generated services for a model whose source contains none.
//
// Everything here is an inference. The geometry is laid out by the same MEP
// engine the twin uses, from the model's MEASURED bounding box and the storey
// heights the manifest STATES — but no run in it was surveyed. The layer label
// and note carry that sentence (`INFERRED_MEP_LAYER`); this file's job is to
// make it look different from source geometry as well as read differently,
// because a viewer who never opens the note still has to be able to tell.
//
// Hence: no material sharing with `ServiceGeometry`, a flat unlit-ish tint and
// visible transparency. A generated duct that rendered exactly like an ingested
// one would be a picture that contradicts its own caption.

"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { renderMepSystems } from "@/lib/layers/mep-render";
import { planInferredMep, type ManifestStorey } from "@/lib/reference-buildings/inferred-mep";

/**
 * Inferred services never share the source palette.
 *
 * Source service layers are coloured by discipline (hvac blue, electrical
 * amber, plumbing green) in `LAYER_COLOUR`. A single desaturated violet that
 * appears nowhere in that map keeps "generated" readable at a glance, at any
 * zoom, without depending on a legend being open.
 */
const INFERRED_TINT = 0x8b7fd4;

export function InferredMepGeometry({
  storeys,
  size,
  baseY,
  useType,
  onPlanned,
}: {
  storeys: readonly ManifestStorey[];
  /** Measured extent of the loaded model, from its own bounding box. */
  size: THREE.Vector3;
  /**
   * The building's underside once the scene offset is applied — the same
   * value the ground plane uses. The planner lays its network out in its own
   * frame starting from y=0, so without this the runs float at the height
   * difference between the two origins. That is not a subtle error: on FZK
   * Haus the first attempt drew the whole network above the roof.
   */
  baseY: number;
  useType?: string;
  /**
   * Reports how many meshes were drawn — 0 means the generator refused,
   * which the panel states rather than showing an empty toggle that looks
   * like a failed download.
   */
  onPlanned?: (meshCount: number) => void;
}) {
  const group = useRef<THREE.Group>(null);

  const model = useMemo(
    () =>
      planInferredMep({
        storeys,
        // The box is centred by the scene offset, so its extent is what the
        // planner needs; x is width and z is depth in the viewer's frame.
        footprint: { widthM: size.x, depthM: size.z },
        useType,
      }),
    [storeys, size, useType],
  );

  useEffect(() => {
    const parent = group.current;
    if (!parent) return;

    // Clear any previous plan before drawing: this component re-runs whenever
    // the model is re-measured, and appending would stack duplicate networks.
    for (const child of [...parent.children]) {
      parent.remove(child);
      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry?.dispose();
          const material = node.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
    }

    if (!model) {
      onPlanned?.(0);
      return;
    }

    const count = renderMepSystems(model, parent, {
      systems: model.systems.map((system) => system.id),
      // One tint for every system, rather than the per-discipline palette a
      // source layer gets: generated services read as one generated thing.
      // `colorMode` stays "system" so the style colour is used as-is instead
      // of being repainted by provenance or clash tints.
      style: {
        color: INFERRED_TINT,
        opacity: 0.72,
        emissiveIntensity: 0.2,
        runTag: "inferred-mep-run",
        fittingTag: "inferred-mep-fitting",
        terminalTag: "inferred-mep-terminal",
      },
    });

    // Align what was drawn to the building it belongs to, by measuring both
    // rather than trusting either frame's origin convention: centre the
    // network on the model's axis and stand its lowest point on the model's
    // underside. Measured alignment survives a change to the planner's
    // internal frame; an assumed offset would not.
    parent.position.set(0, 0, 0);
    parent.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(parent);
    if (!box.isEmpty()) {
      const centre = box.getCenter(new THREE.Vector3());
      parent.position.set(-centre.x, baseY - box.min.y, -centre.z);
    }

    onPlanned?.(count);
  }, [model, baseY, onPlanned]);

  return <group ref={group} name="inferred-mep" />;
}
