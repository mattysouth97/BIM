import * as THREE from "three";
import {
  PV_MODULE_LENGTH_M,
  PV_MODULE_WIDTH_M,
  type PvModuleInstance,
} from "@/lib/retrofit/pv-layout";

// A generic visual treatment of the assumed module class, not measured
// construction details or a manufacturer specification. The layout alone owns
// module dimensions, count, orientation and roof clearance.
const FRAME_DEPTH_M = 0.04;
const FRAME_BORDER_M = 0.018;
const FACE_LIFT_M = 0.0005;

/** A small shared, mipmapped cell pattern: no image request or per-cell mesh. */
function createCellTexture(): THREE.DataTexture {
  const width = 1024;
  const height = 640;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width) * 10;
      const v = ((y + 0.5) / height) * 6;
      const cellX = u % 1;
      const cellY = v % 1;
      const edgeX = Math.min(cellX, 1 - cellX);
      const edgeY = Math.min(cellY, 1 - cellY);
      const gutter = edgeX < 0.015 || edgeY < 0.015 || edgeX + edgeY < 0.075;
      const busbar = Math.min(Math.abs(cellX - 0.25), Math.abs(cellX - 0.5), Math.abs(cellX - 0.75)) < 0.004;
      // Slight deterministic variation keeps cells legible close up without
      // changing the silhouette or implying differing module performance.
      const variation = ((Math.floor(u) * 7 + Math.floor(v) * 3) % 5) - 2;
      const index = (y * width + x) * 4;
      data[index] = gutter ? 53 : busbar ? 78 : 15 + variation;
      data[index + 1] = gutter ? 66 : busbar ? 94 : 32 + variation;
      data[index + 2] = gutter ? 77 : busbar ? 109 : 48 + variation;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.name = "pv-generic-cells";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export interface PvModuleVisual {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Two instanced batches for any module count: aluminum frame and glazed cells.
 * Local X is the 1.7 m edge, local Z the 1.0 m edge, local +Y the face normal.
 * The underside is at local Y=0, so all thickness follows the layout's normal
 * on pitches instead of shifting every panel along world +Y.
 */
export function createPvModuleVisual(modules: readonly PvModuleInstance[]): PvModuleVisual | null {
  if (modules.length === 0) return null;

  const frameGeometry = new THREE.BoxGeometry(PV_MODULE_LENGTH_M, FRAME_DEPTH_M, PV_MODULE_WIDTH_M);
  frameGeometry.translate(0, FRAME_DEPTH_M / 2, 0);
  const faceGeometry = new THREE.PlaneGeometry(
    PV_MODULE_LENGTH_M - FRAME_BORDER_M * 2,
    PV_MODULE_WIDTH_M - FRAME_BORDER_M * 2,
  );
  faceGeometry.rotateX(-Math.PI / 2);
  faceGeometry.translate(0, FRAME_DEPTH_M + FACE_LIFT_M, 0);

  const texture = createCellTexture();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: "#a6afb8",
    metalness: 0.65,
    roughness: 0.38,
  });
  const faceMaterial = new THREE.MeshPhysicalMaterial({
    map: texture,
    metalness: 0.2,
    roughness: 0.32,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
  });
  const frame = new THREE.InstancedMesh(frameGeometry, frameMaterial, modules.length);
  const face = new THREE.InstancedMesh(faceGeometry, faceMaterial, modules.length);
  frame.name = "pv-modules";
  face.name = "pv-module-cells";
  frame.castShadow = true;
  face.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  modules.forEach((module, index) => {
    quaternion.fromArray(module.quaternion);
    position.fromArray(module.centre);
    matrix.compose(position, quaternion, scale);
    frame.setMatrixAt(index, matrix);
    face.setMatrixAt(index, matrix);
  });
  for (const mesh of [frame, face]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  const group = new THREE.Group();
  group.name = "pv-module-assembly";
  group.add(frame, face);
  return {
    group,
    dispose: () => {
      // InstancedMesh.dispose releases instance buffers; geometry/material
      // disposal alone leaves them behind when a retrofit selection changes.
      frame.dispose();
      face.dispose();
      frameGeometry.dispose();
      faceGeometry.dispose();
      frameMaterial.dispose();
      faceMaterial.dispose();
      texture.dispose();
    },
  };
}
