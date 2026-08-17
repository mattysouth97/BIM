// src/lib/generative/validate/rules.ts
//
// Deterministic validation. Every rule here is arithmetic or graph traversal
// over the generated model — no model is consulted and no judgement is
// involved (brief §21: "Validation must happen in code. Not merely through LLM
// judgment.").
//
// Priorities follow the constraint system (§23):
//   P0 impossible to violate — geometry validity, references, floor boundaries
//   P1 required            — accessibility, vertical continuity
//   P2 strong preference   — daylight, exterior access
//   P3 optimisation        — circulation budget, structural regularity

import type { BuildingSpec } from "../spec/building-spec";
import { polygonArea } from "../generate/massing";
import { clipRectToPolygon, pointInPolygon } from "../geom";
import {
  rectsOverlap,
  type GeneratedBuilding,
  type GeneratedLevel,
  type Rect,
} from "../generate/types";

export type ViolationPriority = "P0" | "P1" | "P2" | "P3";
export type ViolationSeverity = "critical" | "warning" | "advisory";

export interface ConstraintViolation {
  code: string;
  priority: ViolationPriority;
  severity: ViolationSeverity;
  message: string;
  /** BIM element ids the UI should select and zoom to. */
  elementIds: string[];
  floorNo?: number;
  /** Deterministic repair hint, when one exists. */
  suggestion?: string;
}

const SEVERITY_OF: Record<ViolationPriority, ViolationSeverity> = {
  P0: "critical",
  P1: "critical",
  P2: "warning",
  P3: "advisory",
};

function violation(
  code: string,
  priority: ViolationPriority,
  message: string,
  elementIds: string[] = [],
  extra: { floorNo?: number; suggestion?: string } = {},
): ConstraintViolation {
  return {
    code,
    priority,
    severity: SEVERITY_OF[priority],
    message,
    elementIds,
    ...extra,
  };
}

const rectInside = (inner: Rect, outer: Rect, tolerance = 0.05) =>
  inner.minX >= outer.minX - tolerance &&
  inner.maxX <= outer.maxX + tolerance &&
  inner.minZ >= outer.minZ - tolerance &&
  inner.maxZ <= outer.maxZ + tolerance;

/**
 * Containment slack for every plate test below, metres.
 *
 * 50 mm — the same figure the core and column checks already used. Wide enough
 * that a wall thickness or a millimetre of float never raises a false critical,
 * far too narrow to hide a room sitting in an L-shape's missing quadrant.
 */
const PLATE_TOLERANCE_M = 0.05;

