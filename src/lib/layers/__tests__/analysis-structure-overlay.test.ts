// Unit tests for the 구조 analysis overlay builders.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type {
  BimElement,
  BimModelSnapshot,
  BimPlacement,
} from "@/lib/bim/model/types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import {
  buildStructureOverlay,
  collectStructureFromRecipe,
  collectStructureFromSnapshot,
  collectStructureModel,
  hasStructuralElements,
} from "../analysis/structure-overlay";

const AT = (x: number, z: number, rotationY = 0): BimPlacement => ({
  x,
  y: 0,
  z,
  rotationY,
});

function el(partial: Partial<BimElement> & { id: string; category: string }): BimElement {
  return {
    origin: "generated",
    kind: "column",
    family: "f",
    typeId: "t",
    buildingPk: "GEN-0001",
    levelId: "level:1",
    hostId: null,
    mark: partial.id,
    instanceParameters: {},
    placement: AT(0, 0),
    phaseCreated: "new",
    visible: true,
    ...partial,
  } as BimElement;
}

function makeSnapshot(overrides: Partial<BimModelSnapshot> = {}): BimModelSnapshot {
  return {
    buildingPk: "GEN-0001",
    levels: [
      {
        id: "level:1",
        name: "1F",
        elevation: 0,
        height: 4,
        floorNo: 1,
        associatedViewId: "v1",
      },
      {
        id: "level:2",
        name: "2F",
        elevation: 4,
        height: 3.5,
        floorNo: 2,
        associatedViewId: "v2",
      },
    ],
    grids: [
      { id: "grid:x:0", name: "A", axis: "x", offset: -6 },
      { id: "grid:x:1", name: "B", axis: "x", offset: 6 },
      { id: "grid:z:0", name: "1", axis: "z", offset: -4 },
    ],
    types: {},
    elements: [
      el({
        id: "COL-1",
        category: "Structural Columns",
        kind: "column",
        system: "structure",
        placement: AT(-6, -4),
        instanceParameters: { widthMm: 600, depthMm: 500 },
      }),
      el({
        id: "COL-2",
        category: "Structural Columns",
        kind: "column",
        system: "structure",
        levelId: "level:2",
        placement: AT(6, -4),
        instanceParameters: { widthMm: 600, depthMm: 600 },
      }),
      el({
        id: "BEAM-1",
        category: "Structural Framing",
        kind: "beam",
        system: "structure",
        placement: AT(0, -4, 0),
        instanceParameters: { lengthM: 12, depthMm: 700, widthMm: 300 },
      }),
      el({
        id: "SLAB-1",
        category: "Floors",
        kind: "slab",
        system: "structure",
        levelId: "level:2",
        instanceParameters: {
          thicknessMm: 210,
          widthM: 24,
          depthM: 16,
          outlineJson: JSON.stringify([
            [
              [-12, -8],
              [12, -8],
              [12, 8],
              [-12, 8],
            ],
          ]),
        },
      }),
      el({
        id: "CORE-WALL-1",
        category: "Walls",
        kind: "wall",
        system: "core",
        instanceParameters: {
          startX: -2,
          startZ: 0,
          endX: 2,
          endZ: 0,
          lengthM: 4,
          thicknessMm: 250,
          unconnectedHeightM: 4,
        },
      }),
      // Not structure: must be ignored entirely.
      el({
        id: "ROOM-1",
        category: "Rooms",
        kind: "room",
        system: "partitions",
        instanceParameters: { areaM2: 40, widthM: 8, depthM: 5 },
      }),
    ],
    documents: [],
    visibility: {},
    ...overrides,
  };
}

function floors(count: number, height = 3): FloorSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * height,
    height,
    isGroundFloor: i === 0,
  }));
}

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  return {
    footprintWidth: 24,
    footprintDepth: 16,
    floors: floors(2),
    totalHeight: 6,
    wallThickness: 0.2,
    column: { spacing: 6, size: 0.5, inset: 1 },
    slab: { thickness: 0.25, overhang: 0 },
    ...overrides,
  } as unknown as BuildingRecipe;
}

