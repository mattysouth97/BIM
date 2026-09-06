"use client";

// src/components/viewer/pv-modules.tsx
//
// The PV modules a roof actually holds, drawn where the layout put them —
// stage 4 of the PV placement methodology. One InstancedMesh, one instance
// per module the layout returned, composed from the module's own centre and
// quaternion. Nothing here decides anything: the layout (`usePvLayout`) is
// the single source the twin, the model pages, the legend and the economics
// all read, so the count drawn here is the count priced.
//
// `centre` is the scene offset the host viewer already applies to the
// building (the model-page viewer recentres the whole GLB); the twin passes
// none because its recipe is already at the origin.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { PvLayoutResult } from "@/lib/retrofit/pv-layout";
import { PV_MODULE_LENGTH_M, PV_MODULE_WIDTH_M } from "@/lib/retrofit/pv-layout";
import { PROPOSAL_EMISSIVE } from "@/lib/retrofit/measure-visuals";

const MODULE_THICKNESS_M = 0.06;

export function pvModuleInstances(layout: PvLayoutResult | null) {
  return layout ? layout.planes.flatMap((p) => p.modules) : [];
}

export function PvModulesVisual({
  layout,
  centre,
  onDrawn,
}: {
  layout: PvLayoutResult | null;
  centre?: THREE.Vector3;
  /** Reports the instanced count, so a page can assert legend = drawn. */
  onDrawn?: (count: number) => void;
}) {
  const modules = useMemo(() => pvModuleInstances(layout), [layout]);

  const mesh = useMemo(() => {
    if (modules.length === 0) return null;
    // The layout's `u` axis (module length) runs along the row; the box's X
    // is that axis, Z is the up-slope width, Y the thickness the quaternion
    // tilts.
    const geo = new THREE.BoxGeometry(PV_MODULE_LENGTH_M, MODULE_THICKNESS_M, PV_MODULE_WIDTH_M);
    const mat = new THREE.MeshStandardMaterial({
      color: "#1e3a5f",
      metalness: 0.6,
      roughness: 0.25,
      emissive: new THREE.Color(PROPOSAL_EMISSIVE),
      emissiveIntensity: 0.12,
    });
    const im = new THREE.InstancedMesh(geo, mat, modules.length);
    im.name = "pv-modules";
    im.castShadow = true;
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    modules.forEach((m, i) => {
      quat.set(m.quaternion[0], m.quaternion[1], m.quaternion[2], m.quaternion[3]);
      pos.set(m.centre[0], m.centre[1] + MODULE_THICKNESS_M / 2, m.centre[2]);
      m4.compose(pos, quat, scale);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [modules]);

  useEffect(() => {
    onDrawn?.(modules.length);
  }, [modules.length, onDrawn]);

  useEffect(() => {
    if (!mesh) return;
    return () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [mesh]);

  if (!mesh) return null;
  return (
    <group position={centre ? [-centre.x, -centre.y, -centre.z] : [0, 0, 0]}>
      <primitive object={mesh} />
    </group>
  );
}
