import * as THREE from "three";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { sourceMaterialSample } from "@/lib/reference-buildings/material-appearance";
import type { RetrofitVisualState } from "@/lib/retrofit/measure-visuals";
import { RENEWED_WALL_COLOR, UPGRADE_GLASS_COLOR, UPGRADE_GLASS_OPACITY, PROPOSAL_EMISSIVE, PROPOSAL_EMISSIVE_INTENSITY } from "@/lib/retrofit/measure-visuals";
import { MATERIAL_TEXTURE_TYPES, MATERIAL_TEXTURE_PROFILES, MATERIAL_TEXTURE_CHANNELS, textureKindForSample } from "./material-expression-profile";
import { installMaterialExpressionShader } from "./material-expression-shader";
export { MATERIAL_TEXTURE_TYPES, MATERIAL_TEXTURE_URLS } from "./material-expression-profile";

export type MaterialBinding = NonNullable<ReferenceBuildingManifest["materialFabric"]>["bindings"][number];

/** Planar projection in local geometry units, with independent UVs at split
 * normals. The material shader applies node/instance scale to reach metres.
 * It changes only texture coordinates, never source vertices.
 */
export function materialProjection(geometry: THREE.BufferGeometry) {
  const clone = geometry.clone();
  const positions = clone.getAttribute("position");
  const normals = clone.getAttribute("normal");
  if (!positions || !normals || positions.count !== normals.count) {
    clone.dispose();
    throw new Error("Material projection requires matching source positions and normals");
  }
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const x = Math.abs(normals.getX(i)), y = Math.abs(normals.getY(i)), z = Math.abs(normals.getZ(i));
    uv[i * 2] = x > y && x > z ? positions.getZ(i) : positions.getX(i);
    uv[i * 2 + 1] = y >= x && y >= z ? positions.getZ(i) : positions.getY(i);
  }
  clone.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return clone;
}

export function materialBindingSample(buildingId: string, binding: MaterialBinding) {
  return sourceMaterialSample(buildingId, binding.representativeLayer?.name ?? (binding.status === "single_material" ? binding.materialNames[0] ?? "" : ""));
}

/** Whole IfcWindow assemblies can mix frames and panes. A glazing category
 * alone cannot justify applying optical transmission to every source part. */
export function sourceGlassBinding(binding: MaterialBinding) {
  return binding.status === "single_material" && binding.materialNames.length === 1 &&
    ["Glass", "WindowGlass_DoubleGlazing_1970_24mm"].includes(binding.materialNames[0]);
}

function isSourceMetal(binding: MaterialBinding) {
  return binding.status === "single_material" && binding.materialNames[0] === "Metal - Chain Link";
}

export function styleMaterialExpression(material: THREE.MeshStandardMaterial, binding: MaterialBinding, buildingId: string, xray: boolean, visual: RetrofitVisualState) {
  const sample = materialBindingSample(buildingId, binding);
  const glass = sourceGlassBinding(binding) || (binding.group === "glazing" && !isSourceMetal(binding));
  const opticalGlass = sourceGlassBinding(binding) && material instanceof THREE.MeshPhysicalMaterial;
  const kind = textureKindForSample(isSourceMetal(binding) ? "metal" : sample.kind);
  const profile = kind ? MATERIAL_TEXTURE_PROFILES[kind] : null;
  // A photographic albedo already contains the material colour. Applying the
  // sidebar swatch again obscured its surface detail with a second dark tint.
  material.color.set(glass ? (opticalGlass ? "#edf4f3" : "#b3c7ce") : material.map && profile ? profile.tint : sample.colour);
  material.roughness = glass ? (opticalGlass ? 0.075 : 0.2) : profile?.roughness[1] ?? 0.88;
  material.metalness = glass ? 0 : profile?.metalness ?? 0;
  material.envMapIntensity = glass ? 1.45 : kind === "metal_panel" ? 1.05 : 0.6;
  material.opacity = glass && !opticalGlass ? 0.45 : 1;
  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.ior = 1.5;
    material.thickness = 0; // Thin-surface illustration, not inferred pane thickness.
    material.transmission = opticalGlass && !xray && !visual.windowsUpgraded ? 0.9 : 0;
  }
  material.emissive.set("#000000");
  material.emissiveIntensity = 0;
  if (binding.group === "wall" && visual.wallsUpgraded) {
    material.color.set(RENEWED_WALL_COLOR);
    material.emissive.set(PROPOSAL_EMISSIVE);
    material.emissiveIntensity = PROPOSAL_EMISSIVE_INTENSITY;
  }
  if (glass && visual.windowsUpgraded) {
    material.color.set(UPGRADE_GLASS_COLOR);
    material.opacity = UPGRADE_GLASS_OPACITY;
  }
  if (xray) material.opacity *= 0.22;
  material.transparent = material.opacity < 1;
  material.depthWrite = !xray && !glass;
  material.needsUpdate = true;
}