describe("hasStructuralElements", () => {
  it("detects structural categories and the core system", () => {
    expect(hasStructuralElements(makeSnapshot())).toBe(true);
    expect(hasStructuralElements(null)).toBe(false);
    expect(
      hasStructuralElements(
        makeSnapshot({
          elements: [el({ id: "R", category: "Rooms", kind: "room", system: "partitions" })],
        }),
      ),
    ).toBe(false);
  });
});

describe("collectStructureFromSnapshot", () => {
  it("collects each structural category into its own bucket", () => {
    const model = collectStructureFromSnapshot(makeSnapshot());
    expect(model.source).toBe("snapshot");
    expect(model.columns).toHaveLength(2);
    expect(model.beams).toHaveLength(1);
    expect(model.slabs).toHaveLength(1);
    expect(model.core).toHaveLength(1);
    expect(model.grids).toHaveLength(3);
  });

  it("takes elevation from the element's level, not placement.y", () => {
    const model = collectStructureFromSnapshot(makeSnapshot());
    const l1 = model.columns.find((c) => c.id === "COL-1")!;
    const l2 = model.columns.find((c) => c.id === "COL-2")!;
    // level:1 spans 0..4, level:2 spans 4..7.5 — centres at 2 and 5.75.
    expect(l1.y).toBeCloseTo(2, 6);
    expect(l1.height).toBeCloseTo(4, 6);
    expect(l2.y).toBeCloseTo(5.75, 6);
    expect(l2.height).toBeCloseTo(3.5, 6);
  });

  it("converts column mm parameters to metres", () => {
    const col = collectStructureFromSnapshot(makeSnapshot()).columns[0];
    expect(col.width).toBeCloseTo(0.6, 6);
    expect(col.depth).toBeCloseTo(0.5, 6);
  });

  it("hangs beams from the top of their storey", () => {
    const beam = collectStructureFromSnapshot(makeSnapshot()).beams[0];
    // level:1 top = 4, beam depth 0.7 → centre at 4 - 0.35.
    expect(beam.y).toBeCloseTo(3.65, 6);
    expect(beam.width).toBeCloseTo(12, 6);
    expect(beam.height).toBeCloseTo(0.7, 6);
    expect(beam.depth).toBeCloseTo(0.3, 6);
  });

  it("parses the slab's real outline", () => {
    const slab = collectStructureFromSnapshot(makeSnapshot()).slabs[0];
    expect(slab.rings).not.toBeNull();
    expect(slab.rings![0]).toHaveLength(4);
    expect(slab.topY).toBeCloseTo(4, 6);
    expect(slab.thicknessM).toBeCloseTo(0.21, 6);
  });

  it("falls back to the bbox when the outline JSON is unusable", () => {
    const snapshot = makeSnapshot();
    const slabEl = snapshot.elements.find((e) => e.id === "SLAB-1")!;
    slabEl.instanceParameters.outlineJson = "not json";
    expect(collectStructureFromSnapshot(snapshot).slabs[0].rings).toBeNull();
  });

  it("builds a core wall from its start/end run", () => {
    const core = collectStructureFromSnapshot(makeSnapshot()).core[0];
    expect(core.x).toBeCloseTo(0, 6);
    expect(core.z).toBeCloseTo(0, 6);
    expect(core.width).toBeCloseTo(4, 6);
    expect(core.depth).toBeCloseTo(0.25, 6);
    expect(core.rotationY).toBeCloseTo(0, 6);
  });

  it("skips elements whose level cannot be resolved", () => {
    const snapshot = makeSnapshot();
    snapshot.elements.find((e) => e.id === "COL-1")!.levelId = "level:99";
    expect(collectStructureFromSnapshot(snapshot).columns).toHaveLength(1);
  });
});

