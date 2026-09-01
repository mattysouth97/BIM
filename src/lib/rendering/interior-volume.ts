// src/lib/rendering/interior-volume.ts
// Cheap interior occlusion so glazing does not reveal an empty void.
// Visual enhancement only — not BIM interior geometry.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { extrudePolygon } from "@/lib/gis/earcut-extrude";
import { insetRing } from "@/lib/gis/ring-utils";
import { createArchitecturalMaterial } from "./architectural-material";
import { materialContextFromRecipe } from "./material-context";
import { isRealisticMode, getRenderRuntime } from "./runtime";

export function generateInteriorVolume(recipe: BuildingRecipe): THREE.Mesh | null {
  if (!isRealisticMode(getRenderRuntime().mode)) return null;

  const inset = Math.max(0.12, recipe.wallThickness + 0.05);
  const height = Math.max(0.4, recipe.totalHeight - 0.15);
  const ctx = materialContextFromRecipe(recipe);
  const mat = createArchitecturalMaterial({
    config: {
      color: "#1c1914",
      roughness: 0.95,
      metalness: 0,
    },
    role: "interior",
    context: { ...ctx, visualId: "interior-cavity" },
  });
  mat.envMapIntensity = 0.08;

  const polygon = recipe.footprintPolygon;
  if (polygon && polygon.length >= 1 && polygon[0].length >= 3) {
    try {
      const insetOuter = insetRing(polygon[0], inset);
      if (insetOuter.length < 3) return null;
      const geo = extrudePolygon([insetOuter, ...polygon.slice(1)], height, 0.08);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.raycast = () => {};
      mesh.userData = { type: "interiorVolume", visualEnhancement: true };
      return mesh;
    } catch {
      return null;
    }
  }

  const w = Math.max(0.4, recipe.footprintWidth - inset * 2);
  const d = Math.max(0.4, recipe.footprintDepth - inset * 2);
  const geo = new THREE.BoxGeometry(w, height, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.08 + height / 2, 0);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  mesh.userData = { type: "interiorVolume", visualEnhancement: true };
  return mesh;
}
