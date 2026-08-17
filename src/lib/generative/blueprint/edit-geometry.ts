// src/lib/generative/blueprint/edit-geometry.ts
//
// Translate and reshape objects already in a BlueprintSpec. Pure: every
// function returns a NEW spec so the editor undo stack can store snapshots.
//
// The native editor only ever authors line loops and axis-aligned rects.
// Imported arcs are translated as rigid bodies; a vertex drag on a curved
// loop flattens that loop to the displayed polyline, because there is no
// honest way to drag one sample of an arc and keep the arc.

import {
  blueprintPlacements,
  type BlueprintSpec,
  type BoundaryLoop,
  type PointMm,
  type Region,
} from "./blueprint-spec";
import { makePolyLoop } from "./builders";

const point = (xMm: number, zMm: number): PointMm => ({
  xMm: Math.round(xMm),
  zMm: Math.round(zMm),
});

export function translatePoint(p: PointMm, dxMm: number, dzMm: number): PointMm {
  return point(p.xMm + dxMm, p.zMm + dzMm);
}

export function ringAreaMm2(points: readonly PointMm[]): number {
  if (points.length < 3) return 0;
  let acc = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    acc += a.xMm * b.zMm - b.xMm * a.zMm;
  }
  return Math.abs(acc) / 2;
}

export function edgeLengthMm(a: PointMm, b: PointMm): number {
  return Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm);
}

/** Mid-point of an edge, for a dimension label. */
export function edgeMidpoint(a: PointMm, b: PointMm): PointMm {
  return {
    xMm: (a.xMm + b.xMm) / 2,
    zMm: (a.zMm + b.zMm) / 2,
  };
}

export function formatMetres(mm: number): string {
  const metres = mm / 1000;
  if (metres >= 10) return `${metres.toFixed(1)} m`;
  return `${metres.toFixed(2)} m`;
}

export function formatAreaM2(mm2: number): string {
  return `${(mm2 / 1_000_000).toFixed(1)} m²`;
}

/** Vertices of a loop, without repeating the closing point. */
export function loopVertices(loop: BoundaryLoop): PointMm[] {
  const out: PointMm[] = [];
  const push = (p: PointMm) => {
    const last = out[out.length - 1];
    if (last && last.xMm === p.xMm && last.zMm === p.zMm) return;
    out.push(p);
  };
  for (const segment of loop.segments) {
    if (segment.kind === "polyline") {
      for (const p of segment.pointsMm) push(p);
      continue;
    }
    push(segment.startMm);
    push(segment.endMm);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && first.xMm === last.xMm && first.zMm === last.zMm) {
    out.pop();
  }
  return out;
}

export function regionVertices(region: Region, loops: Map<string, BoundaryLoop>): PointMm[] {
  switch (region.kind) {
    case "loop":
      return loopVertices(region.loop);
    case "loopRef": {
      const loop = loops.get(region.loopId);
      return loop ? loopVertices(loop) : [];
    }
    case "rect": {
      const hw = region.widthMm / 2;
      const hd = region.depthMm / 2;
      const cos = Math.cos(region.rotationRad);
      const sin = Math.sin(region.rotationRad);
      return (
        [
          [-hw, -hd],
          [hw, -hd],
          [hw, hd],
          [-hw, hd],
        ] as const
      ).map(([lx, lz]) =>
        point(
          region.originMm.xMm + lx * cos - lz * sin,
          region.originMm.zMm + lx * sin + lz * cos,
        ),
      );
    }
  }
}

function loopIndex(spec: BlueprintSpec): Map<string, BoundaryLoop> {
  const map = new Map<string, BoundaryLoop>();
  const add = (loop: BoundaryLoop) => {
    if (!map.has(loop.id)) map.set(loop.id, loop);
  };
  for (const boundary of spec.boundaries) add(boundary.loop);
  for (const item of [...spec.voids, ...spec.cores, ...spec.zones]) {
    if (item.region.kind === "loop") add(item.region.loop);
  }
  return map;
}

