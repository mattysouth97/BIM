"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { disposeObject3D } from "@/lib/layers/analysis/overlay-types";

import type {
  DiagnosticSpatialTarget,
  DiagnosticSurfacePatch,
} from "./diagnostic-selection-types";

function wallGeometry(patch: DiagnosticSurfacePatch): THREE.BufferGeometry {
  const positions: number[] = [];
  const top = patch.elevationM + Math.max(patch.heightM, 0.05);
  for (let index = 0; index < patch.points.length - 1; index += 1) {
    const [x1, z1] = patch.points[index];
    const [x2, z2] = patch.points[index + 1];
    positions.push(
      x1, patch.elevationM, z1,
      x2, patch.elevationM, z2,
      x2, top, z2,
      x1, patch.elevationM, z1,
      x2, top, z2,
      x1, top, z1,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function capGeometry(patch: DiagnosticSurfacePatch): THREE.BufferGeometry {
  const points = [...patch.points];
  const first = points[0];
  const last = points.at(-1);
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  const shape = new THREE.Shape(
    points.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, patch.elevationM + 0.035, 0);
  return geometry;
}

function meshForPatch(
  patch: DiagnosticSurfacePatch,
  target: DiagnosticSpatialTarget,
): THREE.Group {
  const container = new THREE.Group();
  container.name = `diagnostic-highlight:${patch.canonicalObjectId}`;
  const geometry =
    patch.kind === "wall" ? wallGeometry(patch) : capGeometry(patch);
  const isHostOnly = target.precision === "host_surface";
  const material = new THREE.MeshBasicMaterial({
    color: "#22d3ee",
    opacity: isHostOnly ? 0.2 : 0.42,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = patch.objectName;
  mesh.renderOrder = 20;
  mesh.frustumCulled = false;
  mesh.userData = {
    type: "diagnostic-evidence-surface",
    canonicalObjectId: patch.canonicalObjectId,
    diagnosticPrecision: target.precision,
    diagnosticHighlighted: true,
  };

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 15),
    new THREE.LineBasicMaterial({
      color: "#67e8f9",
      transparent: true,
      opacity: isHostOnly ? 0.82 : 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  outline.name = `${patch.objectName}:outline`;
  outline.renderOrder = 21;
  outline.frustumCulled = false;
  container.add(mesh, outline);
  return container;
}

export function buildDiagnosticSelectionGroup(
  target: DiagnosticSpatialTarget,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "diagnostic-selection-root";
  group.userData = {
    selectionId: target.selectionId,
    diagnosticPrecision: target.precision,
  };
  for (const patch of target.patches) {
    group.add(meshForPatch(patch, target));
  }
  return group;
}

/** Evidence-backed geometry drawn above the ordinary analysis overlays. */
export function DiagnosticSelectionLayer({
  target,
}: Readonly<{ target: DiagnosticSpatialTarget | null }>) {
  const group = useMemo(
    () => (target ? buildDiagnosticSelectionGroup(target) : new THREE.Group()),
    [target],
  );

  useEffect(() => {
    return () => disposeObject3D(group);
  }, [group]);

  return <primitive object={group} visible={target != null} />;
}
