// src/lib/procedural/facade-generator.ts
// InstancedMesh facade generator — glass, mullions, solid panels.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe, FacadeConfig, FloorSpec } from "./types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import { getEquipmentGeometryClone } from "@/lib/equipment-assets";
import {
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "@/lib/layers/equipment-scenario";

/** Extra depth (m) an externally-insulated solid panel adds to the wall. */
const WALL_INSULATION_DEPTH = 0.08;

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
  if (config.emissive) {
    mat.emissive = new THREE.Color(config.emissive);
    mat.emissiveIntensity = config.emissiveIntensity ?? 0.1;
  }
  return mat;
}

interface FaceDesc {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  side: "front" | "back" | "left" | "right";
}

/**
 * Derive FaceDesc array from cadastral polygon outer ring edges.
 * Each consecutive vertex pair becomes one facade face strip.
 * Used instead of getFaces() when recipe.footprintPolygon is present.
 *
 * All polygon faces use side: "front" so the window-ratio side-reduction
 * (0.6× for "left"/"right") does not apply — correct for arbitrary polygon edges.
 */
function getPolygonFaces(outerRing: [number, number][], wallThickness: number): FaceDesc[] {
  const faces: FaceDesc[] = [];
  const n = outerRing.length;

  for (let i = 0; i < n - 1; i++) {  // n-1 because last point closes ring (equals first)
    const [x0, z0] = outerRing[i];
    const [x1, z1] = outerRing[i + 1];

    const dx = x1 - x0;
    const dz = z1 - z0;
    const edgeLength = Math.sqrt(dx * dx + dz * dz);
    if (edgeLength < 0.1) continue;  // skip degenerate edges

    // Midpoint of this edge
    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;

    // Edge direction angle (atan2 in XZ plane, measured from +Z axis toward +X axis)
    const angle = Math.atan2(dx, dz);

    // Outward normal (perpendicular to edge, pointing out of the polygon)
    const nx = -dz / edgeLength;
    const nz = dx / edgeLength;

    // Position the face at the outer wall surface (offset inward by wallThickness/2)
    const facePos = new THREE.Vector3(
      midX - nx * wallThickness / 2,
      0,
      midZ - nz * wallThickness / 2,
    );

    // Quaternion: rotate a +Z-facing quad to align with this edge
    const quat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -angle,
    );

    faces.push({
      position: facePos,
      quaternion: quat,
      length: edgeLength,
      side: "front",  // polygon faces are all "front" — no side-ratio reduction
    });
  }

  return faces;
}

function getFaces(w: number, d: number, wallThickness: number): FaceDesc[] {
  const halfW = w / 2;
  const halfD = d / 2;
  const qFront = new THREE.Quaternion();
  const qBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const qRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const qLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

  return [
    { position: new THREE.Vector3(0, 0, halfD - wallThickness / 2), quaternion: qFront, length: w, side: "front" },
    { position: new THREE.Vector3(0, 0, -(halfD - wallThickness / 2)), quaternion: qBack, length: w, side: "back" },
    { position: new THREE.Vector3(halfW - wallThickness / 2, 0, 0), quaternion: qRight, length: d, side: "right" },
    { position: new THREE.Vector3(-(halfW - wallThickness / 2), 0, 0), quaternion: qLeft, length: d, side: "left" },
  ];
}

function countWindowColumns(wallLength: number, facade: FacadeConfig): number {
  const usable = wallLength - 2 * facade.cornerInset - facade.mullionWidth;
  if (usable < facade.windowSpacing) return 0;
  const maxCount = Math.floor(usable / facade.windowSpacing);
  return Math.max(1, Math.round(maxCount * Math.min(facade.windowRatio / 0.4, 1.0)));
}

function seededRandom(floorNo: number, colIndex: number, faceIndex: number): number {
  const seed = floorNo * 397 + colIndex * 71 + faceIndex * 13;
  return ((seed * 16807) % 2147483647) / 2147483647;
}

/**
 * Detect curtain wall mode: enabled when recipe has curtainWall config
 * and window ratio exceeds 0.65. Adjusts facade parameters in-place for
 * continuous glass with structural mullion grid.
 */
