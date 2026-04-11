// src/lib/procedural/structure-generator.ts
// InstancedMesh slabs, columns, and roof geometry.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe, FloorSpec } from "./types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import { extrudePolygon } from "@/lib/gis/earcut-extrude";

function pbrToMaterial(config: PBRMaterialConfig): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: config.roughness,
    metalness: config.metalness,
    side: THREE.FrontSide,
  });
  if (config.transparent) {
    mat.transparent = true;
    mat.opacity = config.opacity ?? 0.4;
  }
  return mat;
}

/**
 * Generate instanced slab geometry for all floors.
 * Each slab instance gets a floor mapping in userData for raycaster selection.
 *
 * When recipe.footprintPolygon is present, returns a THREE.Group of per-floor
 * extruded polygon meshes (one Mesh per floor) instead of a single InstancedMesh.
 * The rectangular InstancedMesh path is preserved as the fallback.
 */
export function generateSlabs(recipe: BuildingRecipe): THREE.InstancedMesh | THREE.Group {
  const { floors, footprintWidth, footprintDepth, slab, footprintPolygon } = recipe;

  // POLYGON PATH: when real cadastral polygon is available
  if (footprintPolygon && footprintPolygon.length >= 1 && footprintPolygon[0].length >= 3) {
    const group = new THREE.Group();
    group.userData = { type: "slab" };
    const mat = pbrToMaterial(recipe.materials.slab);
    const instanceToFloor = new Map<number, FloorSpec>();

    for (let i = 0; i < floors.length; i++) {
      const floor = floors[i];
      const geo = extrudePolygon(footprintPolygon, slab.thickness, floor.y);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { type: "slab", floorNo: floor.floorNo };
      instanceToFloor.set(i, floor);
      group.add(mesh);
    }

    // Preserve instanceToFloor on group for getFloorFromInstanceId compatibility
    group.userData.instanceToFloor = instanceToFloor;
    group.userData.floors = floors;
    return group;
  }

  // RECTANGULAR PATH: original InstancedMesh logic (unchanged)
  const count = floors.length;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = pbrToMaterial(recipe.materials.slab);
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  im.castShadow = true;
  im.receiveShadow = true;

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(footprintWidth, slab.thickness, footprintDepth);
  const quat = new THREE.Quaternion();
  const instanceToFloor = new Map<number, FloorSpec>();

  for (let i = 0; i < floors.length; i++) {
    const floor = floors[i];
    pos.set(0, floor.y + slab.thickness / 2, 0);
    mat4.compose(pos, quat, scl);
    im.setMatrixAt(i, mat4);
    instanceToFloor.set(i, floor);
  }

  im.count = count;
  im.instanceMatrix.needsUpdate = true;
  im.userData = { type: "slab", floors: recipe.floors, instanceToFloor };

  return im;
}

/**
 * Generate instanced column geometry for all floors.
 */
export function generateColumns(recipe: BuildingRecipe): THREE.InstancedMesh {
  const { floors, footprintWidth, footprintDepth, column, slab } = recipe;

  // Column grid positions
  const margin = column.inset;
  const innerW = footprintWidth - margin * 2;
  const innerD = footprintDepth - margin * 2;

  const columnPositions: { x: number; z: number }[] = [];

  if (innerW >= column.spacing && innerD >= column.spacing) {
    const colsX = Math.max(2, Math.round(innerW / column.spacing) + 1);
    const colsZ = Math.max(2, Math.round(innerD / column.spacing) + 1);
    const spacingX = colsX > 1 ? innerW / (colsX - 1) : 0;
    const spacingZ = colsZ > 1 ? innerD / (colsZ - 1) : 0;

    for (let ix = 0; ix < colsX; ix++) {
      for (let iz = 0; iz < colsZ; iz++) {
        columnPositions.push({
          x: colsX > 1 ? -innerW / 2 + ix * spacingX : 0,
          z: colsZ > 1 ? -innerD / 2 + iz * spacingZ : 0,
        });
      }
    }
  }

  const totalCount = floors.length * columnPositions.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = pbrToMaterial(recipe.materials.column);
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, totalCount));
  im.castShadow = true;
  im.receiveShadow = true;
  im.userData = { type: "column" };

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();

  let idx = 0;
  for (const floor of floors) {
    const colHeight = floor.height - slab.thickness;
    if (colHeight <= 0) continue;
    const y = floor.y + slab.thickness + colHeight / 2;

    for (const cp of columnPositions) {
      pos.set(cp.x, y, cp.z);
      scl.set(column.size, colHeight, column.size);
      mat4.compose(pos, quat, scl);
      im.setMatrixAt(idx++, mat4);
    }
  }

  im.count = idx;
  im.instanceMatrix.needsUpdate = true;

  return im;
}

/**
 * Generate hip roof geometry — four-sided sloped roof converging to a ridge.
 */
