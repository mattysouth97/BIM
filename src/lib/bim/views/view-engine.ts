// src/lib/bim/views/view-engine.ts
// Pure functions for generating BIM view definitions from building geometry.
// No React, no Three.js imports at runtime — uses only serialisable types.

import * as THREE from "three";
import type {
  ViewDefinition,
  PlanView,
  ElevationView,
  SectionView,
  PerspectiveView,
  OrthoCameraState,
  PerspCameraState,
  ClippingPlaneDescriptor,
  ElevationSide,
} from "./view-definition";

/** Minimal floor input — recipe FloorSpec is enough; FloorGeometry also fits. */
export interface ViewFloorInput {
  floorNo: number;
  label: string;
  y: number;
  height: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function vec3ToTuple(v: THREE.Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

function planeToDescriptor(plane: THREE.Plane): ClippingPlaneDescriptor {
  return {
    normal: [plane.normal.x, plane.normal.y, plane.normal.z],
    constant: plane.constant,
  };
}

/** Compute ortho zoom (half-height of frustum) that fits a bounding box side with padding */
function fitOrthoZoom(sizeA: number, sizeB: number, padding = 0.15): number {
  return Math.max(sizeA, sizeB) * 0.5 * (1 + padding);
}

// ─── Plan view ────────────────────────────────────────────────────────────────

/**
 * Create a top-down orthographic plan view for a single building level.
 *
 * Camera is positioned directly above the level mid-point.
 * Two clipping planes are applied:
 *   - lower: clips everything below `elevation`
 *   - upper: clips everything above `elevation + height`
 */
export function createPlanView(level: {
  id: string;
  name: string;
  elevation: number;
  height: number;
  footprintWidth?: number;
  footprintDepth?: number;
}): PlanView {
  const {
    id,
    name,
    elevation,
    height,
    footprintWidth = 20,
    footprintDepth = 20,
  } = level;

  // Camera hovers 100 m above level mid-point looking down
  const midY = elevation + height / 2;
  const cameraY = elevation + height + 100;

  const cameraState: OrthoCameraState = {
    kind: "ortho",
    position: [0, cameraY, 0.001], // tiny Z offset keeps "up" direction stable
    target: [0, midY, 0],
    zoom: fitOrthoZoom(footprintWidth, footprintDepth),
    near: 0.1,
    far: cameraY + 10,
  };

  // Lower clip: normal points up (+Y), constant = -(elevation)
  // Plane equation: dot(normal, point) + constant >= 0 → point.y >= elevation
  const lowerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);

  // Upper clip: normal points down (-Y), constant = elevation + height
  // Plane equation: dot(normal, point) + constant >= 0 → -point.y + (elevation+height) >= 0 → point.y <= elevation+height
  const upperPlane = new THREE.Plane(
    new THREE.Vector3(0, -1, 0),
    elevation + height
  );

  return {
    id: `plan-${id}`,
    name: `Plan — ${name}`,
    kind: "plan",
    cameraState,
    levelElevation: elevation,
    levelHeight: height,
    levelId: id,
    clippingPlanes: [
      planeToDescriptor(lowerPlane),
      planeToDescriptor(upperPlane),
    ],
  };
}

// ─── Elevation view ───────────────────────────────────────────────────────────

/**
 * Create an orthographic elevation view looking at one facade of the building.
 *
 * Coordinate convention (matches SceneControls preset positions):
 *   front  = looking from +Z toward origin  (camera at +Z)
 *   back   = looking from -Z toward origin  (camera at -Z)
 *   left   = looking from -X toward origin  (camera at -X)
 *   right  = looking from +X toward origin  (camera at +X)
 */
export function createElevationView(
  side: ElevationSide,
  bbox: THREE.Box3
): ElevationView {
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());

  // Target is the vertical centre of the building
  const target = new THREE.Vector3(center.x, center.y, center.z);

  // Stand-off distance so the building is comfortably in view
  const standoff = Math.max(size.x, size.y, size.z) * 1.5 + 10;

  const positionMap: Record<ElevationSide, THREE.Vector3> = {
    front: new THREE.Vector3(center.x, center.y, center.z + standoff),
    back: new THREE.Vector3(center.x, center.y, center.z - standoff),
    left: new THREE.Vector3(center.x - standoff, center.y, center.z),
    right: new THREE.Vector3(center.x + standoff, center.y, center.z),
  };

  const position = positionMap[side];

  // For front/back elevation: ortho width = X, height = Y
  // For left/right elevation: ortho width = Z, height = Y
  const orthoWidth =
    side === "front" || side === "back" ? size.x : size.z;
  const orthoHeight = size.y;

  const cameraState: OrthoCameraState = {
    kind: "ortho",
    position: vec3ToTuple(position),
    target: vec3ToTuple(target),
    zoom: fitOrthoZoom(orthoWidth, orthoHeight),
    near: 0.1,
    far: standoff * 2 + 50,
  };

  const sideLabels: Record<ElevationSide, string> = {
    front: "South Elevation",
    back: "North Elevation",
    left: "West Elevation",
    right: "East Elevation",
  };

  return {
    id: `elev-${side}`,
    name: sideLabels[side],
    kind: "elevation",
    side,
    cameraState,
    clippingPlanes: [],
  };
}

// ─── Section view ─────────────────────────────────────────────────────────────

/**
 * Create a section view from an arbitrary cutting plane and bounding box.
 *
 * The camera is positioned on the normal side of the plane looking toward the cut.
 * Everything on the opposite side is clipped.
 */