function applyCurtainWallOverrides(
  facade: FacadeConfig,
  recipe: BuildingRecipe,
): { facade: FacadeConfig; glassMaterialOverride: PBRMaterialConfig | null } {
  const cw = recipe.curtainWall;
  if (!cw?.enabled || facade.windowRatio <= 0.65) {
    return { facade, glassMaterialOverride: null };
  }

  // Curtain wall mode: continuous glass, thinner mullions, near-zero solid panels
  const curtainFacade: FacadeConfig = {
    ...facade,
    mullionWidth: cw.mullionWidth || 0.03,
    solidPanelChance: 0.02,
    windowRatio: Math.max(facade.windowRatio, 0.75),
    cornerInset: 0.03,
    glassInset: 0.02,
  };

  const glassMaterialOverride: PBRMaterialConfig = {
    ...recipe.materials.glass,
    color: cw.glassTint || "#88BBCC",
    opacity: cw.glassOpacity || 0.45,
    transparent: true,
  };

  return { facade: curtainFacade, glassMaterialOverride };
}

/**
 * Generate instanced facade geometry for the entire building.
 * Returns a THREE.Group with 4 InstancedMesh children:
 *   glass, solidPanels, hMullions, vMullions
 *
 * Supports curtain wall mode for modern office buildings when
 * recipe.curtainWall is enabled and window ratio > 0.65.
 *
 * The green-retrofit `scenario` decides WHICH envelope hardware renders:
 *   - windowUpgrade  → thermally-broken "mullion-he" profile replaces "mullion"
 *   - wallInsulation → "facade-panel-insulated" replaces "facade-panel", and
 *     the solid-panel instances deepen by WALL_INSULATION_DEPTH so the added
 *     external insulation is visible in section.
 */
