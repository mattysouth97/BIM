// src/lib/mep/__tests__/mep-engine.test.ts
// Engine QA (§29, §31, §33, §41): connectivity, hierarchy, gravity, sizing
// monotonicity, determinism, archetype selection, clash thresholds — run over
// the six-case procedural building set.

import { describe, expect, it } from "vitest";
import { buildMepContext } from "../context";
import { clearMepPlanCache, planMepSystems } from "../plan";
import { indexSystem } from "../size";
import { PIPE_DN_M, ROUND_DUCT_DIAMETERS_M, TRAY_WIDTHS_M } from "../rules";
import { nodeById, type MepModel } from "../types";
import { validateMepModel } from "../validate";
import {
  caseApartment,
  caseLShape,
  caseLShapeRooms,
  casePlantHeavy,
  caseRetail,
  caseSmallOffice,
  caseTowerOffice,
} from "./fixtures";

// Regression thresholds (§33): hard-clash ceilings and auto-score floors,
// ratcheted to the 2026-08-31 measured state (from ~4,000 hard clashes before
// the coordination scheme + self-repair pass). Tighten these as the
// coordinator improves; NEVER loosen without documenting why. The residual
// concentrates in the densest archetype (pre-2000 central plant, case E) —
// see docs/02_Features feature doc, Known Limitations.
const CASES = [
  { name: "A small office", recipe: caseSmallOffice, opts: {}, maxHard: 0, minScore: 70 },
  { name: "B tower office", recipe: caseTowerOffice, opts: {}, maxHard: 50, minScore: 66 },
  { name: "C apartment", recipe: caseApartment, opts: {}, maxHard: 80, minScore: 69 },
  { name: "D retail", recipe: caseRetail, opts: {}, maxHard: 100, minScore: 62 },
  { name: "E plant-heavy", recipe: casePlantHeavy, opts: {}, maxHard: 500, minScore: 55 },
  { name: "F L-shape CAD", recipe: caseLShape, opts: { cadRooms: caseLShapeRooms() }, maxHard: 30, minScore: 67 },
] as const;

function planCase(c: (typeof CASES)[number]): MepModel {
  clearMepPlanCache();
  return planMepSystems(c.recipe(), c.opts);
}

describe("MEP engine — six-case QA suite", { timeout: 60_000 }, () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const recipe = c.recipe();
      const model = planCase(c);
      const ctx = buildMepContext(recipe, c.opts);
      const report = validateMepModel(model, ctx);

      it("connects every terminal to a valid source (§29)", () => {
        expect(model.stats.terminalCount).toBeGreaterThan(0);
        expect(report.disconnectedTerminals).toEqual([]);
        expect(report.orphanSegments).toEqual([]);
      });

      it("keeps risers vertical and aligned (rule T4)", () => {
        expect(report.riserSegmentCount).toBeGreaterThan(0);
        expect(report.nonVerticalRisers).toBe(0);
      });

      it("routes orthogonally except sloped drainage (rule Z5)", () => {
        expect(report.offAxisSegments).toBe(0);
      });

      it("keeps sanitary drainage strictly gravity-monotone (rule P1)", () => {
        expect(report.gravityViolations).toEqual([]);
      });

      it("accumulates flow monotonically toward the source (rule T3)", () => {
        for (const system of model.systems) {
          const index = indexSystem(system, model.nodes, model.segments);
          for (const [nodeId, parentSeg] of index.parentSegment) {
            const grand = index.parentSegment.get(
              parentSeg.from === nodeId ? parentSeg.to : parentSeg.from,
            );
            if (!grand) continue;
            expect(grand.flow).toBeGreaterThanOrEqual(parentSeg.flow - 1e-6);
          }
        }
      });

      it("emits only catalog sizes (rules A2/W1/E2)", () => {
        for (const seg of model.segments) {
          if (seg.shape.kind === "round") {
            const d = seg.shape.diameterM;
            const inCatalog =
              PIPE_DN_M.some((c2) => Math.abs(c2 - d) < 1e-9) ||
              ROUND_DUCT_DIAMETERS_M.some((c2) => Math.abs(c2 - d) < 1e-9);
            expect(inCatalog, `${seg.id} diameter ${d}`).toBe(true);
          } else if (seg.shape.kind === "rect") {
            expect(Math.round(seg.shape.widthM * 1000) % 50, `${seg.id} width`).toBe(0);
            expect(Math.round(seg.shape.heightM * 1000) % 50, `${seg.id} height`).toBe(0);
            expect(seg.shape.widthM / seg.shape.heightM).toBeLessThanOrEqual(4.001);
          } else {
            expect(TRAY_WIDTHS_M).toContain(seg.shape.widthM);
          }
        }
      });

      it("derives explicit fittings at every direction change (§21)", () => {
        expect(model.stats.fittingCount).toBeGreaterThan(0);
        const elbows = model.fittings.filter((f) => f.kind === "elbow").length;
        const tees = model.fittings.filter((f) => f.kind === "tee").length;
        expect(elbows).toBeGreaterThan(0);
        expect(tees).toBeGreaterThan(0);
      });

      it("registers every mechanical equipment item as an electrical load (rule E4)", () => {
        const power = model.systems.find((s) => s.id === "pw");
        expect(power).toBeDefined();
        const feeders = model.nodes.filter(
          (n) => n.systemId === "pw" && n.terminal && n.label?.includes("feeder"),
        );
        const mech = model.nodes.filter(
          (n) =>
            n.kind === "equipment" &&
            n.systemId !== "pw" &&
            ["vent-ahu", "cooling-plant", "heating-boiler", "heating-vrf-head", "safety-fire-pump"].includes(
              n.equipment?.tag ?? "",
            ),
        );
        expect(feeders.length).toBeGreaterThanOrEqual(mech.length);
      });

      it("produces zero hard clashes against STRUCTURE and stays under the system-clash ceiling (§27)", () => {
        const structural = report.clashes.filter(
          (cl) => cl.kind === "hard" && (cl.bType === "column" || cl.bType === "shaft"),
        );
        const details = structural
          .slice(0, 8)
          .map((cl) => `${cl.aId} vs ${cl.bId} pen ${cl.penetrationM.toFixed(3)} @ (${cl.position.x.toFixed(1)},${cl.position.y.toFixed(1)},${cl.position.z.toFixed(1)})`);
        // Pipes through columns/hoistways are never acceptable (§45).
        expect(structural.length, details.join("\n")).toBe(0);
        expect(report.hardClashCount).toBeLessThanOrEqual(c.maxHard);
      });

      it("keeps the auto plausibility score above the regression floor (§34)", () => {
        expect(report.score.autoTotal).toBeGreaterThanOrEqual(c.minScore);
      });
    });
  }
});

