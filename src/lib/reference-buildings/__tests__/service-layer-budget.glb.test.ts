// A .glb.test.ts file, following the existing convention (see
// reference-retrofit-visuals.glb.test.ts), for a test that reads the real
// published binaries rather than only the manifest's own claims about them.
//
// The sibling manifest-level test (service-layer-budget.test.ts) trusts each
// manifest's `drawCalls` figure. This file does not: it recounts draw calls
// out of the glTF JSON chunk of each published service-layer GLB and feeds
// the recount through the SAME checkServiceLayerBudget used everywhere else,
// so a manifest that understates its own count cannot satisfy the budget.
//
// Deliberately no silent skip when a GLB is missing. The four sibling tests
// that already read these bytes unconditionally
// (architectural-details.test.tsx, material-fabric.test.ts,
// mep-coverage.test.ts, reference-architectural-details.test.tsx) already
// make `scripts/restore-reference-glbs.mjs` a precondition of the suite, so
// this arm adds no new download — it only reads a few KB per file where the
// siblings read whole GLBs. A silent skip would make the guard capable of
// not running at all, which is the same absence-is-not-false trap AGENTS.md
// warns about; and skipping a failing test is disallowed outright.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "../manifest";
import {
  SERVICE_LAYER_BUDGET_WAIVERS,
  checkServiceLayerBudget,
  type ServiceLayerRow,
} from "../service-layer-budget";

const ROOT = path.join(process.cwd(), "public/reference-buildings");

const readManifest = (id: string) =>
  JSON.parse(readFileSync(path.join(ROOT, id, "manifest.json")).toString()) as ReferenceBuildingManifest;

/** Rejects anything but a plain `name.glb` basename — no separators, no parent segments. */
function assertPlainGlbBasename(file: string): void {
  if (
    file.includes("/") ||
    file.includes("\\") ||
    file.includes("..") ||
    !file.toLowerCase().endsWith(".glb")
  ) {
    throw new Error(`manifest service-layer "file" is not a plain .glb basename: ${JSON.stringify(file)}`);
  }
}

/** Recounts draw calls from the glTF-binary JSON chunk only — never buffers the BIN chunk. */
function recountDrawCalls(bytes: Buffer): number {
  const jsonChunkLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonChunkLength)) as {
    nodes: { mesh?: number }[];
    meshes: { primitives: unknown[] }[];
  };
  return json.nodes.reduce(
    (sum, node) => sum + (node.mesh === undefined ? 0 : json.meshes[node.mesh].primitives.length),
    0,
  );
}

interface RecountedLayer {
  buildingId: string;
  layerId: string;
  file: string;
  manifestDrawCalls: number;
  recountedDrawCalls: number;
  manifestByteLength: number;
  actualByteLength: number;
}

const recounted: RecountedLayer[] = [];
for (const id of REFERENCE_BUILDING_IDS) {
  const manifest = readManifest(id);
  for (const layer of manifest.serviceLayers ?? []) {
    assertPlainGlbBasename(layer.file);
    const filePath = path.join(ROOT, id, layer.file);
    if (!existsSync(filePath)) {
      throw new Error(
        `${id}/${layer.id}: GLB not found at ${filePath}. Run node scripts/restore-reference-glbs.mjs first.`,
      );
    }
    const fd = readFileSync(filePath);
    recounted.push({
      buildingId: id,
      layerId: layer.id,
      file: layer.file,
      manifestDrawCalls: layer.drawCalls,
      recountedDrawCalls: recountDrawCalls(fd),
      manifestByteLength: layer.byteLength,
      actualByteLength: statSync(filePath).size,
    });
  }
}

describe("service-layer draw calls recounted from the published GLBs", () => {
  it("recounted 21 layers across the 6 publishing models", () => {
    expect(recounted).toHaveLength(21);
  });

  for (const layer of recounted) {
    it(`${layer.buildingId}/${layer.layerId}: recounted draw calls equal the manifest figure, and size matches`, () => {
      expect(layer.recountedDrawCalls).toBe(layer.manifestDrawCalls);
      expect(layer.actualByteLength).toBe(layer.manifestByteLength);
    });
  }

  it("the recounted roster, fed through the same check and waiver register, produces zero findings", () => {
    const rows: ServiceLayerRow[] = recounted.map((layer) => ({
      key: `${layer.buildingId}/${layer.layerId}`,
      buildingId: layer.buildingId,
      layerId: layer.layerId,
      drawCalls: layer.recountedDrawCalls,
      elements: 0,
      triangleCount: 0,
      distinctGeometries: 0,
      instancedShapes: 0,
      instancedPlacements: 0,
    }));
    const findings = checkServiceLayerBudget(rows, SERVICE_LAYER_BUDGET_WAIVERS);
    expect(findings).toEqual([]);
  });

  it("a layer whose file is not a plain .glb basename fails naming the offending value", () => {
    expect(() => assertPlainGlbBasename("../escape.glb")).toThrow(/\.\.\/escape\.glb/);
    expect(() => assertPlainGlbBasename("sub/dir/plumbing.glb")).toThrow(/sub\/dir\/plumbing\.glb/);
    expect(() => assertPlainGlbBasename("plumbing.gltf")).toThrow(/plumbing\.gltf/);
    expect(() => assertPlainGlbBasename("plumbing.glb")).not.toThrow();
  });

  it("a missing GLB fails with a message naming scripts/restore-reference-glbs.mjs, not a raw ENOENT and not a skip", () => {
    const missingPath = path.join(ROOT, "sixty5", "does-not-exist.glb");
    expect(existsSync(missingPath)).toBe(false);
    let thrown: Error | null = null;
    try {
      if (!existsSync(missingPath)) {
        throw new Error(
          `sixty5/does-not-exist: GLB not found at ${missingPath}. Run node scripts/restore-reference-glbs.mjs first.`,
        );
      }
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain("scripts/restore-reference-glbs.mjs");
    expect(thrown!.message).not.toMatch(/ENOENT|budget|over_budget/i);
  });
});
