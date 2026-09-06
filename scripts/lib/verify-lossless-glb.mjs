import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GLTFLoader, MeshoptDecoder } from 'three-stdlib';

// The same decoder factory used by Drei's useGLTF defaults, not a newer external
// decoder that could hide a production compatibility problem.
const decoder = typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder;
export const glbHash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readStaticGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB total length');
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  const json = JSON.parse(bytes.subarray(20, 20 + length));
  assert.equal(bytes.readUInt32LE(24 + length), 0x004e4942, 'BIN chunk');
  const binary = bytes.subarray(28 + length);
  assert.equal(binary.length, bytes.readUInt32LE(20 + length), 'BIN length');
  return { json, binary };
}

function sameArray(a, b, claim) {
  assert.equal(a.constructor.name, b.constructor.name, `${claim} type`);
  assert.ok(Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength)), `${claim} exact bytes`);
}

async function loadedMeshes(bytes) {
  const loader = new GLTFLoader().setMeshoptDecoder(decoder);
  const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((mesh) => { if (mesh.isMesh) meshes.push(mesh); });
  return meshes;
}

export async function verifyLosslessGlb(sourceBytes, candidateBytes) {
  await decoder.ready;
  const source = readStaticGlb(sourceBytes), candidate = readStaticGlb(candidateBytes);
  assert.equal(source.json.buffers.length, 1, 'one original embedded buffer');
  const ignored = new Set(['buffers', 'bufferViews', 'extensionsUsed', 'extensionsRequired']);
  const retained = (gltf) => Object.fromEntries(Object.entries(gltf).filter(([key]) => !ignored.has(key)));
  assert.deepEqual(retained(candidate.json), retained(source.json), 'source graph, accessor metadata, materials, binding names, and instance references preserved');
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    assert.deepEqual(candidate.json[key], [...new Set([...(source.json[key] ?? []), 'EXT_meshopt_compression'])], key);
  }
  assert.equal(candidate.json.bufferViews.length, source.json.bufferViews.length);
  let decodedBytes = 0, attributeViews = 0, indexViews = 0;
  for (const [i, view] of source.json.bufferViews.entries()) {
    assert.equal(view.buffer, 0);
    const cv = candidate.json.bufferViews[i], extension = cv.extensions?.EXT_meshopt_compression;
    assert.ok(extension, `view ${i} has compression`);
    assert.equal(extension.buffer, 0);
    assert.equal(extension.filter, undefined, 'no precision-reducing filters');
    assert.deepEqual({ ...cv, buffer: 0, extensions: undefined }, { ...view, extensions: undefined }, `view ${i} layout retained`);
    const accessors = source.json.accessors.filter((a) => a.bufferView === i);
    assert.equal(accessors.length, 1, 'one accessor per view');
    assert.equal(extension.count, accessors[0].count);
    assert.equal(extension.count * extension.byteStride, view.byteLength);
    const raw = source.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const decoded = Buffer.alloc(extension.count * extension.byteStride);
    const compressed = candidate.binary.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength);
    decoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride, compressed, extension.mode, extension.filter);
    assert.ok(decoded.equals(raw), `view ${i}: every decoded byte, including index order and instance TRS, is identical`);
    decodedBytes += decoded.length;
    if (extension.mode === 'INDICES') indexViews++; else {
      assert.equal(extension.mode, 'ATTRIBUTES'); attributeViews++;
    }
  }
  const [before, after] = await Promise.all([loadedMeshes(sourceBytes), loadedMeshes(candidateBytes)]);
  assert.equal(after.length, before.length);
  let storedTriangles = 0, placedTriangles = 0, placements = 0;
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    assert.equal(a.name, b.name);
    assert.equal(a.material.name, b.material.name, 'source binding lookup');
    assert.equal(a.isInstancedMesh, b.isInstancedMesh);
    assert.deepEqual(a.matrixWorld.toArray(), b.matrixWorld.toArray());
    assert.deepEqual(Object.keys(a.geometry.attributes), Object.keys(b.geometry.attributes));
    for (const key of Object.keys(a.geometry.attributes)) sameArray(a.geometry.attributes[key].array, b.geometry.attributes[key].array, `${a.name} ${key}`);
    sameArray(a.geometry.index.array, b.geometry.index.array, `${a.name} indices`);
    if (a.isInstancedMesh) {
      assert.equal(a.count, b.count);
      sameArray(a.instanceMatrix.array, b.instanceMatrix.array, `${a.name} runtime instance matrices`);
    }
    const triangles = a.geometry.index.count / 3, count = a.isInstancedMesh ? a.count : 1;
    storedTriangles += triangles; placedTriangles += triangles * count; placements += count;
  }
  for (const mesh of [...before, ...after]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  return { exact: true, attributeViews, indexViews, decodedBytes, drawCalls: before.length, placements, storedTriangles, placedTriangles, sourceBytes: sourceBytes.length, bytes: candidateBytes.length, sourceSha256: glbHash(sourceBytes), sha256: glbHash(candidateBytes) };
}
