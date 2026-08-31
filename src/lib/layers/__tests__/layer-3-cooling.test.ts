// src/lib/layers/__tests__/layer-3-cooling.test.ts
// CoolingLayer over the canonical MEP graph: archetype-correct systems
// (VRF refrigerant vs central chilled water), engineered catalog sizes on
// every rendered run, plant heroes at graph nodes, determinism, disposal.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CoolingLayer } from "../layer-3-cooling";
import { clearMepPlanCache } from "@/lib/mep";
import { makeRecipe } from "@/lib/mep/__tests__/fixtures";

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

function collectRunInfos(group: THREE.Group): { sizeLabel: string; basis: string }[] {
  const infos: { sizeLabel: string; basis: string }[] = [];
  group.traverse((obj) => {
    const per = obj.userData?.mepPerInstance as { sizeLabel: string; basis: string }[] | undefined;
    if (obj.userData?.type === "cooling-branch" && per) infos.push(...per);
  });
  return infos;
}

describe("CoolingLayer (graph-driven)", { timeout: 30_000 }, () => {
  it("returns a THREE.Group named 'layer-3-cooling'", () => {
    const group = new CoolingLayer().generate(makeRecipe());
    expect(group.name).toBe("layer-3-cooling");
  });

  it("renders the VRF refrigerant network for a post-2000 office", () => {
    clearMepPlanCache();
    const group = new CoolingLayer().generate(makeRecipe({ era: "2010-2019", mainPurpsCd: "14000" }));
    const runs = findByType(group, "cooling-branch");
    expect(runs).toBeDefined();
    // The CU bank hero comes from the graph's refrigerant source node.
    expect(findByType(group, "heating-vrf-head")).toBeDefined();
  });

  it("renders chilled-water plant (chiller + cooling tower) for a pre-2000 office", () => {
    clearMepPlanCache();
    const group = new CoolingLayer().generate(makeRecipe({ era: "1990-1999", mainPurpsCd: "14000" }));
    expect(findByType(group, "cooling-plant")).toBeDefined();
    expect(findByType(group, "cooling-tower")).toBeDefined();
    expect(findByType(group, "cooling-branch")).toBeDefined();
  });

  it("labels every rendered run with a catalog size and a basis (§10/§19)", () => {
    clearMepPlanCache();
    const group = new CoolingLayer().generate(makeRecipe({ era: "1990-1999", mainPurpsCd: "14000" }));
    const infos = collectRunInfos(group);
    expect(infos.length).toBeGreaterThan(10);
    for (const info of infos) {
      expect(info.sizeLabel).toMatch(/^DN \d+$/);
      expect(["calculated", "estimated", "defaulted", "imported", "user"]).toContain(info.basis);
    }
  });

  it("renders nothing for a residential building (no chilled-water archetype)", () => {
    clearMepPlanCache();
    const group = new CoolingLayer().generate(makeRecipe({ mainPurpsCd: "02001" }));
    expect(findByType(group, "cooling-branch")).toBeUndefined();
    expect(findByType(group, "cooling-plant")).toBeUndefined();
  });

  it("is deterministic: two generates produce identical instance matrices", () => {
    clearMepPlanCache();
    const recipe = makeRecipe({ era: "1990-1999", mainPurpsCd: "14000" });
    const a = new CoolingLayer().generate(recipe);
    const b = new CoolingLayer().generate(recipe);
    const matricesOf = (g: THREE.Group): number[] => {
      const out: number[] = [];
      g.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh) out.push(...Array.from(im.instanceMatrix.array));
      });
      return out;
    };
    expect(matricesOf(a)).toEqual(matricesOf(b));
  });

  it("dispose() does not throw; double dispose is safe", () => {
    const layer = new CoolingLayer();
    layer.generate(makeRecipe({ era: "1990-1999", mainPurpsCd: "14000" }));
    expect(() => {
      layer.dispose();
      layer.dispose();
    }).not.toThrow();
  });
});
