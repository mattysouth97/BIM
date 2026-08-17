// src/lib/procedural/facade-generator.ts
// InstancedMesh facade generator — glass, mullions, solid panels.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe, FacadeConfig, FloorSpec } from "./types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import {
  getEquipmentGeometryClone,
  getEquipmentObjectClone,
} from "@/lib/equipment-assets";
import { pointInRing } from "@/lib/gis/ring-utils";
import {
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "@/lib/layers/equipment-scenario";
import { finishedRoofTopY } from "./roof-surface";

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

export interface FacadeGenerationOptions {
  /** Mixed-use recipes render one facade per section, but only the top section owns the parapet. */
  includeParapet?: boolean;
  /** Override the parapet base elevation. Flat roofs default to their finished top surface. */
  parapetBaseY?: number;
}

function samePoint(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function signedArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    area += x0 * z1 - x1 * z0;
  }
  return area / 2;
}

/**
 * Return an open, counter-clockwise outer ring. Keeping this convention makes
 * each edge's left normal point inward and its right normal point outward.
 */
function normalizeOuterRing(outerRing: [number, number][]): [number, number][] {
  if (outerRing.length === 0) return [];
  const ring = outerRing.map(([x, z]) => [x, z] as [number, number]);
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) {
    ring.pop();
  }
  return signedArea(ring) < 0 ? ring.reverse() : ring;
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
  const ring = normalizeOuterRing(outerRing);
  const n = ring.length;

  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % n];

    const dx = x1 - x0;
    const dz = z1 - z0;
    const edgeLength = Math.hypot(dx, dz);
    if (edgeLength < 0.1) continue;  // skip degenerate edges

    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;

    // Outward normal: take a perpendicular of the edge and flip it if a probe
    // point on that side is still inside the ring. Winding-agnostic — VWorld
    // and CAD rings arrive in either orientation.
    let nx = dz / edgeLength;
    let nz = -dx / edgeLength;
    if (pointInRing(midX + nx * 0.5, midZ + nz * 0.5, outerRing)) {
      nx = -nx;
      nz = -nz;
    }
    const inwardX = -nx;
    const inwardZ = -nz;

    // Position the face plane at the wall centre (inward by wallThickness/2
    // from the ring line — same convention as the rectangular getFaces path)
    const facePos = new THREE.Vector3(
      midX + inwardX * wallThickness / 2,
      0,
      midZ + inwardZ * wallThickness / 2,
    );

    // Yaw a +Z-facing quad so its normal matches the outward normal — which
    // also lays its local X (the window-layout axis) along the edge. The
    // previous atan2(dx, dz) form pointed local X PERPENDICULAR to the edge,
    // marching every window strip off the wall into mid-air.
    const quat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(nx, nz),
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

interface WindowLayout {
  adjustedCols: number;
  startX: number;
  winH: number;
  sillH: number;
}

function windowLayoutForFace(
  face: FaceDesc,
  floor: FloorSpec,
  facade: FacadeConfig,
  slabThickness: number,
  faceIndex: number,
  faceCount: number,
): WindowLayout {
  const cols = countWindowColumns(face.length, facade);
  const sideRatio = (face.side === "left" || face.side === "right") ? 0.6 : 1.0;
  const adjustedCols = Math.max(0, Math.round(cols * sideRatio));
  const clearHeight = floor.height - slabThickness;
  const sillH = Math.max(0.15, Math.min(facade.sillHeight, Math.max(0.15, clearHeight - 0.4)));
  const winH = Math.min(facade.windowHeight, Math.max(0.4, clearHeight - sillH - 0.15));
  const totalSpan = adjustedCols > 0
    ? adjustedCols * facade.windowWidth + (adjustedCols - 1) * (facade.windowSpacing - facade.windowWidth)
    : 0;
  const startX = -totalSpan / 2 + facade.windowWidth / 2;
  void faceIndex;
  void faceCount;
  return { adjustedCols, startX, winH, sillH };
}

/**
 * Continuous cladding that fills the wall around punched openings.
 * Sill/head bands hide the slab and beam line; piers hide the columns.
 * Without this the envelope is only glass + rails and the structure reads
 * as the outer skin.
 */
