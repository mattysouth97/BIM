import type { BoundingBox2D, Point2D, Polygon2D } from "./types";

const DEFAULT_TOLERANCE_M = 1e-6;

export type PolygonValidationFinding = Readonly<{
  code:
    | "too_few_vertices"
    | "non_finite_coordinate"
    | "zero_area"
    | "self_intersection"
    | "duplicate_consecutive_vertex";
  message: string;
  blocking: true;
}>;

export type OrientedEdge = Readonly<{
  index: number;
  start: Point2D;
  end: Point2D;
  lengthM: number;
  outwardAzimuthDeg: number;
  orientation: "north" | "east" | "south" | "west";
}>;

export type HostSegment = Readonly<{
  id: string;
  start: Point2D;
  end: Point2D;
}>;

export function openPolygon(polygon: Polygon2D): Polygon2D {
  if (polygon.length < 2) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return pointsEqual(first, last) ? polygon.slice(0, -1) : polygon.slice();
}

export function closePolygon(polygon: Polygon2D): Polygon2D {
  const open = openPolygon(polygon);
  if (open.length === 0) return open;
  return Object.freeze([...open, open[0]]);
}

/** Returns a canonical open, counter-clockwise ring. */
export function normalizePolygon(polygon: Polygon2D): Polygon2D {
  const open = openPolygon(polygon);
  const cleaned: Point2D[] = [];
  for (const point of open) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error("Polygon coordinates must be finite.");
    }
    if (!cleaned.length || !pointsEqual(cleaned[cleaned.length - 1], point)) {
      cleaned.push(Object.freeze([point[0], point[1]]) as Point2D);
    }
  }
  if (cleaned.length < 3) throw new Error("Polygon needs at least three vertices.");
  if (Math.abs(signedPolygonArea(cleaned)) <= DEFAULT_TOLERANCE_M) {
    throw new Error("Polygon area must be greater than zero.");
  }
  const counterClockwise =
    signedPolygonArea(cleaned) > 0 ? cleaned : [...cleaned].reverse();
  return Object.freeze(counterClockwise);
}

