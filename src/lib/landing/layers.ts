export const BANNER_LAYER_IDS = [
  "rendered",
  "structure",
  "mechanical",
  "all",
] as const;

export type BannerLayerId = (typeof BANNER_LAYER_IDS)[number];

export const BANNER_LAYER_META: Record<
  BannerLayerId,
  { color: string; poster: string; alt: string }
> = {
  rendered: {
    color: "#b85c45",
    poster: "/landing/layer-rendered-brick.jpg",
    alt: "Brick office — punched windows, cornice, interior light",
  },
  structure: {
    color: "#9a9a9a",
    poster: "/landing/layer-structure-frame.jpg",
    alt: "Concrete frame — slabs, columns, and a stacked service core",
  },
  mechanical: {
    color: "#06b6d4",
    poster: "/landing/layer-mechanical-floors.jpg",
    alt: "Every floor of ducts, hydronic pipe, and electrical in cyan, orange, yellow",
  },
  all: {
    color: "#f97316",
    poster: "/landing/layer-all-peel.jpg",
    alt: "Same office peeled — brick envelope, concrete frame, full MEP",
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
