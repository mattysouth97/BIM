// Published GLB overlay for the parallel authoring-feature session.
// Slot ids are the contract in asset-slots.ts. The full 46-family library
// is catalogued at /models/authoring/catalog.json.

import {
  registerBimAssets,
  type BimAssetManifest,
  type BimAssetSlotId,
} from "./asset-slots";

export const AUTHORING_ASSET_MANIFEST: BimAssetManifest = {
  "family.wall.basic": { uri: "/bim-assets/wall-basic.glb", format: "glb" },
  "family.wall.curtain": { uri: "/bim-assets/wall-curtain.glb", format: "glb" },
  "family.floor.basic": { uri: "/bim-assets/floor-basic.glb", format: "glb" },
  "family.roof.basic": { uri: "/bim-assets/roof-basic.glb", format: "glb" },
  "family.column.rectangular": {
    uri: "/bim-assets/column-rectangular.glb",
    format: "glb",
  },
  "family.window.fixed": { uri: "/bim-assets/window-fixed.glb", format: "glb" },
  "family.door.single-flush": {
    uri: "/bim-assets/door-single-flush.glb",
    format: "glb",
  },
  "family.mep.chiller": { uri: "/bim-assets/chiller.glb", format: "glb" },
  "family.mep.boiler": { uri: "/bim-assets/boiler.glb", format: "glb" },
  "family.mep.ahu": { uri: "/bim-assets/ahu.glb", format: "glb" },
  "family.mep.dhw": { uri: "/bim-assets/dhw.glb", format: "glb" },
  "family.lighting.fixture": { uri: "/bim-assets/light-fixture.glb", format: "glb" },
  "family.electrical.panel": {
    uri: "/bim-assets/electrical-panel.glb",
    format: "glb",
  },
};

export const AUTHORING_LIBRARY_BASE = "/models/authoring";

export function publishAuthoringAssets(): void {
  registerBimAssets(AUTHORING_ASSET_MANIFEST);
}

export function publishedSlotIds(): BimAssetSlotId[] {
  return Object.keys(AUTHORING_ASSET_MANIFEST) as BimAssetSlotId[];
}
