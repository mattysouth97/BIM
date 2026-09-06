import * as THREE from "three";

export type ReferenceView = "exterior" | "roof";

/** Keep the depth buffer concentrated on the model. A fixed tiny near plane
 * wastes precision at building scale and makes millimetre layers compete.
 * The padded sphere also leaves room for services and a ground receiver.
 */
export function referenceDepthRange(radius: number, centreDepth: number) {
  const safeRadius = Math.max(0.1, radius);
  const nearest = centreDepth - safeRadius * 1.15;
  const near = Math.max(0.02, nearest * 0.5);
  const far = Math.max(near + 10, centreDepth + safeRadius * 4);
  return { near, far };
}

/** Fit all eight measured corners, including on a narrow portrait canvas. */
export function referenceCameraPose(
  size: THREE.Vector3,
  aspect: number,
  fovDeg: number,
  view: ReferenceView,
  inspection: boolean,
) {
  const direction = new THREE.Vector3(...(view === "roof"
    ? [0, 1, 0.0001] as const
    : [0.7, 0.48, 0.7] as const)).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const tanH = tanV * Math.max(0.1, aspect);
  // With the energy frame open, reserve space for its top and bottom rails.
  const verticalFill = inspection ? 0.86 : 0.55;
  let distance = 1;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
    distance = Math.max(distance,
      corner.dot(direction) + Math.abs(corner.dot(right)) / (tanH * 0.86),
      corner.dot(direction) + Math.abs(corner.dot(up)) / (tanV * verticalFill));
  }
  return { position: direction.multiplyScalar(distance), distance };
}

/** GLTF does not load Three's shadow flags. Restore cached meshes on release. */
export function setReferenceShadows(scene: THREE.Object3D, ghosted = false): () => void {
  const originals: Array<[THREE.Mesh, boolean, boolean]> = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    originals.push([object, object.castShadow, object.receiveShadow]);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const opaque = materials.every((material) => !material.transparent && material.opacity >= 1);
    object.castShadow = !ghosted && opaque;
    object.receiveShadow = !ghosted && opaque;
  });
  return () => originals.forEach(([mesh, cast, receive]) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
}
