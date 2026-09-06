import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { NO_RETROFIT_VISUALS, RENEWED_WALL_COLOR } from "@/lib/retrofit/measure-visuals";
import { MATERIAL_TEXTURE_URLS, materialPickBinding, materialProjection, prepareMaterialExpression, updateMaterialExpression, sourceGlassBinding } from "../material-expression";

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings/fzk-haus/manifest.json"), "utf8")) as ReferenceBuildingManifest;
const binding = manifest.materialFabric!.bindings.find((entry) => entry.group === "wall" && entry.representativeLayer?.name.startsWith("Leichtbeton"))!;

function fixture() {
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const material = new THREE.MeshStandardMaterial({ color: "#112233" });
  material.name = binding.key;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(4, 5, 6);
  source.add(mesh);
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(5, 10, 15));
  instances.setMatrixAt(1, new THREE.Matrix4().makeScale(2, 3, 4));
  source.add(instances);
  const textures = MATERIAL_TEXTURE_URLS.map(() => new THREE.Texture());
  return { source, geometry, material, mesh, instances, textures };
}

describe("illustrative material resource ownership", () => {
  it("projects only cloned UVs while retaining every source vertex, index, normal and placement", () => {
    const { source, geometry, material, mesh, instances, textures } = fixture();
    const originalUv = geometry.getAttribute("uv").array.slice();
    const prepared = prepareMaterialExpression(source, manifest, textures);
    const first = prepared.meshes[0].mesh;
    const second = prepared.meshes[1].mesh as THREE.InstancedMesh;
    expect(first.geometry).not.toBe(geometry);
    expect(first.geometry).toBe(second.geometry);
    for (const name of ["position", "normal"]) expect(Array.from(first.geometry.getAttribute(name).array)).toEqual(Array.from(geometry.getAttribute(name).array));
    expect(Array.from(first.geometry.index!.array)).toEqual(Array.from(geometry.index!.array));
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual(Array.from(originalUv));
    expect(Array.from(first.geometry.getAttribute("uv").array)).not.toEqual(Array.from(originalUv));
    expect(first.position.toArray()).toEqual(mesh.position.toArray());
    expect(second.count).toBe(instances.count);
    expect(Array.from(second.instanceMatrix.array)).toEqual(Array.from(instances.instanceMatrix.array));
    expect(first.material).not.toBe(material);
    expect(mesh.userData.materialBinding).toBeUndefined();
    prepared.dispose();
  });

  it("restores source illustration after x-ray/proposal changes and disposes owned resources exactly once", () => {
    const { source, geometry, material, textures } = fixture();
    const sourceDisposals = [geometry, material, ...textures].map((resource) => vi.spyOn(resource, "dispose"));
    const prepared = prepareMaterialExpression(source, manifest, textures);
    updateMaterialExpression(prepared, manifest.id, false, NO_RETROFIT_VISUALS);
    const row = prepared.meshes[0];
    const baselineColour = row.material.color.getHexString();
    const colourTexture = row.material.map!;
    const normalTexture = row.material.normalMap!;
    const roughnessTexture = row.material.roughnessMap!;
    expect(colourTexture).not.toBe(textures[0]);
    expect(colourTexture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normalTexture.colorSpace).toBe(THREE.NoColorSpace);
    expect(roughnessTexture.colorSpace).toBe(THREE.NoColorSpace);
    for (const texture of [colourTexture, normalTexture, roughnessTexture]) {
      // The shipped concrete texture is 2:1; one tile illustrates 2 × 1 m.
      expect(texture.repeat.toArray()).toEqual([0.5, 1]);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.anisotropy).toBe(8);
    }
    expect(colourTexture.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures[0].wrapS).toBe(THREE.ClampToEdgeWrapping);
    updateMaterialExpression(prepared, manifest.id, true, { ...NO_RETROFIT_VISUALS, wallsUpgraded: true });
    expect(row.material.color.getHexString()).toBe(new THREE.Color(RENEWED_WALL_COLOR).getHexString());
    expect(row.material.opacity).toBe(0.22);
    expect(row.material.depthWrite).toBe(false);
    expect(row.material.map).toBeNull();
    expect(row.material.roughnessMap).toBeNull();
    updateMaterialExpression(prepared, manifest.id, false, NO_RETROFIT_VISUALS);
    expect(row.material.color.getHexString()).toBe(baselineColour);
    expect(row.material.opacity).toBe(1);
    expect(row.material.depthWrite).toBe(true);
    expect(row.material.map).toBe(colourTexture);
    expect(row.material.roughnessMap).toBe(roughnessTexture);
    const disposals = [row.mesh.geometry, row.material, colourTexture, normalTexture, roughnessTexture, prepared.meshes[1].mesh as THREE.InstancedMesh].map((resource) => vi.spyOn(resource, "dispose"));
    prepared.dispose();
    prepared.dispose();
    disposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    sourceDisposals.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(material.color.getHexString()).toBe("112233");
    expect(material.opacity).toBe(1);
    // A fresh mount can prepare the same cache after cleanup (including StrictMode).
    const remounted = prepareMaterialExpression(source, manifest, textures);
    expect(remounted.meshes[0].mesh.geometry).not.toBe(row.mesh.geometry);
    remounted.dispose();
  });

  it("uses optical transmission only for source-bound glass, with complete x-ray/proposal restoration", () => {
    const clinic = JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings/bs-medical-dental-clinic/manifest.json"), "utf8")) as ReferenceBuildingManifest;
    const entries = clinic.materialFabric!.bindings.filter((row) => row.group === "glazing");
    expect(entries.map((entry) => [entry.materialNames[0] ?? "unassigned", sourceGlassBinding(entry)])).toEqual([
      ["Glass", true], ["Metal - Chain Link", false], ["unassigned", false],
    ]);
    const source = new THREE.Group();
    for (const entry of entries) {
      const material = new THREE.MeshStandardMaterial({ name: entry.key });
      source.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
    }
    const prepared = prepareMaterialExpression(source, clinic, MATERIAL_TEXTURE_URLS.map(() => new THREE.Texture()));
    updateMaterialExpression(prepared, clinic.id, false, NO_RETROFIT_VISUALS);
    const glass = prepared.meshes[0].material as THREE.MeshPhysicalMaterial;
    expect(glass).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(glass.transmission).toBe(0.9);
    expect(glass.opacity).toBe(1);
    expect(glass.thickness).toBe(0);
    expect(glass.depthWrite).toBe(false);
    // An explicitly metallic source occurrence must not become transparent
    // merely because the extractor grouped it with curtain-wall geometry.
    expect(prepared.meshes[1].material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(prepared.meshes[1].material.opacity).toBe(1);
    expect(prepared.meshes[1].material.metalness).toBeGreaterThan(0.5);
    expect(prepared.meshes[2].material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
    updateMaterialExpression(prepared, clinic.id, true, NO_RETROFIT_VISUALS);
    expect(glass.transmission).toBe(0);
    expect(glass.transparent).toBe(true);
    updateMaterialExpression(prepared, clinic.id, false, { ...NO_RETROFIT_VISUALS, windowsUpgraded: true });
    expect(glass.transmission).toBe(0);
    expect(glass.opacity).toBeLessThan(1);
    updateMaterialExpression(prepared, clinic.id, false, NO_RETROFIT_VISUALS);
    expect(glass.transmission).toBe(0.9);
    expect(glass.opacity).toBe(1);
    expect(glass.transparent).toBe(false);
    prepared.dispose();
  });

  it("rejects unsupported meshes and invalid projection input without changing the cached source", () => {
    const { source, material, geometry, textures } = fixture();
    material.name = "unknown-binding";
    expect(() => prepareMaterialExpression(source, manifest, textures)).toThrow("Material binding unavailable");
    expect(source.children).toHaveLength(2);
    expect(source.children[0]).toHaveProperty("geometry", geometry);
    const missingNormal = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    expect(() => materialProjection(missingNormal)).toThrow("matching source positions and normals");
  });

  it("resolves a clicked source binding but ignores orbit drags and unbound objects", () => {
    const object = new THREE.Object3D();
    expect(materialPickBinding(object, 0)).toBeNull();
    object.userData.materialBinding = binding;
    expect(materialPickBinding(object, 0)).toBe(binding);
    expect(materialPickBinding(object, 4)).toBe(binding);
    expect(materialPickBinding(object, 5)).toBeNull();
    expect(materialPickBinding(object, Number.NaN)).toBeNull();
    const hiddenLayer = new THREE.Group();
    hiddenLayer.add(object);
    hiddenLayer.visible = false;
    expect(materialPickBinding(object, 0)).toBeNull();
  });
});
