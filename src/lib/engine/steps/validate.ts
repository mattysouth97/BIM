// src/lib/engine/steps/validate.ts
//
// Pure post-generation topology checks — no WASM, no IFC re-parsing. These
// operate directly on the FusedModel (source geometry) and the flat
// GeneratedElement accounting produced by generate-ifc.ts, so they can run
// on every engine invocation without paying for a round-trip through web-ifc.

import type { FusedModel, GeneratedElement, ValidationCheck, ValidationReport } from "../types";
import { computeWindowLayout } from "./generate-ifc";

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

/**
 * Recomputes the expected window count for one storey directly from the
 * FusedModel, reusing generate-ifc.ts's pure computeWindowLayout() — the same
 * function that actually places the windows — so this is a single source of
 * truth rather than a second, potentially-drifting formula. Returns 0 when no
 * facade was supplied (Slice-2: windows only exist when a facade is present).
 */
function expectedWindowsPerStorey(model: FusedModel): number {
  if (!model.facade) return 0;
  const facade = model.facade;
  const outerRing = model.footprint[0] ?? [];
  const edgeCount = Math.max(outerRing.length - 1, 0);
  let total = 0;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const [x1, z1] = outerRing[edgeIndex];
    const [x2, z2] = outerRing[edgeIndex + 1];
    const edgeLength = Math.hypot(x2 - x1, z2 - z1) || 1e-6;
    total += computeWindowLayout(edgeLength, facade).length;
  }
  return total;
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

