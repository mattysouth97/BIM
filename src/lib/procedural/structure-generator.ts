// src/lib/procedural/structure-generator.ts
// InstancedMesh slabs, columns, and roof geometry.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe, FloorSpec } from "./types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import { createArchitecturalMaterial } from "@/lib/rendering/architectural-material";
import { materialContextFromRecipe } from "@/lib/rendering/material-context";
import type { SurfaceRole } from "@/lib/rendering/types";
import { extrudePolygon } from "@/lib/gis/earcut-extrude";
import { insetRing, pointInRing } from "@/lib/gis/ring-utils";
import { finishedRoofTopY } from "./roof-surface";
import {
  getEquipmentGeometryClone,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";
import {
  calcColumnCapacity,
  calcColumnLoad,
  getColumnPositions,
  getRecommendedColumnSize,
} from "@/lib/structural-codes";

function pbrToMaterial(
  config: PBRMaterialConfig,
  recipe: BuildingRecipe,
  role: SurfaceRole,
): THREE.MeshStandardMaterial {
  return createArchitecturalMaterial({
    config,
    role,
    context: materialContextFromRecipe(recipe),
  });
}

/**
 * Generate instanced slab geometry for all floors.
 * Each slab instance gets a floor mapping in userData for raycaster selection.
 *
 * P2-13 WP3 — Polygon path now returns ONE InstancedMesh (not a Group of per-floor
 * Meshes). All floors share the same extruded polygon geometry; per-instance
 * matrix transforms encode each floor's Y position. This bounds draw calls to the
 * same budget as the rectangular path and preserves P0-04 floor selection via
 * userData.instanceToFloor.
 *
 * The rectangular InstancedMesh path is preserved as the fallback.
 */
/**
 * Bucket floors by the plate they render on, preserving stack order.
 *
 * Levels without their own plate share the building footprint, so a building
 * whose register states one area for every storey yields exactly one bucket —
 * the pre-P2-30 single-InstancedMesh path, unchanged.
 */
function groupFloorsByPlate(
  floors: FloorSpec[],
  fallback: [number, number][][],
): Array<{ plate: [number, number][][]; members: FloorSpec[] }> {
  const buckets = new Map<
    string,
    { plate: [number, number][][]; members: FloorSpec[] }
  >();
  for (const floor of floors) {
    const plate =
      floor.plate && floor.plate.length >= 1 && floor.plate[0].length >= 3
        ? floor.plate
        : fallback;
    // Rounded to the millimetre: two plates that render identically must not
    // split into two batches over float noise.
    const key = plate
      .map((ring) => ring.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join(";"))
      .join("|");
    const existing = buckets.get(key);
    if (existing) existing.members.push(floor);
    else buckets.set(key, { plate, members: [floor] });
  }
  return [...buckets.values()];
}

export function generateSlabs(recipe: BuildingRecipe): THREE.InstancedMesh | THREE.Group {
  const { floors, footprintWidth, footprintDepth, slab, footprintPolygon } = recipe;

  // POLYGON PATH: one InstancedMesh per DISTINCT plate — a prism keeps its
  // single batch and its draw-call budget; an N-step building costs N batches,
  // not one mesh per storey (P2-30).
  if (footprintPolygon && footprintPolygon.length >= 1 && footprintPolygon[0].length >= 3) {
    const groups = groupFloorsByPlate(floors, footprintPolygon);
    const mat = pbrToMaterial(recipe.materials.slab, recipe, "slab");

    const buildBatch = (plate: [number, number][][], members: FloorSpec[]) => {
      // Canonical geometry at baseY=0; Y is applied via the instance matrix.
      const geo = extrudePolygon(plate, slab.thickness, 0);
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, members.length));
      im.castShadow = true;
      im.receiveShadow = true;

      const mat4 = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3(1, 1, 1);
      const instanceToFloor = new Map<number, FloorSpec>();

      for (let i = 0; i < members.length; i++) {
        pos.set(0, members[i].y, 0);
        mat4.compose(pos, quat, scl);
        im.setMatrixAt(i, mat4);
        instanceToFloor.set(i, members[i]);
      }

      im.count = members.length;
      im.instanceMatrix.needsUpdate = true;
      // `instanceToFloor` is LOCAL to this batch. A pick carries an instanceId
      // scoped to the mesh it hit, so resolution must read the hit mesh's own
      // map rather than a building-wide one.
      im.userData = { type: "slab", floors: members, instanceToFloor };
      return im;
    };

    if (groups.length === 1) {
      return buildBatch(groups[0].plate, groups[0].members);
    }

    const group = new THREE.Group();
    group.userData = { type: "slab-group", floors };
    for (const g of groups) group.add(buildBatch(g.plate, g.members));
    return group;
  }

  // RECTANGULAR PATH: original InstancedMesh logic with overhang + ground-floor material
  const count = floors.length;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = pbrToMaterial(recipe.materials.slab, recipe, "slab");
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  im.castShadow = true;
  im.receiveShadow = true;

  // Per-instance color: ground floor uses groundFloor material color, others use slab color
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);

  const slabColor = new THREE.Color(recipe.materials.slab.color);
  const groundColor = new THREE.Color(recipe.materials.groundFloor.color);

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const instanceToFloor = new Map<number, FloorSpec>();

  // slab.overhang extends the slab beyond the facade line on all four sides
  const slabW = footprintWidth + 2 * (slab.overhang ?? 0);
  const slabD = footprintDepth + 2 * (slab.overhang ?? 0);
  const scl = new THREE.Vector3(slabW, slab.thickness, slabD);

  for (let i = 0; i < floors.length; i++) {
    const floor = floors[i];
    pos.set(0, floor.y + slab.thickness / 2, 0);
    mat4.compose(pos, quat, scl);
    im.setMatrixAt(i, mat4);
    im.setColorAt(i, floor.isGroundFloor ? groundColor : slabColor);
    instanceToFloor.set(i, floor);
  }

  im.count = count;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.userData = { type: "slab", floors: recipe.floors, instanceToFloor };

  return im;
}

