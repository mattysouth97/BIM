import { describe, it, expect, beforeEach } from "vitest";
import { useAnnotationStore, annotationsForBuilding } from "../annotation-store";
import { useActiveBuildingStore } from "../active-building-store";
import type { ScopedAnnotation } from "../annotation-store";
import type {
  DimensionAnnotation,
  AreaLabelAnnotation,
  LevelMarkerAnnotation,
  SectionPlaneAnnotation,
  ElementId,
} from "../annotation-store";

// ── Factories ─────────────────────────────────────────────────────────────────

function makeDimension(overrides: Partial<DimensionAnnotation> = {}): DimensionAnnotation {
  return {
    id: "dim-1",
    kind: "dimension",
    createdAt: "2026-04-12T00:00:00Z",
    params: {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 5, y: 0, z: 0 },
    },
    ...overrides,
  };
}

function makeAreaLabel(overrides: Partial<AreaLabelAnnotation> = {}): AreaLabelAnnotation {
  return {
    id: "area-1",
    kind: "area-label",
    createdAt: "2026-04-12T00:00:00Z",
    params: {
      area: 42.5,
      position: { x: 2, y: 0, z: 2 },
    },
    ...overrides,
  };
}

function makeLevelMarker(overrides: Partial<LevelMarkerAnnotation> = {}): LevelMarkerAnnotation {
  return {
    id: "level-1",
    kind: "level-marker",
    createdAt: "2026-04-12T00:00:00Z",
    params: {
      elevation: 3.0,
      label: "1FL",
      width: 10,
    },
    ...overrides,
  };
}

function makeSectionPlane(overrides: Partial<SectionPlaneAnnotation> = {}): SectionPlaneAnnotation {
  return {
    id: "section-1",
    kind: "section-plane",
    createdAt: "2026-04-12T00:00:00Z",
    params: {
      axis: "x",
      position: 5,
      size: 20,
    },
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAnnotationStore.setState({ annotations: [], selectedAnnotationId: null });
  useActiveBuildingStore.getState().clearActiveBuilding();
});

// ── addAnnotation ─────────────────────────────────────────────────────────────

describe("addAnnotation", () => {
  it("adds a dimension annotation to empty store", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension());
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useAnnotationStore.getState().annotations[0].kind).toBe("dimension");
  });

  it("adds all four annotation kinds", () => {
    const { addAnnotation } = useAnnotationStore.getState();
    addAnnotation(makeDimension());
    addAnnotation(makeAreaLabel());
    addAnnotation(makeLevelMarker());
    addAnnotation(makeSectionPlane());
    expect(useAnnotationStore.getState().annotations).toHaveLength(4);
  });

  it("preserves order of insertion", () => {
    const { addAnnotation } = useAnnotationStore.getState();
    addAnnotation(makeDimension({ id: "a" }));
    addAnnotation(makeAreaLabel({ id: "b" }));
    const ids = useAnnotationStore.getState().annotations.map((a) => a.id);
    expect(ids).toEqual(["a", "b"]);
  });
});

// ── removeAnnotation ──────────────────────────────────────────────────────────

describe("removeAnnotation", () => {
  it("removes annotation by id", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "dim-x" }));
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "area-x" }));
    useAnnotationStore.getState().removeAnnotation("dim-x");
    const annos = useAnnotationStore.getState().annotations;
    expect(annos).toHaveLength(1);
    expect(annos[0].id).toBe("area-x");
  });

  it("is a no-op when id does not exist", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "keep" }));
    useAnnotationStore.getState().removeAnnotation("no-such-id");
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it("clears selectedAnnotationId when removing selected annotation", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "sel" }));
    useAnnotationStore.setState({ selectedAnnotationId: "sel" });
    useAnnotationStore.getState().removeAnnotation("sel");
    expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
  });

  it("keeps selectedAnnotationId when removing a different annotation", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "a" }));
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "b" }));
    useAnnotationStore.setState({ selectedAnnotationId: "b" });
    useAnnotationStore.getState().removeAnnotation("a");
    expect(useAnnotationStore.getState().selectedAnnotationId).toBe("b");
  });
});

// ── updateAnnotation ──────────────────────────────────────────────────────────

