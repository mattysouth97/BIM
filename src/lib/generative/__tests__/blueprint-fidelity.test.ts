import { describe, expect, it } from "vitest";

import type { BlueprintSpec } from "../blueprint/blueprint-spec";
import {
  addAnchor,
  addBoundary,
  addCore,
  addZone,
  emptyBlueprint,
  makeRectLoop,
} from "../blueprint/builders";
import {
  isPreserved,
  preservationPlan,
  resolveFidelity,
} from "../blueprint/fidelity";

function scene(): BlueprintSpec {
  let spec = addBoundary(emptyBlueprint("Fidelity Case"), {
    loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 }),
    floorNos: [1, 2],
  });
  spec = addAnchor(spec, {
    id: "front-door",
    kind: "entrance",
    positionMm: { xMm: 15_000, zMm: 0 },
  });
  spec = addAnchor(spec, {
    id: "corner-view",
    kind: "landmark-corner",
    positionMm: { xMm: 30_000, zMm: 20_000 },
    hold: { mode: "soft", toleranceMm: 1_500 },
  });
  spec = addCore(spec, {
    id: "core",
    region: {
      kind: "rect",
      originMm: { xMm: 6_000, zMm: 6_000 },
      widthMm: 6_000,
      depthMm: 6_000,
      rotationRad: 0,
    },
    floorNos: [1, 2],
    hold: { mode: "soft", toleranceMm: 3_000 },
  });
  return addZone(spec, {
    id: "lobby",
    program: "lobby",
    region: { kind: "loopRef", loopId: "plate" },
    floorNos: [1],
    memberIds: ["front-door"],
    fidelity: "exact",
  });
}

describe("resolveFidelity", () => {
  it("falls back to the global mode", () => {
    const spec = scene();
    expect(spec.fidelityMode).toBe("guided");
    expect(resolveFidelity(spec, "core")).toBe("guided");
    expect(resolveFidelity(spec, "not-an-object")).toBe("guided");
  });

  it("lets a zone narrow fidelity for itself and its members", () => {
    const spec = scene();
    expect(resolveFidelity(spec, "lobby")).toBe("exact");
    expect(resolveFidelity(spec, "front-door")).toBe("exact");
    expect(resolveFidelity(spec, "corner-view")).toBe("guided");
  });

  it("lets a per-object override beat the zone it belongs to", () => {
    const spec: BlueprintSpec = {
      ...scene(),
      fidelityOverrides: [
        { targetId: "front-door", mode: "exploratory", reason: "Entrance is up for debate." },
      ],
    };
    expect(resolveFidelity(spec, "front-door")).toBe("exploratory");
    // The zone itself is untouched by an override aimed at a member.
    expect(resolveFidelity(spec, "lobby")).toBe("exact");
  });

  it("honours a per-boundary fidelity above the global mode", () => {
    const spec = addBoundary(scene(), {
      loop: makeRectLoop("tower", {
        xMm: 4_000,
        zMm: 4_000,
        widthMm: 12_000,
        depthMm: 12_000,
      }),
      floorNos: [1, 2],
      role: "tower",
      fidelity: "exploratory",
    });
    expect(resolveFidelity(spec, "tower")).toBe("exploratory");
    expect(resolveFidelity(spec, "plate")).toBe("guided");
  });
});

describe("isPreserved", () => {
  it("keeps everything in exact and nothing in exploratory", () => {
    expect(isPreserved("exact", { mode: "soft", toleranceMm: 5_000 })).toBe(true);
    expect(isPreserved("exploratory", { mode: "hard" })).toBe(false);
  });

  it("keeps hard holds and geometry in guided, releasing soft holds", () => {
    expect(isPreserved("guided", { mode: "hard" })).toBe(true);
    expect(isPreserved("guided", { mode: "soft", toleranceMm: 1_000 })).toBe(false);
    expect(isPreserved("guided")).toBe(true);
  });
});

describe("preservationPlan", () => {
  it("splits the scene the way the pre-generation panel will show it", () => {
    const plan = preservationPlan(scene());

    expect(plan.preserved).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Boundary plate (outline) on L1–L2"),
        expect.stringContaining("entrance anchor front-door"),
        expect.stringContaining("lobby zone lobby on L1"),
      ]),
    );
    expect(plan.flexible).toEqual(
      expect.arrayContaining([
        expect.stringContaining("soft ±1500 mm"),
        expect.stringContaining("soft ±3000 mm"),
      ]),
    );

    // Every object lands in exactly one list.
    expect(plan.preserved.length + plan.flexible.length).toBe(5);
    expect(plan.preserved.some((line) => line.includes("corner-view"))).toBe(false);
  });

  it("moves everything to flexible under exploratory fidelity", () => {
    const plan = preservationPlan({ ...scene(), fidelityMode: "exploratory" });
    // The lobby zone still carries its own `exact`, and so does its member.
    expect(plan.preserved).toHaveLength(2);
    expect(plan.flexible).toHaveLength(3);
  });

  it("moves everything to preserved under exact fidelity", () => {
    const plan = preservationPlan({ ...scene(), fidelityMode: "exact" });
    expect(plan.flexible).toEqual([]);
    expect(plan.preserved).toHaveLength(5);
  });

  it("compresses level runs and is stable across calls", () => {
    const spec = addBoundary(emptyBlueprint("Runs"), {
      loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 1_000, depthMm: 1_000 }),
      floorNos: [-2, -1, 1, 2, 3, 7],
    });
    const plan = preservationPlan(spec);
    expect(plan.preserved[0]).toContain("B2–B1, L1–L3, L7");
    expect(preservationPlan(spec)).toEqual(plan);
  });
});
