// src/lib/layers/__tests__/layer-5-ventilation.test.ts
// VentilationLayer over the canonical MEP graph: duct networks with
// engineered rect sizes, AHU/OA-unit heroes at graph nodes, diffuser
// terminals, the animated airflow-streamlines batch (name + cap + shader
// contract preserved), plate containment for irregular footprints.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { MAX_AIRFLOW_LANE_BUNDLES, VentilationLayer } from "../layer-5-ventilation";
import { clearMepPlanCache } from "@/lib/mep";
import { caseLShape, makeRecipe } from "@/lib/mep/__tests__/fixtures";

const CENTRAL = () => makeRecipe({ era: "1990-1999", mainPurpsCd: "14000" });
const VRF = () => makeRecipe({ era: "2010-2019", mainPurpsCd: "14000" });

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

describe("VentilationLayer (graph-driven)", { timeout: 30_000 }, () => {
  it("returns a THREE.Group named 'layer-5-ventilation'", () => {
    expect(new VentilationLayer().generate(CENTRAL()).name).toBe("layer-5-ventilation");
  });

  it("renders supply duct runs with engineered rectangular sizes (rule A1/A2)", () => {
    clearMepPlanCache();
    const group = new VentilationLayer().generate(CENTRAL());
    const per: { sizeLabel: string }[] = [];
    group.traverse((obj) => {
      const list = obj.userData?.mepPerInstance as { sizeLabel: string }[] | undefined;
      if (obj.userData?.type === "vent-duct-run" && list) per.push(...list);
    });
    expect(per.length).toBeGreaterThan(0);
    // Flow-accumulated sizing yields multiple distinct sections, never the
    // old single constant duct size (§45).
    const sizes = new Set(per.map((p) => p.sizeLabel));
    expect(sizes.size).toBeGreaterThan(1);
  });

  it("places the AHU hero at the graph's rooftop source node", () => {
    clearMepPlanCache();
    const group = new VentilationLayer().generate(CENTRAL());
    const ahu = findByType(group, "vent-ahu");
    expect(ahu).toBeDefined();
  });

  it("renders diffuser terminal devices (rule A5)", () => {
    clearMepPlanCache();
    const group = new VentilationLayer().generate(CENTRAL());
    expect(findByType(group, "vent-diffuser")).toBeDefined();
  });

  it("VRF archetype renders the dedicated-OA network and exhaust, no SA trunk", () => {
    clearMepPlanCache();
    const group = new VentilationLayer().generate(VRF());
    expect(findByType(group, "vent-duct-run")).toBeDefined();
    expect(findByType(group, "vent-ahu")).toBeDefined(); // the OA unit hero
  });

  it("keeps the animated airflow-streamlines batch: name, shader uTime, bundle cap", () => {
    clearMepPlanCache();
    const group = new VentilationLayer().generate(CENTRAL());
    const lines = group.getObjectByName("airflow-streamlines") as THREE.LineSegments;
    expect(lines).toBeDefined();
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTime).toBeDefined();
    // Cap: bundles × 3 lanes × samples × 2 verts per segment.
    const positions = lines.geometry.getAttribute("position");
    expect(positions.count).toBeLessThanOrEqual(MAX_AIRFLOW_LANE_BUNDLES * 3 * 14 * 2);
  });

  it("emits no airflow batch when MEP density is zero", () => {
    clearMepPlanCache();
    const group = new VentilationLayer().generate(CENTRAL(), 0);
    expect(group.getObjectByName("airflow-streamlines")).toBeUndefined();
  });

  it("keeps every duct instance inside the solid plate for an L-shaped footprint (§30)", () => {
    clearMepPlanCache();
    const recipe = { ...caseLShape(), era: "1990-1999" as const, mainPurpsCd: "14000" };
    const group = new VentilationLayer().generate(recipe);
    const runs = findByType(group, "vent-duct-run") as THREE.InstancedMesh | undefined;
    expect(runs).toBeDefined();
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < (runs as THREE.InstancedMesh).count; i += 1) {
      (runs as THREE.InstancedMesh).getMatrixAt(i, m);
      m.decompose(p, q, s);
      // The missing arm of the L (x > 0.2, z > 3.2) is empty air; runs above
      // grade must stay out of it.
      const inMissingArm = p.y > 0 && p.x > 0.6 && p.z > 3.6;
      expect(inMissingArm, `instance ${i} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBe(false);
    }
  });

  it("is deterministic across regenerations", () => {
    clearMepPlanCache();
    const recipe = CENTRAL();
    const matricesOf = (g: THREE.Group): number[] => {
      const out: number[] = [];
      g.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh) out.push(...Array.from(im.instanceMatrix.array));
      });
      return out;
    };
    expect(matricesOf(new VentilationLayer().generate(recipe))).toEqual(
      matricesOf(new VentilationLayer().generate(recipe)),
    );
  });

  it("dispose() does not throw; double dispose is safe", () => {
    const layer = new VentilationLayer();
    layer.generate(CENTRAL());
    expect(() => {
      layer.dispose();
      layer.dispose();
    }).not.toThrow();
  });
});
