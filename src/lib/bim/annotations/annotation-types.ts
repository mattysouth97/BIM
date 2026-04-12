// src/lib/bim/annotations/annotation-types.ts
// Discriminated union types for the annotation store.
// These types describe the *data model* for each annotation kind.
// Rendering functions live in src/lib/annotations/*.ts (separate concern).

import * as THREE from "three";

// ── Branded string for element IDs (produced by Phase 30 element-id.ts) ──────
export type ElementId = string & { readonly __brand: "ElementId" };

// ── Per-kind parameter shapes ─────────────────────────────────────────────────

export interface DimensionParams {
  /** World-space start point */
  start: { x: number; y: number; z: number };
  /** World-space end point */
  end: { x: number; y: number; z: number };
  /** Optional: override the displayed distance string */
  labelOverride?: string;
}

export interface AreaLabelParams {
  /** Floor area in m² */
  area: number;
  /** World-space position for the label */
  position: { x: number; y: number; z: number };
}

export interface LevelMarkerParams {
  /** Elevation in metres above ground */
  elevation: number;
  /** Display label, e.g. "1FL", "RF" */
  label: string;
  /** Width of the dashed line spanning the building footprint */
  width: number;
}

export interface SectionPlaneParams {
  /** Cut axis */
  axis: "x" | "z";
  /** Position along the axis */
  position: number;
  /** Side length of the visual helper plane in metres */
  size: number;
}

// ── Annotation instance variants ─────────────────────────────────────────────

interface AnnotationBase {
  /** Stable UUID for this annotation */
  id: string;
  /** Optional reference to the authored element this annotation is anchored to */
  anchorElementId?: ElementId;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

export interface DimensionAnnotation extends AnnotationBase {
  kind: "dimension";
  params: DimensionParams;
}

export interface AreaLabelAnnotation extends AnnotationBase {
  kind: "area-label";
  params: AreaLabelParams;
}

export interface LevelMarkerAnnotation extends AnnotationBase {
  kind: "level-marker";
  params: LevelMarkerParams;
}

export interface SectionPlaneAnnotation extends AnnotationBase {
  kind: "section-plane";
  params: SectionPlaneParams;
}

/** Discriminated union of all annotation types */
export type AnnotationInstance =
  | DimensionAnnotation
  | AreaLabelAnnotation
  | LevelMarkerAnnotation
  | SectionPlaneAnnotation;

export type AnnotationKind = AnnotationInstance["kind"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Narrow to a specific kind — useful in rendering consumers */
export function isAnnotationKind<K extends AnnotationKind>(
  anno: AnnotationInstance,
  kind: K
): anno is Extract<AnnotationInstance, { kind: K }> {
  return anno.kind === kind;
}

/** Convert a stored position object to a THREE.Vector3 */
export function toVector3(p: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}
