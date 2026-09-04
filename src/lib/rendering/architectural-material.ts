// src/lib/rendering/architectural-material.ts
// Turns a BIM PBR config + visual spec into a Three.js material.
// BIM mode keeps the historical MeshStandardMaterial (selection/ghosting
// continue to work). Realistic modes inject world-space shading.

import * as THREE from "three";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import type { ArchitecturalMaterialContext, SurfaceRole, VisualMaterialSpec } from "./types";
import { tryGetVisualMaterial } from "./material-library";
import { resolveVisualMaterial } from "./bim-material-mapping";
import { currentBudget, getRenderRuntime, isRealisticMode } from "./runtime";
import { isCadBlueGlass } from "./pbr-standards";
import { getArchitecturalAtlas } from "./texture-atlas";
import {
  ARCH_COLOR_AFTER,
  ARCH_PROCEDURAL_PARS,
  ARCH_FRAGMENT_PARS,
  ARCH_MAP_FRAGMENT,
  ARCH_NORMAL_AFTER,
  ARCH_ROUGHNESS_AFTER,
  ARCH_VERTEX_PARS,
  ARCH_VERTEX_TAIL,
} from "./shader-chunks";

/**
 * Procedural base surfaces instead of the sampled JPEG atlas.
 *
 * Off by default: this changes how every building looks, and the honest test
 * is what a facade reads like at 2 m, not the byte count. Kept as a switch so
 * the comparison can be made side by side. Promoting it into `QualityBudget`
 * needs an edit to quality-tiers.ts, which is outside this module's ownership.
 */
let proceduralBase = false;

export function setProceduralBaseSurfaces(enabled: boolean): void {
  proceduralBase = enabled;
}

export function proceduralBaseSurfacesEnabled(): boolean {
  return proceduralBase;
}

/**
 * Dev-only handle. The flag is otherwise unreachable at runtime, and a switch
 * nobody can flip cannot be reviewed — the acceptance test for this path is
 * what a facade reads like at 2 m, which needs a side-by-side comparison.
 * Remount the viewer after toggling so materials rebuild.
 */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__bimProceduralSurfaces = (
    enabled = true,
  ) => {
    setProceduralBaseSurfaces(enabled);
    return `procedural base surfaces ${enabled ? "on" : "off"} — remount the viewer`;
  };
}

/** Surface family index consumed by `archProceduralSurface` in the shader. */
const PROCEDURAL_FAMILY: Record<string, number> = {
  concrete_clean: 0,
  concrete_rough: 1,
  brick: 2,
  metal_panel: 3,
  wood: 4,
  roof_tile: 5,
  roof_flat: 6,
};

export interface CreateArchitecturalMaterialArgs {
  config: PBRMaterialConfig;
  role: SurfaceRole;
  context?: ArchitecturalMaterialContext;
}

function resolveSpec(args: CreateArchitecturalMaterialArgs): VisualMaterialSpec | null {
  const fromConfig = tryGetVisualMaterial(args.config.visualId);
  if (fromConfig) return fromConfig;
  return resolveVisualMaterial({
    strctCd: args.context?.strctCd,
    mainPurpsCd: args.context?.mainPurpsCd,
    era: args.context?.era,
    role: args.role,
  });
}

