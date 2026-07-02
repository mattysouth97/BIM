// src/lib/model-storage.ts
import { get, set, del, keys } from "idb-keyval";

const MODEL_PREFIX = "bim-model-";

interface StoredModel {
  buffer: ArrayBuffer;
  fileName: string;
  fileType: "ifc" | "gltf" | "glb";
  uploadedAt: string;
  fileSize: number;
}

/**
 * Save a 3D model to IndexedDB, keyed by building PK.
 */
export async function saveModel(
  buildingPk: string,
  buffer: ArrayBuffer,
  fileName: string,
  fileType: "ifc" | "gltf" | "glb"
): Promise<void> {
  const model: StoredModel = {
    buffer,
    fileName,
    fileType,
    uploadedAt: new Date().toISOString(),
    fileSize: buffer.byteLength,
  };
  await set(MODEL_PREFIX + buildingPk, model);
}

/**
 * Load a stored model for a building.
 */
export async function loadModel(buildingPk: string): Promise<StoredModel | null> {
  const model = await get<StoredModel>(MODEL_PREFIX + buildingPk);
  return model ?? null;
}

/**
 * Delete a stored model.
 */
export async function deleteModel(buildingPk: string): Promise<void> {
  await del(MODEL_PREFIX + buildingPk);
}

/**
 * Check if a model exists for a building.
 */
export async function hasModel(buildingPk: string): Promise<boolean> {
  const allKeys = await keys();
  return allKeys.includes(MODEL_PREFIX + buildingPk);
}

/**
 * List all buildings with stored models.
 */
export async function listModels(): Promise<string[]> {
  const allKeys = await keys();
  return (allKeys as string[])
    .filter(k => typeof k === "string" && k.startsWith(MODEL_PREFIX))
    .map(k => (k as string).slice(MODEL_PREFIX.length));
}
