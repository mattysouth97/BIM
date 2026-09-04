// src/lib/rendering/quality-tiers.ts

import type { QualityBudget, QualityTier, RenderMode } from "./types";

const BUDGETS: Record<QualityTier, QualityBudget> = {
  performance: {
    tier: "performance",
    shadowMapSize: 1024,
    gtao: false,
    gtaoSamples: 8,
    smaa: false,
    contactShadows: false,
    weathering: false,
    stochastic: false,
    triplanar: true,
    maxPixelRatio: 1,
    envFromSky: true,
  },
  balanced: {
    tier: "balanced",
    shadowMapSize: 2048,
    gtao: true,
    gtaoSamples: 8,
    smaa: false,
    contactShadows: true,
    weathering: true,
    stochastic: true,
    triplanar: true,
    maxPixelRatio: 1.5,
    envFromSky: true,
  },
  high: {
    tier: "high",
    shadowMapSize: 2048,
    gtao: true,
    gtaoSamples: 12,
    smaa: true,
    contactShadows: true,
    weathering: true,
    stochastic: true,
    triplanar: true,
    maxPixelRatio: 2,
    envFromSky: true,
  },
  ultra: {
    tier: "ultra",
    shadowMapSize: 4096,
    gtao: true,
    gtaoSamples: 16,
    smaa: true,
    contactShadows: true,
    weathering: true,
    stochastic: true,
    triplanar: true,
    maxPixelRatio: 2,
    envFromSky: true,
  },
  presentation: {
    tier: "presentation",
    shadowMapSize: 4096,
    gtao: true,
    gtaoSamples: 16,
    smaa: true,
    contactShadows: true,
    weathering: true,
    stochastic: true,
    triplanar: true,
    maxPixelRatio: 2,
    envFromSky: true,
  },
};

export function getQualityBudget(tier: QualityTier): QualityBudget {
  return BUDGETS[tier];
}

export function effectiveBudget(mode: RenderMode, tier: QualityTier): QualityBudget {
  if (mode === "bim") {
    return {
      ...BUDGETS.performance,
      shadowMapSize: 2048,
      triplanar: false,
      weathering: false,
      stochastic: false,
      gtao: false,
      smaa: false,
      contactShadows: false,
      envFromSky: false,
      maxPixelRatio: 2,
    };
  }
  if (mode === "hyperreal") {
    const base = BUDGETS[tier === "performance" ? "high" : tier];
    return { ...base, gtao: true, smaa: true, contactShadows: true, weathering: true };
  }
  return BUDGETS[tier];
}

export const QUALITY_TIER_LABELS: Record<QualityTier, { ko: string; en: string }> = {
  performance: { ko: "성능", en: "Performance" },
  balanced: { ko: "균형", en: "Balanced" },
  high: { ko: "높음", en: "High" },
  ultra: { ko: "울트라", en: "Ultra" },
  presentation: { ko: "프레젠테이션", en: "Presentation" },
};
