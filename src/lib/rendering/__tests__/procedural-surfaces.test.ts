import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createArchitecturalMaterial,
  proceduralBaseSurfacesEnabled,
  setProceduralBaseSurfaces,
} from "../architectural-material";
import {
  ARCH_COLOR_AFTER,
  ARCH_FRAGMENT_PARS,
  ARCH_PROCEDURAL_PARS,
  ARCH_ROUGHNESS_AFTER,
} from "../shader-chunks";
import { MATERIAL_LIBRARY } from "../material-library";
import {
  ARCHITECTURAL_TEXTURE_SETS,
  setArchitecturalAtlas,
  type ArchitecturalAtlas,
} from "../texture-atlas";
import { DEFAULT_RENDER_RUNTIME, setRenderRuntime } from "../runtime";

function fakeAtlas(): ArchitecturalAtlas {
  const atlas = {} as ArchitecturalAtlas;
  for (const name of ARCHITECTURAL_TEXTURE_SETS) {
    atlas[name] = { color: new THREE.Texture(), roughness: new THREE.Texture() };
  }
  return atlas;
}

/** First library entry that actually names a texture set. */
const TEXTURED_SPEC = MATERIAL_LIBRARY.find((s) => s.textureSet && s.family !== "glass");

afterEach(() => {
  setProceduralBaseSurfaces(false);
  setArchitecturalAtlas(null);
  setRenderRuntime({ ...DEFAULT_RENDER_RUNTIME });
});

describe("procedural base surfaces", () => {
  it("is off by default, so no visual change ships unreviewed", () => {
    expect(proceduralBaseSurfacesEnabled()).toBe(false);
  });

  it("declares every uArch uniform the fragment chunks reference", () => {
    const used = new Set(
      [ARCH_COLOR_AFTER, ARCH_ROUGHNESS_AFTER, ARCH_PROCEDURAL_PARS]
        .join("\n")
        .match(/uArch[A-Za-z]+/g) ?? [],
    );
    const declared = new Set(
      `${ARCH_FRAGMENT_PARS}\n${ARCH_PROCEDURAL_PARS}`
        .split("\n")
        .filter((l) => l.trim().startsWith("uniform "))
        .map((l) => l.replace(/.*\s(uArch[A-Za-z]+)\s*;.*/, "$1")),
    );
    for (const name of used) expect(declared).toContain(name);
  });

  it("keeps braces balanced in every injected chunk", () => {
    for (const chunk of [ARCH_PROCEDURAL_PARS, ARCH_COLOR_AFTER, ARCH_ROUGHNESS_AFTER]) {
      const open = (chunk.match(/\{/g) ?? []).length;
      const close = (chunk.match(/\}/g) ?? []).length;
      expect(open).toBe(close);
    }
  });

  it("routes all seven texture-set families to a shader branch", () => {
    // Seven families, six branches: concrete_clean (0) and concrete_rough (1)
    // share the first one and differ only by a `coarse` weight, so there are
    // five explicit comparisons plus a trailing `else` carrying the membrane.
    const comparisons = ARCH_PROCEDURAL_PARS.match(/fam < \d+\.5/g) ?? [];
    expect(comparisons).toHaveLength(5);
    expect(ARCH_PROCEDURAL_PARS).toContain("} else {");
    expect(ARCHITECTURAL_TEXTURE_SETS).toHaveLength(7);

    // The highest comparison must leave the last family to the `else`.
    const ceiling = Math.max(...comparisons.map((c) => Number(c.replace("fam < ", ""))));
    expect(ceiling).toBe(5.5);
  });

  it("binds the atlas texture when procedural surfaces are off", () => {
    if (!TEXTURED_SPEC) throw new Error("no textured spec in the material library");
    setRenderRuntime({ mode: "realistic", quality: "high" });
    setArchitecturalAtlas(fakeAtlas());

    const mat = createArchitecturalMaterial({
      config: { color: "#b0b0b0", roughness: 0.8, metalness: 0, visualId: TEXTURED_SPEC.id },
      role: "wall",
    });
    expect(mat.map).not.toBeNull();
  });

  it("drops the texture fetch entirely when procedural surfaces are on", () => {
    if (!TEXTURED_SPEC) throw new Error("no textured spec in the material library");
    setRenderRuntime({ mode: "realistic", quality: "high" });
    setArchitecturalAtlas(fakeAtlas());
    setProceduralBaseSurfaces(true);

    const mat = createArchitecturalMaterial({
      config: { color: "#b0b0b0", roughness: 0.8, metalness: 0, visualId: TEXTURED_SPEC.id },
      role: "wall",
    });
    expect(mat.map).toBeNull();
    expect(mat.roughnessMap).toBeNull();
  });

  it("gives the two paths different program cache keys", () => {
    if (!TEXTURED_SPEC) throw new Error("no textured spec in the material library");
    setRenderRuntime({ mode: "realistic", quality: "high" });
    setArchitecturalAtlas(fakeAtlas());
    const args = {
      config: { color: "#b0b0b0", roughness: 0.8, metalness: 0, visualId: TEXTURED_SPEC.id },
      role: "wall" as const,
    };

    const sampled = createArchitecturalMaterial(args).customProgramCacheKey();
    setProceduralBaseSurfaces(true);
    const procedural = createArchitecturalMaterial(args).customProgramCacheKey();

    expect(sampled).not.toBe(procedural);
    expect(procedural).toContain("proc");
  });
});
