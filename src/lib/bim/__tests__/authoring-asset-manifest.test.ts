import { describe, it, expect, afterEach } from "vitest";
import {
  clearBimAssetOverlay,
  resolveAssetSlot,
  type BimAssetSlotId,
} from "../asset-slots";
import {
  AUTHORING_ASSET_MANIFEST,
  publishAuthoringAssets,
} from "../authoring-asset-manifest";
import { AUTHORING_FAMILY_IDS, authoringFamilyUrl } from "../family-catalog";

afterEach(() => {
  clearBimAssetOverlay();
});

const REQUIRED_SLOTS: BimAssetSlotId[] = [
  "family.wall.basic",
  "family.wall.curtain",
  "family.floor.basic",
  "family.roof.basic",
  "family.column.rectangular",
  "family.window.fixed",
  "family.door.single-flush",
  "family.mep.chiller",
  "family.mep.boiler",
  "family.mep.ahu",
  "family.mep.dhw",
  "family.lighting.fixture",
  "family.electrical.panel",
];

describe("authoring asset manifest", () => {
  it("publishes a GLB for every contract slot", () => {
    for (const slot of REQUIRED_SLOTS) {
      const entry = AUTHORING_ASSET_MANIFEST[slot];
      expect(entry, slot).toBeDefined();
      expect(entry?.format).toBe("glb");
      expect(entry?.uri?.endsWith(".glb")).toBe(true);
    }
  });

  it("registering the overlay makes slots resolve from the manifest", () => {
    expect(resolveAssetSlot("family.door.single-flush").source).toBe(
      "procedural-fallback",
    );
    publishAuthoringAssets();
    const door = resolveAssetSlot("family.door.single-flush");
    expect(door.source).toBe("manifest");
    expect(door.uri).toBe("/bim-assets/door-single-flush.glb");
  });

  it("lists the 102 course families with stable public URLs", () => {
    expect(AUTHORING_FAMILY_IDS).toHaveLength(102);
    expect(new Set(AUTHORING_FAMILY_IDS).size).toBe(AUTHORING_FAMILY_IDS.length);
    expect(authoringFamilyUrl("door-single-flush-910")).toBe(
      "/models/authoring/door-single-flush-910.glb",
    );
  });
});