function checkFootprintNondegenerate(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  // Slice-1: every slab is extruded from the same fused footprint, so there is
  // no per-slab area to compare against — the check collapses to "is the
  // shared footprint area non-degenerate" (SLAB_AREA_TOLERANCE_PCT would
  // apply to comparing distinct slab profiles, which this pipeline does not
  // yet produce; deferred honestly rather than faked). This does NOT verify
  // per-slab area accuracy — just that the shared footprint isn't a
  // collinear/zero-area ring.
  const outerRing = model.footprint[0] ?? [];
  const area = Math.abs(shoelaceArea(outerRing));
  const passed = area > 0;
  return {
    id: "footprint-nondegenerate",
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

/**
 * Slice-3: the single ground-floor entrance door exists whenever the
 * footprint has at least one edge to host it on (pickEntranceEdge needs a
 * real edge) — independent of model.facade, since the entrance is not a
 * window-facade feature. Returns 0 for a degenerate (edge-less) footprint.
 */
function expectedDoorCount(model: FusedModel): number {
  const outerRing = model.footprint[0] ?? [];
  const edgeCount = Math.max(outerRing.length - 1, 0);
  return edgeCount > 0 ? 1 : 0;
}

function checkElementCount(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  // NOT a byte round-trip through IFC — this verifies the flat element
  // accounting produced by generate-ifc.ts matches the construction formula
  // (floors * edges-per-storey walls + floors slabs + floors * windows-per-
  // storey + the one Slice-3 entrance door). A real write→read round-trip is
  // exercised separately by generate-ifc-roundtrip.integration.test.ts.
  const outerRing = model.footprint[0] ?? [];
  const edgeCount = Math.max(outerRing.length - 1, 0);
  const windowsPerStorey = expectedWindowsPerStorey(model);
  const doorCount = expectedDoorCount(model);
  const expectedCount = model.floors * edgeCount + model.floors + model.floors * windowsPerStorey + doorCount;
  const actualCount = elements.length;
  const passed = actualCount === expectedCount;
  return {
    id: "element-count",
    passed,
    detail: passed
      ? `element count ${actualCount} matches expected ${expectedCount} (floors=${model.floors}, edges=${edgeCount}, windows/storey=${windowsPerStorey}, doors=${doorCount})`
      : `element count ${actualCount} does not match expected ${expectedCount} (floors=${model.floors}, edges=${edgeCount}, windows/storey=${windowsPerStorey}, doors=${doorCount})`,
  };
}

function checkWindowHosting(model: FusedModel, windows: GeneratedElement[]): { passed: boolean; detail: string; badIds: number[] } {
  if (!model.facade) {
    const passed = windows.length === 0;
    return {
      passed,
      detail: passed
        ? "no facade supplied — 0 windows generated, as expected"
        : `no facade supplied but ${windows.length} window(s) were generated`,
      badIds: passed ? [] : windows.map((w) => w.expressId),
    };
  }

  const windowsPerStorey = expectedWindowsPerStorey(model);
  const countsByStorey = new Map<number, number>();
  for (const w of windows) {
    countsByStorey.set(w.storey, (countsByStorey.get(w.storey) ?? 0) + 1);
  }

  let passed = windows.length === windowsPerStorey * model.floors;
  for (let storey = 0; storey < model.floors; storey += 1) {
    if ((countsByStorey.get(storey) ?? 0) !== windowsPerStorey) passed = false;
  }

  return {
    passed,
    detail: passed
      ? `${windows.length} window(s) hosted (${windowsPerStorey} per storey × ${model.floors} storeys), matching the facade layout`
      : `window count ${windows.length} does not match expected ${windowsPerStorey * model.floors} (${windowsPerStorey} per storey × ${model.floors} storeys)`,
    badIds: passed ? [] : windows.map((w) => w.expressId),
  };
}

/**
 * Slice-3: exactly one entrance door, on storey 0. Reuses expectedDoorCount()
 * — the same "does a footprint with edges exist" logic checkElementCount
 * folds in — so both checks agree on how many doors should exist.
 */
function checkDoorHosting(model: FusedModel, doors: GeneratedElement[]): { passed: boolean; detail: string; badIds: number[] } {
  const expected = expectedDoorCount(model);

  if (doors.length !== expected) {
    return {
      passed: false,
      detail: `door count ${doors.length} does not match expected ${expected}`,
      badIds: doors.map((d) => d.expressId),
    };
  }
  if (expected === 0) {
    return { passed: true, detail: "no footprint edges — 0 entrance doors expected, as expected", badIds: [] };
  }

  const [door] = doors;
  const passed = door.storey === 0;
  return {
    passed,
    detail: passed
      ? "1 entrance door hosted on storey 0, as expected"
      : `entrance door is on storey ${door.storey}, expected storey 0`,
    badIds: passed ? [] : [door.expressId],
  };
}

function checkOpeningsHosted(model: FusedModel, elements: GeneratedElement[]): ValidationCheck {
  // Pure topology/count check — does NOT re-parse IFC bytes to confirm the
  // real IfcRelVoidsElement/IfcRelFillsElement relationships exist; that's
  // covered separately by generate-ifc-roundtrip.integration.test.ts's real
  // IFCWINDOW/IFCDOOR/IFCOPENINGELEMENT count assertions. This check verifies
  // the flat window AND (Slice-3) entrance-door accounting is internally
  // consistent: no facade => no windows, otherwise every storey has exactly
  // the window count the facade layout formula predicts; and exactly one
  // entrance door exists (when the footprint has edges), on storey 0.
  const windows = elements.filter((e) => e.kind === "window");
  const doors = elements.filter((e) => e.kind === "door");

  const windowResult = checkWindowHosting(model, windows);
  const doorResult = checkDoorHosting(model, doors);

  const passed = windowResult.passed && doorResult.passed;
  const badIds = [...windowResult.badIds, ...doorResult.badIds];
  const detail = passed
    ? `${windowResult.detail}; ${doorResult.detail}`
    : [windowResult.passed ? null : windowResult.detail, doorResult.passed ? null : doorResult.detail]
        .filter((d): d is string => d !== null)
        .join("; ");

  return {
    id: "openings-hosted",
    passed,
    detail,
    ...(passed ? {} : { elementIds: badIds }),
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
    checkFootprintNondegenerate(model, elements),
    checkStoreyMonotonic(model, elements),
    checkElementCount(model, elements),
    checkOpeningsHosted(model, elements),
  ];
  return { checks, passed: checks.every((c) => c.passed) };
}