describe("updateAnnotation", () => {
  it("patches params on a dimension annotation", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1" }));
    useAnnotationStore.getState().updateAnnotation("d1", {
      params: { start: { x: 1, y: 0, z: 0 }, end: { x: 9, y: 0, z: 0 } },
    });
    const anno = useAnnotationStore.getState().annotations[0] as DimensionAnnotation;
    expect(anno.params.end.x).toBe(9);
    expect(anno.params.start.x).toBe(1);
  });

  it("patches anchorElementId", () => {
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "ar1" }));
    useAnnotationStore.getState().updateAnnotation("ar1", {
      anchorElementId: "elem-abc" as ElementId,
    });
    expect(useAnnotationStore.getState().annotations[0].anchorElementId).toBe("elem-abc");
  });

  it("is a no-op when id does not exist", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1" }));
    useAnnotationStore.getState().updateAnnotation("unknown", { anchorElementId: "x" as ElementId });
    // original unmodified
    expect(useAnnotationStore.getState().annotations[0].anchorElementId).toBeUndefined();
  });

  it("does not affect other annotations", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1" }));
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "ar1" }));
    useAnnotationStore.getState().updateAnnotation("d1", {
      anchorElementId: "elem-x" as ElementId,
    });
    expect(useAnnotationStore.getState().annotations[1].anchorElementId).toBeUndefined();
  });
});

// ── clearAll ──────────────────────────────────────────────────────────────────

describe("clearAll", () => {
  it("removes all annotations", () => {
    const { addAnnotation, clearAll } = useAnnotationStore.getState();
    addAnnotation(makeDimension());
    addAnnotation(makeAreaLabel());
    clearAll();
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);
  });

  it("clears selectedAnnotationId", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1" }));
    useAnnotationStore.setState({ selectedAnnotationId: "d1" });
    useAnnotationStore.getState().clearAll();
    expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
  });
});

// ── removeByAnchor ────────────────────────────────────────────────────────────

describe("removeByAnchor", () => {
  it("removes all annotations anchored to a given elementId", () => {
    const anchor = "elem-wall-1" as ElementId;
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1", anchorElementId: anchor }));
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "ar1", anchorElementId: anchor }));
    useAnnotationStore.getState().addAnnotation(makeLevelMarker({ id: "lv1" })); // no anchor
    useAnnotationStore.getState().removeByAnchor(anchor);
    const remaining = useAnnotationStore.getState().annotations;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("lv1");
  });

  it("is a no-op when no annotations match anchor", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1" }));
    useAnnotationStore.getState().removeByAnchor("no-such-element" as ElementId);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it("clears selectedAnnotationId if selected annotation was anchored", () => {
    const anchor = "elem-col-7" as ElementId;
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1", anchorElementId: anchor }));
    useAnnotationStore.setState({ selectedAnnotationId: "d1" });
    useAnnotationStore.getState().removeByAnchor(anchor);
    expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
  });

  it("keeps selectedAnnotationId if selected annotation was NOT anchored to target", () => {
    const anchor = "elem-A" as ElementId;
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1", anchorElementId: anchor }));
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "ar1", anchorElementId: "elem-B" as ElementId }));
    useAnnotationStore.setState({ selectedAnnotationId: "ar1" });
    useAnnotationStore.getState().removeByAnchor(anchor);
    expect(useAnnotationStore.getState().selectedAnnotationId).toBe("ar1");
    expect(useAnnotationStore.getState().annotations[0].id).toBe("ar1");
  });

  it("removes multiple annotations with same anchor in one call", () => {
    const anchor = "elem-multi" as ElementId;
    for (let i = 0; i < 5; i++) {
      useAnnotationStore.getState().addAnnotation(makeDimension({ id: `d${i}`, anchorElementId: anchor }));
    }
    useAnnotationStore.getState().addAnnotation(makeSectionPlane({ id: "s-keep" }));
    useAnnotationStore.getState().removeByAnchor(anchor);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useAnnotationStore.getState().annotations[0].id).toBe("s-keep");
  });
});

// ── selectAnnotation ──────────────────────────────────────────────────────────

describe("selectAnnotation", () => {
  it("sets selectedAnnotationId", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "d1" }));
    useAnnotationStore.getState().selectAnnotation("d1");
    expect(useAnnotationStore.getState().selectedAnnotationId).toBe("d1");
  });

  it("deselects when passed null", () => {
    useAnnotationStore.setState({ selectedAnnotationId: "d1" });
    useAnnotationStore.getState().selectAnnotation(null);
    expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
  });
});

// ── persist partialize ────────────────────────────────────────────────────────

describe("persist partialize", () => {
  it("selectedAnnotationId is not included in the partialize output", () => {
    // The partialize function in the store only returns { annotations }.
    // We verify by checking the store's persist options directly.
    // Access the store's internal persist API to call partialize.
    const storeApi = useAnnotationStore as unknown as {
      persist: { getOptions: () => { partialize: (s: typeof useAnnotationStore extends { getState: () => infer S } ? S : never) => unknown };
      };
    };
    const partialize = storeApi.persist.getOptions().partialize;
    const fullState = useAnnotationStore.getState();
    const persisted = partialize(fullState) as Record<string, unknown>;
    expect(Object.keys(persisted)).toEqual(["annotations"]);
    expect(persisted).not.toHaveProperty("selectedAnnotationId");
  });

  it("annotations array round-trips through JSON (simulate localStorage)", () => {
    const dim = makeDimension({ id: "round-trip-1" });
    useAnnotationStore.getState().addAnnotation(dim);

    const serialised = JSON.stringify({ annotations: useAnnotationStore.getState().annotations });
    const parsed = JSON.parse(serialised) as { annotations: ScopedAnnotation[] };

    // Restore into a fresh state
    useAnnotationStore.setState({ annotations: parsed.annotations, selectedAnnotationId: null });

    const restored = useAnnotationStore.getState().annotations[0] as DimensionAnnotation;
    expect(restored.id).toBe("round-trip-1");
    expect(restored.kind).toBe("dimension");
    expect(restored.params.end.x).toBe(5);
    expect(restored.createdAt).toBe("2026-04-12T00:00:00Z");
  });
});

