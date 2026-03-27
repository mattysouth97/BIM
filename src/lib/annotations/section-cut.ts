// src/lib/annotations/section-cut.ts
// Section cut plane for clipping visualization.

import * as THREE from "three";

export interface SectionCutResult {
  plane: THREE.Plane;
  helper: THREE.Group;
  dispose: () => void;
}

/**
 * Create a section cut plane along the given axis at the given position.
 * Returns the THREE.Plane for renderer.clippingPlanes and a visual helper group.
 */
export function createSectionPlane(
  axis: "x" | "z",
  position: number,
  size: number
): SectionCutResult {
  // Plane normal: for X-axis cut, normal points in +X direction;
  // for Z-axis cut, normal points in +Z direction.
  const normal = axis === "x"
    ? new THREE.Vector3(-1, 0, 0)
    : new THREE.Vector3(0, 0, -1);

  const plane = new THREE.Plane(normal, position);

  // Visual helper: a semi-transparent quad showing the cut plane
  const helperGroup = new THREE.Group();
  helperGroup.name = "annotation-section";

  const planeGeo = new THREE.PlaneGeometry(size, size);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x2196f3,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);

  // Orient and position
  if (axis === "x") {
    planeMesh.rotation.y = Math.PI / 2;
    planeMesh.position.set(position, size / 2, 0);
  } else {
    planeMesh.position.set(0, size / 2, position);
  }

  helperGroup.add(planeMesh);

  // Edge lines for visibility
  const edgeGeo = new THREE.EdgesGeometry(planeGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2196f3, linewidth: 1, transparent: true, opacity: 0.4 });
  const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeLine.position.copy(planeMesh.position);
  edgeLine.rotation.copy(planeMesh.rotation);
  helperGroup.add(edgeLine);

  return {
    plane,
    helper: helperGroup,
    dispose: () => {
      planeGeo.dispose();
      planeMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
    },
  };
}
