// The semantic navigation tree is the only handle the user has on "the core on
// levels 3–5". If its shape drifts, selection scope and locking both drift with
// it silently — the UI still renders, it just points at the wrong elements.
//
// Everything here is built from a REAL snapshot (heuristic provider → buildDesign)
// rather than a hand-written fixture, because the tree's contract is about what
// the emitter actually produces, not about what a fixture author imagines.

import { describe, expect, it } from "vitest";

import { buildDesign } from "../build";
import type { ModificationScope } from "../client";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import {
  buildNavigationTree,
  findNavNode,
  isolationFloors,
  type NavNode,
} from "../session/navigation";
import { LOCKABLE_SYSTEMS } from "../session/locks";
import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";

const provider = new HeuristicReasoningProvider();

/** Mirrors navigation.ts — a level lists at most this many rooms individually. */
const MAX_SPACES_PER_LEVEL = 60;

/** Building a design is the expensive part; the tree itself is cheap. */
const cache = new Map<string, BimModelSnapshot>();

async function snapshotFor(prompt: string): Promise<BimModelSnapshot> {
  const hit = cache.get(prompt);
  if (hit) return hit;
  const { data: spec } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  const { snapshot } = buildDesign({
    spec,
    buildingPk: "test",
    generationId: "GEN-0001",
  });
  cache.set(prompt, snapshot);
  return snapshot;
}

async function treeFor(prompt: string): Promise<NavNode> {
  return buildNavigationTree(await snapshotFor(prompt));
}

const ABOVE_GRADE = "A five storey office building.";
/** Basements make floorNo go negative — the token and sort must survive that. */
const WITH_BASEMENTS = "A 3 storey office building with two basement levels.";

function groupOf(root: NavNode, id: string): NavNode {
  const group = root.children.find((child) => child.id === id);
  expect(group, `missing ${id}`).toBeDefined();
  return group as NavNode;
}

describe("buildNavigationTree — root", () => {
  it("roots at the whole building and splits into exactly Systems and Levels", async () => {
    const snapshot = await snapshotFor(ABOVE_GRADE);
    const root = buildNavigationTree(snapshot);

    expect(root.id).toBe("building");
    expect(root.kind).toBe("building");
    expect(root.count).toBe(snapshot.elements.length);
    expect(root.scope).toEqual({ kind: "building", label: "Whole building" });
    // The root is not lockable: "lock everything" is not a thing you can undo
    // one system at a time.
    expect(root.lockToken).toBeUndefined();

    // Exactly two groups, in this order — the panel renders them positionally.
    expect(root.children.map((child) => child.id)).toEqual([
      "group:systems",
      "group:levels",
    ]);
    expect(root.children.map((child) => child.label)).toEqual(["Systems", "Levels"]);
    for (const child of root.children) expect(child.kind).toBe("category");

    // "All levels" must name every level, not just the populated ones.
    expect(groupOf(root, "group:levels").scope.floorNos).toEqual(
      snapshot.levels.map((level) => level.floorNo),
    );
  });
});

describe("buildNavigationTree — systems", () => {
  it("gives every system a system: lock token and a system-kind scope", async () => {
    const snapshot = await snapshotFor(ABOVE_GRADE);
    const systems = groupOf(buildNavigationTree(snapshot), "group:systems").children;

    expect(systems.length).toBeGreaterThan(0);

    for (const node of systems) {
      expect(node.kind).toBe("system");
      expect(node.system).toBeDefined();
      // The token is what the lock store round-trips through parseLock; if the
      // node id and the token ever diverge, locking silently targets nothing.
      expect(node.lockToken).toBe(`system:${node.system}`);
      expect(node.id).toBe(node.lockToken);
      expect(node.scope.kind).toBe("system");
      expect(node.scope.label).toBe(`${node.label} system`);
      // A system spans every level, so it must not pin the isolation view.
      expect(node.scope.floorNos).toBeUndefined();

      expect(node.count).toBe(
        snapshot.elements.filter((element) => element.system === node.system).length,
      );
    }

    // Only systems that actually produced elements appear, and they keep the
    // canonical reading order rather than map-insertion order.
    const present = LOCKABLE_SYSTEMS.filter((system) =>
      snapshot.elements.some((element) => element.system === system),
    );
    expect(systems.map((node) => node.system)).toEqual(present);
  });

  it("lists each system's categories biggest-first and accounts for every element", async () => {
    const systems = groupOf(await treeFor(ABOVE_GRADE), "group:systems").children;

    for (const system of systems) {
      expect(system.children.length).toBeGreaterThan(0);

      const counts = system.children.map((category) => category.count);
      // Descending: the largest category is the one worth clicking first.
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);

      // Categories partition the system — no element is double-counted or lost.
      expect(counts.reduce((sum, n) => sum + n, 0)).toBe(system.count);
      expect(system.detail).toBe(
        `${system.children.length} categor${system.children.length === 1 ? "y" : "ies"}`,
      );

      for (const category of system.children) {
        expect(category.kind).toBe("category");
        expect(category.id).toBe(`system:${system.system}/category:${category.label}`);
        // A category is a selection of concrete elements, not a lockable unit.
        expect(category.lockToken).toBeUndefined();
        expect(category.scope.kind).toBe("selection");
        expect(category.scope.elementIds?.length).toBeGreaterThan(0);
        // Element ids are a description, not a payload: capped at 200.
        expect(category.scope.elementIds!.length).toBeLessThanOrEqual(
          Math.min(category.count, 200),
        );
      }
    }
  });
});

