/**
 * earcut-extrude.ts
 *
 * Pure utility: convert GeoJSON polygon rings (already projected to local
 * XZ meter-space) into a Three.js BufferGeometry by extruding upward along Y.
 *
 * No React, no R3F — pure Three.js + earcut only.
 *
 * Callers are responsible for projecting WGS84 coordinates to local [x, z]
 * meter-space before passing rings to extrudePolygon() (use gis-transform.ts).
 */

import earcut, { flatten as earcutFlatten } from "earcut";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Signed area of a 2-D polygon ring via the shoelace formula.
 * Positive = CCW in standard math coordinates (x right, z up).
 * Negative = CW.
 */
function signedArea(ring: [number, number][]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return area / 2;
}

/**
 * Ensure the outer ring is CCW and each hole ring is CW, as earcut requires.
 * If the winding is wrong, a reversed copy is returned; otherwise the
 * original array reference is returned unchanged (no unnecessary allocation).
 */
function normaliseRings(
  rings: [number, number][][]
): [number, number][][] {
  return rings.map((ring, idx) => {
    const area = signedArea(ring);
    const isOuter = idx === 0;
    // Outer ring must be CCW (area > 0), holes must be CW (area < 0).
    // If area === 0 the ring is degenerate — leave as-is.
    if (area === 0) return ring;
    const needsReverse = isOuter ? area < 0 : area > 0;
    if (!needsReverse) return ring;
    const copy = ring.slice().reverse() as [number, number][];
    return copy;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extrude GeoJSON-style polygon rings into a Three.js BufferGeometry.
 *
 * @param rings         [outerRing, ...holes] — each point is [x, z] in local
 *                      meter-space. Rings may be open or closed (last point
 *                      equal to first is fine; earcut handles both).
 * @param heightMeters  Extrusion height in meters (along +Y).
 * @param baseY         Y position of the base cap (default 0). Use this for
 *                      per-floor stacking.
 * @returns             A BufferGeometry with position + index attributes and
 *                      computed vertex normals. No material is applied.
 */
export function extrudePolygon(
  rings: [number, number][][],
  heightMeters: number,
  baseY = 0
): THREE.BufferGeometry {
  // Normalise winding order before handing to earcut
  const normRings = normaliseRings(rings);

  // earcut.flatten converts GeoJSON-style rings to the flat array format
  // earcut expects.  We pass 2-D points [x, z] so dimensions = 2.
  const { vertices, holes, dimensions } = earcutFlatten(
    normRings as number[][][]
  );

  // Triangle indices for the XZ-plane cap (shared by both top and bottom caps)
  const capIndices = earcut(vertices, holes, dimensions);
  const capTriCount = capIndices.length / 3;

  // Number of unique 2-D vertices (from earcut.flatten)
  const vertexCount = vertices.length / dimensions; // dimensions === 2

  // -------------------------------------------------------------------------
  // Vertex layout in the position buffer:
  //
  //   [0 … vertexCount-1]              → bottom cap  (y = baseY)
  //   [vertexCount … 2*vertexCount-1]  → top cap     (y = baseY + heightMeters)
  //   [2*vertexCount … ]               → side quads  (4 verts × edge count)
  //
  // We use un-indexed triangle lists for simplicity and then call
  // computeVertexNormals() to get smooth normals for side faces.
  // -------------------------------------------------------------------------

  // Count side vertices: only the OUTER ring produces side quads.
  // The outer ring in the flat vertices array runs from index 0 to
  // (holes[0] - 1) if holes exist, or to (vertexCount - 1) otherwise.
  // earcut.flatten places the outer ring first; holes[0] is the start index
  // of the first hole in the flat vertices array (in terms of point indices).
  const outerVertexCount = holes.length > 0 ? holes[0] : vertexCount;

  // Each edge of the outer ring produces one side quad (2 triangles = 6 verts)
  // The outer ring may or may not be "closed" (first == last) in the input.
  // earcut.flatten keeps the closing vertex in the flat array, but we should
  // not create a side quad for the degenerate zero-length closing edge.
  // We detect closure by checking if the last outer point equals the first.
  const outerPoints: [number, number][] = [];
  for (let i = 0; i < outerVertexCount; i++) {
    outerPoints.push([vertices[i * 2], vertices[i * 2 + 1]]);
  }

  // Remove closing point if ring is closed (avoids zero-length side edge)
  const lastPt = outerPoints[outerPoints.length - 1];
  const firstPt = outerPoints[0];
  const isClosed =
    lastPt[0] === firstPt[0] && lastPt[1] === firstPt[1];
  const edgePoints = isClosed ? outerPoints.slice(0, -1) : outerPoints;
  const edgeCount = edgePoints.length;

  // Total float count: (bottom + top caps use indexed geometry, so we build
  // separate flat arrays for caps vs sides and merge at the end via index buffer)
  //
  // Strategy:
  //   1. Cap positions: 2 × vertexCount points (bottom + top)
  //   2. Side positions: edgeCount × 4 points (one quad per edge)
  //   3. Cap indices: bottom (reversed winding) + top (normal winding)
  //   4. Side indices: 2 triangles per quad

  const capVertices = 2 * vertexCount; // bottom + top
  const sideVertices = edgeCount * 4;  // 4 corners per quad
  const totalVertices = capVertices + sideVertices;

  const positions = new Float32Array(totalVertices * 3);

  // Fill bottom cap vertices (y = baseY)
  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 2];
    const z = vertices[i * 2 + 1];
    positions[i * 3]     = x;
    positions[i * 3 + 1] = baseY;
    positions[i * 3 + 2] = z;
  }

  // Fill top cap vertices (y = baseY + heightMeters)
  const topOffset = vertexCount;
  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 2];
    const z = vertices[i * 2 + 1];
    positions[(topOffset + i) * 3]     = x;
    positions[(topOffset + i) * 3 + 1] = baseY + heightMeters;
    positions[(topOffset + i) * 3 + 2] = z;
  }

  // Fill side quad vertices
  // For edge from p[i] → p[(i+1) % edgeCount]:
  //   v0 = bottom-left   (p[i],   baseY)
  //   v1 = bottom-right  (p[i+1], baseY)
  //   v2 = top-right     (p[i+1], baseY + height)
  //   v3 = top-left      (p[i],   baseY + height)
  const sideStart = capVertices; // vertex index where sides begin
  for (let i = 0; i < edgeCount; i++) {
    const p0 = edgePoints[i];
    const p1 = edgePoints[(i + 1) % edgeCount];
    const base = (sideStart + i * 4) * 3;

    // v0 — bottom-left
    positions[base]     = p0[0];
    positions[base + 1] = baseY;
    positions[base + 2] = p0[1];

    // v1 — bottom-right
    positions[base + 3] = p1[0];
    positions[base + 4] = baseY;
    positions[base + 5] = p1[1];

    // v2 — top-right
    positions[base + 6] = p1[0];
    positions[base + 7] = baseY + heightMeters;
    positions[base + 8] = p1[1];

    // v3 — top-left
    positions[base + 9]  = p0[0];
    positions[base + 10] = baseY + heightMeters;
    positions[base + 11] = p0[1];
  }

  // -------------------------------------------------------------------------
  // Build index buffer
  // -------------------------------------------------------------------------
  // Bottom cap: capTriCount triangles, raw earcut winding (CW in XZ → downward normal)
  // Top cap:    capTriCount triangles, REVERSED earcut winding (upward normal)
  // Sides:      edgeCount * 2 triangles

  const totalTriangles = capTriCount * 2 + edgeCount * 2;
  const indexData = new Uint32Array(totalTriangles * 3);
  let idx = 0;

  // Bottom cap: earcut returns CW winding in XZ plane (viewed from +Y),
  // which naturally produces a downward-facing normal — use indices as-is.
  for (let t = 0; t < capTriCount; t++) {
    indexData[idx++] = capIndices[t * 3];
    indexData[idx++] = capIndices[t * 3 + 1];
    indexData[idx++] = capIndices[t * 3 + 2];
  }

  // Top cap: reverse earcut winding so normals point upward (+Y).
  for (let t = 0; t < capTriCount; t++) {
    const i0 = capIndices[t * 3];
    const i1 = capIndices[t * 3 + 1];
    const i2 = capIndices[t * 3 + 2];
    indexData[idx++] = topOffset + i2; // reversed
    indexData[idx++] = topOffset + i1;
    indexData[idx++] = topOffset + i0;
  }

  // Side quads — 2 triangles per quad (outward normal for CCW outer ring)
  // Tri 1: v0, v1, v2
  // Tri 2: v0, v2, v3
  for (let i = 0; i < edgeCount; i++) {
    const v0 = sideStart + i * 4;
    const v1 = v0 + 1;
    const v2 = v0 + 2;
    const v3 = v0 + 3;

    indexData[idx++] = v0;
    indexData[idx++] = v1;
    indexData[idx++] = v2;

    indexData[idx++] = v0;
    indexData[idx++] = v2;
    indexData[idx++] = v3;
  }

  // -------------------------------------------------------------------------
  // Assemble BufferGeometry
  // -------------------------------------------------------------------------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  geo.setIndex(new THREE.BufferAttribute(indexData, 1));
  geo.computeVertexNormals();

  return geo;
}