function claddingSlotsForFace(
  face: FaceDesc,
  floor: FloorSpec,
  facade: FacadeConfig,
  slabThickness: number,
  layout: WindowLayout,
  curtainSkin: boolean,
): { x: number; y: number; sx: number; sy: number }[] {
  const slots: { x: number; y: number; sx: number; sy: number }[] = [];
  const barWidth = face.length - 2 * facade.cornerInset;
  if (barWidth < 0.08) return slots;

  // Curtain-wall offices stay glass-forward. Only a thin slab-edge
  // spandrel hides the beam line — full punched-window fill belongs
  // on residential / solid facades.
  if (curtainSkin) {
    const band = Math.min(0.4, slabThickness + 0.16);
    if (band > 0.08) {
      slots.push({ x: 0, y: floor.y + band / 2, sx: barWidth, sy: band });
    }
    return slots;
  }

  const wallBaseY = floor.y + slabThickness;
  const floorTop = floor.y + floor.height;
  const { adjustedCols, startX, winH, sillH } = layout;

  if (adjustedCols === 0) {
    const h = floor.height;
    if (h > 0.08) slots.push({ x: 0, y: floor.y + h / 2, sx: barWidth, sy: h });
    return slots;
  }

  const windowBottom = wallBaseY + sillH;
  const windowTop = windowBottom + winH;
  const sillBandH = windowBottom - floor.y;
  const headH = floorTop - windowTop;

  if (sillBandH > 0.08) {
    slots.push({ x: 0, y: floor.y + sillBandH / 2, sx: barWidth, sy: sillBandH });
  }
  if (headH > 0.08) {
    slots.push({ x: 0, y: windowTop + headH / 2, sx: barWidth, sy: headH });
  }

  const leftEdge = -face.length / 2 + facade.cornerInset;
  const rightEdge = face.length / 2 - facade.cornerInset;
  const xs: number[] = [leftEdge];
  for (let c = 0; c < adjustedCols; c++) {
    const cx = adjustedCols === 1 ? 0 : startX + c * facade.windowSpacing;
    xs.push(cx - facade.windowWidth / 2, cx + facade.windowWidth / 2);
  }
  xs.push(rightEdge);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const w = xs[i + 1] - xs[i];
    if (w > 0.08) {
      slots.push({
        x: (xs[i] + xs[i + 1]) / 2,
        y: windowBottom + winH / 2,
        sx: w,
        sy: winH,
      });
    }
  }
  return slots;
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
function isFacadeGenerationOptions(
  value: EquipmentScenario | FacadeGenerationOptions,
): value is FacadeGenerationOptions {
  return "includeParapet" in value || "parapetBaseY" in value;
}

/**
 * `scenarioOrOptions` accepts either the green-retrofit equipment scenario
 * (window/wall swaps) or mixed-use parapet options so existing call sites
 * keep compiling. Pass both via the 3-arg form.
 */
