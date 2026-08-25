import type {
  CanonicalEnergyModel,
  Opening,
  Surface,
} from "@/lib/energy-diagnostics/types";
import type { CanonicalViewerBridge } from "@/lib/energy-diagnostics/viewer-bridge";
import type {
  DiagnosticSpatialPrecision,
  DiagnosticSpatialTarget,
  DiagnosticSurfacePatch,
} from "@/components/viewer/diagnostic-selection-types";

import type { DiagnosisSelection } from "./types";

const ENVELOPE_OBJECTS = Object.freeze([
  "envelope-shell:Walls",
  "envelope-shell:Windows",
  "envelope-shell:Roof",
  "envelope-shell:Ground Floor",
]);

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectNameForSurface(
  model: CanonicalEnergyModel,
  surface: Surface,
): string {
  if (surface.threeObjectId) return surface.threeObjectId;
  const mapped = model.mappings.find(
    (mapping) => mapping.canonicalObjectId === surface.id,
  )?.threeObjectIds[0];
  return mapped ?? `diagnostic-surface:${surface.id}`;
}

function categoryForSurface(surface: Surface): string | null {
  if (surface.type === "exterior_wall") return "envelope-shell:Walls";
  if (surface.type === "roof") return "envelope-shell:Roof";
  if (surface.type === "ground_floor") {
    return "envelope-shell:Ground Floor";
  }
  return null;
}

function patchForSurface(
  model: CanonicalEnergyModel,
  bridge: CanonicalViewerBridge,
  surface: Surface,
): DiagnosticSurfacePatch | null {
  const geometry = surface.geometry.value;
  const minimumPoints =
    surface.type === "exterior_wall" ? 2 : 3;
  if (!geometry || geometry.length < minimumPoints) return null;
  if (
    surface.type !== "exterior_wall" &&
    surface.type !== "roof" &&
    surface.type !== "ground_floor"
  ) {
    return null;
  }
  if (
    geometry.some(
      (point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1]),
    )
  ) {
    return null;
  }

  const storey = model.geometry.storeys.find(
    (candidate) => candidate.id === surface.storeyId,
  );
  if (!storey) return null;
  const storeyElevation = finite(storey.elevationM.value, 0);
  const storeyHeight = Math.max(
    finite(storey.floorToFloorHeightM.value, 0),
    0,
  );
  const elevationM =
    surface.type === "roof"
      ? storeyElevation + storeyHeight
      : storeyElevation;

  return Object.freeze({
    canonicalObjectId: surface.id,
    objectName: objectNameForSurface(model, surface),
    kind: surface.type === "exterior_wall" ? "wall" : "cap",
    points: Object.freeze(
      geometry.map(
        (point) =>
          Object.freeze([
            point[0] - bridge.displayOrigin[0],
            point[1] - bridge.displayOrigin[1],
          ] as const),
      ),
    ),
    elevationM,
    heightM: surface.type === "exterior_wall" ? storeyHeight : 0,
  });
}

function patchBounds(patches: readonly DiagnosticSurfacePatch[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const patch of patches) {
    for (const [x, z] of patch.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      minY = Math.min(minY, patch.elevationM);
      maxY = Math.max(maxY, patch.elevationM + patch.heightM);
    }
  }
  const center = Object.freeze([
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ] as const);
  const radius = Math.max(
    1.5,
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2,
  );
  return { center, radius };
}

function viewDirectionForPatches(
  model: CanonicalEnergyModel,
  patches: readonly DiagnosticSurfacePatch[],
): readonly [number, number, number] {
  if (patches.length !== 1 || patches[0].kind !== "wall") {
    return Object.freeze([0.72, 0.52, 0.72] as const);
  }
  const surface = model.geometry.surfaces.find(
    (candidate) => candidate.id === patches[0].canonicalObjectId,
  );
  const azimuth = finite(surface?.azimuthDeg.value, Number.NaN);
  if (!Number.isFinite(azimuth)) {
    return Object.freeze([0.72, 0.52, 0.72] as const);
  }
  // Surface azimuth is true-north referenced, while the viewer deliberately
  // preserves the drawing coordinate frame. Remove the drawing's north
  // rotation so the camera approaches the actual rendered face.
  const drawingNorth = finite(model.site.northOrientationDeg.value, 0);
  const radians = ((azimuth - drawingNorth) * Math.PI) / 180;
  return Object.freeze([
    Math.sin(radians),
    0.28,
    Math.cos(radians),
  ] as const);
}