// ── building scoping (P2-16) ──────────────────────────────────────────────────

describe("building scoping (P2-16)", () => {
  it("stamps the active buildingPk at add time", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useAnnotationStore.getState().addAnnotation(makeDimension());
    expect(useAnnotationStore.getState().annotations[0].buildingPk).toBe("bldg-A");
  });

  it("stamps null when no building is active", () => {
    useAnnotationStore.getState().addAnnotation(makeDimension());
    expect(useAnnotationStore.getState().annotations[0].buildingPk).toBeNull();
  });

  it("isolates two buildings — A's annotations never appear on B", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "a-dim" }));
    useAnnotationStore.getState().addAnnotation(makeAreaLabel({ id: "a-area" }));

    useActiveBuildingStore.getState().setActiveBuilding("bldg-B");
    // Same anchorElementId as could collide across buildings — the original bug
    useAnnotationStore
      .getState()
      .addAnnotation(makeDimension({ id: "b-dim", anchorElementId: "elem-1" as ElementId }));

    const all = useAnnotationStore.getState().annotations;
    expect(annotationsForBuilding(all, "bldg-A").map((a) => a.id)).toEqual(["a-dim", "a-area"]);
    expect(annotationsForBuilding(all, "bldg-B").map((a) => a.id)).toEqual(["b-dim"]);
  });

  it("same-building reload still shows them (scope survives JSON round-trip)", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useAnnotationStore.getState().addAnnotation(makeDimension({ id: "keep-a" }));

    const serialised = JSON.stringify({ annotations: useAnnotationStore.getState().annotations });
    const parsed = JSON.parse(serialised) as { annotations: ScopedAnnotation[] };
    useAnnotationStore.setState({ annotations: parsed.annotations, selectedAnnotationId: null });

    const forA = annotationsForBuilding(useAnnotationStore.getState().annotations, "bldg-A");
    expect(forA.map((a) => a.id)).toEqual(["keep-a"]);
  });

  it("legacy null-scoped annotations are not attributed to any specific building", () => {
    const legacy: ScopedAnnotation = { ...makeDimension({ id: "legacy" }), buildingPk: null };
    useAnnotationStore.setState({ annotations: [legacy], selectedAnnotationId: null });
    expect(annotationsForBuilding(useAnnotationStore.getState().annotations, "bldg-A")).toEqual([]);
    expect(
      annotationsForBuilding(useAnnotationStore.getState().annotations, null).map((a) => a.id)
    ).toEqual(["legacy"]);
  });
});

// ── persist migrate v2 (P2-16) ────────────────────────────────────────────────

describe("persist migrate v2 (P2-16)", () => {
  const getMigrate = () => {
    const storeApi = useAnnotationStore as unknown as {
      persist: { getOptions: () => { migrate: (p: unknown, v: number) => unknown } };
    };
    return storeApi.persist.getOptions().migrate;
  };

  it("stamps legacy v1 annotations with buildingPk null", () => {
    const migrated = getMigrate()(
      { annotations: [makeDimension({ id: "old-1" }), makeAreaLabel({ id: "old-2" })] },
      1
    ) as { annotations: ScopedAnnotation[] };
    expect(migrated.annotations.map((a) => a.buildingPk)).toEqual([null, null]);
    expect(migrated.annotations.map((a) => a.id)).toEqual(["old-1", "old-2"]);
  });

  it("adopts unversioned v0 payloads the same way", () => {
    const migrated = getMigrate()({ annotations: [makeDimension({ id: "v0" })] }, 0) as {
      annotations: ScopedAnnotation[];
    };
    expect(migrated.annotations[0].buildingPk).toBeNull();
  });

  it("falls back to defaults for unknown future versions", () => {
    expect(getMigrate()({ annotations: [] }, 3)).toBeUndefined();
  });

  it("falls back to defaults for malformed legacy payloads", () => {
    expect(getMigrate()({ annotations: "garbage" }, 1)).toBeUndefined();
    expect(getMigrate()(null, 1)).toBeUndefined();
  });
});
