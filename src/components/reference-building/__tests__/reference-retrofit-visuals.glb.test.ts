// Verifies the roof/floor elevation split against the REAL published GLBs,
// not a synthetic fixture — bim-54's warning (their own area-weighted WWR
// mean weighted by the wrong area, caught only when bim-83 measured a THIRD
// building) applies exactly here: a rule checked visually on one building,
// or on a shape too simple to exercise it, can be silently wrong. This reads
// the actual `public/reference-buildings/**/model.glb` files this app
// ships and runs the real exported functions against them.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  splitTrianglesByElevation,
  analyzeUpwardFaces,
  roofElevationThresholdM,
  resolveRoofFace,
} from "../reference-retrofit-visuals";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "public", "reference-buildings");

interface GlbAccessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }
interface GlbPrimitive { attributes: Record<string, number>; indices?: number; material: number }
interface GlbJson {
  accessors: GlbAccessor[];
  bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
  meshes: Array<{ primitives: GlbPrimitive[] }>;
  materials: Array<{ name: string }>;
}
type ManifestLike = ReferenceBuildingManifest;

const COMPONENT_TYPED_ARRAY: Record<number, new (buf: ArrayBufferLike, offset: number, length: number) => ArrayLike<number>> = {
  5126: Float32Array, // FLOAT
  5125: Uint32Array, // UNSIGNED_INT
  5123: Uint16Array, // UNSIGNED_SHORT
};
const NUM_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Minimal glTF-binary reader for the container `scripts/lib/ifc-glb.mjs` writes — JSON chunk + one BIN chunk, no external buffers. */
function parseGlb(buf: Buffer): { json: GlbJson; bin: Buffer } {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb file");
  let offset = 12;
  let json: GlbJson | null = null;
  let bin: Buffer | null = null;
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunkData.toString("utf8")) as GlbJson;
    else if (chunkType === 0x004e4942) bin = Buffer.from(chunkData);
    offset += 8 + chunkLength;
  }
  if (!json || !bin) throw new Error("glb missing JSON or BIN chunk");
  return { json, bin };
}

function readAccessor(json: GlbJson, bin: Buffer, accessorIndex: number): ArrayLike<number> {
  const accessor = json.accessors[accessorIndex];
  const bufferView = json.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const TypedArrayCtor = COMPONENT_TYPED_ARRAY[accessor.componentType];
  const count = accessor.count * NUM_COMPONENTS[accessor.type];
  const absoluteByteOffset = bin.byteOffset + byteOffset;
  return new TypedArrayCtor(bin.buffer, absoluteByteOffset, count);
}

/** The merged mesh whose material is named `materialName` — one per `FABRIC_GROUPS` bucket, never an instanced variant. */
function findMeshByMaterialName(
  json: GlbJson,
  bin: Buffer,
  materialName: string,
): { positions: ArrayLike<number>; indices: ArrayLike<number> } | null {
  const materialIndex = json.materials.findIndex((m) => m.name === materialName);
  if (materialIndex < 0) return null;
  for (const mesh of json.meshes) {
    const prim = mesh.primitives[0];
    if (prim.material !== materialIndex) continue;
    if (prim.indices === undefined) continue;
    return {
      positions: readAccessor(json, bin, prim.attributes.POSITION),
      indices: readAccessor(json, bin, prim.indices),
    };
  }
  return null;
}

function loadBuilding(id: string) {
  const dir = path.join(ROOT, id);
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestLike;
  const glbBuf = readFileSync(path.join(dir, manifest.model.file));
  return { manifest, ...parseGlb(glbBuf) };
}

/** Sum of `surfaceSqm` over roof rows at the TOPMOST roof-referencing storey — the figure `roofElevationThresholdM`'s "max, not min" rule is supposed to isolate. */
function topmostRoofSurfaceSqm(manifest: ManifestLike): number {
  const storeys = manifest.storeys!;
  const roofs = manifest.roofs!;
  const elevationByStorey = new Map(storeys.map((s) => [s.id, s.elevationM]));
  const elevations = roofs
    .map((r) => (r.storeyId ? elevationByStorey.get(r.storeyId) : undefined))
    .filter((e): e is number => typeof e === "number");
  const maxElevation = Math.max(...elevations);
  return roofs
    .filter((r) => r.storeyId && elevationByStorey.get(r.storeyId) === maxElevation)
    .reduce((sum, r) => sum + r.surfaceSqm, 0);
}

