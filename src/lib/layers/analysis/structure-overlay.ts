// src/lib/layers/analysis/structure-overlay.ts
//
// 구조 (Structure) analysis overlay — isolates the load-bearing system.
//
// Source preference is explicit and reported back to the caller:
//   1. `BimModelSnapshot` — the rich source. Structural Columns / Structural
//      Framing / Floors and system==="core" elements carry real placements,
//      real sizes and real level bindings, so the overlay draws the model that
//      exists rather than a re-derivation of it.
//   2. `BuildingRecipe` — fallback when the snapshot holds no structural
//      elements. Column positions come from `getColumnPositions` (the same
//      helper the procedural structure generator uses), slabs from the
//      footprint ring. Beams and grids are NOT synthesised here: the recipe
//      does not carry them, and drawing invented framing would be a lie.
//
// Grid lines are emitted only for `BimGrid` entries, which are axis-aligned
// (`axis: "x" | "z"`) by type. Rotated / skewed local grids are a documented
// gap in the BIM model — there is no rotation on `BimGrid`, so no rotated grid
// line is drawn or faked.
//
// Pure module: no React, no store access. Deterministic for a given input.

import * as THREE from "three";
import type { BimElement, BimLevel, BimModelSnapshot } from "@/lib/bim/model/types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { getColumnPositions } from "@/lib/structural-codes";
import {
  isUsableRings,
  STRUCTURE_OVERLAY_GROUP,
  type Ring,
} from "./overlay-types";

export type StructureSource = "snapshot" | "recipe";

export type StructureRole = "column" | "beam" | "slab" | "core";

/** An oriented box in world metres. `rotationY` is about the box centre. */
export interface StructureBox {
  id: string;
  role: StructureRole;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotationY: number;
}

export interface StructureSlab {
  id: string;
  /** Top-of-slab elevation, m. */
  topY: number;
  thicknessM: number;
  /** Real plate outline in world XZ metres when the snapshot carries one. */
  rings: Ring[] | null;
  /** Bounding-box fallback used when no outline is available. */
  centreX: number;
  centreZ: number;
  widthM: number;
  depthM: number;
}

export interface StructureGridLine {
  id: string;
  name: string;
  axis: "x" | "z";
  offset: number;
}

export interface StructureModel {
  source: StructureSource;
  columns: StructureBox[];
  beams: StructureBox[];
  slabs: StructureSlab[];
  core: StructureBox[];
  grids: StructureGridLine[];
}

const COLUMN_CATEGORY = "Structural Columns";
const FRAMING_CATEGORY = "Structural Framing";
const FLOOR_CATEGORY = "Floors";

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function levelMap(levels: readonly BimLevel[]): Map<string, BimLevel> {
  return new Map(levels.map((l) => [l.id, l]));
}

function parseRings(raw: unknown): Ring[] | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const rings: Ring[] = [];
    for (const ring of parsed) {
      if (!Array.isArray(ring)) return null;
      const pts: [number, number][] = [];
      for (const p of ring) {
        if (!Array.isArray(p) || p.length < 2) return null;
        const x = Number(p[0]);
        const z = Number(p[1]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        pts.push([x, z]);
      }
      rings.push(pts);
    }
    return isUsableRings(rings) ? rings : null;
  } catch {
    return null;
  }
}

/** True when the snapshot carries anything the structure overlay can draw. */
export function hasStructuralElements(snapshot: BimModelSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return snapshot.elements.some(
    (el) =>
      el.category === COLUMN_CATEGORY ||
      el.category === FRAMING_CATEGORY ||
      el.category === FLOOR_CATEGORY ||
      el.system === "core",
  );
}

/* ------------------------------------------------------------------ */
/* Snapshot collection                                                 */
/* ------------------------------------------------------------------ */

/**
 * Read the structural system out of a BIM snapshot.
 *
 * Elevation comes from the element's level (`placement.y` is 0 for generated
 * structure — the level binding is what carries height), so an element with no
 * resolvable level is skipped rather than dropped at y=0.
 */