function translateLoop(loop: BoundaryLoop, dxMm: number, dzMm: number): BoundaryLoop {
  return {
    ...loop,
    segments: loop.segments.map((segment) => {
      if (segment.kind === "polyline") {
        return {
          ...segment,
          pointsMm: segment.pointsMm.map((p) => translatePoint(p, dxMm, dzMm)),
        };
      }
      if (segment.kind === "line") {
        return {
          ...segment,
          startMm: translatePoint(segment.startMm, dxMm, dzMm),
          endMm: translatePoint(segment.endMm, dxMm, dzMm),
        };
      }
      if (segment.kind === "arc") {
        return {
          ...segment,
          startMm: translatePoint(segment.startMm, dxMm, dzMm),
          endMm: translatePoint(segment.endMm, dxMm, dzMm),
          centerMm: translatePoint(segment.centerMm, dxMm, dzMm),
        };
      }
      return {
        ...segment,
        startMm: translatePoint(segment.startMm, dxMm, dzMm),
        control1Mm: translatePoint(segment.control1Mm, dxMm, dzMm),
        control2Mm: translatePoint(segment.control2Mm, dxMm, dzMm),
        endMm: translatePoint(segment.endMm, dxMm, dzMm),
      };
    }),
  };
}

function translateRegion(region: Region, dxMm: number, dzMm: number): Region {
  if (region.kind === "rect") {
    return { ...region, originMm: translatePoint(region.originMm, dxMm, dzMm) };
  }
  if (region.kind === "loop") {
    return { ...region, loop: translateLoop(region.loop, dxMm, dzMm) };
  }
  return region;
}

/** Vertices the Select tool can grab for this id, or null if nothing is editable. */
export function objectVertices(spec: BlueprintSpec, id: string): PointMm[] | null {
  const loops = loopIndex(spec);
  const boundary = spec.boundaries.find((b) => b.loop.id === id);
  if (boundary) return loopVertices(boundary.loop);

  const voidItem = spec.voids.find((v) => v.id === id);
  if (voidItem) return regionVertices(voidItem.region, loops);

  const core = spec.cores.find((c) => c.id === id);
  if (core) return regionVertices(core.region, loops);

  const zone = spec.zones.find((z) => z.id === id);
  if (zone) return regionVertices(zone.region, loops);

  const anchor = spec.anchors.find((a) => a.id === id);
  if (anchor) return [anchor.positionMm];

  const node = spec.circulation.nodes.find((n) => n.id === id);
  if (node) return [node.positionMm];

  const placement = blueprintPlacements(spec).find((p) => p.id === id);
  if (placement) return [placement.positionMm];

  return null;
}

/**
 * Slide an object by a millimetre delta. Returns the original spec when the
 * id is unknown or the delta is a no-op.
 */
export function translateObject(
  spec: BlueprintSpec,
  id: string,
  dxMm: number,
  dzMm: number,
): BlueprintSpec {
  const dx = Math.round(dxMm);
  const dz = Math.round(dzMm);
  if (dx === 0 && dz === 0) return spec;

  const boundaries = spec.boundaries.map((b) =>
    b.loop.id === id ? { ...b, loop: translateLoop(b.loop, dx, dz) } : b,
  );
  const voids = spec.voids.map((v) =>
    v.id === id ? { ...v, region: translateRegion(v.region, dx, dz) } : v,
  );
  const cores = spec.cores.map((c) =>
    c.id === id ? { ...c, region: translateRegion(c.region, dx, dz) } : c,
  );
  const zones = spec.zones.map((z) =>
    z.id === id ? { ...z, region: translateRegion(z.region, dx, dz) } : z,
  );
  const anchors = spec.anchors.map((a) =>
    a.id === id ? { ...a, positionMm: translatePoint(a.positionMm, dx, dz) } : a,
  );
  const nodes = spec.circulation.nodes.map((n) =>
    n.id === id ? { ...n, positionMm: translatePoint(n.positionMm, dx, dz) } : n,
  );
  const placements = blueprintPlacements(spec).map((p) =>
    p.id === id ? { ...p, positionMm: translatePoint(p.positionMm, dx, dz) } : p,
  );

  return {
    ...spec,
    boundaries,
    voids,
    cores,
    zones,
    anchors,
    circulation: { ...spec.circulation, nodes },
    placements,
  };
}