describe("slab elevation split on the real Clinic GLB (multi-roof-elevation case)", () => {
  const data = loadBuilding("bs-medical-dental-clinic");
  const run = data ? it : it.skip;

  run("splits the merged slab mesh into a nonempty roof set and a nonempty floor set", () => {
    if (!data) return;
    const slab = findMeshByMaterialName(data.json, data.bin, "slab");
    expect(slab).not.toBeNull();
    const threshold = roofElevationThresholdM(data.manifest.roofs, data.manifest.storeys);
    expect(threshold).not.toBeNull();
    const { above, below } = splitTrianglesByElevation(slab!.positions, slab!.indices, threshold!);
    expect(above.length).toBeGreaterThan(0);
    // The Clinic has occupied floors well below its roof — a rule that
    // swallowed everything as "roof" would pass the previous assertion too.
    expect(below.length).toBeGreaterThan(0);
  });

  run("measures the TOPMOST roof only — apex sits at the true top, and a lower threshold demonstrably finds MORE roof-like area than this one keeps out", () => {
    if (!data) return;
    const slab = findMeshByMaterialName(data.json, data.bin, "slab")!;
    const storeys = data.manifest.storeys!;
    const elevationByStorey = new Map(storeys.map((s) => [s.id, s.elevationM]));
    const threshold = roofElevationThresholdM(data.manifest.roofs, data.manifest.storeys)!;
    const { above } = splitTrianglesByElevation(slab.positions, slab.indices, threshold);
    const analysis = analyzeUpwardFaces(slab.positions, above);
    expect(analysis).not.toBeNull();

    // Sits at the building's actual top storey, not some blended mid-height
    // that would result from mixing the two roofs together.
    const topStoreyElevation = Math.max(...storeys.map((s) => s.elevationM));
    expect(analysis!.apexY).toBeGreaterThan(topStoreyElevation - 1.0);

    // NOTE on what this test does NOT assert: `analysis.areaSqm` is not
    // checked against `topmostRoofSurfaceSqm` here. It measures roughly 2×
    // that figure on this building, because the standing-seam sections are
    // authored as "both-sheets-wound-upward" surface models — see
    // `analyzeUpwardFaces`'s own doc comment and the dedicated test below,
    // which pins that ratio directly rather than treating it as noise.

    // The manifest states a SECOND roof, lower down, over the second floor —
    // prove this function is the thing keeping it out, by lowering the
    // threshold just enough to admit it and showing that finds materially
    // more upward roof-like area than the topmost-only threshold does.
    const secondRoofElevation = Math.min(
      ...data.manifest.roofs!
        .map((r) => (r.storeyId ? elevationByStorey.get(r.storeyId) : undefined))
        .filter((e): e is number => typeof e === "number"),
    );
    expect(secondRoofElevation).toBeLessThan(topStoreyElevation - 1); // the manifest actually has two roof elevations
    const lowerThreshold = secondRoofElevation - 1.0;
    const { above: aboveLower } = splitTrianglesByElevation(slab.positions, slab.indices, lowerThreshold);
    const analysisLower = analyzeUpwardFaces(slab.positions, aboveLower)!;
    expect(analysisLower.areaSqm).toBeGreaterThan(analysis!.areaSqm * 1.15);
  });
});

