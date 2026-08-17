"use client";

// src/components/viewer/family-instance.tsx
//
// One authored GLB, cloned and placed in the world.
//
// Lifted out of `authoring-family-layer.tsx` (which still uses it, unchanged)
// so the solved-interior layer draws its doors, windows and stairs through the
// SAME loader: one drei GLTF cache per url, one clone per instance, the same
// shadow flags a hand-placed family gets. Two copies of this component would
// mean two caches for one file.
//
// The only addition over the original is `mirrored`, which the interior layer
// needs for a right-hand door leaf.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useBimModelStore } from "@/store/bim-model-store";

export interface FamilyInstanceProps {
  url: string;
  position: [number, number, number];
  /** Multiplier on the family's authored size — 1 means "as authored". */
  scale: [number, number, number];
  rotation: [number, number, number];
  /** When set, a click selects this BIM element. Omitted ⇒ not clickable. */
  instanceId?: string;
  /**
   * Mirror the family about its local X — a door's opposite hand.
   *
   * Implemented as a negative X scale, which flips the winding of every
   * triangle in the clone. Lighting survives that (three.js builds the normal
   * matrix from the inverse transpose of the model matrix), but BACKFACE
   * CULLING does not: an unmirrored material would show the inside of the leaf.
   * So mirrored clones render double-sided.
   *
   * The GLTF cache hands every clone of a url the SAME material instances, so
   * the materials are cloned before `side` is touched — setting it in place
   * would flip every unmirrored door in the building too. The clones are
   * disposed with the instance.
   */
  mirrored?: boolean;
}

export function FamilyInstance({
  url,
  position,
  scale,
  rotation,
  instanceId,
  mirrored = false,
}: FamilyInstanceProps) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  const selectElement = useBimModelStore((s) => s.selectElement);

  useEffect(() => {
    // Materials this instance OWNS (mirrored case only) and must dispose.
    const owned: THREE.Material[] = [];

    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!mirrored) return;

      const current = mesh.material;
      const cloned = Array.isArray(current)
        ? current.map((m) => m.clone())
        : (current as THREE.Material).clone();
      for (const material of Array.isArray(cloned) ? cloned : [cloned]) {
        material.side = THREE.DoubleSide;
        owned.push(material);
      }
      mesh.material = cloned;
    });

    return () => {
      for (const material of owned) material.dispose();
    };
  }, [clone, mirrored]);

  const appliedScale = useMemo<[number, number, number]>(
    () => (mirrored ? [-scale[0], scale[1], scale[2]] : scale),
    [mirrored, scale],
  );

  return (
    <primitive
      object={clone}
      position={position}
      scale={appliedScale}
      rotation={rotation}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!instanceId) return;
        e.stopPropagation();
        selectElement(instanceId);
      }}
    />
  );
}