/** Structural column/beam grid derived from the recipe. */
interface ColumnGrid {
  positions: { x: number; z: number }[];
  colsX: number;
  colsZ: number;
  spacingX: number;
  spacingZ: number;
  innerW: number;
  innerD: number;
}

/** Compute the structural column grid (shared by columns and beams). */
function computeColumnGrid(recipe: BuildingRecipe): ColumnGrid {
  const { footprintWidth, footprintDepth, column } = recipe;
  const margin = column.inset;
  const innerW = footprintWidth - margin * 2;
  const innerD = footprintDepth - margin * 2;

  const positions: { x: number; z: number }[] = [];
  let colsX = 0;
  let colsZ = 0;
  let spacingX = 0;
  let spacingZ = 0;

  if (innerW >= column.spacing && innerD >= column.spacing) {
    colsX = Math.max(2, Math.round(innerW / column.spacing) + 1);
    colsZ = Math.max(2, Math.round(innerD / column.spacing) + 1);
    spacingX = colsX > 1 ? innerW / (colsX - 1) : 0;
    spacingZ = colsZ > 1 ? innerD / (colsZ - 1) : 0;

    for (let ix = 0; ix < colsX; ix++) {
      for (let iz = 0; iz < colsZ; iz++) {
        positions.push({
          x: colsX > 1 ? -innerW / 2 + ix * spacingX : 0,
          z: colsZ > 1 ? -innerD / 2 + iz * spacingZ : 0,
        });
      }
    }
  }

  return { positions, colsX, colsZ, spacingX, spacingZ, innerW, innerD };
}

/**
 * Generate instanced column geometry for all floors.
 *
 * Uses the detailed Blender column module (unit-normalized: chamfered shaft,
 * base/cap plates, corner ribs) when preloaded — it occupies the same
 * BoxGeometry(1,1,1) unit space, so the per-instance (size, height, size)
 * scaling is unchanged. Falls back to the plain unit box otherwise.
 */
