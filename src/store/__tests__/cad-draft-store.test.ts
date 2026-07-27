// src/store/__tests__/cad-draft-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCadDraftStore, type DraftStorage } from "../cad-draft-store";
import { useCadViewerStore } from "../cad-viewer-store";
import type { CadDocument } from "@/lib/cad/doc/types";

function memoryStorage(): DraftStorage & { data: Map<string, CadDocument> } {
  const data = new Map<string, CadDocument>();
  return {
    data,
    load: async (k) => data.get(k),
    save: async (k, d) => { data.set(k, d); },
  };
}

const S = () => useCadDraftStore.getState();

describe("cad-draft-store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    S()._setStorage(storage);
    useCadDraftStore.setState({
      doc: null, past: [], future: [], activeLayer: "0",
      selectedEntityId: null, persistKey: null,
    });
    useCadViewerStore.setState({ doc: null, layerVisibility: {} });
  });

  it("newDrawing seeds a blank doc with a DRAFT layer and syncs the viewer", () => {
    S().newDrawing("my-plan", "cad-draft:pk1");
    const doc = S().doc!;
    expect(doc.id).toBe("my-plan");
    expect(doc.entities).toHaveLength(0);
    expect(doc.layers.map((l) => l.name)).toContain("DRAFT");
    expect(S().activeLayer).toBe("DRAFT");
    expect(useCadViewerStore.getState().doc?.id).toBe("my-plan");
  });

  it("addEntity assigns continuing ids + active layer and grows extents", () => {
    S().newDrawing("d", "k");
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 30, y: 0 } });
    const doc = S().doc!;
    expect(doc.entities[0].id).toBe("e0");
    expect(doc.entities[0].layer).toBe("DRAFT");
    expect(doc.extents.max.x).toBe(30);
    S().addEntity({ kind: "circle", center: { x: 0, y: 0 }, radius: 2 });
    expect(S().doc!.entities[1].id).toBe("e1");
    expect(S().doc!.extents.min.x).toBeCloseTo(-2, 6);
  });

  it("continues e{n} ids from an existing base doc", () => {
    S().newDrawing("d", "k");
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    const base = S().doc!;
    useCadDraftStore.setState({ doc: null, past: [], future: [] });
    S().startDraft(base, "k2");
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 2, y: 0 } });
    expect(S().doc!.entities[1].id).toBe("e1");
  });

  it("undo/redo round-trips and new mutations clear the redo stack", () => {
    S().newDrawing("d", "k");
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 2, y: 0 } });
    expect(S().doc!.entities).toHaveLength(2);
    S().undo();
    expect(S().doc!.entities).toHaveLength(1);
    S().redo();
    expect(S().doc!.entities).toHaveLength(2);
    S().undo();
    S().addEntity({ kind: "circle", center: { x: 0, y: 0 }, radius: 1 });
    S().redo(); // stack cleared → no-op
    expect(S().doc!.entities).toHaveLength(2);
    expect(S().doc!.entities[1].kind).toBe("circle");
  });

  it("deleteEntity removes and clears selection", () => {
    S().newDrawing("d", "k");
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    S().selectEntity("e0");
    S().deleteEntity("e0");
    expect(S().doc!.entities).toHaveLength(0);
    expect(S().selectedEntityId).toBeNull();
  });

  it("addLayer creates + activates; setActiveLayer switches", () => {
    S().newDrawing("d", "k");
    S().addLayer("WALLS", 1);
    expect(S().doc!.layers.map((l) => l.name)).toContain("WALLS");
    expect(S().activeLayer).toBe("WALLS");
    S().setActiveLayer("DRAFT");
    expect(S().activeLayer).toBe("DRAFT");
  });

  it("persists on mutation and loadDraft restores", async () => {
    S().newDrawing("d", "key1");
    S().addEntity({ kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    await Promise.resolve();
    expect(storage.data.get("key1")?.entities).toHaveLength(1);
    const restored = await S().loadDraft("key1");
    expect(restored?.entities).toHaveLength(1);
    expect(await S().loadDraft("missing")).toBeNull();
  });
});

describe("cad-viewer-store.updateDoc", () => {
  it("preserves existing toggles, defaults new layers visible", () => {
    const base: CadDocument = {
      id: "d", entities: [], unitScaleToMeters: 1,
      layers: [{ name: "A", colorIndex: 1, visible: true }],
      extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
      warnings: [], stats: { totalParsed: 0, mapped: 0, skipped: {} },
    };
    useCadViewerStore.getState().openViewer(base);
    useCadViewerStore.getState().toggleLayer("A"); // hide A
    const next = {
      ...base,
      layers: [...base.layers, { name: "B", colorIndex: 3, visible: true }],
    };
    useCadViewerStore.getState().updateDoc(next);
    const s = useCadViewerStore.getState();
    expect(s.doc?.layers).toHaveLength(2);
    expect(s.layerVisibility.A).toBe(false); // toggle preserved
    expect(s.layerVisibility.B).toBe(true);  // new layer visible
  });
});
