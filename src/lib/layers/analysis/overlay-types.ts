// src/lib/layers/analysis/overlay-types.ts
// Shared vocabulary for the three semantic analysis overlays (외피 / 구조 / 에너지존).
//
// These overlays are ANALYSIS views drawn on top of the twin — they are not the
// twin's own envelope/structure geometry (that is owned by ProceduralBuilding and
// toggled by the existing `envelope` / `structure` LayerIds). They therefore carry
// their own id space and their own visibility record so an analyst can x-ray the
// physics without losing the building.
//
// Pure module: no React, no Zustand, no DOM. Deterministic for a given input.

import * as THREE from "three";

/** Analysis-overlay identifier — parallel to LayerId, never merged into it. */
export type AnalysisOverlayId =
  | "overlay-envelope"
  | "overlay-structure"
  | "overlay-zone";

/** All valid analysis-overlay ids, in panel order. */
export const ANALYSIS_OVERLAY_IDS: AnalysisOverlayId[] = [
  "overlay-envelope",
  "overlay-structure",
  "overlay-zone",
];

export interface AnalysisOverlayConfig {
  id: AnalysisOverlayId;
  name: string;
  nameKo: string;
  color: string;
  description: string;
  descriptionKo: string;
}

export const ANALYSIS_OVERLAY_CONFIGS: Record<
  AnalysisOverlayId,
  AnalysisOverlayConfig
> = {
  "overlay-envelope": {
    id: "overlay-envelope",
    name: "Envelope heat loss",
    nameKo: "외피 열손실",
    color: "#38bdf8",
    description: "Shells graded by heat-loss share (W/K)",
    descriptionKo: "열손실 분담률(W/K)로 등급화한 외피",
  },
  "overlay-structure": {
    id: "overlay-structure",
    name: "Structure isolate",
    nameKo: "구조 분리",
    color: "#a3a3a3",
    description: "Columns, framing, slabs, core, grids",
    descriptionKo: "기둥·보·슬래브·코어·그리드",
  },
  "overlay-zone": {
    id: "overlay-zone",
    name: "Energy zones",
    nameKo: "에너지 존",
    color: "#fb923c",
    description: "Rooms grouped by program, shaded by demand",
    descriptionKo: "용도별 실 그룹, 수요로 음영",
  },
};

/** Root group names — one per overlay, used for targeted lookup and disposal. */
export const ENVELOPE_OVERLAY_GROUP = "analysis-envelope-overlay";
export const STRUCTURE_OVERLAY_GROUP = "analysis-structure-overlay";
export const ZONE_OVERLAY_GROUP = "analysis-zone-overlay";

/* ------------------------------------------------------------------ */
/* Colour banding                                                      */
/* ------------------------------------------------------------------ */

/**
 * Five-step ramp, cool → hot. Index 0 is the smallest contribution.
 * Shared by the envelope (heat-loss share) and zone (demand share) overlays so
 * one legend key reads across both.
 */
export const ANALYSIS_BAND_COLORS = [
  "#2563eb", // 0 — lowest
  "#0ea5e9", // 1
  "#22c55e", // 2
  "#f59e0b", // 3
  "#dc2626", // 4 — highest
] as const;

export const ANALYSIS_BAND_COUNT = ANALYSIS_BAND_COLORS.length;

/**
 * Map a 0..1 fraction to a band index. Monotone non-decreasing in `fraction`;
 * non-finite and negative inputs collapse to band 0, ≥1 to the top band.
 */
export function analysisBandIndex(fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= 0) return 0;
  if (fraction >= 1) return ANALYSIS_BAND_COUNT - 1;
  return Math.min(
    ANALYSIS_BAND_COUNT - 1,
    Math.floor(fraction * ANALYSIS_BAND_COUNT),
  );
}