export function collectStructureFromSnapshot(snapshot: BimModelSnapshot): StructureModel {
  const levels = levelMap(snapshot.levels);
  const columns: StructureBox[] = [];
  const beams: StructureBox[] = [];
  const slabs: StructureSlab[] = [];
  const core: StructureBox[] = [];

  for (const el of snapshot.elements) {
    const level = el.levelId ? levels.get(el.levelId) : undefined;

    if (el.category === COLUMN_CATEGORY) {
      if (!level) continue;
      const size = num(el.instanceParameters.widthMm, 400) / 1000;
      const depth = num(el.instanceParameters.depthMm, size * 1000) / 1000;
      columns.push({
        id: el.id,
        role: "column",
        x: el.placement.x,
        y: level.elevation + level.height / 2,
        z: el.placement.z,
        width: size,
        height: level.height,
        depth,
        rotationY: el.placement.rotationY,
      });
      continue;
    }

    if (el.category === FRAMING_CATEGORY) {
      if (!level) continue;
      const length = num(el.instanceParameters.lengthM);
      if (length <= 0) continue;
      const beamDepth = num(el.instanceParameters.depthMm, 600) / 1000;
      const beamWidth = num(el.instanceParameters.widthMm, 300) / 1000;
      beams.push({
        id: el.id,
        role: "beam",
        x: el.placement.x,
        y: level.elevation + level.height - beamDepth / 2,
        z: el.placement.z,
        width: length,
        height: beamDepth,
        depth: beamWidth,
        rotationY: el.placement.rotationY,
      });
      continue;
    }

    if (el.category === FLOOR_CATEGORY) {
      if (!level) continue;
      slabs.push({
        id: el.id,
        topY: level.elevation,
        thicknessM: num(el.instanceParameters.thicknessMm, 200) / 1000,
        rings: parseRings(el.instanceParameters.outlineJson),
        centreX: el.placement.x,
        centreZ: el.placement.z,
        widthM: num(el.instanceParameters.widthM),
        depthM: num(el.instanceParameters.depthM),
      });
      continue;
    }

    if (el.system === "core") {
      if (!level) continue;
      core.push(coreBox(el, level));
    }
  }

  return {
    source: "snapshot",
    columns,
    beams,
    slabs,
    core,
    grids: snapshot.grids.map((g) => ({
      id: g.id,
      name: g.name,
      axis: g.axis,
      offset: g.offset,
    })),
  };
}

/** Core walls use their start/end run; shafts, stairs and lifts use their rect. */
function coreBox(el: BimElement, level: BimLevel): StructureBox {
  if (el.kind === "wall") {
    const sx = num(el.instanceParameters.startX, el.placement.x);
    const sz = num(el.instanceParameters.startZ, el.placement.z);
    const ex = num(el.instanceParameters.endX, el.placement.x);
    const ez = num(el.instanceParameters.endZ, el.placement.z);
    const length = num(el.instanceParameters.lengthM, Math.hypot(ex - sx, ez - sz));
    const thickness = num(el.instanceParameters.thicknessMm, 200) / 1000;
    const height = num(el.instanceParameters.unconnectedHeightM, level.height);
    return {
      id: el.id,
      role: "core",
      x: (sx + ex) / 2,
      y: level.elevation + height / 2,
      z: (sz + ez) / 2,
      width: Math.max(length, 0.01),
      height,
      depth: thickness,
      rotationY: Math.atan2(ez - sz, ex - sx),
    };
  }
  const width = num(el.instanceParameters.widthM, 2);
  const depth = num(el.instanceParameters.depthM, 2);
  return {
    id: el.id,
    role: "core",
    x: el.placement.x,
    y: level.elevation + level.height / 2,
    z: el.placement.z,
    width,
    height: level.height,
    depth,
    rotationY: el.placement.rotationY,
  };
}

/* ------------------------------------------------------------------ */
/* Recipe fallback                                                     */
/* ------------------------------------------------------------------ */

/**
 * Fallback structural system implied by the recipe. Columns follow
 * `getColumnPositions` (shared with structure-generator.ts) and one slab is
 * emitted per floor. No beams and no grids — the recipe carries neither.
 */
export function collectStructureFromRecipe(recipe: BuildingRecipe): StructureModel {
  const positions = getColumnPositions(recipe);
  const size = recipe.column.size;
  const columns: StructureBox[] = [];
  const slabs: StructureSlab[] = [];

  const rings: Ring[] | null = isUsableRings(recipe.footprintPolygon)
    ? recipe.footprintPolygon
    : null;

  for (const floor of recipe.floors) {
    for (const pos of positions) {
      columns.push({
        id: `recipe-column-${floor.floorNo}-${pos.x.toFixed(3)}-${pos.z.toFixed(3)}`,
        role: "column",
        x: pos.x,
        y: floor.y + floor.height / 2,
        z: pos.z,
        width: size,
        height: floor.height,
        depth: size,
        rotationY: 0,
      });
    }
    slabs.push({
      id: `recipe-slab-${floor.floorNo}`,
      topY: floor.y,
      thicknessM: recipe.slab.thickness,
      rings,
      centreX: 0,
      centreZ: 0,
      widthM: recipe.footprintWidth,
      depthM: recipe.footprintDepth,
    });
  }

  return { source: "recipe", columns, beams: [], slabs, core: [], grids: [] };
}

/**
 * Snapshot when it has structure, recipe otherwise. `snapshot` is also rejected
 * when it belongs to a different building than the one being viewed.
 */
