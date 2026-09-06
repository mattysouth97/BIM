// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { MeshoptDecoder } from "three-stdlib";
import { beforeAll, describe, expect, it } from "vitest";
import { readStaticGlb, verifyLosslessGlb } from "../../../../scripts/lib/verify-lossless-glb.mjs";

const published = readFileSync(path.join(process.cwd(), "public/reference-buildings/fzk-haus/material-fabric.glb"));
let original: Buffer;

function pack(json: object, binary: Buffer) {
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const result = Buffer.alloc(28 + padded.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + padded.length); result.writeUInt32LE(0x004e4942, 24 + padded.length); binary.copy(result, 28 + padded.length);
  return result;
}

beforeAll(async () => {
  const decoder = MeshoptDecoder();
  if (!("decodeGltfBuffer" in decoder) || !("ready" in decoder)) throw new Error("The shipped Meshopt decoder requires WebAssembly support");
  await decoder.ready;
  const { json, binary } = readStaticGlb(published);
  const restored = Buffer.alloc(json.buffers[1].byteLength);
  for (const view of json.bufferViews) {
    const ext = view.extensions.EXT_meshopt_compression;
    const raw = Buffer.alloc(ext.count * ext.byteStride);
    decoder.decodeGltfBuffer(raw, ext.count, ext.byteStride, binary.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength), ext.mode, ext.filter);
    raw.copy(restored, view.byteOffset ?? 0);
    view.buffer = 0;
    delete view.extensions;
  }
  json.buffers = [{ byteLength: restored.length }];
  for (const key of ["extensionsUsed", "extensionsRequired"]) json[key] = json[key].filter((extension: string) => extension !== "EXT_meshopt_compression");
  original = pack(json, restored);
});

describe("lossless material publish guard", () => {
  it("accepts exact decoded geometry, index order, bindings and instance matrices through the shipped Drei decoder", async () => {
    const result = await verifyLosslessGlb(original, published);
    expect(result).toMatchObject({ exact: true, attributeViews: 33, indexViews: 12, drawCalls: 12, placements: 55, storedTriangles: 12262, placedTriangles: 13778 });
  });

  it("rejects an altered source material binding even when all geometry is identical", async () => {
    const { json, binary } = readStaticGlb(published);
    json.materials[0].name = "wrong-source-material";
    await expect(verifyLosslessGlb(original, pack(json, binary))).rejects.toThrow("source graph");
  });

  it("rejects a cyclic index rotation even though the triangle shape and winding are unchanged", async () => {
    const { json, binary } = readStaticGlb(original);
    const accessor = json.accessors[json.meshes[0].primitives[0].indices];
    const view = json.bufferViews[accessor.bufferView];
    const altered = Buffer.from(binary), stride = accessor.componentType === 5123 ? 2 : 4;
    const offset = view.byteOffset ?? 0, first = Buffer.from(altered.subarray(offset, offset + stride));
    altered.copy(altered, offset, offset + stride, offset + 3 * stride);
    first.copy(altered, offset + 2 * stride);
    await expect(verifyLosslessGlb(pack(json, altered), published)).rejects.toThrow("every decoded byte");
  });

  it("rejects one changed instance-translation byte even when counts and source names match", async () => {
    const { json, binary } = readStaticGlb(original);
    const node = json.nodes.find((entry: { extensions?: { EXT_mesh_gpu_instancing?: unknown } }) => entry.extensions?.EXT_mesh_gpu_instancing);
    const accessor = json.accessors[node.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION];
    const view = json.bufferViews[accessor.bufferView], altered = Buffer.from(binary);
    altered[view.byteOffset ?? 0] ^= 1;
    await expect(verifyLosslessGlb(pack(json, altered), published)).rejects.toThrow("every decoded byte");
  });
});
