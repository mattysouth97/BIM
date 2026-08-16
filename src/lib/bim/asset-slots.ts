// src/lib/bim/asset-slots.ts
// Contract for the parallel 3D-asset session.
// Workflow / views / schedules / identity bind to these slot ids.
// They must NOT author replacement meshes — procedural geometry stays
// the fallback until a manifest entry is published.

export type BimAssetFormat = "gltf" | "glb" | "ifc";

export type BimAssetSlotId =
  | "family.wall.basic"
  | "family.wall.curtain"
  | "family.floor.basic"
  | "family.roof.basic"
  | "family.column.rectangular"
  | "family.window.fixed"
  | "family.door.single-flush"
  | "family.mep.chiller"
  | "family.mep.boiler"
  | "family.mep.ahu"
  | "family.mep.dhw"
  | "family.lighting.fixture"
  | "family.electrical.panel";

export interface BimAssetRef {
  slot: BimAssetSlotId;
  /** Set when the asset session publishes a file under public/bim-assets/. */
  uri?: string;
  format?: BimAssetFormat;
  source: "manifest" | "procedural-fallback";
}

export type BimAssetManifest = Partial<
  Record<BimAssetSlotId, { uri: string; format: BimAssetFormat }>
>;

/** In-memory overlay — the 3D session can call `registerBimAssets` without a rebuild. */
let overlay: BimAssetManifest = {};

export function registerBimAssets(partial: BimAssetManifest): void {
  overlay = { ...overlay, ...partial };
}

export function clearBimAssetOverlay(): void {
  overlay = {};
}

export function resolveAssetSlot(slot: BimAssetSlotId): BimAssetRef {
  const hit = overlay[slot];
  if (hit) {
    return { slot, uri: hit.uri, format: hit.format, source: "manifest" };
  }
  return { slot, source: "procedural-fallback" };
}

export function identitySlotFor(kind: string, extra?: { curtainWall?: boolean; mepType?: string }): BimAssetSlotId {
  if (extra?.curtainWall) return "family.wall.curtain";
  switch (kind) {
    case "window":
    case "glass":
      return "family.window.fixed";
    case "door":
      return "family.door.single-flush";
    case "column":
    case "structural-column":
      return "family.column.rectangular";
    case "slab":
      return "family.floor.basic";
    case "roof":
      return "family.roof.basic";
    case "chiller":
      return "family.mep.chiller";
    case "boiler":
      return "family.mep.boiler";
    case "ahu":
      return "family.mep.ahu";
    case "dhw":
      return "family.mep.dhw";
    case "lightingFixture":
    case "lighting":
      return "family.lighting.fixture";
    case "electricalPanel":
    case "electrical":
      return "family.electrical.panel";
    default:
      return "family.wall.basic";
  }
}