export function collectStructureModel(input: {
  snapshot: BimModelSnapshot | null | undefined;
  recipe: BuildingRecipe;
  buildingPk: string;
}): StructureModel {
  const { snapshot, recipe, buildingPk } = input;
  if (snapshot && snapshot.buildingPk === buildingPk && hasStructuralElements(snapshot)) {
    return collectStructureFromSnapshot(snapshot);
  }
  return collectStructureFromRecipe(recipe);
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export const STRUCTURE_ROLE_COLORS: Record<StructureRole, string> = {
  column: "#475569",
  beam: "#0ea5e9",
  slab: "#cbd5e1",
  core: "#f59e0b",
};

export const STRUCTURE_GRID_COLOR = "#8b5cf6";

const STRUCTURE_OPACITY = 0.72;

function xrayMaterial(color: string): THREE.MeshBasicMaterial {
  // depthTest off so the isolate reads through the facade — this is an x-ray
  // overlay, not building geometry.
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: STRUCTURE_OPACITY,
    depthWrite: false,
    depthTest: false,
  });
}

function instancedBoxes(
  boxes: readonly StructureBox[],
  role: StructureRole,
): THREE.InstancedMesh | null {
  if (boxes.length === 0) return null;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(
    geo,
    xrayMaterial(STRUCTURE_ROLE_COLORS[role]),
    boxes.length,
  );
  mesh.name = `structure-${role}s`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();

  boxes.forEach((box, i) => {
    position.set(box.x, box.y, box.z);
    euler.set(0, box.rotationY, 0);
    quaternion.setFromEuler(euler);
    scale.set(
      Math.max(box.width, 1e-4),
      Math.max(box.height, 1e-4),
      Math.max(box.depth, 1e-4),
    );
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData = { type: "analysis-structure", role, count: boxes.length };
  return mesh;
}

function slabMesh(slab: StructureSlab): THREE.Mesh {
  const material = xrayMaterial(STRUCTURE_ROLE_COLORS.slab);
  const thickness = Math.max(slab.thicknessM, 0.02);
  let geo: THREE.BufferGeometry;

  if (slab.rings && isUsableRings(slab.rings)) {
    const [outer, ...holes] = slab.rings;
    const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const hole of holes) {
      if (hole.length < 3) continue;
      shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
    }
    geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    // Shape space is (X, Y, extrusion). rotateX(-π/2) maps it to (X, extrusion,
    // -Y) — the same mapping buildCapGeometry uses, which is why the ring's z
    // was negated on the way into the Shape. The plate then spans y = 0..t, so
    // shift it down to put the top face at topY.
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, slab.topY - thickness, 0);
  } else {
    geo = new THREE.BoxGeometry(
      Math.max(slab.widthM, 0.01),
      thickness,
      Math.max(slab.depthM, 0.01),
    );
    geo.translate(slab.centreX, slab.topY - thickness / 2, slab.centreZ);
  }

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = `structure-slab:${slab.id}`;
  mesh.renderOrder = 4;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData = { type: "analysis-structure", role: "slab", slabId: slab.id };
  return mesh;
}

function gridLines(
  grids: readonly StructureGridLine[],
  halfExtent: number,
  topY: number,
): THREE.LineSegments | null {
  if (grids.length === 0) return null;
  const positions: number[] = [];
  for (const grid of grids) {
    if (grid.axis === "x") {
      // A grid on the x axis is a line of constant x running along z.
      positions.push(grid.offset, topY, -halfExtent, grid.offset, topY, halfExtent);
    } else {
      positions.push(-halfExtent, topY, grid.offset, halfExtent, topY, grid.offset);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(STRUCTURE_GRID_COLOR),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = "structure-grids";
  lines.renderOrder = 5;
  lines.frustumCulled = false;
  lines.userData = { type: "analysis-structure", role: "grid", count: grids.length };
  return lines;
}

export interface StructureOverlayInput {
  model: StructureModel;
  /** Half the plan extent used to span grid lines, m. */
  halfExtentM: number;
  /** Elevation the grid lines are drawn at, m. */
  gridY: number;
}

/** Build the 구조 overlay group. */
export function buildStructureOverlay(input: StructureOverlayInput): THREE.Group {
  const { model, halfExtentM, gridY } = input;
  const group = new THREE.Group();
  group.name = STRUCTURE_OVERLAY_GROUP;

  const columns = instancedBoxes(model.columns, "column");
  if (columns) group.add(columns);
  const beams = instancedBoxes(model.beams, "beam");
  if (beams) group.add(beams);
  const core = instancedBoxes(model.core, "core");
  if (core) group.add(core);

  if (model.slabs.length > 0) {
    const slabGroup = new THREE.Group();
    slabGroup.name = "structure-slabs";
    for (const slab of model.slabs) slabGroup.add(slabMesh(slab));
    group.add(slabGroup);
  }

  const grids = gridLines(model.grids, halfExtentM, gridY);
  if (grids) group.add(grids);

  return group;
}
