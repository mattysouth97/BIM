import * as THREE from "three";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { sourceMaterialSample } from "@/lib/reference-buildings/material-appearance";
import type { RetrofitVisualState } from "@/lib/retrofit/measure-visuals";
import { RENEWED_WALL_COLOR, UPGRADE_GLASS_COLOR, UPGRADE_GLASS_OPACITY, PROPOSAL_EMISSIVE, PROPOSAL_EMISSIVE_INTENSITY } from "@/lib/retrofit/measure-visuals";

export type MaterialBinding = NonNullable<ReferenceBuildingManifest["materialFabric"]>["bindings"][number];

export const MATERIAL_TEXTURE_TYPES = ["concrete_rough", "brick", "wood", "metal_panel"] as const;
export const MATERIAL_TEXTURE_URLS = MATERIAL_TEXTURE_TYPES.flatMap((kind) => [`/textures/${kind}/color.jpg`, `/textures/${kind}/normal.jpg`]);

/** Planar projection in source geometry units (metres), with independent UVs
 * at split normals. It changes only texture coordinates, never source vertices.
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

export function styleMaterialExpression(material: THREE.MeshStandardMaterial, binding: MaterialBinding, buildingId: string, xray: boolean, visual: RetrofitVisualState) {
  const sample = materialBindingSample(buildingId, binding);
  const glass = binding.group === "glazing";
  material.color.set(glass ? "#8bb8d1" : sample.colour);
  material.roughness = glass ? 0.15 : sample.kind === "metal" ? 0.38 : 0.88;
  material.metalness = sample.kind === "metal" ? 0.55 : 0;
  material.opacity = glass ? 0.45 : 1;
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
  material.depthWrite = !xray;
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
  const meshes: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; binding: MaterialBinding; colourMap: THREE.Texture | null; normalMap: THREE.Texture | null }[] = [];
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
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(0.7, 0.7);
      texture.anisotropy = 4;
      texture.colorSpace = index % 2 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
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
      const material = mesh.material.clone();
      materials.push(material);
      mesh.material = material;
      mesh.userData.materialBinding = binding;
      const kind = materialBindingSample(manifest.id, binding).kind;
      const textureIndex = kind === "brick" ? 2 : kind === "wood" ? 4 : kind === "metal" || kind === "framing" ? 6 : ["concrete", "masonry", "mortar", "gravel"].includes(kind) ? 0 : -1;
      if (textureIndex >= 0 && binding.group !== "glazing") {
        if (!textures[textureIndex] || !textures[textureIndex + 1]) throw new Error("Illustrative material textures unavailable");
        material.map = textures[textureIndex];
        material.normalMap = textures[textureIndex + 1];
        material.normalScale.setScalar(0.3);
      }
      meshes.push({ mesh, material, binding, colourMap: material.map, normalMap: material.normalMap });
    });
    if (!meshes.length) throw new Error("Material fabric contains no bound source meshes");
  } catch (error) {
    dispose();
    throw error;
  }
  return { scene, meshes, dispose };
}

export function updateMaterialExpression(prepared: ReturnType<typeof prepareMaterialExpression>, buildingId: string, xray: boolean, visual: RetrofitVisualState) {
  for (const { material, binding, colourMap, normalMap } of prepared.meshes) {
    // A renewed wall's illustrative old brick/wood finish must not survive the
    // proposal tint. Restoring the preview restores the same owned samplers.
    const renewedWall = binding.group === "wall" && visual.wallsUpgraded;
    material.map = renewedWall ? null : colourMap;
    material.normalMap = renewedWall ? null : normalMap;
    styleMaterialExpression(material, binding, buildingId, xray, visual);
  }
}

export function materialPickBinding(object: THREE.Object3D, pointerTravelPx: number): MaterialBinding | null {
  if (!Number.isFinite(pointerTravelPx) || pointerTravelPx > 4) return null;
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return null;
  return (object.userData.materialBinding as MaterialBinding | undefined) ?? null;
}