function applyProgram(mat: THREE.MeshStandardMaterial, spec: VisualMaterialSpec, args: CreateArchitecturalMaterialArgs): void {
  const budget = currentBudget();
  const runtime = getRenderRuntime();
  const atlas = getArchitecturalAtlas();
  const texSet = spec.textureSet && atlas ? atlas[spec.textureSet] : null;
  const useProcedural = proceduralBase && budget.triplanar;

  if (texSet && budget.triplanar && !useProcedural) {
    texSet.color.wrapS = texSet.color.wrapT = THREE.RepeatWrapping;
    texSet.roughness.wrapS = texSet.roughness.wrapT = THREE.RepeatWrapping;
    texSet.color.colorSpace = THREE.SRGBColorSpace;
    texSet.roughness.colorSpace = THREE.LinearSRGBColorSpace;
    mat.map = texSet.color;
    mat.roughnessMap = texSet.roughness;
    // Mesh UVs on instanced unit boxes are stretched — triplanar in the
    // shader replaces UV sampling. Skip the mesh normalMap for the same reason.
    mat.color.set("#f3f1ec");
  }

  const uniforms = {
    uArchMetersX: { value: spec.metersPerTile[0] },
    uArchMetersY: { value: spec.metersPerTile[1] },
    uArchSeed: { value: args.context?.seed ?? 0.17 },
    uArchHeight: { value: args.context?.buildingHeight ?? 20 },
    uArchRain: { value: spec.weathering.rainStreaks },
    uArchDirt: { value: spec.weathering.groundDirt },
    uArchOxidation: { value: spec.weathering.oxidation },
    uArchFade: { value: spec.weathering.fade },
    uArchWetness: { value: runtime.wetness },
    uArchDetail: { value: spec.microDetail * (budget.tier === "performance" ? 0.4 : 1) },
    uArchStochastic: { value: budget.stochastic && spec.stochastic === "rotate" ? 1 : 0 },
    uArchWeathering: { value: budget.weathering ? 1 : 0 },
    uArchTint: { value: new THREE.Color(spec.albedo) },
    uArchProcedural: { value: useProcedural ? 1 : 0 },
    uArchFamily: { value: PROCEDURAL_FAMILY[spec.textureSet ?? "concrete_rough"] ?? 1 },
  };

  const cacheKey = [
    "arch",
    runtime.mode,
    budget.tier,
    spec.id,
    args.role,
    useProcedural ? "proc" : texSet ? spec.textureSet : "none",
    budget.weathering ? "w" : "nw",
    budget.stochastic ? "s" : "ns",
  ].join(":");

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${ARCH_VERTEX_PARS}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${ARCH_VERTEX_TAIL}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${ARCH_FRAGMENT_PARS}\n${ARCH_PROCEDURAL_PARS}`,
      )
      .replace("#include <map_fragment>", ARCH_MAP_FRAGMENT)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${ARCH_COLOR_AFTER}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${ARCH_ROUGHNESS_AFTER}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${ARCH_NORMAL_AFTER}`);
  };
  mat.customProgramCacheKey = () => cacheKey;
  mat.needsUpdate = true;
}

/**
 * BIM-accurate dimensions are not modified. Visual displacement lives in the
 * normal/roughness response only.
 */
export function createArchitecturalMaterial(
  args: CreateArchitecturalMaterialArgs,
): THREE.MeshStandardMaterial {
  const runtime = getRenderRuntime();
  const spec = resolveSpec(args);
  const role = args.role;
  const isGlass = role === "glass" || spec?.family === "glass";

  if (!isRealisticMode(runtime.mode) || !spec) {
    const mat = new THREE.MeshStandardMaterial({
      color: args.config.color,
      roughness: args.config.roughness,
      metalness: args.config.metalness,
      side: THREE.FrontSide,
    });
    if (args.config.transparent) {
      mat.transparent = true;
      mat.opacity = args.config.opacity ?? 0.4;
    }
    if (args.config.emissive) {
      mat.emissive = new THREE.Color(args.config.emissive);
      mat.emissiveIntensity = args.config.emissiveIntensity ?? 0.1;
    }
    mat.userData.visualRole = role;
    mat.userData.visualId = spec?.id;
    return mat;
  }

  const albedo = isGlass && isCadBlueGlass(args.config.color)
    ? spec.albedo
    : (isGlass ? spec.albedo : args.config.color);
  const roughness = spec.roughness;
  const metalness = spec.metalness;

  if (isGlass) {
    const glass = spec.glass;
    const mat = new THREE.MeshPhysicalMaterial({
      color: albedo,
      roughness,
      metalness: 0,
      transparent: true,
      opacity: glass?.opacity ?? args.config.opacity ?? 0.32,
      ior: spec.ior,
      specularIntensity: 1,
      envMapIntensity: glass?.envMapIntensity ?? spec.envMapIntensity,
      side: THREE.FrontSide,
      depthWrite: false,
      thickness: 0.012,
    });
    if (args.config.emissive) {
      mat.emissive = new THREE.Color(args.config.emissive);
      mat.emissiveIntensity = args.config.emissiveIntensity ?? 0.05;
    }
    applyProgram(mat, spec, args);
    mat.userData.visualRole = role;
    mat.userData.visualId = spec.id;
    mat.userData.visualEnhancement = true;
    return mat;
  }

  const mat = new THREE.MeshStandardMaterial({
    color: albedo,
    roughness,
    metalness,
    envMapIntensity: spec.envMapIntensity,
    side: THREE.FrontSide,
  });
  if (args.config.transparent) {
    mat.transparent = true;
    mat.opacity = args.config.opacity ?? 1;
  }
  if (args.config.emissive) {
    mat.emissive = new THREE.Color(args.config.emissive);
    mat.emissiveIntensity = args.config.emissiveIntensity ?? 0.1;
  }
  applyProgram(mat, spec, args);
  mat.userData.visualRole = role;
  mat.userData.visualId = spec.id;
  mat.userData.visualEnhancement = true;
  return mat;
}