describe("buildNavigationTree — levels", () => {
  it("orders levels top-down and tokenises each one, basements included", async () => {
    const snapshot = await snapshotFor(WITH_BASEMENTS);
    const levels = groupOf(buildNavigationTree(snapshot), "group:levels").children;

    expect(levels).toHaveLength(snapshot.levels.length);
    // A basement is present, so the descending sort is doing real work here.
    expect(Math.min(...levels.map((level) => level.floorNo!))).toBeLessThan(0);

    const floorNos = levels.map((level) => level.floorNo!);
    expect([...floorNos].sort((a, b) => b - a)).toEqual(floorNos);
    expect(new Set(floorNos).size).toBe(floorNos.length);

    for (const level of levels) {
      expect(level.kind).toBe("level");
      expect(level.id).toBe(`level:${level.floorNo}`);
      expect(level.lockToken).toBe(`level:${level.floorNo}`);
      expect(level.scope.kind).toBe("level");
      // Exactly one floor — a level scope that leaked its neighbours would
      // isolate the wrong storeys in 3D.
      expect(level.scope.floorNos).toEqual([level.floorNo]);
      expect(level.scope.elementIds).toBeUndefined();
    }
  });

  it("hangs the rooms of that level under it, labelled by their space name", async () => {
    const snapshot = await snapshotFor(ABOVE_GRADE);
    const levels = groupOf(buildNavigationTree(snapshot), "group:levels").children;

    const roomsOn = (floorNo: number) =>
      snapshot.elements.filter(
        (element) => element.kind === "room" && element.levelId === `level:${floorNo}`,
      );

    const populated = levels.filter((level) => roomsOn(level.floorNo!).length > 0);
    expect(populated.length).toBeGreaterThan(0);

    for (const level of populated) {
      const rooms = roomsOn(level.floorNo!);
      // The overflow summary only appears past the cap; these fixtures stay under
      // it, so children map one-to-one onto rooms.
      expect(rooms.length).toBeLessThanOrEqual(MAX_SPACES_PER_LEVEL);
      expect(level.children).toHaveLength(rooms.length);

      expect(new Set(level.children.map((space) => space.id))).toEqual(
        new Set(rooms.map((room) => `space:${room.id}`)),
      );

      const labelById = new Map(
        rooms.map((room) => [`space:${room.id}`, room.instanceParameters.name]),
      );
      for (const space of level.children) {
        expect(space.kind).toBe("space");
        expect(space.label).toBe(labelById.get(space.id));
        expect(space.floorNo).toBe(level.floorNo);
        expect(space.count).toBe(1);
        expect(space.scope.kind).toBe("space");
        expect(space.scope.floorNos).toEqual([level.floorNo]);
        expect(space.scope.elementIds).toEqual([space.id.slice("space:".length)]);
        // A single room is not a lockable unit — element locks come from
        // elsewhere, and offering a token here would imply otherwise.
        expect(space.lockToken).toBeUndefined();
      }
    }
  });
});

