export const BANNER_LAYER_IDS = [
  "rendered",
  "structure",
  "mechanical",
  "all",
] as const;

export type BannerLayerId = (typeof BANNER_LAYER_IDS)[number];

export const BANNER_LAYER_META: Record<
  BannerLayerId,
  /**
   * `focus` is the CSS object-position the plate crops around — the three
   * render plates sit their building right of centre, the BIM plate centres it.
   * `veil` is how hard the landing scrim has to hold the plate back: the three
   * renders are bright studio shots that would swallow white type, the BIM
   * plate is already charcoal and only needs a light hand.
   */
  { color: string; poster: string; alt: string; focus: string; veil: number }
> = {
  rendered: {
    color: "#b85c45",
    poster: "/landing/layer-rendered-brick.jpg",
    alt: "Brick office — punched windows, cornice, interior light",
    focus: "72% 50%",
    veil: 0.9,
  },
  structure: {
    color: "#9a9a9a",
    poster: "/landing/layer-structure-frame.jpg",
    alt: "Concrete frame — slabs, columns, and a stacked service core",
    focus: "72% 50%",
    veil: 0.9,
  },
  mechanical: {
    color: "#06b6d4",
    poster: "/landing/layer-mechanical-floors.jpg",
    alt: "Every floor of ducts, hydronic pipe, and electrical in cyan, orange, yellow",
    focus: "72% 50%",
    veil: 0.9,
  },
  all: {
    color: "#22d3ee",
    poster: "/landing/bim-layers.jpg",
    alt: "One building exploded into its BIM layers — photovoltaic roof, curtain wall, cyan HVAC, electrical, steel frame, slabs, foundation",
    focus: "50% 50%",
    veil: 0.4,
  },
};

export function nextBannerLayer(id: BannerLayerId): BannerLayerId {
  const i = BANNER_LAYER_IDS.indexOf(id);
  return BANNER_LAYER_IDS[(i + 1) % BANNER_LAYER_IDS.length];
}

export function prevBannerLayer(id: BannerLayerId): BannerLayerId {
  const i = BANNER_LAYER_IDS.indexOf(id);
  return BANNER_LAYER_IDS[(i - 1 + BANNER_LAYER_IDS.length) % BANNER_LAYER_IDS.length];
}

export function bannerLayerFromKey(key: string): BannerLayerId | null {
  if (key >= "1" && key <= "4") {
    return BANNER_LAYER_IDS[Number(key) - 1] ?? null;
  }
  return null;
}