/** A level whose outline is real geometry rather than a degenerate placeholder. */
function hasUsablePlate(level: GeneratedLevel | undefined): level is GeneratedLevel {
  return level !== undefined && (level.polygon?.[0]?.length ?? 0) >= 3;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

function checkGeometry(building: GeneratedBuilding): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];

  // Zero-area / sliver rooms.
  for (const space of building.spaces) {
    if (space.areaSqm <= 0.5) {
      out.push(
        violation(
          "ZERO_AREA_SPACE",
          "P0",
          `${space.label} has an unusable area of ${space.areaSqm.toFixed(2)} m².`,
          [space.id],
          { floorNo: space.floorNo, suggestion: "Remove the space or enlarge its bay." },
        ),
      );
    }
  }

  // Rooms standing off the plate.
  //
  // The aggregate PROGRAM_EXCEEDS_PLATE test cannot see this: a room in an
  // L-shape's missing quadrant is invisible to it as long as other rooms
  // undershoot by the same area. This is the per-room constraint, and it is
  // the only rule that reads the level's REAL outline for a space.
  const levelByFloor = new Map(building.levels.map((l) => [l.floorNo, l]));
  for (const space of building.spaces) {
    const level = levelByFloor.get(space.floorNo);
    if (!hasUsablePlate(level)) continue;
    if (clipRectToPolygon(space.rect, level.polygon, PLATE_TOLERANCE_M)) continue;
    out.push(
      violation(
        "SPACE_OUTSIDE_PLATE",
        "P0",
        `${space.label} is not wholly on the level ${space.floorNo} floor plate.`,
        [space.id],
        {
          floorNo: space.floorNo,
          suggestion: "Move the space onto solid floor, or shrink it to fit the plate.",
        },
      ),
    );
  }

  // Overlapping rooms on the same level.
  const byFloor = new Map<number, typeof building.spaces>();
  for (const space of building.spaces) {
    const list = byFloor.get(space.floorNo) ?? [];
    list.push(space);
    byFloor.set(space.floorNo, list);
  }
  for (const [floorNo, spaces] of byFloor) {
    for (let i = 0; i < spaces.length; i += 1) {
      for (let j = i + 1; j < spaces.length; j += 1) {
        if (rectsOverlap(spaces[i].rect, spaces[j].rect, 0.01)) {
          out.push(
            violation(
              "SPACE_OVERLAP",
              "P0",
              `${spaces[i].label} and ${spaces[j].label} overlap on level ${floorNo}.`,
              [spaces[i].id, spaces[j].id],
              { floorNo },
            ),
          );
        }
      }
    }
  }

  // Degenerate walls.
  for (const wall of building.walls) {
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (length < 0.01) {
      out.push(
        violation("ZERO_LENGTH_WALL", "P0", `Wall ${wall.id} has no length.`, [wall.id], {
          floorNo: wall.floorNo,
        }),
      );
    }
  }

  // Duplicate coincident walls — a classic generator bug that doubles geometry.
  const seen = new Map<string, string>();
  for (const wall of building.walls) {
    const a = `${wall.start[0].toFixed(2)},${wall.start[1].toFixed(2)}`;
    const b = `${wall.end[0].toFixed(2)},${wall.end[1].toFixed(2)}`;
    const key = `${wall.floorNo}|${[a, b].sort().join("|")}`;
    const previous = seen.get(key);
    if (previous) {
      out.push(
        violation(
          "DUPLICATE_WALL",
          "P0",
          `Walls ${previous} and ${wall.id} are coincident.`,
          [previous, wall.id],
          { floorNo: wall.floorNo, suggestion: "Delete one of the duplicated walls." },
        ),
      );
    } else {
      seen.set(key, wall.id);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Hosting + references                                                */
/* ------------------------------------------------------------------ */

function checkHosting(building: GeneratedBuilding): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  const wallById = new Map(building.walls.map((w) => [w.id, w]));
  const spaceIds = new Set(building.spaces.map((s) => s.id));

  for (const opening of building.openings) {
    const host = wallById.get(opening.hostWallId);
    if (!host) {
      out.push(
        violation(
          "UNHOSTED_OPENING",
          "P0",
          `${opening.kind} ${opening.id} references wall ${opening.hostWallId}, which does not exist.`,
          [opening.id],
          { floorNo: opening.floorNo },
        ),
      );
      continue;
    }

    if (opening.kind === "window" && host.role !== "exterior") {
      out.push(
        violation(
          "WINDOW_ON_INTERIOR_WALL",
          "P1",
          `Window ${opening.id} is hosted on a ${host.role} wall.`,
          [opening.id, host.id],
          { floorNo: opening.floorNo },
        ),
      );
    }

    const hostLength = Math.hypot(host.end[0] - host.start[0], host.end[1] - host.start[1]);
    if (opening.widthM > hostLength) {
      out.push(
        violation(
          "OPENING_WIDER_THAN_HOST",
          "P0",
          `${opening.id} is ${opening.widthM.toFixed(2)} m wide but its host wall is only ${hostLength.toFixed(2)} m.`,
          [opening.id, host.id],
          { floorNo: opening.floorNo },
        ),
      );
    }

    for (const spaceId of opening.connectsSpaceIds ?? []) {
      if (!spaceIds.has(spaceId)) {
        out.push(
          violation(
            "DANGLING_SPACE_REFERENCE",
            "P0",
            `${opening.id} connects to space ${spaceId}, which does not exist.`,
            [opening.id],
            { floorNo: opening.floorNo },
          ),
        );
      }
    }
  }

  for (const wall of building.walls) {
    for (const spaceId of wall.boundsSpaceIds) {
      if (!spaceIds.has(spaceId)) {
        out.push(
          violation(
            "DANGLING_SPACE_REFERENCE",
            "P0",
            `Wall ${wall.id} bounds space ${spaceId}, which does not exist.`,
            [wall.id],
            { floorNo: wall.floorNo },
          ),
        );
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Spatial                                                             */
/* ------------------------------------------------------------------ */

function checkSpatial(building: GeneratedBuilding): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];

  for (const space of building.spaces) {
    if (!space.reachable) {
      out.push(
        violation(
          "SPACE_NOT_ACCESSIBLE",
          "P1",
          `${space.label} has no valid connection to circulation.`,
          [space.id],
          {
            floorNo: space.floorNo,
            suggestion: "Add a door between this space and the adjacent corridor.",
          },
        ),
      );
    }
  }

  // Every occupied level needs circulation to hang rooms off.
  const byFloor = new Map<number, typeof building.spaces>();
  for (const space of building.spaces) {
    const list = byFloor.get(space.floorNo) ?? [];
    list.push(space);
    byFloor.set(space.floorNo, list);
  }
  for (const [floorNo, spaces] of byFloor) {
    if (spaces.length > 1 && !spaces.some((s) => s.isCirculation)) {
      out.push(
        violation(
          "NO_CIRCULATION_ON_LEVEL",
          "P1",
          `Level ${floorNo} has ${spaces.length} spaces but no circulation.`,
          spaces.map((s) => s.id),
          { floorNo },
        ),
      );
    }
  }

  // A level with NO spaces at all never appears in `byFloor`, so every check
  // above skips it — leaving the rules inverted: two rooms without a corridor
  // is flagged, while a wholly unprogrammed storey passes in silence. That is
  // exactly what "add a floor" produces when the patch appends a level without
  // extending any program to it: a glazed, columned, empty shell that validates
  // clean and promotes the design to GEOMETRICALLY_VALIDATED.
  for (const level of building.levels) {
    const usage = level.usage;
    // Parking, plant and roof levels are legitimately roomless.
    if (usage !== "occupied" && usage !== "lobby" && usage !== "retail") continue;
    if ((byFloor.get(level.floorNo)?.length ?? 0) > 0) continue;

    out.push(
      violation(
        "UNPROGRAMMED_LEVEL",
        "P2",
        `Level ${level.floorNo} (${level.name}) is marked "${usage}" but contains no spaces.`,
        [],
        {
          floorNo: level.floorNo,
          suggestion:
            "Assign program to this storey, or change its usage to one that is expected to be empty.",
        },
      ),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Core continuity                                                     */
/* ------------------------------------------------------------------ */

function checkCore(building: GeneratedBuilding): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  const floorNos = building.levels.map((l) => l.floorNo).sort((a, b) => a - b);
  if (floorNos.length === 0) return out;

  const top = floorNos[floorNos.length - 1];
  const bottom = floorNos[0];

  for (const component of building.core.components) {
    // A shaft or stair that stops short of a level it should serve is the
    // "shafts not vertically aligned" failure in the brief.
    if (component.fromFloorNo > bottom || component.toFloorNo < top) {
      const served = `${component.fromFloorNo}..${component.toFloorNo}`;
      out.push(
        violation(
          "CORE_NOT_CONTINUOUS",
          "P1",
          `${component.kind} ${component.id} serves levels ${served} but the building spans ${bottom}..${top}.`,
          [component.id],
          { suggestion: "Extend the core component through every level." },
        ),
      );
    }

    if (!rectInside(component.rect, building.core.rect)) {
      out.push(
        violation(
          "CORE_COMPONENT_OUTSIDE_CORE",
          "P0",
          `${component.kind} ${component.id} extends outside the core footprint.`,
          [component.id],
        ),
      );
    }

    // The core is ONE rect for the whole building, so a plate that steps back or
    // is cut by a notch can leave a shaft hanging over nothing on some levels
    // only. Reported against the first offending level rather than every one:
    // the defect is the siting, and it is repaired once.
    const offending = building.levels.find(
      (level) =>
        level.floorNo >= component.fromFloorNo &&
        level.floorNo <= component.toFloorNo &&
        hasUsablePlate(level) &&
        !clipRectToPolygon(component.rect, level.polygon, PLATE_TOLERANCE_M),
    );
    if (offending) {
      out.push(
        violation(
          "CORE_OUTSIDE_PLATE",
          "P1",
          `${component.kind} ${component.id} does not stand on solid floor at level ${offending.floorNo}.`,
          [component.id],
          {
            floorNo: offending.floorNo,
            suggestion: "Site the core on the largest solid region of the plate.",
          },
        ),
      );
    }
  }

  const components = building.core.components;
  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      if (rectsOverlap(components[i].rect, components[j].rect, 0.01)) {
        out.push(
          violation(
            "CORE_COMPONENTS_OVERLAP",
            "P0",
            `${components[i].id} and ${components[j].id} occupy the same space.`,
            [components[i].id, components[j].id],
          ),
        );
      }
    }
  }

  if (building.core.components.filter((c) => c.kind === "stair").length === 0) {
    out.push(
      violation("NO_EGRESS_STAIR", "P1", "The building has no stair.", [], {
        suggestion: "Add at least one stair to the core.",
      }),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

function checkStructure(building: GeneratedBuilding): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  const levelByFloor = new Map(building.levels.map((l) => [l.floorNo, l]));

  for (const column of building.columns) {
    const level = levelByFloor.get(column.floorNo);
    if (!level) {
      out.push(
        violation(
          "COLUMN_ON_MISSING_LEVEL",
          "P0",
          `Column ${column.id} sits on level ${column.floorNo}, which does not exist.`,
          [column.id],
        ),
      );
      continue;
    }
    // Point-in-polygon, not point-in-box: the bounding box of an L-shape covers
    // the quadrant that was removed, so the box test passed a column standing in
    // thin air. `structure.ts` never creates one, but validation that is only
    // correct because generation happens to agree is not validation.
    if (
      hasUsablePlate(level) &&
      !pointInPolygon([column.x, column.z], level.polygon, PLATE_TOLERANCE_M)
    ) {
      out.push(
        violation(
          "COLUMN_OUTSIDE_PLATE",
          "P1",
          `Column ${column.id} falls outside the level ${column.floorNo} floor plate.`,
          [column.id],
          { floorNo: column.floorNo },
        ),
      );
    }
  }

  // Columns must be supported by a column (or ground) below.
  const byFloor = new Map<number, Set<string>>();
  for (const column of building.columns) {
    const set = byFloor.get(column.floorNo) ?? new Set<string>();
    set.add(column.gridRef);
    byFloor.set(column.floorNo, set);
  }
  const floorNos = [...byFloor.keys()].sort((a, b) => a - b);
  for (let i = 1; i < floorNos.length; i += 1) {
    const below = byFloor.get(floorNos[i - 1])!;
    for (const gridRef of byFloor.get(floorNos[i])!) {
      if (!below.has(gridRef)) {
        out.push(
          violation(
            "UNSUPPORTED_COLUMN",
            "P1",
            `Column at grid ${gridRef} on level ${floorNos[i]} has no column beneath it.`,
            [`COL-L${floorNos[i]}-${gridRef}`],
            { floorNo: floorNos[i] },
          ),
        );
      }
    }
  }

  for (const level of building.levels) {
    const slabs = building.slabs.filter((s) => s.floorNo === level.floorNo);
    if (slabs.length === 0) {
      out.push(
        violation(
          "MISSING_SLAB",
          "P1",
          `Level ${level.floorNo} has no floor slab.`,
          [],
          { floorNo: level.floorNo },
        ),
      );
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Program + budgets                                                   */
/* ------------------------------------------------------------------ */

function checkProgram(
  building: GeneratedBuilding,
  spec: BuildingSpec,
): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];

  const budget = spec.constraints.find((c) => c.rule?.kind === "max_circulation_ratio");
  if (budget?.rule?.numeric && building.metrics.circulationRatio > budget.rule.numeric) {
    out.push(
      violation(
        "CIRCULATION_OVER_BUDGET",
        "P3",
        `Circulation is ${(building.metrics.circulationRatio * 100).toFixed(1)}% of net area, above the ${(budget.rule.numeric * 100).toFixed(0)}% target.`,
        [],
        { suggestion: "Reduce corridor width or shorten the corridor run." },
      ),
    );
  }

  // Program that was requested but never placed — the honest way to report
  // "it did not fit" instead of silently shipping a smaller building.
  for (const item of spec.program) {
    for (const floorNo of item.levels) {
      const placed = building.spaces.filter(
        (s) => s.programId === item.id && s.floorNo === floorNo,
      );
      if (placed.length === 0) {
        out.push(
          violation(
            "PROGRAM_NOT_PLACED",
            item.priority === "P0" ? "P0" : "P2",
            `${item.label} was requested on level ${floorNo} but did not fit.`,
            [],
            { floorNo, suggestion: "Enlarge the floor plate or reduce the target area." },
          ),
        );
        continue;
      }

      const total = placed.reduce((sum, s) => sum + s.areaSqm, 0);

      // Discrete rooms each owe the minimum, so the level owes minimum × count.
      // Circulation is one requirement realised as a run of segments, so it
      // owes the minimum once — multiplying by the segment count would punish
      // the solver for subdividing a corridor it was always going to subdivide.
      const isCirculationItem = placed.every((s) => s.isCirculation);
      const required = isCirculationItem
        ? item.minAreaSqm
        : item.minAreaSqm * placed.length;

      if (total < required * 0.9) {
        out.push(
          violation(
            "SPACE_BELOW_TARGET_AREA",
            "P2",
            // Report the threshold actually applied. Quoting the per-room
            // minimum while testing against the aggregate produced messages
            // like "60.5 m², below its 40 m² minimum".
            `${item.label} on level ${floorNo} totals ${total.toFixed(1)} m², below the ${required.toFixed(1)} m² required for ${placed.length} space(s).`,
            placed.map((s) => s.id),
            { floorNo },
          ),
        );
      }
    }

    const needsExterior = item.adjacency.some((a) => a.kind === "REQUIRES_EXTERIOR");
    if (needsExterior) {
      const landlocked = building.spaces.filter(
        (s) => s.programId === item.id && !s.hasExteriorWall,
      );
      if (landlocked.length > 0) {
        out.push(
          violation(
            "MISSING_EXTERIOR_ACCESS",
            "P2",
            `${landlocked.length} ${item.label} space(s) require an exterior wall but have none.`,
            landlocked.map((s) => s.id),
          ),
        );
      }
    }
  }

  // Plate must actually contain what was placed on it.
  for (const level of building.levels) {
    const placed = building.spaces
      .filter((s) => s.floorNo === level.floorNo)
      .reduce((sum, s) => sum + s.areaSqm, 0);
    if (placed > level.plateAreaSqm * 1.02) {
      out.push(
        violation(
          "PROGRAM_EXCEEDS_PLATE",
          "P0",
          `Level ${level.floorNo} has ${placed.toFixed(0)} m² of spaces on a ${level.plateAreaSqm.toFixed(0)} m² plate.`,
          [],
          { floorNo: level.floorNo },
        ),
      );
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

function checkLevels(building: GeneratedBuilding): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  const sorted = [...building.levels].sort((a, b) => a.floorNo - b.floorNo);

  for (const level of sorted) {
    if (polygonArea(level.polygon) <= 0) {
      out.push(
        violation(
          "EMPTY_FLOOR_PLATE",
          "P0",
          `Level ${level.floorNo} has an empty floor plate.`,
          [],
          { floorNo: level.floorNo },
        ),
      );
    }
  }

  // Above-grade levels must stack contiguously — a gap is a floating storey.
  const above = sorted.filter((l) => l.floorNo > 0);
  for (let i = 1; i < above.length; i += 1) {
    const expected = above[i - 1].elevationM + above[i - 1].heightM;
    if (Math.abs(above[i].elevationM - expected) > 0.01) {
      out.push(
        violation(
          "LEVEL_STACK_GAP",
          "P0",
          `Level ${above[i].floorNo} starts at ${above[i].elevationM.toFixed(2)} m but level ${above[i - 1].floorNo} ends at ${expected.toFixed(2)} m.`,
          [],
          { floorNo: above[i].floorNo },
        ),
      );
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export interface ValidationReport {
  violations: ConstraintViolation[];
  counts: { critical: number; warning: number; advisory: number };
  /** True when nothing at P0/P1 is outstanding. */
  geometricallyValid: boolean;
}

export function validateBuilding(
  building: GeneratedBuilding,
  spec: BuildingSpec,
): ValidationReport {
  const violations = [
    ...checkGeometry(building),
    ...checkHosting(building),
    ...checkSpatial(building),
    ...checkCore(building),
    ...checkStructure(building),
    ...checkProgram(building, spec),
    ...checkLevels(building),
  ];

  const counts = {
    critical: violations.filter((v) => v.severity === "critical").length,
    warning: violations.filter((v) => v.severity === "warning").length,
    advisory: violations.filter((v) => v.severity === "advisory").length,
  };

  // Sort worst-first so the Issues panel needs no further ordering.
  const order: Record<ViolationPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  violations.sort((a, b) => order[a.priority] - order[b.priority]);

  return { violations, counts, geometricallyValid: counts.critical === 0 };
}