export function createSectionView(
  plane: THREE.Plane,
  bbox: THREE.Box3,
  id = "section-0",
  name = "Section"
): SectionView {
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Project bounding-box centre onto the plane's normal direction to find a sensible target
  const distToCenter = plane.distanceToPoint(center);
  const target = center.clone().addScaledVector(plane.normal, -distToCenter);

  // Camera stands off on the side the normal points toward
  const standoff = maxDim * 1.5 + 10;
  const position = target.clone().addScaledVector(plane.normal, standoff);

  const cameraState: OrthoCameraState = {
    kind: "ortho",
    position: vec3ToTuple(position),
    target: vec3ToTuple(target),
    zoom: fitOrthoZoom(maxDim, size.y),
    near: 0.1,
    far: standoff * 2 + 50,
  };

  const cutDescriptor = planeToDescriptor(plane);

  return {
    id,
    name,
    kind: "section",
    cameraState,
    cutPlane: cutDescriptor,
    clippingPlanes: [cutDescriptor],
  };
}

// ─── 3D isometric view ────────────────────────────────────────────────────────

/**
 * Default perspective isometric view of the full building bounding box.
 * Included in `computeDefaultViewsForBuilding` so the autonomous BIM document
 * ships with a 3D sheet; callers may still append a custom-id copy.
 */
export function create3dView(bbox: THREE.Box3, id = "3d-iso"): PerspectiveView {
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  const d = span * 1.8 + 8 || 20;

  const cameraState: PerspCameraState = {
    kind: "persp",
    position: [center.x + d * 0.7, center.y + d * 0.5, center.z + d * 0.7],
    target: [center.x, center.y, center.z],
    fov: 35,
    near: 0.1,
    far: d * 10,
  };

  return {
    id,
    name: "3D — Isometric",
    kind: "3d",
    cameraState,
    clippingPlanes: [],
  };
}

/** Longitudinal section through the origin, looking at the longer axis. */
export function createDefaultSectionView(bbox: THREE.Box3): SectionView {
  const size = bbox.getSize(new THREE.Vector3());
  const normal =
    size.x >= size.z
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
  const plane = new THREE.Plane(normal, 0);
  return createSectionView(plane, bbox, "section-long", "Section — Long");
}

// ─── Apply view to camera ──────────────────────────────────────────────────────

export interface OrbitControlsLike {
  target: THREE.Vector3;
  update(): void;
  object?: THREE.Camera;
}

/**
 * Mutate a Three.js camera (and optional OrbitControls) to match a ViewDefinition.
 * Call this inside a useEffect / useFrame — not during render.
 */
export function applyViewToCamera(
  view: ViewDefinition,
  camera: THREE.Camera,
  orbitControls?: OrbitControlsLike,
  viewportAspect?: number,
): void {
  const cs = view.cameraState;
  camera.position.set(...cs.position);

  if (cs.kind === "ortho") {
    const orthoCamera = camera as THREE.OrthographicCamera;
    const halfH = cs.zoom;
    // Preserve aspect ratio if the camera already has width/height set
    if (orthoCamera.isOrthographicCamera) {
      const fromCamera =
        (orthoCamera.right - orthoCamera.left) /
        (orthoCamera.top - orthoCamera.bottom);
      const aspect = viewportAspect ?? (fromCamera || 1);
      orthoCamera.top = halfH;
      orthoCamera.bottom = -halfH;
      orthoCamera.left = -halfH * aspect;
      orthoCamera.right = halfH * aspect;
      orthoCamera.near = cs.near;
      orthoCamera.far = cs.far;
      orthoCamera.updateProjectionMatrix();
    }
  } else if (cs.kind === "persp") {
    const perspCamera = camera as THREE.PerspectiveCamera;
    if (perspCamera.isPerspectiveCamera) {
      perspCamera.fov = cs.fov;
      perspCamera.near = cs.near;
      perspCamera.far = cs.far;
      perspCamera.updateProjectionMatrix();
    }
  }

  const target = new THREE.Vector3(...cs.target);
  camera.lookAt(target);

  if (orbitControls) {
    orbitControls.target.copy(target);
    orbitControls.update();
  }
}

// ─── Default views for a building ─────────────────────────────────────────────

/**
 * Generate the full default view set for a building:
 *   - One 3D view
 *   - One plan view per floor
 *   - Four elevation views (front, back, left, right)
 *   - One longitudinal section
 */
export function computeDefaultViewsForBuilding(
  floors: ViewFloorInput[],
  bbox: THREE.Box3
): ViewDefinition[] {
  const bboxSize = bbox.getSize(new THREE.Vector3());
  const footprintWidth = bboxSize.x;
  const footprintDepth = bboxSize.z;

  // Plan views — one per floor, sorted ground-up
  const sortedFloors = [...floors].sort((a, b) => a.y - b.y);
  const planViews: PlanView[] = sortedFloors.map((floor) =>
    createPlanView({
      id: String(floor.floorNo),
      name: floor.label,
      elevation: floor.y,
      height: floor.height,
      footprintWidth,
      footprintDepth,
    })
  );

  // Elevation views — four cardinal sides
  const elevationSides: ElevationSide[] = ["front", "back", "left", "right"];
  const elevationViews: ElevationView[] = elevationSides.map((side) =>
    createElevationView(side, bbox)
  );

  return [
    create3dView(bbox),
    ...planViews,
    ...elevationViews,
    createDefaultSectionView(bbox),
  ];
}