describe("collectStructureFromRecipe", () => {
  it("derives one column per grid position per floor and one slab per floor", () => {
    const recipe = makeRecipe();
    const model = collectStructureFromRecipe(recipe);
    expect(model.source).toBe("recipe");
    expect(model.slabs).toHaveLength(recipe.floors.length);
    expect(model.columns.length).toBeGreaterThan(0);
    expect(model.columns.length % recipe.floors.length).toBe(0);
  });

  it("synthesises no beams and no grid lines", () => {
    const model = collectStructureFromRecipe(makeRecipe());
    expect(model.beams).toEqual([]);
    expect(model.grids).toEqual([]);
  });

  it("is deterministic", () => {
    const recipe = makeRecipe();
    expect(collectStructureFromRecipe(recipe)).toEqual(
      collectStructureFromRecipe(recipe),
    );
  });
});

describe("collectStructureModel", () => {
  it("prefers the snapshot when it has structure for this building", () => {
    const model = collectStructureModel({
      snapshot: makeSnapshot(),
      recipe: makeRecipe(),
      buildingPk: "GEN-0001",
    });
    expect(model.source).toBe("snapshot");
  });

  it("falls back to the recipe for a snapshot of a different building", () => {
    const model = collectStructureModel({
      snapshot: makeSnapshot(),
      recipe: makeRecipe(),
      buildingPk: "demo",
    });
    expect(model.source).toBe("recipe");
  });

  it("falls back to the recipe when the snapshot has no structure", () => {
    const model = collectStructureModel({
      snapshot: makeSnapshot({
        elements: [el({ id: "R", category: "Rooms", kind: "room", system: "partitions" })],
      }),
      recipe: makeRecipe(),
      buildingPk: "GEN-0001",
    });
    expect(model.source).toBe("recipe");
  });
});

describe("buildStructureOverlay", () => {
  const model = collectStructureFromSnapshot(makeSnapshot());

  it("emits one instanced mesh per populated role plus slabs and grids", () => {
    const group = buildStructureOverlay({ model, halfExtentM: 30, gridY: 0.05 });
    const names = group.children.map((c) => c.name);
    expect(names).toEqual([
      "structure-columns",
      "structure-beams",
      "structure-cores",
      "structure-slabs",
      "structure-grids",
    ]);
  });

  it("matches instance counts to the collected element counts", () => {
    const group = buildStructureOverlay({ model, halfExtentM: 30, gridY: 0.05 });
    const columns = group.getObjectByName("structure-columns") as THREE.InstancedMesh;
    const beams = group.getObjectByName("structure-beams") as THREE.InstancedMesh;
    expect(columns.count).toBe(model.columns.length);
    expect(beams.count).toBe(model.beams.length);
    expect(group.getObjectByName("structure-slabs")!.children).toHaveLength(
      model.slabs.length,
    );
  });

  it("draws one grid segment per BimGrid entry", () => {
    const group = buildStructureOverlay({ model, halfExtentM: 30, gridY: 0.05 });
    const lines = group.getObjectByName("structure-grids") as THREE.LineSegments;
    const positions = lines.geometry.getAttribute("position");
    expect(positions.count).toBe(model.grids.length * 2);
  });

  it("omits roles that have no elements", () => {
    const group = buildStructureOverlay({
      model: collectStructureFromRecipe(makeRecipe()),
      halfExtentM: 30,
      gridY: 0.05,
    });
    const names = group.children.map((c) => c.name);
    expect(names).not.toContain("structure-beams");
    expect(names).not.toContain("structure-grids");
    expect(names).toContain("structure-columns");
  });

  it("is deterministic — two builds produce identical instance matrices", () => {
    const dump = () => {
      const g = buildStructureOverlay({ model, halfExtentM: 30, gridY: 0.05 });
      const im = g.getObjectByName("structure-columns") as THREE.InstancedMesh;
      return Array.from(im.instanceMatrix.array);
    };
    expect(dump()).toEqual(dump());
  });
});
