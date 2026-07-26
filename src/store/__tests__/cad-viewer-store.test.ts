// src/store/__tests__/cad-viewer-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCadViewerStore } from "../cad-viewer-store";
import type { CadDocument } from "@/lib/cad/doc/types";

const doc: CadDocument = {
  id: "d1",
  layers: [
    { name: "WALLS", colorIndex: 1, visible: true },
    { name: "HIDDEN", colorIndex: 3, visible: false },
  ],
  entities: [], unitScaleToMeters: 1,
  extents: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  warnings: [], stats: { totalParsed: 0, mapped: 0, skipped: {} },
};

describe("cad-viewer-store", () => {
  beforeEach(() => useCadViewerStore.setState({ doc: null, layerVisibility: {} }));

  it("openViewer seeds visibility from the layer table", () => {
    useCadViewerStore.getState().openViewer(doc);
    const s = useCadViewerStore.getState();
    expect(s.doc?.id).toBe("d1");
    expect(s.layerVisibility).toEqual({ WALLS: true, HIDDEN: false });
  });

  it("toggleLayer flips one layer; setAllLayers floods", () => {
    useCadViewerStore.getState().openViewer(doc);
    useCadViewerStore.getState().toggleLayer("WALLS");
    expect(useCadViewerStore.getState().layerVisibility.WALLS).toBe(false);
    useCadViewerStore.getState().setAllLayers(true);
    expect(useCadViewerStore.getState().layerVisibility.HIDDEN).toBe(true);
  });

  it("closeViewer clears the doc", () => {
    useCadViewerStore.getState().openViewer(doc);
    useCadViewerStore.getState().closeViewer();
    expect(useCadViewerStore.getState().doc).toBeNull();
  });
});
