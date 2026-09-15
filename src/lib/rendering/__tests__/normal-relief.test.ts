// src/lib/rendering/__tests__/normal-relief.test.ts
//
// The atlas shipped normal maps for every texture set and nothing sampled
// them: the mesh normalMap is skipped under triplanar, every tier sets
// triplanar true, and the only normal work in the shader was an edge bevel.
// The channel was eventually deleted as dead weight.
//
// It is back, sampled triplanar in the shader. These pin the two things that
// made it dead before — that the tier actually asks for the channel, and that
// the material actually binds it — so it cannot quietly go unread again.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { getQualityBudget, effectiveBudget } from "../quality-tiers";
import { createArchitecturalMaterial } from "../architectural-material";
import { setRenderRuntime, DEFAULT_RENDER_RUNTIME } from "../runtime";
import {
  architecturalTextureUrls,
  setArchitecturalAtlas,
  ARCHITECTURAL_TEXTURE_SETS,
  type ArchitecturalAtlas,
} from "../texture-atlas";

function fakeAtlas(withNormal: boolean): ArchitecturalAtlas {
  const set = () => {
    const base = { color: new THREE.Texture(), roughness: new THREE.Texture() };
    return withNormal ? { ...base, normal: new THREE.Texture() } : base;
  };
  const atlas = {} as ArchitecturalAtlas;
  for (const name of ARCHITECTURAL_TEXTURE_SETS) atlas[name] = set();
  return atlas;
}

/** Reads a uniform off the material by running its onBeforeCompile hook. */
function uniformsOf(mat: THREE.MeshStandardMaterial): Record<string, { value: unknown }> {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader:
      "#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>",
  };
  // three calls this with the real shader source; the includes above are the
  // ones the factory replaces, so the hook runs to completion.
  mat.onBeforeCompile?.(shader as never, undefined as never);
  return shader.uniforms;
}

describe("the tier decides whether the normal channel is even fetched", () => {
  it("performance does not pay for it; every richer tier does", () => {
    expect(getQualityBudget("performance").normalMaps).toBe(false);
    for (const tier of ["balanced", "high", "ultra", "presentation"] as const) {
      expect(getQualityBudget(tier).normalMaps).toBe(true);
    }
  });

  it("BIM mode never fetches it, because it does not mount the atlas at all", () => {
    for (const tier of ["balanced", "high", "ultra", "presentation"] as const) {
      expect(effectiveBudget("bim", tier).normalMaps).toBe(false);
    }
  });

  it("the URL list carries the channel only when asked", () => {
    const without = architecturalTextureUrls(false);
    const with_ = architecturalTextureUrls(true);
    expect(without.some((u) => u.endsWith("/normal.jpg"))).toBe(false);
    expect(with_.some((u) => u.endsWith("/normal.jpg"))).toBe(true);
    // Aliased sets are still deduplicated, so this is not 7 more entries.
    expect(with_.length).toBeGreaterThan(without.length);
    expect(new Set(with_).size).toBe(with_.length);
  });
});

describe("the material binds the normal map it was given", () => {
  beforeEach(() => {
    setRenderRuntime({ ...DEFAULT_RENDER_RUNTIME, mode: "realistic", quality: "high" });
  });
  afterEach(() => {
    setArchitecturalAtlas(null);
    setRenderRuntime(DEFAULT_RENDER_RUNTIME);
  });

  const wall = {
    config: { color: "#B8B0A8", roughness: 0.9, metalness: 0, visualId: "brick-red" },
    role: "wall" as const,
    context: { seed: 0.2, buildingHeight: 20, era: "1970-1989" as const, strctCd: "11" },
  };

  it("drives the strength uniform above zero when the atlas carries a normal", () => {
    setArchitecturalAtlas(fakeAtlas(true));
    const uniforms = uniformsOf(createArchitecturalMaterial(wall));
    expect(uniforms.uArchNormalTex?.value).toBeInstanceOf(THREE.Texture);
    expect(uniforms.uArchNormalStrength?.value as number).toBeGreaterThan(0);
  });

  it("leaves the strength at zero when the atlas has no normal channel", () => {
    // This is the state the old atlas was permanently in. The shader branch
    // must switch itself off rather than sampling an undefined sampler.
    setArchitecturalAtlas(fakeAtlas(false));
    const uniforms = uniformsOf(createArchitecturalMaterial(wall));
    expect(uniforms.uArchNormalTex?.value ?? null).toBeNull();
    expect(uniforms.uArchNormalStrength?.value as number).toBe(0);
  });

  it("does not bind three's UV normalMap — the stretched instanced UVs are the whole reason for triplanar", () => {
    setArchitecturalAtlas(fakeAtlas(true));
    const mat = createArchitecturalMaterial(wall);
    expect(mat.normalMap).toBeNull();
  });
});
