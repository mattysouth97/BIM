// src/lib/generative/blueprint/fidelity.ts
//
// Fidelity answers one question the user asks before every generation: "what
// exactly are you going to keep?" The blueprint is design authority, so the
// answer must be computable, not reassuring prose.
//
// Precedence, narrowest first:
//   1. an explicit `fidelityOverrides` entry naming the object
//   2. the fidelity of a zone that declares the object as a member
//      (an object that IS a zone uses its own `fidelity`)
//   3. `spec.fidelityMode`

import {
  blueprintPlacements,
  type BlueprintSpec,
  type FidelityMode,
  type Hold,
  type Region,
} from "./blueprint-spec";

export function resolveFidelity(spec: BlueprintSpec, objectId: string): FidelityMode {
  for (const override of spec.fidelityOverrides) {
    if (override.targetId === objectId) return override.mode;
  }

  for (const zone of spec.zones) {
    if (zone.fidelity === undefined) continue;
    if (zone.id === objectId || zone.memberIds.includes(objectId)) return zone.fidelity;
  }

  // A boundary carries its own fidelity because one traced plan may be exact
  // while the rest of the drawing is a sketch.
  for (const boundary of spec.boundaries) {
    if (boundary.loop.id === objectId && boundary.fidelity !== undefined) {
      return boundary.fidelity;
    }
  }

  return spec.fidelityMode;
}

/**
 * Whether an object survives generation untouched.
 *
 *   exact       — always preserved.
 *   exploratory — never preserved; the generator may reinterpret it.
 *   guided      — geometry is preserved; a constraint is preserved only if the
 *                 author held it hard. This is what makes "soft ± tolerance"
 *                 mean something rather than decorate the schema.
 */
export function isPreserved(mode: FidelityMode, hold?: Hold): boolean {
  if (mode === "exact") return true;
  if (mode === "exploratory") return false;
  return hold ? hold.mode === "hard" : true;
}

export interface PreservationPlan {
  /** Descriptors for objects generation must not move. */
  preserved: string[];
  /** Descriptors for objects generation may adjust, and by how much. */
  flexible: string[];
}

const levelLabel = (floorNo: number) => (floorNo < 0 ? `B${-floorNo}` : `L${floorNo}`);

/** "L1–L3, L7" — compressed so a 30-storey blueprint stays readable. */
function formatFloors(floorNos: readonly number[]): string {
  if (floorNos.length === 0) return "all levels";
  const sorted = [...new Set(floorNos)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i];
    if (current !== undefined && current === previous + 1) {
      previous = current;
      continue;
    }
    runs.push(
      start === previous
        ? levelLabel(start)
        : `${levelLabel(start)}–${levelLabel(previous)}`,
    );
    if (current === undefined) break;
    start = current;
    previous = current;
  }
  return runs.join(", ");
}

function regionLabel(region: Region): string {
  switch (region.kind) {
    case "loop":
      return `loop ${region.loop.id}`;
    case "loopRef":
      return `loop ${region.loopId}`;
    case "rect":
      return `${region.widthMm}×${region.depthMm} mm rect`;
  }
}

const holdLabel = (hold: Hold) =>
  hold.mode === "hard" ? "hard" : `soft ±${hold.toleranceMm} mm`;

/**
 * The list the UI shows before generation runs. Declaration order is preserved
 * so the panel is stable between runs — no sorting, no set iteration.
 */
export function preservationPlan(spec: BlueprintSpec): PreservationPlan {
  const preserved: string[] = [];
  const flexible: string[] = [];

  const file = (id: string, descriptor: string, hold?: Hold) => {
    const mode = resolveFidelity(spec, id);
    const line = `${descriptor} · ${mode}${hold ? ` · ${holdLabel(hold)}` : ""}`;
    (isPreserved(mode, hold) ? preserved : flexible).push(line);
  };

  for (const boundary of spec.boundaries) {
    file(
      boundary.loop.id,
      `Boundary ${boundary.loop.id} (${boundary.role}) on ${formatFloors(boundary.floorNos)}`,
    );
  }

  for (const item of spec.voids) {
    file(
      item.id,
      `${item.kind.value} ${item.id} on ${formatFloors(item.floorNos)}`,
    );
  }

  for (const item of spec.cores) {
    file(
      item.id,
      `Core ${item.id} (${regionLabel(item.region)}) on ${formatFloors(item.floorNos)}`,
      item.hold,
    );
  }

  for (const item of spec.anchors) {
    file(
      item.id,
      `${item.kind.value} anchor ${item.id} at (${item.positionMm.xMm}, ${item.positionMm.zMm}) mm`,
      item.hold,
    );
  }

  for (const item of spec.axes) {
    file(item.id, `${item.kind} axis ${item.id}`);
  }

  for (const item of spec.zones) {
    file(
      item.id,
      `${item.program.value} zone ${item.id} on ${formatFloors(item.floorNos)}`,
    );
  }

  for (const item of spec.gridSystems) {
    file(
      item.id,
      `Grid ${item.id} (${item.xSpacingsMm.length}×${item.zSpacingsMm.length} bays)`,
    );
  }

  for (const item of spec.dimensions) {
    const subject =
      item.subject.mode === "between"
        ? `${item.subject.fromId}→${item.subject.toId}`
        : `${item.subject.targetId} ${item.subject.measure}`;
    file(item.id, `Dimension ${subject} = ${item.valueMm.value} mm`, item.hold);
  }

  for (const item of blueprintPlacements(spec)) {
    file(
      item.id,
      `${item.tool} ${item.id} (${item.familyId}) at (${item.positionMm.xMm}, ${item.positionMm.zMm}) mm on ${formatFloors(item.floorNos)}`,
    );
  }

  return { preserved, flexible };
}
