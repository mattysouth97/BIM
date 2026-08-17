import { describe, expect, it } from "vitest";

import { generateOpenings } from "../generate/openings";
import type { GeneratedOpening, GeneratedWall, PlacedSpace } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { createRng, seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */
//
// The wall/space solvers are sibling modules under parallel development, so the
// tests drive `generateOpenings` from hand-built inputs. That is deliberate: the
// contract this module has to honour is the GeneratedWall/PlacedSpace shape, not
// whatever the solver happens to emit this week.

const FLOOR = 2;
const WALL_HEIGHT_M = 3.9;

function space(partial: Partial<PlacedSpace> & { id: string }): PlacedSpace {
  return {
    programId: "",
    type: "office-open",
    label: partial.id,
    floorNo: FLOOR,
    rect: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 },
    areaSqm: 100,
    isCirculation: false,
    adjacentSpaceIds: [],
    hasExteriorWall: false,
    reachable: true,
    ...partial,
  };
}

function wall(partial: Partial<GeneratedWall> & { id: string }): GeneratedWall {
  return {
    floorNo: FLOOR,
    start: [0, 0],
    end: [10, 0],
    thicknessM: 0.125,
    heightM: WALL_HEIGHT_M,
    role: "interior",
    boundsSpaceIds: [],
    ...partial,
  };
}

/** A straight run of `lengthM` on the given elevation, laid out along +X or +Z. */
function exteriorWall(
  id: string,
  side: NonNullable<GeneratedWall["side"]>,
  lengthM: number,
): GeneratedWall {
  const alongX = side === "north" || side === "south";
  return wall({
    id,
    role: "exterior",
    side,
    thicknessM: 0.25,
    start: [0, 0],
    end: alongX ? [lengthM, 0] : [0, lengthM],
    boundsSpaceIds: ["ROOM-1"],
  });
}

const CORRIDOR = space({
  id: "CORR-1",
  programId: "circulation",
  type: "corridor",
  label: "Corridor",
  isCirculation: true,
});

/**
 * A minimal but complete floor: corridor + two rooms, one exterior wall per
 * elevation, one core wall, and one partition too short to take a door.
 */
function baseFloor(): { walls: GeneratedWall[]; spaces: PlacedSpace[] } {
  return {
    spaces: [
      CORRIDOR,
      space({ id: "ROOM-1", programId: "open-office", label: "Open Office" }),
      space({ id: "ROOM-2", programId: "meeting", label: "Meeting Room" }),
    ],
    walls: [
      exteriorWall("W-N", "north", 24),
      exteriorWall("W-S", "south", 24),
      exteriorWall("W-E", "east", 16),
      exteriorWall("W-W", "west", 16),
      // A permissive exterior wall that names two bounding spaces, one of them
      // circulation. Only the WallRole may stop a door landing here — the
      // arity of boundsSpaceIds must not be the thing doing the work.
      wall({
        id: "W-X",
        role: "exterior",
        side: "north",
        thicknessM: 0.25,
        start: [0, 12],
        end: [20, 12],
        boundsSpaceIds: ["CORR-1", "ROOM-1"],
      }),
      // P-1 and C-1 are deliberately mis-tagged with a compass side: role, not
      // the presence of `side`, is what decides whether a wall gets glazed.
      wall({ id: "P-1", side: "south", start: [0, 4], end: [8, 4], boundsSpaceIds: ["CORR-1", "ROOM-1"] }),
      wall({ id: "P-2", start: [8, 4], end: [16, 4], boundsSpaceIds: ["ROOM-2", "CORR-1"] }),
      // Two ordinary rooms with no declared requirement: no door.
      wall({ id: "P-3", start: [8, 0], end: [8, 4], boundsSpaceIds: ["ROOM-1", "ROOM-2"] }),
      // Corridor-to-room, but only 1.0 m long — a 0.9 m leaf cannot fit.
      wall({ id: "P-SHORT", start: [16, 4], end: [17, 4], boundsSpaceIds: ["CORR-1", "ROOM-2"] }),
      wall({
        id: "C-1",
        role: "core",
        side: "east",
        start: [10, 8],
        end: [16, 8],
        boundsSpaceIds: ["CORR-1", "ROOM-2"],
      }),
    ],
  };
}

function run(spec: BuildingSpec, floor = baseFloor(), floorNo = FLOOR): GeneratedOpening[] {
  return generateOpenings({
    spec,
    floorNo,
    walls: floor.walls,
    spaces: floor.spaces,
    rng: createRng(spec.generationSeed).fork("openings"),
  });
}