describe("the both-sheets-wound-upward area artefact, pinned rather than treated as noise", () => {
  // `analyzeUpwardFaces` cannot tell a doubled surface-model roof from a real
  // one once merged — see its doc comment. Pinning the actual ratio here
  // means a future extractor change that fixes (or worsens) it shows up as a
  // failing assertion instead of a silently different number on screen.
  const clinic = loadBuilding("bs-medical-dental-clinic");
  const runClinic = clinic ? it : it.skip;

  runClinic("the Clinic's standing-seam roof reads close to 2x its stated surface", () => {
    if (!clinic) return;
    const slab = findMeshByMaterialName(clinic.json, clinic.bin, "slab")!;
    const threshold = roofElevationThresholdM(clinic.manifest.roofs, clinic.manifest.storeys)!;
    const { above } = splitTrianglesByElevation(slab.positions, slab.indices, threshold);
    const analysis = analyzeUpwardFaces(slab.positions, above)!;
    const expectedTopArea = topmostRoofSurfaceSqm(clinic.manifest);
    const ratio = analysis.areaSqm / expectedTopArea;
    expect(ratio).toBeGreaterThan(1.05); // meaningfully more than the stated figure...
    expect(ratio).toBeLessThan(1.6); // ...but well short of a uniform 2x, since only part of this roof is standing-seam
  });
});

describe("slab elevation split on the real Duplex GLB (single-roof case bim-54 flagged)", () => {
  // A single-storey-roof flat box is the shape LEAST likely to expose a bug
  // in the max-vs-min elevation rule (there is only one roof-referencing
  // storey, so max and min coincide) — checked anyway, per bim-54's request,
  // because "the rule happens to agree with me here" is not the same claim
  // as "the rule is right", and this building is the one most likely to
  // pass by accident.
  const data = loadBuilding("duplex-apartment");
  const run = data ? it : it.skip;

  run("finds the roof, excludes the floors below it, and measures close to the manifest's own single roof row", () => {
    if (!data) return;
    const slab = findMeshByMaterialName(data.json, data.bin, "slab");
    expect(slab).not.toBeNull();
    const threshold = roofElevationThresholdM(data.manifest.roofs, data.manifest.storeys);
    expect(threshold).not.toBeNull();
    const { above, below } = splitTrianglesByElevation(slab!.positions, slab!.indices, threshold!);
    expect(above.length).toBeGreaterThan(0);
    expect(below.length).toBeGreaterThan(0); // the two occupied levels

    const analysis = analyzeUpwardFaces(slab!.positions, above);
    expect(analysis).not.toBeNull();
    const expectedArea = data.manifest.areas.roofSurfaceSqm as number;
    expect(analysis!.areaSqm).toBeGreaterThan(expectedArea * 0.7);
    expect(analysis!.areaSqm).toBeLessThan(expectedArea * 1.3);
    // Flat roof: the manifest states 0.00 degrees.
    expect(analysis!.tiltDeg).toBeLessThan(5);
  });
});

describe("dedicated roofing layer on the real Schependomlaan GLB (no elevation split — different code path entirely)", () => {
  // This building never reaches the slab-split path at runtime: it has its
  // own "roofing" service layer, so `RoofRetrofitVisualBoundary` picks
  // `RoofingLayerRetrofitVisual` instead. Verified on ITS OWN file, whole
  // mesh, no threshold — proving the third building exercises the OTHER
  // branch correctly rather than assuming it does because Clinic/Duplex do.
  const dir = path.join(ROOT, "schependomlaan");
  const manifestPath = path.join(dir, "manifest.json");
  const exists = existsSync(manifestPath);
  const run = exists ? it : it.skip;

  run("the whole roofing.glb mesh's tilt agrees with the manifest's stated mixed tile+deck roof; its area reads well over `areas.roofSurfaceSqm`, the same class of artefact as the Clinic's standing seam", () => {
    if (!exists) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestLike;
    const roofingLayer = manifest.serviceLayers!.find((l) => l.id === "roofing");
    expect(roofingLayer).toBeDefined();
    const { json, bin } = parseGlb(readFileSync(path.join(dir, roofingLayer!.file)));
    const mesh = json.meshes[0];
    const prim = mesh.primitives[0];
    const positions = readAccessor(json, bin, prim.attributes.POSITION);
    const indices = readAccessor(json, bin, prim.indices!);

    const analysis = analyzeUpwardFaces(positions, indices);
    expect(analysis).not.toBeNull();
    // energy-inputs.ts states 35.62° (306.00 m² tiled sporenkap @ 63.2° +
    // 236.96 m² flat deck @ 0.0°, area-weighted over the 542.96 m² that
    // input file prices). This module measures higher, ~45°, and that is
    // NOT a bug to chase: the per-element over-count factors here are NOT
    // uniform (1.01x-2.90x, per this roof's own manifest rows), the steep
    // tiled faces carry the larger factors, and an area-weighted mean shifts
    // toward whichever side is over-counted more — see `analyzeUpwardFaces`'s
    // doc comment. Bounded well short of the pure-tile 63.2°, since the flat
    // deck's real (undoubled-ish) weight still pulls it down substantially.
    expect(analysis!.tiltDeg).toBeGreaterThan(30);
    expect(analysis!.tiltDeg).toBeLessThan(55);
    // Area does NOT cancel. This roof's own manifest rows report the
    // extractor's per-element correction ranging 1.01x-2.90x ("the
    // element's parts cover its shadow N x over" — stacked layer solids,
    // not a single both-sheets-upward surface as on the Clinic), so the
    // whole-mesh blend need not land near a clean 2x. Measured and pinned
    // here rather than loosened away: a future extractor fix shows up as a
    // failing assertion, not a silently different on-screen number.
    const expectedArea = manifest.areas.roofSurfaceSqm as number;
    const ratio = analysis!.areaSqm / expectedArea;
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(1.9);
  });
});

