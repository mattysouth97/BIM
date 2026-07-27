// src/store/__tests__/cad-markup-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCadMarkupStore, type CadMarkup, type MarkupStorage } from "../cad-markup-store";

function memoryStorage(): MarkupStorage & { data: Map<string, CadMarkup[]> } {
  const data = new Map<string, CadMarkup[]>();
  return {
    data,
    load: async (id) => data.get(id),
    save: async (id, m) => { data.set(id, m); },
  };
}

const note = (id: string): CadMarkup => ({
  id, kind: "note", position: { x: 1, y: 2 }, text: "hello",
});

describe("cad-markup-store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    useCadMarkupStore.getState()._setStorage(storage);
    useCadMarkupStore.setState({ docId: null, markups: [], tool: "pan" });
  });

  it("adds, updates, removes markups", () => {
    const s = useCadMarkupStore.getState();
    s.loadForDocument("doc1");
    useCadMarkupStore.getState().addMarkup(note("m1"));
    expect(useCadMarkupStore.getState().markups).toHaveLength(1);
    useCadMarkupStore.getState().updateMarkup("m1", { text: "edited" });
    expect(
      (useCadMarkupStore.getState().markups[0] as Extract<CadMarkup, { kind: "note" }>).text,
    ).toBe("edited");
    useCadMarkupStore.getState().removeMarkup("m1");
    expect(useCadMarkupStore.getState().markups).toHaveLength(0);
  });

  it("persists on mutation and restores on load", async () => {
    useCadMarkupStore.getState().loadForDocument("doc1");
    useCadMarkupStore.getState().addMarkup(note("m1"));
    await Promise.resolve(); // let async save flush
    expect(storage.data.get("doc1")).toHaveLength(1);

    useCadMarkupStore.getState().loadForDocument("doc2");
    expect(useCadMarkupStore.getState().markups).toHaveLength(0);

    useCadMarkupStore.getState().loadForDocument("doc1");
    await new Promise((r) => setTimeout(r, 0)); // async load
    expect(useCadMarkupStore.getState().markups).toHaveLength(1);
  });

  it("tool selection round-trips", () => {
    useCadMarkupStore.getState().setTool("measure");
    expect(useCadMarkupStore.getState().tool).toBe("measure");
  });
});
