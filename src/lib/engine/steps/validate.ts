// src/lib/engine/steps/validate.ts
//
// Pure post-generation topology checks — no WASM, no IFC re-parsing. These
// operate directly on the FusedModel (source geometry) and the flat
// GeneratedElement accounting produced by generate-ifc.ts, so they can run
// on every engine invocation without paying for a round-trip through web-ifc.

import type { FusedModel, GeneratedElement, ValidationCheck, ValidationReport } from "../types";

const RING_CLOSURE_EPSILON_M = 1e-6;

/**
 * Signed area of a single 2-D ring via the shoelace formula (meters^2,
 * XZ-plane). Callers that only need magnitude should take Math.abs().
 */
function shoelaceArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[i + 1];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

function isRingClosed(ring: [number, number][]): boolean {
  if (ring.length < 2) return false;
  const [x1, z1] = ring[0];
  const [x2, z2] = ring[ring.length - 1];
  return Math.abs(x1 - x2) <= RING_CLOSURE_EPSILON_M && Math.abs(z1 - z2) <= RING_CLOSURE_EPSILON_M;
}

function slabElementIds(elements: GeneratedElement[]): number[] {
  return elements.filter((e) => e.kind === "slab").map((e) => e.expressId);
}

function checkRingClosed(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  const rings = model.footprint;
  const passed = rings.length > 0 && rings.every(isRingClosed);
  return {
    id: "ring-closed",
    passed,
    detail: passed
      ? "all footprint rings are closed (first vertex == last vertex)"
      : "one or more footprint rings are not closed (first vertex != last vertex)",
    ...(passed ? {} : { elementIds: slabElementIds(elements) }),
  };
}

function checkSlabArea(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  // Slice-1: every slab is extruded from the same fused footprint, so there is
  // no per-slab area to compare against — the check collapses to "is the
  // shared footprint area non-degenerate" (SLAB_AREA_TOLERANCE_PCT would
  // apply to comparing distinct slab profiles, which this pipeline does not
  // yet produce; deferred honestly rather than faked).
  const outerRing = model.footprint[0] ?? [];
  const area = Math.abs(shoelaceArea(outerRing));
  const passed = area > 0;
  return {
    id: "slab-area",
    passed,
    detail: passed
      ? `footprint area ${area.toFixed(2)} m^2 is valid`
      : `footprint area is degenerate (${area.toFixed(6)} m^2) — collinear or zero-area ring`,
    ...(passed ? {} : { elementIds: slabElementIds(elements) }),
  };
}

function checkStoreyMonotonic(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  const storeys = Array.from(new Set(elements.map((e) => e.storey))).sort((a, b) => a - b);
  const expected = Array.from({ length: model.floors }, (_, i) => i);
  const passed = storeys.length === expected.length && storeys.every((s, i) => s === expected[i]);
  return {
    id: "storey-monotonic",
    passed,
    detail: passed
      ? `storeys 0..${model.floors - 1} are present and increasing`
      : `storey indices [${storeys.join(", ")}] do not match expected 0..${model.floors - 1}`,
  };
}

function checkRoundtripCount(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  const outerRing = model.footprint[0] ?? [];
  const edgeCount = Math.max(outerRing.length - 1, 0);
  const expectedCount = model.floors * edgeCount + model.floors;
  const actualCount = elements.length;
  const passed = actualCount === expectedCount;
  return {
    id: "roundtrip-count",
    passed,
    detail: passed
      ? `element count ${actualCount} matches expected ${expectedCount} (floors=${model.floors}, edges=${edgeCount})`
      : `element count ${actualCount} does not match expected ${expectedCount} (floors=${model.floors}, edges=${edgeCount})`,
  };
}

/**
 * Runs the Slice-1 topology checks against a fused model and its generated
 * elements. Pure: no WASM, no IFC parsing — geometry checks read straight
 * from `model.footprint`; count/order checks read `elements`.
 */
export function validate(model: FusedModel, elements: GeneratedElement[]): ValidationReport {
  const checks: ValidationCheck[] = [
    checkRingClosed(model, elements),
    checkSlabArea(model, elements),
    checkStoreyMonotonic(model, elements),
    checkRoundtripCount(model, elements),
  ];
  return { checks, passed: checks.every((c) => c.passed) };
}