describe("MEP engine — behaviour", { timeout: 60_000 }, () => {
  it("is deterministic: identical inputs produce identical models (§41)", () => {
    clearMepPlanCache();
    const a = planMepSystems(caseTowerOffice());
    clearMepPlanCache();
    const b = planMepSystems(caseTowerOffice());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("memoizes by input fingerprint", () => {
    clearMepPlanCache();
    const a = planMepSystems(caseSmallOffice());
    const b = planMepSystems(caseSmallOffice());
    expect(a).toBe(b);
  });

  it("selects archetypes from use × era (rule KR-10)", { timeout: 30_000 }, () => {
    clearMepPlanCache();
    expect(planMepSystems(caseTowerOffice()).archetype).toBe("vrf");
    expect(planMepSystems(casePlantHeavy()).archetype).toBe("central-ahu");
    expect(planMepSystems(caseApartment()).archetype).toBe("residential-hydronic");
    expect(planMepSystems(caseRetail()).archetype).toBe("packaged");
  });

  it("gates sprinklers on the 11-storey rule and generates the comb above it", () => {
    clearMepPlanCache();
    const low = planMepSystems(caseSmallOffice());
    expect(low.systems.find((s) => s.id === "fp")).toBeUndefined();
    const high = planMepSystems(caseTowerOffice());
    const fp = high.systems.find((s) => s.id === "fp");
    expect(fp).toBeDefined();
    const heads = high.nodes.filter((n) => n.systemId === "fp" && n.terminal);
    // 32×22 plate at 3.6 m spacing → dozens of heads per floor, 12 floors.
    expect(heads.length).toBeGreaterThan(300);
  });

  it("labels every quantity and carries assumptions (§10, §19)", () => {
    clearMepPlanCache();
    const model = planMepSystems(caseTowerOffice());
    expect(model.assumptions.length).toBeGreaterThan(3);
    for (const seg of model.segments) {
      expect(["calculated", "estimated", "defaulted", "imported", "user"]).toContain(seg.sizeBasis);
    }
  });

  it("uses CAD rooms as terminal zones on the CAD-driven path (§10)", () => {
    clearMepPlanCache();
    const model = planMepSystems(caseLShape(), { cadRooms: caseLShapeRooms() });
    expect(model.zones.length).toBeGreaterThan(0);
    expect(model.zones.every((z) => z.source === "cad-room")).toBe(true);
    // Distinct fingerprint vs the procedural grid of the same plate.
    clearMepPlanCache();
    const grid = planMepSystems(caseLShape());
    expect(grid.inputKey).not.toBe(model.inputKey);
    expect(grid.zones.every((z) => z.source === "grid")).toBe(true);
  });

  it("keeps every element inside the solid plate for the L-shape (§30)", () => {
    clearMepPlanCache();
    const model = planMepSystems(caseLShape());
    const nodes = nodeById(model);
    // The missing arm of the L: x > -1, z > 2 is empty air. Underground
    // utility entries (y < 0) and above-roof terminations are legitimate
    // exterior runs and exempt.
    for (const node of nodes.values()) {
      if (node.position.y < 0) continue;
      const inMissingArm = node.position.x > 0.2 && node.position.z > 3.2;
      expect(inMissingArm, `${node.id} at (${node.position.x.toFixed(1)}, ${node.position.z.toFixed(1)})`).toBe(false);
    }
  });
});