/** Band colour for a 0..1 fraction. Monotone in the same sense as the index. */
export function analysisBandColor(fraction: number): string {
  return ANALYSIS_BAND_COLORS[analysisBandIndex(fraction)];
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Footprint ring in local metres, [x, z] pairs. */
export type Ring = [number, number][];

export function isUsableRings(rings: Ring[] | undefined): rings is Ring[] {
  return Array.isArray(rings) && rings.length > 0 && rings[0].length >= 3;
}

/** Signed shoelace area of a ring. Positive = counter-clockwise in XZ. */
export function signedRingArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    twice += x1 * z2 - x2 * z1;
  }
  return twice / 2;
}

export function ringPerimeter(ring: Ring): number {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    total += Math.hypot(x2 - x1, z2 - z1);
  }
  return total;
}

/** Axis-aligned rectangle ring centred on the origin — the no-polygon fallback. */
export function rectRing(width: number, depth: number): Ring {
  const hw = width / 2;
  const hd = depth / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
}

/**
 * Outward unit normal of edge `i` of a ring, in XZ.
 *
 * "Outward" means away from the enclosed solid: for the outer ring that is away
 * from the building, for a courtyard ring that is into the void. Direction is
 * derived from the ring's own winding, so CAD rings that arrive in either
 * orientation both resolve correctly.
 */
export function edgeOutwardNormal(
  ring: Ring,
  index: number,
  isHole: boolean,
): [number, number] {
  const [x1, z1] = ring[index];
  const [x2, z2] = ring[(index + 1) % ring.length];
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len === 0) return [0, 0];
  const winding = signedRingArea(ring) >= 0 ? 1 : -1;
  const sign = isHole ? -winding : winding;
  return [(sign * dz) / len, (-sign * dx) / len];
}

/**
 * Copy of `rings` pushed `offset` metres along each edge's outward normal.
 * This is a RENDER offset only (it keeps the translucent shell off the twin's
 * own faces to avoid z-fighting); no quantity is ever measured from it.
 */
export function offsetRings(rings: Ring[], offset: number): Ring[] {
  return rings.map((ring, ringIndex) => {
    const isHole = ringIndex > 0;
    return ring.map((_, i) => {
      // Average the normals of the two edges meeting at this vertex so corners
      // stay closed instead of splitting.
      const prev = (i - 1 + ring.length) % ring.length;
      const [nx1, nz1] = edgeOutwardNormal(ring, prev, isHole);
      const [nx2, nz2] = edgeOutwardNormal(ring, i, isHole);
      let nx = nx1 + nx2;
      let nz = nz1 + nz2;
      const len = Math.hypot(nx, nz);
      if (len > 0) {
        nx /= len;
        nz /= len;
      }
      const [x, z] = ring[i];
      return [x + nx * offset, z + nz * offset] as [number, number];
    });
  });
}

/**
 * Vertical band of quads following every ring, from `yBottom` to `yTop`.
 * Double-sided by construction is unnecessary — callers set
 * `side: THREE.DoubleSide` on the material.
 */
export function buildRingBandGeometry(
  rings: Ring[],
  yBottom: number,
  yTop: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      // two triangles per edge
      positions.push(x1, yBottom, z1, x2, yBottom, z2, x2, yTop, z2);
      positions.push(x1, yBottom, z1, x2, yTop, z2, x1, yTop, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Horizontal cap (outer ring minus holes) at `y`.
 * `THREE.Shape` is authored in XY, so the ring's z is negated on the way in and
 * `rotateX(-π/2)` maps it back to +z (see energy-heatmap-builder for the same trick).
 */
export function buildCapGeometry(rings: Ring[], y: number): THREE.BufferGeometry {
  const [outer, ...holes] = rings;
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) {
    if (hole.length < 3) continue;
    shape.holes.push(
      new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
    );
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** Translucent overlay material with the shared render settings. */
export function overlayMaterial(
  color: string,
  opacity: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** Recursive geometry + material disposal, matching building-layers.tsx. */
export function disposeObject3D(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  root.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.InstancedMesh ||
      obj instanceof THREE.Points ||
      obj instanceof THREE.Line ||
      obj instanceof THREE.LineSegments
    ) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m: THREE.Material) => m.dispose());
      } else if (mat) {
        (mat as THREE.Material).dispose();
      }
    }
  });
}
