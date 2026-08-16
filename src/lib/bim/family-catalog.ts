// Typed index of the Blender-authored Revit Architecture family library.
// Geometry files: public/models/authoring/*.glb
// Slot defaults used by workflow/views: public/bim-assets/*.glb

export type AuthoringFamilyKind = "system" | "loadable";

export type AuthoringPlacement =
  | "linear"
  | "point"
  | "hosted"
  | "sketch-boundary"
  | "sketch-footprint"
  | "sketch-or-auto"
  | "sketch"
  | "component"
  | "component-run"
  | "component-landing";

export interface AuthoringFamily {
  id: string;
  file: string;
  path: string;
  category: string;
  categoryKo: string;
  family: string;
  familyKo: string;
  type: string;
  typeKo: string;
  familyKind: AuthoringFamilyKind;
  host: string;
  origin: string;
  placement: AuthoringPlacement;
  courseRef: string;
}

export const AUTHORING_FAMILY_BASE = "/models/authoring";

/** Every family authored from the Revit basic-course authoring set. */
export const AUTHORING_FAMILY_IDS = [
  "wall-basic-generic-200",
  "wall-exterior-brick-on-cmu",
  "wall-exterior-cmu-insulated",
  "wall-interior-partition",
  "wall-stacked-brick-cmu",
  "curtain-mullion-rect-50x150",
  "curtain-panel-glazed",
  "curtain-wall-storefront",
  "door-single-flush-910",
  "door-single-flush-810",
  "door-double-flush-1800",
  "door-glass-storefront",
  "window-fixed-1200x1500",
  "window-casement-900x1200",
  "window-sliding-1800x1500",
  "window-awning-900x600",
  "column-struct-round-450",
  "column-struct-round-600",
  "column-struct-rect-450x600",
  "column-struct-rect-600x750",
  "column-arch-rect-400",
  "floor-generic-150",
  "floor-concrete-200",
  "floor-wood-finish",
  "roof-basic-flat",
  "roof-pitched-module",
  "ceiling-generic-gypsum",
  "ceiling-acoustic-tile",
  "stair-run-8riser",
  "stair-landing-1200",
  "railing-guard-1m",
  "railing-handrail-1m",
  "ramp-module",
  "light-troffer-600",
  "light-pendant",
  "light-downlight",
  "furniture-desk",
  "furniture-task-chair",
  "furniture-sofa-2seat",
  "furniture-dining-table",
  "furniture-bed-queen",
  "plumbing-toilet",
  "plumbing-lavatory",
  "plumbing-kitchen-sink",
  "planting-tree-deciduous",
  "planting-shrub",
] as const;

export type AuthoringFamilyId = (typeof AUTHORING_FAMILY_IDS)[number];

export function authoringFamilyUrl(id: AuthoringFamilyId | string): string {
  return `${AUTHORING_FAMILY_BASE}/${id}.glb`;
}