function buildingFocus(bridge: CanonicalViewerBridge) {
  const width = Math.max(bridge.recipe.footprintWidth, 1);
  const depth = Math.max(bridge.recipe.footprintDepth, 1);
  const height = Math.max(bridge.recipe.totalHeight, 1);
  return {
    center: Object.freeze([0, height / 2, 0] as const),
    radius: Math.max(2, Math.hypot(width, height, depth) / 2),
    viewDirection: Object.freeze([0.72, 0.52, 0.72] as const),
  };
}

/**
 * Converts finding evidence into viewer geometry without inventing component
 * placement. Surfaces use their canonical geometry; openings fall back to the
 * only spatial fact guaranteed by the model, their host surface.
 */
export function deriveDiagnosticSpatialTarget(
  model: CanonicalEnergyModel,
  bridge: CanonicalViewerBridge,
  selection: DiagnosisSelection | null,
): DiagnosticSpatialTarget | null {
  if (!selection || selection.kind !== "diagnostic_finding") return null;

  const selectedIds = new Set(selection.canonicalObjectIds);
  const surfaces = new Map(
    model.geometry.surfaces.map((surface) => [surface.id, surface]),
  );
  const openings = new Map(
    model.geometry.openings.map((opening) => [opening.id, opening]),
  );
  const selectedSurfaces = new Map<string, Surface>();
  const selectedOpenings: Opening[] = [];
  const buildingWide = selectedIds.has(model.building.id);

  for (const id of selectedIds) {
    const surface = surfaces.get(id);
    if (surface) selectedSurfaces.set(surface.id, surface);
    const opening = openings.get(id);
    if (opening) {
      selectedOpenings.push(opening);
      const host = surfaces.get(opening.hostSurfaceId);
      if (host) selectedSurfaces.set(host.id, host);
    }
  }

  const patches = [...selectedSurfaces.values()].flatMap((surface) => {
    const patch = patchForSurface(model, bridge, surface);
    return patch ? [patch] : [];
  });
  const fallbackObjectIds = new Set(
    selection.threeObjectIds.filter((id) => id.startsWith("envelope-shell:")),
  );
  for (const surface of selectedSurfaces.values()) {
    if (patches.some((patch) => patch.canonicalObjectId === surface.id)) {
      continue;
    }
    const category = categoryForSurface(surface);
    if (category) fallbackObjectIds.add(category);
  }
  if (selectedOpenings.length > 0 && patches.length === 0) {
    fallbackObjectIds.add("envelope-shell:Windows");
  }
  if (buildingWide) {
    for (const id of ENVELOPE_OBJECTS) fallbackObjectIds.add(id);
  }

  // A finding with no canonical geometry, host, category mapping, or explicit
  // building scope is non-spatial. Keep the user's current camera exactly as
  // it is instead of implying that the whole building is evidence.
  if (!buildingWide && patches.length === 0 && fallbackObjectIds.size === 0) {
    return null;
  }

  let precision: DiagnosticSpatialPrecision;
  if (buildingWide) precision = "building";
  else if (selectedOpenings.length > 0 && patches.length > 0) {
    precision = "host_surface";
  } else if (patches.length > 0) precision = "exact_surface";
  else if (fallbackObjectIds.size > 0) precision = "category";
  else {
    precision = "building";
  }

  const bounds = patches.length > 0 ? patchBounds(patches) : buildingFocus(bridge);
  const viewDirection =
    patches.length > 0
      ? viewDirectionForPatches(model, patches)
      : buildingFocus(bridge).viewDirection;
  const requestId = `${selection.id}:${selection.canonicalObjectIds.join("|")}`;

  return Object.freeze({
    selectionId: selection.id,
    precision,
    patches: Object.freeze(patches),
    fallbackObjectIds: Object.freeze([...fallbackObjectIds]),
    focus: Object.freeze({
      requestId,
      center: bounds.center,
      radius: bounds.radius,
      viewDirection,
    }),
  });
}