export function generateFacade(
  recipe: BuildingRecipe,
  scenario: EquipmentScenario = SHOWCASE_EQUIPMENT_SCENARIO,
): THREE.Group {
  const { slab, wallThickness, footprintWidth, footprintDepth, floors } = recipe;
  const aboveFloors = floors.filter(f => f.type === "above");
  if (aboveFloors.length === 0) return new THREE.Group();

  // Apply curtain wall overrides if applicable
  const { facade: cwFacade, glassMaterialOverride } = applyCurtainWallOverrides(recipe.facade, recipe);
  const facade = cwFacade;

  const faces = recipe.footprintPolygon && recipe.footprintPolygon[0]?.length >= 3
    ? getPolygonFaces(recipe.footprintPolygon[0], wallThickness)
    : getFaces(footprintWidth, footprintDepth, wallThickness);

  // --- Pre-pass: count instances ---
  let glassCount = 0;
  let solidCount = 0;
  let hMullionCount = 0;
  let vMullionCount = 0;

  for (const floor of aboveFloors) {
    for (const face of faces) {
      const cols = countWindowColumns(face.length, facade);
      const sideRatio = (face.side === "left" || face.side === "right") ? 0.6 : 1.0;
      const adjustedCols = Math.max(0, Math.round(cols * sideRatio));

      for (let c = 0; c < adjustedCols; c++) {
        const isCenterDoor = floor.isGroundFloor && face.side === "front" && adjustedCols > 2
          && c >= Math.floor(adjustedCols / 2) - 1 && c <= Math.floor(adjustedCols / 2);
        if (isCenterDoor) {
          solidCount++;
        } else if (seededRandom(floor.floorNo, c, faces.indexOf(face)) < facade.solidPanelChance) {
          solidCount++;
        } else {
          glassCount++;
        }
      }
      // Horizontal mullions: at slab line + at top of wall for this floor
      hMullionCount += 2;
      // Vertical mullions: at each window column edge (left + right) = adjustedCols + 1 total bars
      vMullionCount += adjustedCols + 1;
    }
  }
  // Parapet: 1 horizontal bar per face at building top
  hMullionCount += faces.length;

  // --- Create InstancedMesh objects ---
  const glassGeo = new THREE.PlaneGeometry(1, 1);
  const glassMat = pbrToMaterial(glassMaterialOverride || recipe.materials.glass);
  const glassIM = new THREE.InstancedMesh(glassGeo, glassMat, Math.max(1, glassCount));
  glassIM.castShadow = false;
  glassIM.receiveShadow = true;
  glassIM.userData = { type: "glass" };

  // Detailed spandrel-panel Blender module (unit-normalized, raised face
  // toward local +Z = exterior) or plain unit box. Instance scaling to
  // (windowWidth, winH, solidPanelDepth) is identical either way.
  // wallInsulation swaps in the EIFS-clad variant (same unit envelope and
  // axis convention) and deepens the panel by the added insulation.
  const solidPanelDepth = scenario.wallInsulation
    ? wallThickness + WALL_INSULATION_DEPTH
    : wallThickness;
  const solidGeo =
    getEquipmentGeometryClone(
      scenario.wallInsulation ? "facade-panel-insulated" : "facade-panel",
    ) ?? new THREE.BoxGeometry(1, 1, 1);
  const solidMat = pbrToMaterial(recipe.materials.wall);
  const solidIM = new THREE.InstancedMesh(solidGeo, solidMat, Math.max(1, solidCount));
  solidIM.castShadow = true;
  solidIM.receiveShadow = true;
  solidIM.userData = { type: "solidPanel" };

  // Curtain wall mullions: darker, more metallic for structural grid appearance
  const mullionConfig = glassMaterialOverride
    ? { ...recipe.materials.mullion, color: "#505860", metalness: 0.7, roughness: 0.3 }
    : recipe.materials.mullion;
  const mullionMat = pbrToMaterial(mullionConfig);
  // Detailed aluminum mullion profile (unit-normalized, length along Y,
  // exterior cap fin authored toward -Z → rotate 180° about Y so the cap
  // faces local +Z = outward). Horizontal bars reuse the same profile
  // rotated so its length axis runs along X.
  // windowUpgrade swaps in the thermally-broken twin-fin profile, authored
  // with the SAME unit envelope and axis convention → same rotations.
  const mullionAssetId = scenario.windowUpgrade ? "mullion-he" : "mullion";
  const vDetailedGeo = getEquipmentGeometryClone(mullionAssetId);
  if (vDetailedGeo) vDetailedGeo.rotateY(Math.PI);
  const hDetailedGeo = getEquipmentGeometryClone(mullionAssetId);
  if (hDetailedGeo) {
    hDetailedGeo.rotateY(Math.PI);
    hDetailedGeo.rotateZ(-Math.PI / 2);
  }
  const hGeo = hDetailedGeo ?? new THREE.BoxGeometry(1, 1, 1);
  const hIM = new THREE.InstancedMesh(hGeo, mullionMat, Math.max(1, hMullionCount));
  hIM.castShadow = true;
  hIM.receiveShadow = true;
  hIM.userData = { type: "hMullion" };

  const vGeo = vDetailedGeo ?? new THREE.BoxGeometry(1, 1, 1);
  const vMat = pbrToMaterial(recipe.materials.mullion);
  const vIM = new THREE.InstancedMesh(vGeo, vMat, Math.max(1, vMullionCount));
  vIM.castShadow = true;
  vIM.receiveShadow = true;
  vIM.userData = { type: "vMullion" };

  // --- Second pass: set matrices ---
  let gi = 0, si = 0, hi = 0, vi = 0;
  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (const floor of aboveFloors) {
    const clearHeight = floor.height - slab.thickness;
    const wallBaseY = floor.y + slab.thickness;

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      const cols = countWindowColumns(face.length, facade);
      const sideRatio = (face.side === "left" || face.side === "right") ? 0.6 : 1.0;
      const adjustedCols = Math.max(0, Math.round(cols * sideRatio));

      // Window column positions (local X, centered)
      const totalSpan = adjustedCols > 0
        ? adjustedCols * facade.windowWidth + (adjustedCols - 1) * (facade.windowSpacing - facade.windowWidth)
        : 0;
      const startX = -totalSpan / 2 + facade.windowWidth / 2;

      for (let c = 0; c < adjustedCols; c++) {
        const localX = adjustedCols === 1 ? 0 : startX + c * facade.windowSpacing;
        const localY = facade.sillHeight + facade.windowHeight / 2;
        const winH = Math.min(facade.windowHeight, clearHeight - facade.sillHeight - 0.2);

        const isCenterDoor = floor.isGroundFloor && face.side === "front" && adjustedCols > 2
          && c >= Math.floor(adjustedCols / 2) - 1 && c <= Math.floor(adjustedCols / 2);
        const isSolid = isCenterDoor || seededRandom(floor.floorNo, c, fi) < facade.solidPanelChance;

        // Transform: local coords → world coords via face position + rotation
        if (isSolid) {
          pos.set(localX, wallBaseY + localY, 0);
          pos.applyQuaternion(face.quaternion).add(face.position);
          scl.set(facade.windowWidth, winH, solidPanelDepth);
          mat4.compose(pos, face.quaternion, scl);
          solidIM.setMatrixAt(si++, mat4);
        } else {
          // Glass: inset from wall exterior
          const glassZ = wallThickness / 2 - facade.glassInset;
          pos.set(localX, wallBaseY + localY, glassZ);
          pos.applyQuaternion(face.quaternion).add(face.position);
          scl.set(facade.windowWidth, winH, 1);
          mat4.compose(pos, face.quaternion, scl);
          glassIM.setMatrixAt(gi++, mat4);
        }
      }

      // Horizontal mullions: bottom slab line + top of clear height
      const barWidth = face.length - 2 * facade.cornerInset;
      if (barWidth > 0) {
        // Bottom bar (at slab line)
        pos.set(0, wallBaseY, wallThickness / 2 + facade.mullionDepth / 2);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(barWidth, facade.mullionWidth, facade.mullionDepth);
        mat4.compose(pos, face.quaternion, scl);
        hIM.setMatrixAt(hi++, mat4);

        // Top bar (at top of clear height)
        pos.set(0, wallBaseY + clearHeight, wallThickness / 2 + facade.mullionDepth / 2);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(barWidth, facade.mullionWidth, facade.mullionDepth);
        mat4.compose(pos, face.quaternion, scl);
        hIM.setMatrixAt(hi++, mat4);
      }

      // Vertical mullions at window edges
      for (let c = 0; c <= adjustedCols; c++) {
        let localX: number;
        if (adjustedCols === 0) {
          localX = 0;
        } else if (c === 0) {
          localX = startX - facade.windowWidth / 2 - facade.mullionWidth / 2;
        } else if (c === adjustedCols) {
          localX = startX + (adjustedCols - 1) * facade.windowSpacing + facade.windowWidth / 2 + facade.mullionWidth / 2;
        } else {
          localX = startX + (c - 0.5) * facade.windowSpacing;
        }

        // Skip if too close to corner
        if (Math.abs(localX) > face.length / 2 - facade.cornerInset) continue;

        pos.set(localX, wallBaseY + clearHeight / 2, wallThickness / 2 + facade.mullionDepth / 2);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(facade.mullionWidth, clearHeight, facade.mullionDepth);
        mat4.compose(pos, face.quaternion, scl);
        vIM.setMatrixAt(vi++, mat4);
      }
    }
  }

  // Parapet at building top
  const topY = recipe.totalHeight;
  for (const face of faces) {
    const barWidth = face.length - 2 * facade.cornerInset;
    if (barWidth <= 0) continue;
    pos.set(0, topY + facade.parapetHeight / 2, wallThickness / 2 + facade.mullionDepth / 2);
    pos.applyQuaternion(face.quaternion).add(face.position);
    scl.set(barWidth, facade.parapetHeight, facade.mullionDepth);
    mat4.compose(pos, face.quaternion, scl);
    hIM.setMatrixAt(hi++, mat4);
  }

  // Update instance counts to actual used
  glassIM.count = gi;
  solidIM.count = si;
  hIM.count = hi;
  vIM.count = vi;
  glassIM.instanceMatrix.needsUpdate = true;
  solidIM.instanceMatrix.needsUpdate = true;
  hIM.instanceMatrix.needsUpdate = true;
  vIM.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(glassIM, solidIM, hIM, vIM);
  return group;
}