/** A committed scene owns every resource it changes. The GLTF and texture
 * caches are shared across viewers and are never styled, disposed or edited.
 */
export function prepareMaterialExpression(source: THREE.Group, manifest: ReferenceBuildingManifest, sourceTextures: readonly THREE.Texture[]) {
  const bindings = new Map(manifest.materialFabric?.bindings.map((binding) => [binding.key, binding]));
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const instances: THREE.InstancedMesh[] = [];
  const meshes: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; binding: MaterialBinding; colourMap: THREE.Texture | null; normalMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }[] = [];
  const scene = source.clone(true);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    instances.forEach((mesh) => mesh.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  };
  try {
    for (const [index, cached] of sourceTextures.entries()) {
      const texture = cached.clone();
      const profile = MATERIAL_TEXTURE_PROFILES[MATERIAL_TEXTURE_TYPES[Math.floor(index / MATERIAL_TEXTURE_CHANNELS.length)]];
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1 / profile.metresPerTile[0], 1 / profile.metresPerTile[1]);
      texture.anisotropy = 8;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = index % MATERIAL_TEXTURE_CHANNELS.length === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      textures.push(texture);
    }
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh instanceof THREE.InstancedMesh) instances.push(mesh);
      if (Array.isArray(mesh.material) || !(mesh.material instanceof THREE.MeshStandardMaterial)) throw new Error("Unsupported material fabric primitive");
      const binding = bindings.get(mesh.material.name);
      if (!binding) throw new Error(`Material binding unavailable: ${mesh.material.name}`);
      if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, materialProjection(mesh.geometry));
      mesh.geometry = geometries.get(mesh.geometry)!;
      let material: THREE.MeshStandardMaterial;
      if (sourceGlassBinding(binding)) {
        material = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(material, mesh.material);
        material.defines = { STANDARD: "", PHYSICAL: "" };
      } else material = mesh.material.clone();
      materials.push(material);
      mesh.material = material;
      mesh.userData.materialBinding = binding;
      const kind = textureKindForSample(isSourceMetal(binding) ? "metal" : materialBindingSample(manifest.id, binding).kind);
      const profile = kind ? MATERIAL_TEXTURE_PROFILES[kind] : null;
      const textureIndex = kind ? MATERIAL_TEXTURE_TYPES.indexOf(kind) * MATERIAL_TEXTURE_CHANNELS.length : -1;
      if (profile && textureIndex >= 0 && (binding.group !== "glazing" || isSourceMetal(binding))) {
        if (!textures[textureIndex] || !textures[textureIndex + 1] || !textures[textureIndex + 2]) throw new Error("Illustrative material textures unavailable");
        material.map = textures[textureIndex];
        material.normalMap = textures[textureIndex + 1];
        material.roughnessMap = textures[textureIndex + 2];
        material.normalScale.setScalar(profile.normalStrength);
      }
      installMaterialExpressionShader(material, profile?.roughness ?? [0.72, 0.98]);
      meshes.push({ mesh, material, binding, colourMap: material.map, normalMap: material.normalMap, roughnessMap: material.roughnessMap });
    });
    if (!meshes.length) throw new Error("Material fabric contains no bound source meshes");
  } catch (error) {
    dispose();
    throw error;
  }
  return { scene, meshes, dispose };
}

export function updateMaterialExpression(prepared: ReturnType<typeof prepareMaterialExpression>, buildingId: string, xray: boolean, visual: RetrofitVisualState) {
  for (const { material, binding, colourMap, normalMap, roughnessMap } of prepared.meshes) {
    // A renewed wall's illustrative old brick/wood finish must not survive the
    // proposal tint. Restoring the preview restores the same owned samplers.
    const renewedWall = binding.group === "wall" && visual.wallsUpgraded;
    material.map = renewedWall ? null : colourMap;
    material.normalMap = renewedWall ? null : normalMap;
    material.roughnessMap = renewedWall ? null : roughnessMap;
    styleMaterialExpression(material, binding, buildingId, xray, visual);
  }
}

export function materialPickBinding(object: THREE.Object3D, pointerTravelPx: number): MaterialBinding | null {
  if (!Number.isFinite(pointerTravelPx) || pointerTravelPx > 4) return null;
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return null;
  return (object.userData.materialBinding as MaterialBinding | undefined) ?? null;
}
