import { describe, expect, it } from "vitest";
import {
  BANNER_LAYER_IDS,
  BANNER_LAYER_META,
  bannerLayerFromKey,
  nextBannerLayer,
  prevBannerLayer,
} from "../layers";

describe("banner layers", () => {
  it("cycles through every discipline and back to rendered", () => {
    let id: (typeof BANNER_LAYER_IDS)[number] = BANNER_LAYER_IDS[0];
    const seen = new Set<string>();
    for (let i = 0; i < BANNER_LAYER_IDS.length; i++) {
      seen.add(id);
      id = nextBannerLayer(id);
    }
    expect(seen.size).toBe(4);
    expect(id).toBe("rendered");
    expect(prevBannerLayer("rendered")).toBe("all");
    expect(BANNER_LAYER_IDS.includes("shape" as never)).toBe(false);
  });

  it("maps 1–4 keys onto the same order as the rail", () => {
    expect(BANNER_LAYER_IDS.map((_, i) => bannerLayerFromKey(String(i + 1)))).toEqual([
      "rendered",
      "structure",
      "mechanical",
      "all",
    ]);
    expect(bannerLayerFromKey("0")).toBeNull();
    expect(bannerLayerFromKey("5")).toBeNull();
  });

  it("gives each layer a poster and no baked type", () => {
    for (const id of BANNER_LAYER_IDS) {
      expect(BANNER_LAYER_META[id].poster).toMatch(/^\/landing\/.+\.jpg$/);
      expect(BANNER_LAYER_META[id].alt.length).toBeGreaterThan(8);
    }
  });
});
