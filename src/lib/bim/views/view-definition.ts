// src/lib/bim/views/view-definition.ts
// Type definitions for the BIM view system.
// Views are pure data — no Three.js objects stored, only serialisable config.

import type * as THREE from "three";

// ─── Camera state (serialisable) ──────────────────────────────────────────────

/** Serialisable orthographic camera state */
export interface OrthoCameraState {
  kind: "ortho";
  position: [number, number, number];
  target: [number, number, number];
  /** Half-height of the ortho frustum in world-space metres */
  zoom: number;
  near: number;
  far: number;
}

/** Serialisable perspective camera state */
export interface PerspCameraState {
  kind: "persp";
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field-of-view in degrees */
  fov: number;
  near: number;
  far: number;
}

export type CameraState = OrthoCameraState | PerspCameraState;

// ─── Clipping plane descriptor (serialisable) ──────────────────────────────────

/**
 * Serialisable representation of a THREE.Plane.
 * Store (normal, constant) so the plane can be reconstructed without importing THREE.
 */
export interface ClippingPlaneDescriptor {
  /** Unit normal vector */
  normal: [number, number, number];
  /** Signed distance from the origin (THREE.Plane.constant) */
  constant: number;
}

// ─── View kind ────────────────────────────────────────────────────────────────

export type ViewKind = "plan" | "elevation" | "section" | "3d";

// ─── Shared view base ─────────────────────────────────────────────────────────

interface ViewBase {
  id: string;
  name: string;
  kind: ViewKind;
  cameraState: CameraState;
  /** Clipping planes applied when this view is active (may be empty) */
  clippingPlanes?: ClippingPlaneDescriptor[];
}

// ─── Concrete view interfaces ─────────────────────────────────────────────────

/** Revit-style floor-plan range, stored in metres relative to the level. */
export interface ViewRange {
  top: number;
  cut: number;
  bottom: number;
  viewDepth: number;
}

/** Top-down orthographic view clipped to a single building level */
export interface PlanView extends ViewBase {
  kind: "plan";
  cameraState: OrthoCameraState;
  /** World-space Y elevation of the floor slab */
  levelElevation: number;
  /** World-space height of this level (used for clipping) */
  levelHeight: number;
  /** Level identifier from FloorGeometry */
  levelId: string;
  /** View range — cut plane drives the plan clip (Revit 1.2 m AFF default). */
  viewRange?: ViewRange;
}

export type ElevationSide = "front" | "back" | "left" | "right";

/** Orthographic side view looking at one facade */
export interface ElevationView extends ViewBase {
  kind: "elevation";
  cameraState: OrthoCameraState;
  side: ElevationSide;
}

/** Orthographic view with an arbitrary section-cut clipping plane */
export interface SectionView extends ViewBase {
  kind: "section";
  cameraState: OrthoCameraState;
  /** The single cutting plane (also present in clippingPlanes for convenience) */
  cutPlane: ClippingPlaneDescriptor;
}

/** Standard perspective/isometric 3-D view */
export interface PerspectiveView extends ViewBase {
  kind: "3d";
  cameraState: PerspCameraState;
}

// ─── Discriminated union ───────────────────────────────────────────────────────

export type ViewDefinition =
  | PlanView
  | ElevationView
  | SectionView
  | PerspectiveView;

// ─── Helper: reconstruct THREE.Plane from descriptor ──────────────────────────

/**
 * Convert a serialisable ClippingPlaneDescriptor back into a THREE.Plane.
 * Call this at render time — not during store operations.
 */
export function toThreePlane(
  desc: ClippingPlaneDescriptor,
  THREE_module: { Plane: new (normal: THREE.Vector3, constant: number) => THREE.Plane; Vector3: new (x: number, y: number, z: number) => THREE.Vector3 }
): THREE.Plane {
  const normal = new THREE_module.Vector3(...desc.normal);
  return new THREE_module.Plane(normal, desc.constant);
}
