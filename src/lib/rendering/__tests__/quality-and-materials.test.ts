import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import { effectiveBudget, getQualityBudget } from "../quality-tiers";
import { createArchitecturalMaterial } from "../architectural-material";
import { setRenderRuntime, DEFAULT_RENDER_RUNTIME } from "../runtime";
import { generateInteriorVolume } from "../interior-volume";
import { hashString01 } from "../hash";
import { getCameraPreset } from "../camera-presets";
import type { BuildingRecipe } from "@/lib/procedural/types";

function stubRecipe(): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 12,
    floors: [{ floorNo: 1, label: "1F", type: "above", y: 0, height: 3, isGroundFloor: true }],
    totalHeight: 12,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.4, windowHeight: 1.6, sillHeight: 0.8, windowSpacing: 2.2,
      windowRatio: 0.3, mullionDepth: 0.08, mullionWidth: 0.05, glassInset: 0.03,
      solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#A0A098", roughness: 0.8, metalness: 0.05 },
    },
    siteWidth: 30,
    siteDepth: 22,
    buildingName: "Test",
    address: "Seoul",
  };
}

describe("quality budgets", () => {
  it("disables expensive passes in BIM mode", () => {
    const bim = effectiveBudget("bim", "ultra");
    expect(bim.gtao).toBe(false);
    expect(bim.smaa).toBe(false);
    expect(bim.weathering).toBe(false);
    expect(bim.triplanar).toBe(false);
  });

  it("keeps GTAO and weathering on in high realistic", () => {
    const high = getQualityBudget("high");
    expect(high.gtao).toBe(true);
    expect(high.weathering).toBe(true);
    expect(high.shadowMapSize).toBeGreaterThanOrEqual(2048);
  });
});

describe("architectural materials", () => {
  beforeEach(() => {
    setRenderRuntime({ ...DEFAULT_RENDER_RUNTIME });
  });

  it("BIM mode returns a plain MeshStandardMaterial and does not remap glass", () => {
    setRenderRuntime({ mode: "bim" });
    const mat = createArchitecturalMaterial({
      config: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
      role: "glass",
    });
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(mat).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(`#${mat.color.getHexString()}`).toBe("#88bbdd");
  });

  it("realistic glass is physical, not CAD blue, and keeps MeshStandardMaterial inheritance", () => {
    setRenderRuntime({ mode: "realistic", quality: "high" });
    const mat = createArchitecturalMaterial({
      config: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4, visualId: "glass-low-e" },
      role: "glass",
      context: { seed: 0.2, buildingHeight: 20, era: "2010-2019", strctCd: "11" },
    });
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(isCadBlueGlassHex(`#${mat.color.getHexString()}`)).toBe(false);
    expect(mat.userData.visualEnhancement).toBe(true);
    expect(mat.userData.visualId).toBe("glass-low-e");
  });

  it("does not emit interior volume in BIM mode", () => {
    setRenderRuntime({ mode: "bim" });
    expect(generateInteriorVolume(stubRecipe())).toBeNull();
  });

  it("emits an interior volume in realistic mode without changing footprint", () => {
    setRenderRuntime({ mode: "realistic" });
    const recipe = stubRecipe();
    const mesh = generateInteriorVolume(recipe);
    expect(mesh).not.toBeNull();
    expect(mesh?.userData.visualEnhancement).toBe(true);
    expect(recipe.footprintWidth).toBe(20);
    expect(recipe.wallThickness).toBe(0.2);
  });
});

describe("hash and camera presets", () => {
  it("hashes deterministically", () => {
    expect(hashString01("alpha")).toBe(hashString01("alpha"));
    expect(hashString01("alpha")).not.toBe(hashString01("beta"));
  });

  it("keeps architectural exterior FOV below a wide-angle 50°", () => {
    expect(getCameraPreset("architectural-exterior").fov).toBeLessThanOrEqual(40);
    expect(getCameraPreset("technical-bim").fov).toBe(35);
  });
});

function isCadBlueGlassHex(hex: string): boolean {
  const h = hex.replace("#", "");
  const v = Number.parseInt(h, 16);
  const r = ((v >> 16) & 255) / 255;
  const g = ((v >> 8) & 255) / 255;
  const b = (v & 255) / 255;
  return b > 0.55 && b > r * 1.15 && g > r * 0.9 && r < 0.75;
}
