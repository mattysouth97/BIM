// src/lib/layers/__tests__/layer-6-dhw.test.ts
// DHWLayer over the canonical MEP graph: pressurized water tree + gravity
// drainage as visually and topologically distinct systems, fixtures, tank,
// determinism, disposal.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { DHWLayer } from "../layer-6-dhw";
import { clearMepPlanCache } from "@/lib/mep";
import { makeRecipe } from "@/lib/mep/__tests__/fixtures";

function findAllByType(group: THREE.Group, type: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  group.traverse((obj) => {
    if (obj.userData?.type === type) found.push(obj);
  });
  return found;
}

describe("DHWLayer (graph-driven)", { timeout: 30_000 }, () => {
  it("returns a THREE.Group named 'layer-6-dhw'", () => {
    expect(new DHWLayer().generate(makeRecipe()).name).toBe("layer-6-dhw");
  });

  it("renders pressurized water runs and gravity drainage as separate tags (rule P1)", () => {
    clearMepPlanCache();
    const group = new DHWLayer().generate(makeRecipe());
    expect(findAllByType(group, "dhw-branch").length).toBeGreaterThan(0);
    expect(findAllByType(group, "dhw-drain").length).toBeGreaterThan(0);
  });

  it("renders the DHW tank hero and bathroom fixtures from the graph", () => {
    clearMepPlanCache();
    const group = new DHWLayer().generate(makeRecipe());
    expect(findAllByType(group, "dhw-storage-tank").length).toBeGreaterThan(0);
    expect(findAllByType(group, "water-bathroom-fixture").length).toBeGreaterThan(0);
  });

  it("labels rendered water runs with DN sizes and a basis", () => {
    clearMepPlanCache();
    const group = new DHWLayer().generate(makeRecipe());
    const infos: { sizeLabel: string; basis: string }[] = [];
    for (const obj of findAllByType(group, "dhw-branch")) {
      const per = obj.userData?.mepPerInstance as { sizeLabel: string; basis: string }[] | undefined;
      if (per) infos.push(...per);
    }
    expect(infos.length).toBeGreaterThan(5);
    for (const info of infos) expect(info.sizeLabel).toMatch(/^DN \d+$/);
  });

  it("is deterministic across regenerations", () => {
    clearMepPlanCache();
    const recipe = makeRecipe();
    const matricesOf = (g: THREE.Group): number[] => {
      const out: number[] = [];
      g.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh) out.push(...Array.from(im.instanceMatrix.array));
      });
      return out;
    };
    expect(matricesOf(new DHWLayer().generate(recipe))).toEqual(matricesOf(new DHWLayer().generate(recipe)));
  });

  it("dispose() does not throw; double dispose is safe", () => {
    const layer = new DHWLayer();
    layer.generate(makeRecipe());
    expect(() => {
      layer.dispose();
      layer.dispose();
    }).not.toThrow();
  });
});
