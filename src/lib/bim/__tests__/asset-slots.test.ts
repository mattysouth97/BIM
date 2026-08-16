import { describe, it, expect, afterEach } from "vitest";
import {
  clearBimAssetOverlay,
  identitySlotFor,
  registerBimAssets,
  resolveAssetSlot,
} from "../asset-slots";

afterEach(() => {
  clearBimAssetOverlay();
});

describe("identitySlotFor", () => {
  it("maps kinds to family slots", () => {
    expect(identitySlotFor("wall")).toBe("family.wall.basic");
    expect(identitySlotFor("wall", { curtainWall: true })).toBe("family.wall.curtain");
    expect(identitySlotFor("chiller")).toBe("family.mep.chiller");
    expect(identitySlotFor("window")).toBe("family.window.fixed");
  });
});

describe("resolveAssetSlot", () => {
  it("returns procedural fallback until the asset session publishes", () => {
    expect(resolveAssetSlot("family.mep.chiller")).toEqual({
      slot: "family.mep.chiller",
      source: "procedural-fallback",
    });
  });

  it("reads overlay entries from the 3D-asset session", () => {
    registerBimAssets({
      "family.mep.chiller": { uri: "/bim-assets/chiller.glb", format: "glb" },
    });
    expect(resolveAssetSlot("family.mep.chiller")).toEqual({
      slot: "family.mep.chiller",
      uri: "/bim-assets/chiller.glb",
      format: "glb",
      source: "manifest",
    });
  });
});