export function signedPolygonArea(polygon: Polygon2D): number {
  const ring = openPolygon(polygon);
  if (ring.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

export function polygonArea(polygon: Polygon2D): number {
  return Math.abs(signedPolygonArea(polygon));
}

export function polygonPerimeter(polygon: Polygon2D): number {
  const ring = openPolygon(polygon);
  return ring.reduce((total, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return total + distance(point, next);
  }, 0);
}

export function polygonCentroid(polygon: Polygon2D): Point2D {
  const ring = openPolygon(polygon);
  const signedArea = signedPolygonArea(ring);
  if (Math.abs(signedArea) <= DEFAULT_TOLERANCE_M) {
    throw new Error("Cannot calculate centroid of a zero-area polygon.");
  }
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  const divisor = 6 * signedArea;
  return Object.freeze([x / divisor, y / divisor]);
}

export function polygonBounds(polygon: Polygon2D): BoundingBox2D {
  const ring = openPolygon(polygon);
  if (ring.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function validatePolygon(
  polygon: Polygon2D,
  toleranceM = DEFAULT_TOLERANCE_M,
): readonly PolygonValidationFinding[] {
  const findings: PolygonValidationFinding[] = [];
  const ring = openPolygon(polygon);
  if (ring.length < 3) {
    findings.push(finding("too_few_vertices", "At least three vertices are required."));
    return findings;
  }
  if (ring.some((point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    findings.push(finding("non_finite_coordinate", "A polygon coordinate is not finite."));
  }
  if (Math.abs(signedPolygonArea(ring)) <= toleranceM) {
    findings.push(finding("zero_area", "Polygon area is zero or below tolerance."));
  }
  for (let index = 0; index < ring.length; index += 1) {
    if (distance(ring[index], ring[(index + 1) % ring.length]) <= toleranceM) {
      findings.push(
        finding(
          "duplicate_consecutive_vertex",
          `Vertices ${index} and ${(index + 1) % ring.length} overlap.`,
        ),
      );
    }
  }
  if (hasSelfIntersection(ring, toleranceM)) {
    findings.push(finding("self_intersection", "Polygon edges self-intersect."));
  }
  return findings;
}

/**
 * Edge orientation for a counter-clockwise footprint where +X is east and +Y
 * is north. Azimuth is clockwise from north in [0, 360).
 */
export function orientedEdges(polygon: Polygon2D): readonly OrientedEdge[] {
  const ring = normalizePolygon(polygon);
  return ring.map((start, index) => {
    const end = ring[(index + 1) % ring.length];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const outwardX = dy;
    const outwardY = -dx;
    const azimuth = normalizeDegrees(
      (Math.atan2(outwardX, outwardY) * 180) / Math.PI,
    );
    return Object.freeze({
      index,
      start,
      end,
      lengthM: Math.hypot(dx, dy),
      outwardAzimuthDeg: azimuth,
      orientation: cardinalOrientation(azimuth),
    });
  });
}

export function calculateZoneVolume(
  floorAreaSqm: number,
  heightM: number,
  excludedVolumeM3 = 0,
): number {
  if (floorAreaSqm <= 0 || heightM <= 0 || excludedVolumeM3 < 0) {
    throw new Error("Zone area and height must be positive; excluded volume cannot be negative.");
  }
  const gross = floorAreaSqm * heightM;
  if (excludedVolumeM3 >= gross) {
    throw new Error("Excluded volume must be smaller than gross zone volume.");
  }
  return gross - excludedVolumeM3;
}

export function sharedBoundaryLength(
  left: Polygon2D,
  right: Polygon2D,
  toleranceM = 0.001,
): number {
  const leftEdges = polygonSegments(left);
  const rightEdges = polygonSegments(right);
  let total = 0;
  for (const a of leftEdges) {
    for (const b of rightEdges) total += collinearOverlapLength(a, b, toleranceM);
  }
  return total;
}

export function areSpacesAdjacent(
  left: Polygon2D,
  right: Polygon2D,
  toleranceM = 0.001,
): boolean {
  return sharedBoundaryLength(left, right, toleranceM) > toleranceM;
}

export function mapPointOpeningToHost(
  openingCenter: Point2D,
  hosts: readonly HostSegment[],
  toleranceM = 0.05,
): string | null {
  const ranked = hosts
    .map((host) => ({ host, distance: pointToSegmentDistance(openingCenter, host) }))
    .filter((candidate) => candidate.distance <= toleranceM)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.host.id.localeCompare(right.host.id),
    );
  return ranked[0]?.host.id ?? null;
}

export function relativeError(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(actual - expected) / Math.abs(expected);
}

function polygonSegments(polygon: Polygon2D): readonly HostSegment[] {
  const ring = openPolygon(polygon);
  return ring.map((start, index) => ({
    id: `edge-${index}`,
    start,
    end: ring[(index + 1) % ring.length],
  }));
}

function collinearOverlapLength(
  left: HostSegment,
  right: HostSegment,
  toleranceM: number,
): number {
  const leftDx = left.end[0] - left.start[0];
  const leftDy = left.end[1] - left.start[1];
  const length = Math.hypot(leftDx, leftDy);
  if (length <= toleranceM) return 0;
  const crossDirection =
    leftDx * (right.end[1] - right.start[1]) -
    leftDy * (right.end[0] - right.start[0]);
  if (Math.abs(crossDirection) > toleranceM * length) return 0;
  const lineDistanceA = Math.abs(
    leftDx * (right.start[1] - left.start[1]) -
      leftDy * (right.start[0] - left.start[0]),
  ) / length;
  const lineDistanceB = Math.abs(
    leftDx * (right.end[1] - left.start[1]) -
      leftDy * (right.end[0] - left.start[0]),
  ) / length;
  if (lineDistanceA > toleranceM || lineDistanceB > toleranceM) return 0;

  const unitX = leftDx / length;
  const unitY = leftDy / length;
  const project = (point: Point2D) =>
    (point[0] - left.start[0]) * unitX + (point[1] - left.start[1]) * unitY;
  const rightMin = Math.min(project(right.start), project(right.end));
  const rightMax = Math.max(project(right.start), project(right.end));
  return Math.max(0, Math.min(length, rightMax) - Math.max(0, rightMin));
}

function pointToSegmentDistance(point: Point2D, segment: HostSegment): number {
  const dx = segment.end[0] - segment.start[0];
  const dy = segment.end[1] - segment.start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, segment.start);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - segment.start[0]) * dx +
        (point[1] - segment.start[1]) * dy) /
        lengthSquared,
    ),
  );
  return distance(point, [segment.start[0] + t * dx, segment.start[1] + t * dy]);
}

function hasSelfIntersection(ring: Polygon2D, toleranceM: number): boolean {
  for (let leftIndex = 0; leftIndex < ring.length; leftIndex += 1) {
    const leftStart = ring[leftIndex];
    const leftEnd = ring[(leftIndex + 1) % ring.length];
    for (let rightIndex = leftIndex + 1; rightIndex < ring.length; rightIndex += 1) {
      if (
        rightIndex === leftIndex ||
        rightIndex === leftIndex + 1 ||
        (leftIndex === 0 && rightIndex === ring.length - 1)
      ) {
        continue;
      }
      const rightStart = ring[rightIndex];
      const rightEnd = ring[(rightIndex + 1) % ring.length];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd, toleranceM)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
  toleranceM: number,
): boolean {
  const cross = (p: Point2D, q: Point2D, r: Point2D) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (
    ((abC > toleranceM && abD < -toleranceM) ||
      (abC < -toleranceM && abD > toleranceM)) &&
    ((cdA > toleranceM && cdB < -toleranceM) ||
      (cdA < -toleranceM && cdB > toleranceM))
  );
}

function cardinalOrientation(
  azimuthDeg: number,
): "north" | "east" | "south" | "west" {
  if (azimuthDeg >= 315 || azimuthDeg < 45) return "north";
  if (azimuthDeg < 135) return "east";
  if (azimuthDeg < 225) return "south";
  return "west";
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function distance(left: Point2D, right: Point2D): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function pointsEqual(
  left: Point2D,
  right: Point2D,
  toleranceM = DEFAULT_TOLERANCE_M,
): boolean {
  return distance(left, right) <= toleranceM;
}

function finding(
  code: PolygonValidationFinding["code"],
  message: string,
): PolygonValidationFinding {
  return { code, message, blocking: true };
}