/** Distance of an opening's centre from `wall.start`, along the wall axis. */
function offsetAlongWall(opening: GeneratedOpening, host: GeneratedWall): number {
  const dx = host.end[0] - host.start[0];
  const dz = host.end[1] - host.start[1];
  const length = Math.hypot(dx, dz);
  const px = opening.position[0] - host.start[0];
  const pz = opening.position[1] - host.start[1];
  return (px * dx + pz * dz) / length;
}

/* ------------------------------------------------------------------ */
/* Doors                                                               */
/* ------------------------------------------------------------------ */

describe("generateOpenings — doors from connectivity", () => {
  it("puts exactly one door on every partition between circulation and a room", async () => {
    const spec = await specFor("A five-storey office building.");
    const doors = run(spec).filter((o) => o.kind === "door");

    const hosts = doors.map((d) => d.hostWallId).sort();
    expect(hosts).toEqual(["P-1", "P-2"]);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it("places the door at the midpoint of its host wall", async () => {
    const spec = await specFor("A five-storey office building.");
    const door = run(spec).find((o) => o.hostWallId === "P-1");
    expect(door?.position).toEqual([4, 4]);
  });

  it("takes width, height and sill from the spec dimensions", async () => {
    const spec = await specFor("A five-storey office building.");
    const door = run(spec).find((o) => o.kind === "door");
    expect(door?.widthM).toBeCloseTo(spec.dimensions.doorWidthMm.value / 1000, 9);
    expect(door?.heightM).toBeCloseTo(spec.dimensions.doorHeightMm.value / 1000, 9);
    expect(door?.sillM).toBe(0);
  });

  it("records the two spaces the door connects", async () => {
    const spec = await specFor("A five-storey office building.");
    const door = run(spec).find((o) => o.hostWallId === "P-2");
    expect(door?.connectsSpaceIds).toEqual(["ROOM-2", "CORR-1"]);
  });

  it("skips a wall too short to host the leaf plus its jambs", async () => {
    const spec = await specFor("A five-storey office building.");
    const doorWidthM = spec.dimensions.doorWidthMm.value / 1000;
    expect(doorWidthM).toBeLessThan(1.0); // the fixture wall is 1.0 m long
    const doors = run(spec).filter((o) => o.kind === "door");
    expect(doors.map((d) => d.hostWallId)).not.toContain("P-SHORT");
  });

  it("does not door two ordinary rooms the program never required to touch", async () => {
    const spec = await specFor("A five-storey office building.");
    const doors = run(spec).filter((o) => o.kind === "door");
    expect(doors.map((d) => d.hostWallId)).not.toContain("P-3");
  });

  it("doors two non-circulation rooms when the program says REQUIRES_ADJACENCY", async () => {
    // The research template declares lab-support REQUIRES_ADJACENCY lab.
    const spec = await specFor(
      "Generate a four-storey research center with laboratories around the exterior.",
    );
    const required = spec.program
      .flatMap((p) => p.adjacency.map((a) => ({ from: p.id, ...a })))
      .find((a) => a.kind === "REQUIRES_ADJACENCY");
    expect(required?.from).toBe("lab-support");
    expect(required?.targetId).toBe("lab");

    const floor = {
      spaces: [
        space({ id: "LAB-1", programId: "lab", type: "laboratory", label: "Laboratory" }),
        space({ id: "SUP-1", programId: "lab-support", type: "service", label: "Lab Support" }),
        space({ id: "MEET-1", programId: "meeting", type: "meeting", label: "Meeting" }),
      ],
      walls: [
        wall({ id: "P-LAB", start: [0, 0], end: [7, 0], boundsSpaceIds: ["LAB-1", "SUP-1"] }),
        wall({ id: "P-OTHER", start: [0, 6], end: [7, 6], boundsSpaceIds: ["LAB-1", "MEET-1"] }),
      ],
    };

    const doors = run(spec, floor).filter((o) => o.kind === "door");
    expect(doors.map((d) => d.hostWallId)).toEqual(["P-LAB"]);
  });

  it("matches a REQUIRES_ADJACENCY pair regardless of which side declared it", async () => {
    const spec = await specFor(
      "Generate a four-storey research center with laboratories around the exterior.",
    );
    const floor = {
      spaces: [
        space({ id: "LAB-1", programId: "lab", type: "laboratory", label: "Laboratory" }),
        space({ id: "SUP-1", programId: "lab-support", type: "service", label: "Lab Support" }),
      ],
      // Reversed order relative to the declaration (lab-support → lab).
      walls: [wall({ id: "P-REV", start: [0, 0], end: [7, 0], boundsSpaceIds: ["LAB-1", "SUP-1"] })],
    };
    expect(run(spec, floor)).toHaveLength(1);
  });

  it("ignores solver corridors with empty programIds rather than pairing them", async () => {
    const spec = await specFor(
      "Generate a four-storey research center with laboratories around the exterior.",
    );
    const floor = {
      spaces: [
        space({ id: "ANON-1", programId: "" }),
        space({ id: "ANON-2", programId: "" }),
      ],
      walls: [wall({ id: "P-ANON", start: [0, 0], end: [7, 0], boundsSpaceIds: ["ANON-1", "ANON-2"] })],
    };
    expect(run(spec, floor)).toHaveLength(0);
  });

  it("ids doors as DOOR-L<floor>-<3-digit index>", async () => {
    const spec = await specFor("A five-storey office building.");
    const doors = run(spec).filter((o) => o.kind === "door");
    expect(doors.map((d) => d.id)).toEqual(["DOOR-L2-000", "DOOR-L2-001"]);
    for (const door of doors) expect(door.floorNo).toBe(FLOOR);
  });
});

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

describe("generateOpenings — windows from facade rules", () => {
  it("tiles windows along the facade module and ids them 4-digit", async () => {
    const spec = await specFor("A five-storey office building.");
    const windows = run(spec).filter((o) => o.kind === "window");

    expect(windows.length).toBeGreaterThan(10);
    expect(windows[0].id).toBe("WIN-L2-0000");
    expect(windows[1].id).toBe("WIN-L2-0001");
    for (const win of windows) {
      expect(win.id).toMatch(/^WIN-L2-\d{4}$/);
      expect(win.connectsSpaceIds).toBeUndefined();
    }
  });

  it("derives width, head and sill from the matching facade side", async () => {
    const spec = await specFor("A five-storey office building.");
    const north = spec.facade.sides.find((s) => s.side === "north")!;
    expect(north.system).toBe("punched-window");

    const win = run(spec).find((o) => o.hostWallId === "W-N")!;
    expect(win.widthM).toBeCloseTo(north.windowWidthMm / 1000, 9);
    expect(win.sillM).toBeCloseTo(north.sillHeightMm / 1000, 9);
    expect(win.heightM).toBeCloseTo((north.headHeightMm - north.sillHeightMm) / 1000, 9);
  });

  it("spaces the windows one module apart", async () => {
    const spec = await specFor("A five-storey office building.");
    const north = spec.facade.sides.find((s) => s.side === "north")!;
    const host = baseFloor().walls.find((w) => w.id === "W-N")!;
    const offsets = run(spec)
      .filter((o) => o.hostWallId === "W-N")
      .map((o) => offsetAlongWall(o, host));

    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i] - offsets[i - 1]).toBeCloseTo(north.moduleMm / 1000, 6);
    }
  });

  it("keeps 0.6 m clear at both ends of every exterior wall", async () => {
    const spec = await specFor("A five-storey office building.");
    const floor = baseFloor();
    const byId = new Map(floor.walls.map((w) => [w.id, w]));

    for (const win of run(spec, floor).filter((o) => o.kind === "window")) {
      const host = byId.get(win.hostWallId)!;
      const length = Math.hypot(host.end[0] - host.start[0], host.end[1] - host.start[1]);
      const centre = offsetAlongWall(win, host);
      expect(centre - win.widthM / 2).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(centre + win.widthM / 2).toBeLessThanOrEqual(length - 0.6 + 1e-9);
    }
  });

  it("emits nothing on a wall shorter than the corner clearances", async () => {
    const spec = await specFor("A five-storey office building.");
    const floor = { spaces: [], walls: [exteriorWall("W-TINY", "north", 1.1)] };
    expect(run(spec, floor)).toHaveLength(0);
  });

  it("gives a curtain-wall elevation more glass than an identical punched one", async () => {
    const spec = await specFor(
      "Five storey office building with a curtain wall on the south elevation.",
    );
    expect(spec.facade.sides.find((s) => s.side === "south")?.system).toBe("curtain-wall");
    expect(spec.facade.sides.find((s) => s.side === "north")?.system).toBe("punched-window");

    // Identical geometry on both elevations, so only the facade rule differs.
    const floor = {
      spaces: [],
      walls: [exteriorWall("W-N", "north", 30), exteriorWall("W-S", "south", 30)],
    };
    const openings = run(spec, floor);
    const glassOn = (id: string) =>
      openings
        .filter((o) => o.hostWallId === id)
        .reduce((sum, o) => sum + o.widthM * o.heightM, 0);

    expect(glassOn("W-S")).toBeGreaterThan(glassOn("W-N") * 1.5);
    // And the curtain-wall panel is floor-mounted full-module glass.
    const panel = openings.find((o) => o.hostWallId === "W-S")!;
    expect(panel.sillM).toBe(0);
    expect(panel.widthM).toBeCloseTo(
      spec.facade.sides.find((s) => s.side === "south")!.moduleMm / 1000 - 0.1,
      9,
    );
  });

  it("drops trailing windows so the wall never exceeds its glazing ratio", async () => {
    const spec = await specFor(
      "Five storey office building with a curtain wall on the south elevation.",
    );
    const south = spec.facade.sides.find((s) => s.side === "south")!;
    const floor = { spaces: [], walls: [exteriorWall("W-S", "south", 30)] };

    const windows = run(spec, floor);
    expect(windows.length).toBeGreaterThan(0);

    // How many modules the corner rule alone would have allowed. A full-height
    // curtain panel blows past the stated ratio, so the glazing trim must remove
    // more than the corners already did — otherwise this test proves nothing.
    const moduleM = south.moduleMm / 1000;
    const panelM = moduleM - 0.1;
    let cornerValid = 0;
    for (let i = 0; i < Math.floor(30 / moduleM); i += 1) {
      const centre = (i + 0.5) * moduleM;
      if (centre - panelM / 2 >= 0.6 - 1e-9 && centre + panelM / 2 <= 30 - 0.6 + 1e-9) {
        cornerValid += 1;
      }
    }
    expect(windows.length).toBeLessThan(cornerValid);

    const wallAreaSqm = 30 * WALL_HEIGHT_M;
    const glass = windows.reduce((sum, o) => sum + o.widthM * o.heightM, 0);
    expect(glass / wallAreaSqm).toBeLessThanOrEqual(south.glazingRatio + 1e-9);
    // The cap is genuinely binding: one more panel would breach the ratio.
    const perPanel = windows[0].widthM * windows[0].heightM;
    expect((glass + perPanel) / wallAreaSqm).toBeGreaterThan(south.glazingRatio);
  });

  it("never lets a window wider than its module overlap the next one", async () => {
    const spec = await specFor("A five-storey office building.");
    // A spec can legitimately ask for a 2.0 m window on a 1.5 m module; the
    // generator must pier them apart rather than emit one continuous slot.
    const greedy: BuildingSpec = {
      ...spec,
      facade: {
        ...spec.facade,
        sides: spec.facade.sides.map((s) =>
          s.side === "north" ? { ...s, windowWidthMm: 2_000, glazingRatio: 0.95 } : s,
        ),
      },
    };
    const host = exteriorWall("W-N", "north", 30);
    const windows = run(greedy, { spaces: [], walls: [host] });
    expect(windows.length).toBeGreaterThan(5);

    const offsets = windows.map((o) => offsetAlongWall(o, host)).sort((a, b) => a - b);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i] - offsets[i - 1]).toBeGreaterThanOrEqual(windows[i].widthM - 1e-9);
    }
    expect(windows[0].widthM).toBeLessThan(spec.facade.sides[0].moduleMm / 1000);
  });

  it("emits no windows on a solid elevation", async () => {
    const spec = await specFor("A five-storey office building.");
    const solid: BuildingSpec = {
      ...spec,
      facade: {
        ...spec.facade,
        sides: spec.facade.sides.map((s) =>
          s.side === "north" ? { ...s, system: "solid" as const } : s,
        ),
      },
    };
    const floor = { spaces: [], walls: [exteriorWall("W-N", "north", 30)] };
    expect(run(solid, floor)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Hard invariants                                                     */
/* ------------------------------------------------------------------ */

describe("generateOpenings — invariants", () => {
  const PROMPTS = [
    "A five-storey office building.",
    "Generate a four-storey research center with laboratories around the exterior.",
    "A six storey residential apartment block.",
    "Five storey office building with a curtain wall on the south elevation.",
    "A two storey warehouse and logistics building.",
  ];

  it("hosts every opening on a wall that exists in the input", async () => {
    for (const prompt of PROMPTS) {
      const spec = await specFor(prompt);
      const floor = baseFloor();
      const ids = new Set(floor.walls.map((w) => w.id));
      const openings = run(spec, floor);
      expect(openings.length).toBeGreaterThan(0);
      for (const opening of openings) {
        expect(ids.has(opening.hostWallId)).toBe(true);
        expect(opening.floorNo).toBe(FLOOR);
      }
    }
  });

  it("never puts a window on an interior or core wall", async () => {
    for (const prompt of PROMPTS) {
      const spec = await specFor(prompt);
      const floor = baseFloor();
      const roleById = new Map(floor.walls.map((w) => [w.id, w.role]));
      for (const win of run(spec, floor).filter((o) => o.kind === "window")) {
        expect(roleById.get(win.hostWallId)).toBe("exterior");
      }
    }
  });

  it("never puts a door on an exterior wall", async () => {
    for (const prompt of PROMPTS) {
      const spec = await specFor(prompt);
      const floor = baseFloor();
      const roleById = new Map(floor.walls.map((w) => [w.id, w.role]));
      for (const door of run(spec, floor).filter((o) => o.kind === "door")) {
        expect(roleById.get(door.hostWallId)).not.toBe("exterior");
        expect(roleById.get(door.hostWallId)).toBe("interior");
      }
    }
  });

  it("never overlaps two openings on the same wall along the wall axis", async () => {
    for (const prompt of PROMPTS) {
      const spec = await specFor(prompt);
      const floor = baseFloor();
      const byId = new Map(floor.walls.map((w) => [w.id, w]));
      const grouped = new Map<string, GeneratedOpening[]>();
      for (const opening of run(spec, floor)) {
        const list = grouped.get(opening.hostWallId) ?? [];
        list.push(opening);
        grouped.set(opening.hostWallId, list);
      }

      for (const [wallId, openings] of grouped) {
        const host = byId.get(wallId)!;
        const spans = openings
          .map((o) => {
            const centre = offsetAlongWall(o, host);
            return [centre - o.widthM / 2, centre + o.widthM / 2] as const;
          })
          .sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i += 1) {
          expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-9);
        }
      }
    }
  });

  it("keeps total window area per wall within the stated glazing ratio", async () => {
    for (const prompt of PROMPTS) {
      const spec = await specFor(prompt);
      const floor = baseFloor();
      const byId = new Map(floor.walls.map((w) => [w.id, w]));
      const areaByWall = new Map<string, number>();
      for (const win of run(spec, floor).filter((o) => o.kind === "window")) {
        areaByWall.set(
          win.hostWallId,
          (areaByWall.get(win.hostWallId) ?? 0) + win.widthM * win.heightM,
        );
      }

      for (const [wallId, glassSqm] of areaByWall) {
        const host = byId.get(wallId)!;
        const length = Math.hypot(host.end[0] - host.start[0], host.end[1] - host.start[1]);
        const side = spec.facade.sides.find((s) => s.side === host.side)!;
        const budget = length * host.heightM * side.glazingRatio;
        // Within 1% — the trim is a hard cap, so the slack is never consumed.
        expect(glassSqm).toBeLessThanOrEqual(budget * 1.01);
      }
    }
  });

  it("ignores walls belonging to another level", async () => {
    const spec = await specFor("A five-storey office building.");
    const floor = baseFloor();
    const otherLevel = floor.walls.map((w) => ({ ...w, id: `${w.id}-L9`, floorNo: 9 }));
    const openings = run(spec, { ...floor, walls: [...floor.walls, ...otherLevel] });
    for (const opening of openings) expect(opening.hostWallId).not.toMatch(/-L9$/);
  });
});

/* ------------------------------------------------------------------ */
/* Determinism                                                         */
/* ------------------------------------------------------------------ */

describe("generateOpenings — determinism", () => {
  it("returns identical openings for identical inputs", async () => {
    const spec = await specFor("A five-storey office building.");
    expect(JSON.stringify(run(spec))).toEqual(JSON.stringify(run(spec)));
  });

  it("returns identical openings across independent spec generations of one prompt", async () => {
    const prompt = "Five storey office building with a curtain wall on the south elevation.";
    const a = run(await specFor(prompt));
    const b = run(await specFor(prompt));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
  });

  it("does not depend on the rng stream it is handed", async () => {
    const spec = await specFor("A five-storey office building.");
    const floor = baseFloor();
    const withSeedA = generateOpenings({
      spec,
      floorNo: FLOOR,
      walls: floor.walls,
      spaces: floor.spaces,
      rng: createRng(1),
    });
    const withSeedB = generateOpenings({
      spec,
      floorNo: FLOOR,
      walls: floor.walls,
      spaces: floor.spaces,
      rng: createRng(987_654),
    });
    expect(JSON.stringify(withSeedA)).toEqual(JSON.stringify(withSeedB));
  });
});
