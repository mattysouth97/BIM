import { AUTHORING_FAMILIES } from "@/lib/bim/family-catalog";
import { afterEach, describe, expect, it } from "vitest";

import { catalogFootprintMm } from "../catalog-dims";
import { evaluateSymbol } from "../evaluate";
import type { SymbolGraph } from "../graph-types";
import { clearRegisteredSymbols, registerSymbols, symbolFor } from "../registry";

afterEach(() => {
  clearRegisteredSymbols();
});

describe("registry: resolution chain", () => {
  it("prefers an explicitly registered graph over any default", () => {
    const explicit: SymbolGraph = { id: "door-single-flush-910", nodes: [{ op: "circle", weight: "symbol", cx: 0, cz: 0, radius: 1 }] };
    registerSymbols({ "door-single-flush-910": explicit });
    expect(symbolFor("door-single-flush-910")).toBe(explicit);
  });

  it("falls back to the tool default when no explicit graph is registered", () => {
    const graph = symbolFor("door-single-flush-910");
    expect(graph.nodes.some((n) => n.op === "arc")).toBe(true);
  });

  it("re-parameterises the tool default's widthMm/depthMm to the family's real catalog footprint", () => {
    const dims = catalogFootprintMm("door-single-flush-910")!;
    const graph = symbolFor("door-single-flush-910");
    expect(graph.params?.widthMm).toBeCloseTo(dims.widthMm);
  });

  it("uses the bbox fallback for an id with no AuthoringFamily entry", () => {
    const graph = symbolFor("totally-unknown-family-id");
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ op: "rect" });
    expect(graph.id).toContain("bbox-fallback");
  });

  it("bbox fallback still evaluates to real geometry", () => {
    const graph = symbolFor("totally-unknown-family-id");
    const geo = evaluateSymbol(graph);
    expect(geo.strokes).toHaveLength(1);
    expect(geo.boundsMm).not.toBeNull();
  });

  it("registerSymbols is additive and last-write-wins per id", () => {
    const first: SymbolGraph = { id: "a", nodes: [{ op: "circle", weight: "symbol", cx: 0, cz: 0, radius: 1 }] };
    const second: SymbolGraph = { id: "b", nodes: [{ op: "circle", weight: "symbol", cx: 0, cz: 0, radius: 2 }] };
    registerSymbols({ "door-single-flush-910": first });
    registerSymbols({ "door-single-flush-910": second });
    expect(symbolFor("door-single-flush-910")).toBe(second);
  });

  it("resolves every one of the 102 real families to a usable symbol — nothing resolves to nothing", () => {
    for (const family of AUTHORING_FAMILIES) {
      const graph = symbolFor(family.id);
      expect(graph).toBeDefined();
      expect(graph.nodes.length).toBeGreaterThan(0);
      const geo = evaluateSymbol(graph);
      expect(geo.strokes.length).toBeGreaterThan(0);
      expect(geo.boundsMm).not.toBeNull();
    }
  });
});