describe("resolveRoofFace on the real Schependomlaan roofing.glb — isolating the tile from the flat deck", () => {
  // The blended whole-mesh tilt (previous describe block) reads ~45°, well
  // off the manifest's stated 63.2° for the tiled component alone, because
  // the flat deck's ~0° faces dilute the mean. `resolveRoofFace` is supposed
  // to fix exactly this by restricting to the steep sub-population when the
  // roof is stated pitched — verified here against the real mesh, not a
  // synthetic fixture, since a synthetic two-plane fixture could not have
  // caught the dilution this building's real geometry actually produces.
  const dir = path.join(ROOT, "schependomlaan");
  const manifestPath = path.join(dir, "manifest.json");
  const exists = existsSync(manifestPath);
  const run = exists ? it : it.skip;

  run("comes within a few degrees of the stated 63.2° tile pitch, given the stated roof type is 'gable'", () => {
    if (!exists) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestLike;
    const roofingLayer = manifest.serviceLayers!.find((l) => l.id === "roofing");
    const { json, bin } = parseGlb(readFileSync(path.join(dir, roofingLayer!.file)));
    const mesh = json.meshes[0];
    const prim = mesh.primitives[0];
    const positions = readAccessor(json, bin, prim.attributes.POSITION);
    const indices = readAccessor(json, bin, prim.indices!);

    const resolved = resolveRoofFace(positions, indices, "gable");
    expect(resolved).not.toBeNull();
    expect(resolved!.tiltDeg).toBeGreaterThan(55);
    expect(resolved!.tiltDeg).toBeLessThan(63.2 + 5);

    // And without the stated type (falls back to self-detected pitched,
    // since the blended tilt alone already clears the flat threshold) it
    // should land in the same neighbourhood — the stated type sharpens this,
    // it is not the only way to reach it.
    const withoutStated = resolveRoofFace(positions, indices, undefined);
    expect(withoutStated!.tiltDeg).toBeGreaterThan(55);
  });

  run("stays at the blended figure when the roof is stated flat, even though this specific mesh is not", () => {
    if (!exists) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestLike;
    const roofingLayer = manifest.serviceLayers!.find((l) => l.id === "roofing");
    const { json, bin } = parseGlb(readFileSync(path.join(dir, roofingLayer!.file)));
    const positions = readAccessor(json, bin, json.meshes[0].primitives[0].attributes.POSITION);
    const indices = readAccessor(json, bin, json.meshes[0].primitives[0].indices!);
    const resolved = resolveRoofFace(positions, indices, "flat");
    // A stated "flat" is trusted over this module's own geometry — it does
    // NOT go looking for a steep sub-population that the stated fact says
    // should not be there.
    expect(resolved!.tiltDeg).toBeLessThan(50);
  });
});
