export type SceneFocusTarget = Readonly<{
  /** Changes whenever the user explicitly asks the viewer to focus again. */
  requestId: string;
  center: readonly [x: number, y: number, z: number];
  radius: number;
  /** Direction from the target toward the camera. */
  viewDirection?: readonly [x: number, y: number, z: number];
}>;

export type DiagnosticSpatialPrecision =
  | "exact_surface"
  | "host_surface"
  | "category"
  | "building";

export type DiagnosticSurfacePatch = Readonly<{
  canonicalObjectId: string;
  objectName: string;
  kind: "wall" | "cap";
  points: readonly (readonly [x: number, z: number])[];
  elevationM: number;
  heightM: number;
}>;

export type DiagnosticSpatialTarget = Readonly<{
  selectionId: string;
  precision: DiagnosticSpatialPrecision;
  patches: readonly DiagnosticSurfacePatch[];
  fallbackObjectIds: readonly string[];
  focus: SceneFocusTarget;
}>;