function generateHipGeometry(
  footprintWidth: number,
  footprintDepth: number,
  gableHeight: number,
  hipInset: number,
): THREE.BufferGeometry {
  const topW = footprintWidth * hipInset;
  const topD = footprintDepth * hipInset;
  const hw = footprintWidth / 2, hd = footprintDepth / 2;
  const thw = topW / 2, thd = topD / 2;
  const h = gableHeight;
  const vertices = new Float32Array([
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
    -thw, h, -thd, thw, h, -thd, thw, h, thd, -thw, h, thd,
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generate sawtooth (clerestory) roof geometry — repeating triangular ridges
 * along the building width for north-facing skylights. Common in factories.
 */
function generateSawtoothGeometry(
  footprintWidth: number,
  footprintDepth: number,
  sawtoothCount: number,
  sawtoothHeight: number,
): THREE.BufferGeometry {
  const ridgeCount = Math.max(1, sawtoothCount);
  const ridgeWidth = footprintWidth / ridgeCount;
  const hw = footprintWidth / 2;
  const hd = footprintDepth / 2;

  // Each ridge is a triangular prism: flat bottom, sloped south face, vertical north face
  // Vertices per ridge: 4 (bottom quad) + 2 (top edge) = 6
  // But we build as extruded 2D profiles along depth (Z axis)
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < ridgeCount; i++) {
    const x0 = -hw + i * ridgeWidth;       // Left edge of this ridge
    const x1 = -hw + (i + 1) * ridgeWidth; // Right edge of this ridge
    const baseIdx = i * 6;

    // Front face (z = +hd) triangle: bottom-left, bottom-right, top-right (north face)
    // Back face (z = -hd) same triangle
    // Profile: bottom at y=0 from x0 to x1, then slope up to x1 at y=sawtoothHeight
    vertices.push(
      x0, 0, -hd,  // 0: front-bottom-left
      x1, 0, -hd,  // 1: front-bottom-right
      x1, sawtoothHeight, -hd,  // 2: front-top-right (peak)
      x0, 0, hd,   // 3: back-bottom-left
      x1, 0, hd,   // 4: back-bottom-right
      x1, sawtoothHeight, hd,   // 5: back-top-right (peak)
    );

    // Bottom face (x0,0,-hd) -> (x1,0,-hd) -> (x1,0,hd) -> (x0,0,hd)
    indices.push(
      baseIdx + 0, baseIdx + 1, baseIdx + 4,
      baseIdx + 0, baseIdx + 4, baseIdx + 3,
    );
    // Sloped face (south-facing): (x0,0) -> (x1,sawtoothH) on both z sides
    indices.push(
      baseIdx + 0, baseIdx + 2, baseIdx + 1,
      baseIdx + 0, baseIdx + 5, baseIdx + 2,
      baseIdx + 0, baseIdx + 3, baseIdx + 5,
    );
    // Vertical north face: (x1,0) -> (x1,sawtoothH) on both z sides
    indices.push(
      baseIdx + 1, baseIdx + 2, baseIdx + 5,
      baseIdx + 1, baseIdx + 5, baseIdx + 4,
    );
    // Top face (horizontal): (x1,sawtoothH,-hd) -> (x1,sawtoothH,hd) — just an edge, no top cap needed
    // End caps (z = -hd and z = hd triangles)
    indices.push(
      baseIdx + 0, baseIdx + 1, baseIdx + 2, // front triangle
      baseIdx + 3, baseIdx + 5, baseIdx + 4, // back triangle
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generate roof mesh (single mesh, not instanced — only one roof per building).
 * Supports flat, gable, hip, sawtooth, and legacy "other" (truncated pyramid) types.
 */
export function generateRoof(recipe: BuildingRecipe): THREE.Mesh {
  const { roof, footprintWidth, footprintDepth, totalHeight } = recipe;
  const mat = pbrToMaterial(recipe.materials.roof);

  let geo: THREE.BufferGeometry;
  let y: number;

  if (roof.type === "gable") {
    const shape = new THREE.Shape();
    const hw = footprintWidth / 2;
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(0, roof.gableHeight);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, { depth: footprintDepth, bevelEnabled: false });
    geo.center();
    y = totalHeight;
  } else if (roof.type === "hip") {
    geo = generateHipGeometry(footprintWidth, footprintDepth, roof.gableHeight, roof.hipInset);
    y = totalHeight;
  } else if (roof.type === "sawtooth") {
    const count = roof.sawtoothCount ?? 4;
    const height = roof.sawtoothHeight ?? 2.0;
    geo = generateSawtoothGeometry(footprintWidth, footprintDepth, count, height);
    y = totalHeight;
  } else if (roof.type === "other") {
    // Legacy hip roof — truncated pyramid (kept for backward compatibility)
    geo = generateHipGeometry(footprintWidth, footprintDepth, roof.gableHeight, roof.hipInset);
    y = totalHeight;
  } else {
    geo = new THREE.BoxGeometry(footprintWidth, roof.flatThickness, footprintDepth);
    y = totalHeight + roof.flatThickness / 2;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, y, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: "roof" };

  return mesh;
}