function replaceRegionRing(region: Region, id: string, points: readonly PointMm[]): Region {
  if (points.length < 3) return region;
  if (region.kind === "rect" && points.length === 4 && region.rotationRad === 0) {
    const xs = points.map((p) => p.xMm);
    const zs = points.map((p) => p.zMm);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const widthMm = Math.round(maxX - minX);
    const depthMm = Math.round(maxZ - minZ);
    if (widthMm < 1 || depthMm < 1) return region;
    return {
      kind: "rect",
      originMm: point((minX + maxX) / 2, (minZ + maxZ) / 2),
      widthMm,
      depthMm,
      rotationRad: 0,
    };
  }
  const loopId = region.kind === "loop" ? region.loop.id : `${id}-loop`;
  return { kind: "loop", loop: makePolyLoop(loopId, points) };
}

/**
 * Move one vertex of the object. Axis-aligned rects stay rects: the opposite
 * corner holds and the dragged corner writes a new width/depth. Polygons
 * replace just that vertex.
 */
export function moveObjectVertex(
  spec: BlueprintSpec,
  id: string,
  vertexIndex: number,
  next: PointMm,
): BlueprintSpec {
  const vertices = objectVertices(spec, id);
  if (!vertices || vertexIndex < 0 || vertexIndex >= vertices.length) return spec;
  const current = vertices[vertexIndex];
  const snapped = point(next.xMm, next.zMm);
  if (current.xMm === snapped.xMm && current.zMm === snapped.zMm) return spec;

  const boundary = spec.boundaries.find((b) => b.loop.id === id);
  if (boundary) {
    const nextPoints = vertices.map((p, i) => (i === vertexIndex ? snapped : p));
    if (nextPoints.length < 3) return spec;
    return {
      ...spec,
      boundaries: spec.boundaries.map((b) =>
        b.loop.id === id ? { ...b, loop: makePolyLoop(id, nextPoints) } : b,
      ),
    };
  }

  const patchRegion = <T extends { id: string; region: Region }>(item: T): T => {
    if (item.id !== id) return item;
    if (item.region.kind === "rect" && item.region.rotationRad === 0 && vertices.length === 4) {
      const [bl, br, tr, tl] = vertices;
      const corners = [bl, br, tr, tl];
      corners[vertexIndex] = snapped;
      // Opposite corner holds; rebuild the AA box from the two.
      const opposite = corners[(vertexIndex + 2) % 4];
      return {
        ...item,
        region: {
          kind: "rect",
          originMm: point((snapped.xMm + opposite.xMm) / 2, (snapped.zMm + opposite.zMm) / 2),
          widthMm: Math.max(1, Math.abs(snapped.xMm - opposite.xMm)),
          depthMm: Math.max(1, Math.abs(snapped.zMm - opposite.zMm)),
          rotationRad: 0,
        },
      };
    }
    const nextPoints = vertices.map((p, i) => (i === vertexIndex ? snapped : p));
    return { ...item, region: replaceRegionRing(item.region, item.id, nextPoints) };
  };

  if (spec.voids.some((v) => v.id === id)) {
    return { ...spec, voids: spec.voids.map(patchRegion) };
  }
  if (spec.cores.some((c) => c.id === id)) {
    return { ...spec, cores: spec.cores.map(patchRegion) };
  }
  if (spec.zones.some((z) => z.id === id)) {
    return { ...spec, zones: spec.zones.map(patchRegion) };
  }

  if (spec.anchors.some((a) => a.id === id)) {
    return {
      ...spec,
      anchors: spec.anchors.map((a) =>
        a.id === id ? { ...a, positionMm: snapped } : a,
      ),
    };
  }
  if (spec.circulation.nodes.some((n) => n.id === id)) {
    return {
      ...spec,
      circulation: {
        ...spec.circulation,
        nodes: spec.circulation.nodes.map((n) =>
          n.id === id ? { ...n, positionMm: snapped } : n,
        ),
      },
    };
  }
  if (blueprintPlacements(spec).some((p) => p.id === id)) {
    return {
      ...spec,
      placements: blueprintPlacements(spec).map((p) =>
        p.id === id ? { ...p, positionMm: snapped } : p,
      ),
    };
  }

  return spec;
}

export function nearestVertexIndex(
  points: readonly PointMm[],
  probe: PointMm,
  thresholdMm: number,
): number | null {
  let best = -1;
  let bestDist = thresholdMm;
  for (let i = 0; i < points.length; i += 1) {
    const dist = Math.hypot(points[i].xMm - probe.xMm, points[i].zMm - probe.zMm);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best === -1 ? null : best;
}