export function generateFacade(
  recipe: BuildingRecipe,
  scenarioOrOptions: EquipmentScenario | FacadeGenerationOptions = SHOWCASE_EQUIPMENT_SCENARIO,
  maybeOptions: FacadeGenerationOptions = {},
): THREE.Group {
  const scenario = isFacadeGenerationOptions(scenarioOrOptions)
    ? SHOWCASE_EQUIPMENT_SCENARIO
    : scenarioOrOptions;
  const options = isFacadeGenerationOptions(scenarioOrOptions)
    ? scenarioOrOptions
    : maybeOptions;
  const { slab, wallThickness, footprintWidth, footprintDepth, floors } = recipe;
  const aboveFloors = floors.filter(f => f.type === "above");
  if (aboveFloors.length === 0) return new THREE.Group();

  // Apply curtain wall overrides if applicable
  const { facade: cwFacade, glassMaterialOverride } = applyCurtainWallOverrides(recipe.facade, recipe);
  const facade = cwFacade;
  const curtainSkin =
    recipe.curtainWall?.enabled === true && facade.windowRatio > 0.65;

  const faces = recipe.footprintPolygon && recipe.footprintPolygon[0]?.length >= 3
    ? getPolygonFaces(recipe.footprintPolygon[0], wallThickness)
    : getFaces(footprintWidth, footprintDepth, wallThickness);

  // --- Pre-pass: count instances ---
  let glassCount = 0;
  let solidCount = 0;
  let hMullionCount = 0;
  let vMullionCount = 0;

  for (const floor of aboveFloors) {
    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      const layout = windowLayoutForFace(face, floor, facade, slab.thickness, fi, faces.length);
      solidCount += claddingSlotsForFace(face, floor, facade, slab.thickness, layout, curtainSkin).length;

      for (let c = 0; c < layout.adjustedCols; c++) {
        const isCenterDoor = floor.isGroundFloor && face.side === "front" && layout.adjustedCols > 2
          && c >= Math.floor(layout.adjustedCols / 2) - 1 && c <= Math.floor(layout.adjustedCols / 2);
        if (isCenterDoor) {
          solidCount++;
        } else if (seededRandom(floor.floorNo, c, fi) < facade.solidPanelChance) {
          solidCount++;
        } else {
          glassCount++;
        }
      }
      // Horizontal mullions: at slab line + at top of wall for this floor
      hMullionCount += 2;
      // Vertical mullions: at each window column edge (left + right) = adjustedCols + 1 total bars
      vMullionCount += layout.adjustedCols + 1;
    }
  }
  const includeParapet = options.includeParapet ?? recipe.roof.type === "flat";
  // Parapet is cladding (solid panels sitting on the roof), not a mullion rail.
  if (includeParapet) solidCount += faces.length;

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
  // Graceful degrade: if the retrofit-only "facade-panel-insulated" variant
  // failed to preload, fall back to the baseline "facade-panel" asset (which
  // preloads independently and is very likely cached) before the plain box —
  // never worse than the pre-retrofit look just because one GLB dropped out.
  const solidGeo =
    getEquipmentGeometryClone(
      scenario.wallInsulation ? "facade-panel-insulated" : "facade-cladding",
    ) ??
    getEquipmentGeometryClone("facade-cladding") ??
    getEquipmentGeometryClone("facade-panel") ??
    new THREE.BoxGeometry(1, 1, 1);
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
  // Graceful degrade: if the retrofit-only "mullion-he" variant failed to
  // preload, fall back to the baseline "mullion" asset (which preloads
  // independently and is very likely cached) before the plain box — never
  // worse than the pre-retrofit look just because one GLB dropped out.
  const mullionAssetId = scenario.windowUpgrade ? "mullion-he" : "mullion";
  const vDetailedGeo =
    getEquipmentGeometryClone(mullionAssetId) ?? getEquipmentGeometryClone("mullion");
  if (vDetailedGeo) vDetailedGeo.rotateY(Math.PI);
  const hDetailedGeo =
    getEquipmentGeometryClone(mullionAssetId) ?? getEquipmentGeometryClone("mullion");
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
    const railHeight = Math.min(facade.mullionWidth, Math.max(0, clearHeight / 2));
    const verticalHeight = Math.max(0, clearHeight - 2 * railHeight);
    const verticalCenterY = wallBaseY + railHeight + verticalHeight / 2;

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      const layout = windowLayoutForFace(face, floor, facade, slab.thickness, fi, faces.length);
      const { adjustedCols, startX, winH, sillH } = layout;

      for (const slot of claddingSlotsForFace(face, floor, facade, slab.thickness, layout, curtainSkin)) {
        pos.set(slot.x, slot.y, 0);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(slot.sx, slot.sy, solidPanelDepth);
        mat4.compose(pos, face.quaternion, scl);
        solidIM.setMatrixAt(si++, mat4);
      }

      for (let c = 0; c < adjustedCols; c++) {
        const localX = adjustedCols === 1 ? 0 : startX + c * facade.windowSpacing;
        const localY = sillH + winH / 2;

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

      // Horizontal mullions sit fully inside the clear facade zone and touch
      // the slabs without penetrating them.
      const barWidth = face.length - 2 * facade.cornerInset;
      if (barWidth > 0 && railHeight > 0) {
        pos.set(0, wallBaseY + railHeight / 2, wallThickness / 2 + facade.mullionDepth / 2);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(barWidth, railHeight, facade.mullionDepth);
        mat4.compose(pos, face.quaternion, scl);
        hIM.setMatrixAt(hi++, mat4);

        pos.set(0, wallBaseY + clearHeight - railHeight / 2, wallThickness / 2 + facade.mullionDepth / 2);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(barWidth, railHeight, facade.mullionDepth);
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

        if (verticalHeight <= 0) continue;
        pos.set(localX, verticalCenterY, wallThickness / 2 + facade.mullionDepth / 2);
        pos.applyQuaternion(face.quaternion).add(face.position);
        scl.set(facade.mullionWidth, verticalHeight, facade.mullionDepth);
        mat4.compose(pos, face.quaternion, scl);
        vIM.setMatrixAt(vi++, mat4);
      }
    }
  }

  if (includeParapet) {
    const parapetBaseY = options.parapetBaseY ?? finishedRoofTopY(recipe);
    for (const face of faces) {
      const barWidth = face.length - 2 * facade.cornerInset;
      if (barWidth <= 0) continue;
      // Continue the wall cladding above the roof deck — same centerline as
      // the storey panels, so the parapet does not sit in the roof volume.
      pos.set(0, parapetBaseY + facade.parapetHeight / 2, 0);
      pos.applyQuaternion(face.quaternion).add(face.position);
      scl.set(barWidth, facade.parapetHeight, solidPanelDepth);
      mat4.compose(pos, face.quaternion, scl);
      solidIM.setMatrixAt(si++, mat4);
    }
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

  // Parapet coping — 1 m Blender modules tiled along each face, sitting on
  // the cladding (not inside the roof slab).
  if (includeParapet) {
    const capGeo = getEquipmentGeometryClone("parapet-cap");
    if (capGeo) {
      const parapetBaseY = options.parapetBaseY ?? finishedRoofTopY(recipe);
      const capY = parapetBaseY + facade.parapetHeight;
      let capSlots = 0;
      for (const face of faces) {
        const barWidth = face.length - 2 * facade.cornerInset;
        if (barWidth > 0.3) capSlots += Math.max(1, Math.ceil(barWidth));
      }
      const capIM = new THREE.InstancedMesh(
        capGeo,
        pbrToMaterial(recipe.materials.roof),
        Math.max(1, capSlots),
      );
      capIM.castShadow = true;
      capIM.receiveShadow = true;
      capIM.userData = { type: "parapetCap" };
      let ci = 0;
      for (const face of faces) {
        const barWidth = face.length - 2 * facade.cornerInset;
        if (barWidth <= 0.3) continue;
        const n = Math.max(1, Math.ceil(barWidth));
        const piece = barWidth / n;
        const start = -barWidth / 2 + piece / 2;
        for (let k = 0; k < n; k++) {
          pos.set(start + k * piece, capY, 0);
          pos.applyQuaternion(face.quaternion).add(face.position);
          scl.set(piece, 1, 1);
          mat4.compose(pos, face.quaternion, scl);
          capIM.setMatrixAt(ci++, mat4);
        }
      }
      capIM.count = ci;
      capIM.instanceMatrix.needsUpdate = true;
      group.add(capIM);
    }
  }

  // Hosted balconies — glass rail matching the Revit 외피 reference.
  // Skip the ground floor and solid/door bays; every other vision bay on
  // the long faces so the skin reads as architecture, not a frame.
  if (!curtainSkin && getEquipmentObjectClone("balcony-module")) {
    const balconyGroup = new THREE.Group();
    balconyGroup.name = "balconies";
    const outward = wallThickness / 2 + 0.02;
    for (const floor of aboveFloors) {
      if (floor.isGroundFloor) continue;
      for (let fi = 0; fi < faces.length; fi++) {
        const face = faces[fi];
        if (face.side !== "front" && face.side !== "back") continue;
        const layout = windowLayoutForFace(face, floor, facade, slab.thickness, fi, faces.length);
        for (let c = 0; c < layout.adjustedCols; c++) {
          if (c % 2 !== 0) continue;
          const isCenterDoor = false;
          const isSolid =
            isCenterDoor ||
            seededRandom(floor.floorNo, c, fi) < facade.solidPanelChance;
          if (isSolid) continue;
          const localX =
            layout.adjustedCols === 1 ? 0 : layout.startX + c * facade.windowSpacing;
          const inst = getEquipmentObjectClone("balcony-module");
          if (!inst) continue;
          pos.set(localX, floor.y + slab.thickness, outward);
          pos.applyQuaternion(face.quaternion).add(face.position);
          inst.position.copy(pos);
          inst.quaternion.copy(face.quaternion);
          inst.userData = { type: "balcony" };
          balconyGroup.add(inst);
        }
      }
    }
    if (balconyGroup.children.length > 0) group.add(balconyGroup);
  }

  return group;
}