describe("buildNavigationTree — rooms the model named badly", () => {
  /** Replace the rooms on one floor, keeping everything else untouched. */
  function withRooms(
    snapshot: BimModelSnapshot,
    floorNo: number,
    rooms: BimElement[],
  ): BimModelSnapshot {
    const levelId = `level:${floorNo}`;
    return {
      ...snapshot,
      elements: [
        ...snapshot.elements.filter(
          (element) => !(element.kind === "room" && element.levelId === levelId),
        ),
        ...rooms,
      ],
    };
  }

  function roomTemplate(snapshot: BimModelSnapshot, floorNo: number): BimElement {
    const room = snapshot.elements.find(
      (element) => element.kind === "room" && element.levelId === `level:${floorNo}`,
    );
    expect(room, `no room on level ${floorNo}`).toBeDefined();
    return room as BimElement;
  }

  it("falls back to the element id when a room name is missing or not a string", async () => {
    const base = await snapshotFor(ABOVE_GRADE);
    const template = roomTemplate(base, 1);

    // `instanceParameters` ultimately carries labels that originated in model
    // output, so the tree must not assume `name` is a string — a numeric label
    // rendering as "undefined" in the panel is how a user loses a room.
    const unnamed: BimElement = {
      ...template,
      id: "SPACE-UNNAMED",
      instanceParameters: { spaceType: "office" },
    };
    const numeric: BimElement = {
      ...template,
      id: "SPACE-NUMERIC",
      instanceParameters: { name: 404, areaM2: "not a number" },
    };

    const levels = groupOf(
      buildNavigationTree(withRooms(base, 1, [unnamed, numeric])),
      "group:levels",
    ).children;
    const level = levels.find((node) => node.floorNo === 1)!;

    expect(level.children.map((space) => space.label)).toEqual([
      "SPACE-UNNAMED",
      "SPACE-NUMERIC",
    ]);
    // The scope label the reasoning layer receives gets the same fallback.
    expect(level.children.map((space) => space.scope.label)).toEqual([
      "SPACE-UNNAMED",
      "SPACE-NUMERIC",
    ]);
    // A non-numeric area is omitted rather than printed as "NaN m²".
    for (const space of level.children) expect(space.detail).toBeUndefined();
  });

  it("summarises a floor with more rooms than the cap instead of dropping them", async () => {
    const base = await snapshotFor(ABOVE_GRADE);
    const template = roomTemplate(base, 1);
    const overflow = 5;

    const many: BimElement[] = Array.from(
      { length: MAX_SPACES_PER_LEVEL + overflow },
      (_, i) => ({
        ...template,
        id: `SPACE-BULK-${i}`,
        instanceParameters: { ...template.instanceParameters, name: `Room ${i}` },
      }),
    );

    const levels = groupOf(
      buildNavigationTree(withRooms(base, 1, many)),
      "group:levels",
    ).children;
    const level = levels.find((node) => node.floorNo === 1)!;

    // 60 rooms plus one honest "there are more" node — never a silent truncation.
    expect(level.children).toHaveLength(MAX_SPACES_PER_LEVEL + 1);
    expect(level.detail).toContain(`${many.length} spaces`);

    const last = level.children[level.children.length - 1];
    expect(last.id).toBe("space-overflow:1");
    expect(last.label).toBe(`+${overflow} more spaces`);
    expect(last.count).toBe(overflow);
    // Clicking the summary selects the level, which is the only honest scope for
    // "the rooms I am not showing you".
    expect(last.scope.kind).toBe("level");
    expect(last.scope.floorNos).toEqual([1]);
  });
});

describe("findNavNode", () => {
  it("finds a node at any depth and refuses to invent one", async () => {
    const root = await treeFor(ABOVE_GRADE);

    expect(findNavNode(root, "building")).toBe(root);

    // Deepest branch available: building → group → level → space.
    const levels = groupOf(root, "group:levels").children;
    const level = levels.find((node) => node.children.length > 0)!;
    const space = level.children[0];

    expect(findNavNode(root, space.id)).toBe(space);
    expect(findNavNode(root, level.id)).toBe(level);
    expect(findNavNode(root, "group:systems")?.label).toBe("Systems");

    // Ids that merely look plausible must not resolve — a stale selection from a
    // previous generation has to surface as "gone", not as a near-miss node.
    expect(findNavNode(root, "level:9999")).toBeNull();
    expect(findNavNode(root, "system:not-a-system")).toBeNull();
    expect(findNavNode(root, "")).toBeNull();
    expect(findNavNode(root, level.id.toUpperCase())).toBeNull();

    // Searching from a subtree only sees that subtree.
    expect(findNavNode(level, "building")).toBeNull();
    expect(findNavNode(level, space.id)).toBe(space);
  });
});

describe("isolationFloors", () => {
  it("says 'no restriction' for a missing scope and for a scope naming no floors", () => {
    // Both mean "show everything". The renderer must not be able to tell them
    // apart from an empty list, which would mean "show nothing".
    expect(isolationFloors(null)).toBeNull();
    expect(isolationFloors({ kind: "building", label: "Whole building" })).toBeNull();
    expect(
      isolationFloors({ kind: "system", label: "Structure system", floorNos: [] }),
    ).toBeNull();
    // Elements without floors do not imply floors.
    expect(
      isolationFloors({ kind: "selection", label: "Some walls", elementIds: ["W-1"] }),
    ).toBeNull();
  });

  it("returns a defensive copy so the isolation view cannot mutate the scope", () => {
    const scope: ModificationScope = {
      kind: "selection",
      label: "Levels 3-5",
      floorNos: [3, 4, 5],
    };

    const floors = isolationFloors(scope);

    expect(floors).toEqual([3, 4, 5]);
    expect(floors).not.toBe(scope.floorNos);

    floors!.push(99);
    floors!.sort((a, b) => b - a);
    expect(scope.floorNos).toEqual([3, 4, 5]);
  });

  it("passes a real level scope straight through, negative floors included", async () => {
    const levels = groupOf(await treeFor(WITH_BASEMENTS), "group:levels").children;
    const basement = levels.find((level) => level.floorNo! < 0)!;

    expect(isolationFloors(basement.scope)).toEqual([basement.floorNo]);
  });
});