export function generateColumns(recipe: BuildingRecipe): THREE.InstancedMesh {
  const { floors, column, slab } = recipe;

  // Canonical grid (structural-codes) already drops columns that do not fit
  // the cadastral polygon — same visual filter as the local point-in-ring path.
  // P2-30: a level with its own plate is filtered against THAT plate, so a
  // setback does not leave columns standing outside the storey above.
  const columnPositions = getColumnPositions(recipe);
  const perPlateCache = new Map<string, { x: number; z: number }[]>();
  const positionsFor = (floor: FloorSpec): { x: number; z: number }[] => {
    if (!floor.plate || floor.plate.length < 1 || floor.plate[0].length < 3) {
      return columnPositions;
    }
    const key = floor.plate[0]
      .map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`)
      .join(";");
    const hit = perPlateCache.get(key);
    if (hit) return hit;
    const solved = getColumnPositions({ ...recipe, footprintPolygon: floor.plate });
    perPlateCache.set(key, solved);
    return solved;
  };

  const totalCount = floors.reduce(
    (sum, floor) => sum + positionsFor(floor).length,
    0,
  );
  const geo = getEquipmentGeometryClone("column") ?? new THREE.BoxGeometry(1, 1, 1);
  const mat = pbrToMaterial(recipe.materials.column, recipe, "column");
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, totalCount));
  im.castShadow = true;
  im.receiveShadow = true;
  im.userData = { type: "column", sizingLabels: [] as string[] };

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const capacity = calcColumnCapacity(recipe);
  const loads = calcColumnLoad(recipe, columnPositions.length);

  let idx = 0;
  for (let floorIndex = 0; floorIndex < floors.length; floorIndex++) {
    const floor = floors[floorIndex];
    const colHeight = floor.height - slab.thickness;
    if (colHeight <= 0) continue;
    const y = floor.y + slab.thickness + colHeight / 2;
    const floorLoad = loads[floorIndex] ?? 0;
    const utilization = capacity > 0 ? floorLoad / capacity : 0;

    for (const cp of positionsFor(floor)) {
      pos.set(cp.x, y, cp.z);
      scl.set(column.size, colHeight, column.size);
      mat4.compose(pos, quat, scl);
      im.setMatrixAt(idx, mat4);
      im.userData.sizingLabels[idx] =
        `${getRecommendedColumnSize(floorLoad)} | ${Math.round(floorLoad)} kN | ${Math.round(utilization * 100)}% cap.`;
      idx++;
    }
  }

  im.count = idx;
  im.instanceMatrix.needsUpdate = true;

  return im;
}

/**
 * Generate instanced structural beams spanning the column grid.
 *
 * Beams run along X and Z between adjacent column nodes at every floor, with
 * the beam top flush against the slab above. Uses the detailed Blender beam
 * profile (unit-normalized, length along X, constant cross-section — safe to
 * stretch along its length) when preloaded, otherwise a plain unit box.
 *
 * Returns null when the recipe has no column grid (footprint smaller than a
 * single structural bay) or when the building uses a cadastral polygon
 * footprint (the rectangular grid would poke outside the real outline).
 */
export function generateBeams(recipe: BuildingRecipe): THREE.InstancedMesh | null {
  const { floors, column, slab, footprintPolygon } = recipe;
  if (footprintPolygon && footprintPolygon.length >= 1 && footprintPolygon[0].length >= 3) {
    return null;
  }

  const grid = computeColumnGrid(recipe);
  if (grid.positions.length === 0 || grid.colsX < 2 || grid.colsZ < 2) return null;

  const beamDepth = Math.min(0.5, slab.thickness * 2 + 0.1);
  const beamWidth = Math.max(0.2, column.size * 0.8);

  const beamsPerFloor =
    (grid.colsX - 1) * grid.colsZ + grid.colsX * (grid.colsZ - 1);
  const totalCount = floors.length * beamsPerFloor;
  if (totalCount === 0) return null;

  const geo = getEquipmentGeometryClone("beam") ?? new THREE.BoxGeometry(1, 1, 1);
  const mat = pbrToMaterial(recipe.materials.column, recipe, "beam");
  const im = new THREE.InstancedMesh(geo, mat, totalCount);
  im.castShadow = true;
  im.receiveShadow = true;
  im.userData = { type: "beam" };

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const identityQuat = new THREE.Quaternion();
  // Beam geometry length axis is X; rotate 90° about Y for Z-spanning beams.
  const zSpanQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 2
  );

  let idx = 0;
  for (const floor of floors) {
    // Beam top flush with the underside of the slab above this floor.
    const y = floor.y + floor.height - beamDepth / 2;

    // X-spanning beams between adjacent grid columns in each Z row
    for (let iz = 0; iz < grid.colsZ; iz++) {
      const z = grid.colsZ > 1 ? -grid.innerD / 2 + iz * grid.spacingZ : 0;
      for (let ix = 0; ix < grid.colsX - 1; ix++) {
        const x0 = -grid.innerW / 2 + ix * grid.spacingX;
        pos.set(x0 + grid.spacingX / 2, y, z);
        scl.set(grid.spacingX, beamDepth, beamWidth);
        mat4.compose(pos, identityQuat, scl);
        im.setMatrixAt(idx++, mat4);
      }
    }

    // Z-spanning beams between adjacent grid columns in each X row
    for (let ix = 0; ix < grid.colsX; ix++) {
      const x = grid.colsX > 1 ? -grid.innerW / 2 + ix * grid.spacingX : 0;
      for (let iz = 0; iz < grid.colsZ - 1; iz++) {
        const z0 = -grid.innerD / 2 + iz * grid.spacingZ;
        pos.set(x, y, z0 + grid.spacingZ / 2);
        // Local scale is applied before rotation: X = span length.
        scl.set(grid.spacingZ, beamDepth, beamWidth);
        mat4.compose(pos, zSpanQuat, scl);
        im.setMatrixAt(idx++, mat4);
      }
    }
  }

  im.count = idx;
  im.instanceMatrix.needsUpdate = true;
  return im;
}

/**
 * Roof furniture (stair bulkhead, gooseneck vents, skylight, drain, ladder) —
 * a fixed-size detailed Blender asset dressed onto flat roofs.
 *
 * Detailed-asset-only: returns null when the asset is not preloaded, the roof
 * is not flat, or the footprint is too small to host the ~5×3.5 m set.
 */
export function generateRoofFurniture(recipe: BuildingRecipe): THREE.Group | null {
  const { roof, footprintWidth, footprintDepth, totalHeight, footprintPolygon } = recipe;
  if (roof.type !== "flat") return null;
  if (Math.min(footprintWidth, footprintDepth) < 10) return null;

  const furniture = getEquipmentObjectClone("roof-furniture");
  if (!furniture) return null;

  const roofTopY = totalHeight + roof.flatThickness;
  // Offset toward a rear corner, clamped so the set stays on the roof.
  const x = Math.min(footprintWidth / 2 - 3.2, footprintWidth * 0.18);
  const z = Math.max(-(footprintDepth / 2 - 2.6), -footprintDepth * 0.22);

  // The corner spot is bbox-derived; with a real footprint polygon, skip the
  // set entirely if the spot is not actually on the roof (e.g. in a notch).
  if (
    footprintPolygon &&
    footprintPolygon.length >= 1 &&
    footprintPolygon[0].length >= 3 &&
    !pointInRing(x, z, footprintPolygon[0])
  ) {
    return null;
  }
  furniture.position.set(x, roofTopY, z);
  tagEquipmentObject(
    furniture,
    { type: "roof" },
    { castShadow: true, receiveShadow: true }
  );
  return furniture;
}

/**
 * Roof-terrace timber pergola — the architectural 외피 finish on a flat roof.
 * Base-origin asset sits on the finished roof top, opposite the plant band.
 */
export function generateRoofPergola(recipe: BuildingRecipe): THREE.Group | null {
  const { roof, footprintWidth, footprintDepth, footprintPolygon } = recipe;
  if (roof.type !== "flat") return null;
  if (recipe.curtainWall?.enabled) return null;
  if (Math.min(footprintWidth, footprintDepth) < 12) return null;

  const pergola = getEquipmentObjectClone("roof-pergola");
  if (!pergola) return null;

  const roofTopY = finishedRoofTopY(recipe);
  // Sit in the rear plant keep-out (PV skips z below roofPlantBandMaxZ)
  // so the canopy does not land in the solar field.
  const x = -Math.min(footprintWidth / 2 - 3.0, footprintWidth * 0.22);
  const z = Math.max(-(footprintDepth / 2 - 2.2), -footprintDepth * 0.28);

  if (
    footprintPolygon &&
    footprintPolygon.length >= 1 &&
    footprintPolygon[0].length >= 3 &&
    !pointInRing(x, z, footprintPolygon[0])
  ) {
    return null;
  }
  pergola.position.set(x, roofTopY, z);
  tagEquipmentObject(
    pergola,
    { type: "roofPergola" },
    { castShadow: true, receiveShadow: true },
  );
  return pergola;
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
function isAxisAlignedRectangle(rings?: [number, number][][]): boolean {
  if (!rings || rings.length !== 1 || rings[0].length < 4) return false;
  const ring = [...rings[0]];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    ring.length > 1 &&
    Math.abs(first[0] - last[0]) < 1e-6 &&
    Math.abs(first[1] - last[1]) < 1e-6
  ) {
    ring.pop();
  }
  if (ring.length !== 4) return false;

  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const expected = new Set([
    `${minX}:${minZ}`,
    `${minX}:${maxZ}`,
    `${maxX}:${minZ}`,
    `${maxX}:${maxZ}`,
  ]);
  return ring.every(([x, z]) => expected.has(`${x}:${z}`));
}

export function generateRoof(recipe: BuildingRecipe): THREE.Mesh {
  const { roof, footprintWidth, footprintDepth, totalHeight, footprintPolygon, wallThickness } = recipe;
  const mat = pbrToMaterial(recipe.materials.roof, recipe, "roof");
  // Pull the deck back to the inner face of the wall so it does not occupy
  // the same volume as the parapet cladding.
  const deckInset = Math.max(0, wallThickness / 2);

  // POLYGON PATH: flat roofs follow the real outline exactly like the slabs —
  // a bbox rectangle would cantilever over concave regions (L-notches) and
  // misalign with the polygon-driven facade and parapet.
  if (
    roof.type === "flat" &&
    footprintPolygon &&
    footprintPolygon.length >= 1 &&
    footprintPolygon[0].length >= 3
  ) {
    const inset = [
      insetRing(footprintPolygon[0], deckInset),
      ...footprintPolygon.slice(1),
    ];
    const geo = extrudePolygon(inset, roof.flatThickness, totalHeight);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: "roof", effectiveRoofType: "flat" };
    return mesh;
  }

  let geo: THREE.BufferGeometry;
  let y: number;
  let effectiveRoofType = roof.type;
  const hasPolygon = !!recipe.footprintPolygon?.[0]?.length;
  const needsPolygonCap =
    hasPolygon && (roof.type === "flat" || !isAxisAlignedRectangle(recipe.footprintPolygon));

  if (needsPolygonCap) {
    // Bounding-box roofs cross concave footprints and courtyard voids. Keep
    // the exact footprint; irregular pitched roofs use a collision-free flat
    // cap until a polygon-aware pitch solver is available.
    const inset = [
      insetRing(recipe.footprintPolygon![0], deckInset),
      ...recipe.footprintPolygon!.slice(1),
    ];
    geo = extrudePolygon(inset, roof.flatThickness, 0);
    y = totalHeight;
    effectiveRoofType = "flat";
  } else if (roof.type === "gable") {
    const shape = new THREE.Shape();
    const hw = footprintWidth / 2;
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(0, roof.gableHeight);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, { depth: footprintDepth, bevelEnabled: false });
    geo.center();
    y = totalHeight + roof.gableHeight / 2;
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
    geo = new THREE.BoxGeometry(
      Math.max(1, footprintWidth - wallThickness),
      roof.flatThickness,
      Math.max(1, footprintDepth - wallThickness),
    );
    y = totalHeight + roof.flatThickness / 2;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, y, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: "roof", effectiveRoofType };

  return mesh;
}
