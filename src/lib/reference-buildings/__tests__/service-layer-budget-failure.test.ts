// The sibling test, service-layer-budget.test.ts, only ever observes the live
// roster passing — it can never show what a finding looks like. AGENTS.md
// records ten instances in this repo where arithmetic was right and the
// sentence beside it was false, including one where a verification pass
// checked the values and the prose built from them went out unchecked. So
// this file drives the failure path directly: synthetic rows through the
// real `checkServiceLayerBudget`, asserting both the finding KIND and that
// the numbers quoted in its `message` reproduce by parsing them back out.
import { describe, expect, it } from "vitest";
import {
  SERVICE_LAYER_BUDGET_WAIVERS,
  SERVICE_LAYER_DRAW_CALL_BUDGET,
  checkServiceLayerBudget,
  type ServiceLayerRow,
} from "../service-layer-budget";

const row = (overrides: Partial<ServiceLayerRow> & Pick<ServiceLayerRow, "key" | "drawCalls">): ServiceLayerRow => ({
  buildingId: overrides.key.split("/")[0],
  layerId: overrides.key.split("/")[1],
  elements: 0,
  triangleCount: 0,
  distinctGeometries: 0,
  instancedShapes: 0,
  instancedPlacements: 0,
  ...overrides,
});

const SIXTY5_PLUMBING = SERVICE_LAYER_BUDGET_WAIVERS["sixty5/plumbing"];
const CLINIC_HVAC_LIVE_DRAW_CALLS = 276;

describe("service-layer draw-call budget: the failure path, driven directly", () => {
  it("a new layer at 301 with no waiver yields exactly one over_budget finding", () => {
    const findings = checkServiceLayerBudget([row({ key: "new-building/plumbing", drawCalls: 301 })], {});
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("over_budget");
  });

  it("a new layer at exactly 300 yields nothing — the ceiling is inclusive", () => {
    const findings = checkServiceLayerBudget(
      [row({ key: "new-building/plumbing", drawCalls: SERVICE_LAYER_DRAW_CALL_BUDGET })],
      {},
    );
    expect(findings).toEqual([]);
  });

  it("a waived layer at measuredDrawCalls + 1 yields waiver_grown; at exactly measuredDrawCalls it yields nothing", () => {
    const grown = checkServiceLayerBudget(
      [row({ key: "sixty5/plumbing", drawCalls: SIXTY5_PLUMBING.measuredDrawCalls + 1 })],
      { "sixty5/plumbing": SIXTY5_PLUMBING },
    );
    expect(grown).toHaveLength(1);
    expect(grown[0].kind).toBe("waiver_grown");

    const atFigure = checkServiceLayerBudget(
      [row({ key: "sixty5/plumbing", drawCalls: SIXTY5_PLUMBING.measuredDrawCalls })],
      { "sixty5/plumbing": SIXTY5_PLUMBING },
    );
    expect(atFigure).toEqual([]);
  });

  it("a waived layer that has fallen to 300 yields stale_waiver, and the message says the entry must be deleted", () => {
    const findings = checkServiceLayerBudget(
      [row({ key: "sixty5/plumbing", drawCalls: SERVICE_LAYER_DRAW_CALL_BUDGET })],
      { "sixty5/plumbing": SIXTY5_PLUMBING },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("stale_waiver");
    expect(findings[0].message.toLowerCase()).toContain("delete");
  });

  it("a waiver key matching no row yields orphan_waiver, and its message makes no claim about draw-call count", () => {
    const findings = checkServiceLayerBudget([], { "ghost-building/plumbing": SIXTY5_PLUMBING });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("orphan_waiver");
    expect(findings[0].message).not.toMatch(/\d/);
    expect(findings[0].message.toLowerCase()).toContain("no published service layer");
  });

  it("removing sixty5/plumbing from the waiver map re-arms the ceiling: the same 2462 row passes with the waiver and fails without it", () => {
    const liveRow = row({ key: "sixty5/plumbing", drawCalls: SIXTY5_PLUMBING.measuredDrawCalls });

    const withWaiver = checkServiceLayerBudget([liveRow], { "sixty5/plumbing": SIXTY5_PLUMBING });
    expect(withWaiver).toEqual([]);

    // Build a modified copy for the re-arm case — never mutate the exported
    // register in place, so a failed run cannot leave the shipped register
    // altered in a checkout shared with other sessions.
    const withoutWaiver = checkServiceLayerBudget([liveRow], {});
    expect(withoutWaiver).toHaveLength(1);
    expect(withoutWaiver[0].kind).toBe("over_budget");
  });

  it("bs-medical-dental-clinic/hvac at its live 276 yields nothing; the same key at 301 yields over_budget", () => {
    const atLive = checkServiceLayerBudget(
      [row({ key: "bs-medical-dental-clinic/hvac", drawCalls: CLINIC_HVAC_LIVE_DRAW_CALLS })],
      {},
    );
    expect(atLive).toEqual([]);

    const overBudget = checkServiceLayerBudget(
      [row({ key: "bs-medical-dental-clinic/hvac", drawCalls: 301 })],
      {},
    );
    expect(overBudget).toHaveLength(1);
    expect(overBudget[0].kind).toBe("over_budget");
  });

  it("the overage parsed back out of an over_budget message equals drawCalls - 300", () => {
    const drawCalls = 355;
    const findings = checkServiceLayerBudget([row({ key: "new-building/electrical", drawCalls })], {});
    expect(findings).toHaveLength(1);
    const numbers = [...findings[0].message.matchAll(/\d+/g)].map((match) => Number(match[0]));
    expect(numbers).toContain(drawCalls - SERVICE_LAYER_DRAW_CALL_BUDGET);
  });

  it("the recorded figure parsed back out of a waiver_grown message equals that waiver's measuredDrawCalls", () => {
    const findings = checkServiceLayerBudget(
      [row({ key: "sixty5/plumbing", drawCalls: SIXTY5_PLUMBING.measuredDrawCalls + 3 })],
      { "sixty5/plumbing": SIXTY5_PLUMBING },
    );
    expect(findings).toHaveLength(1);
    const numbers = [...findings[0].message.matchAll(/\d+/g)].map((match) => Number(match[0]));
    expect(numbers).toContain(SIXTY5_PLUMBING.measuredDrawCalls);
  });
});
