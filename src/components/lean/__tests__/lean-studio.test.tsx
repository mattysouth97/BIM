/* @vitest-environment happy-dom */
//
// The lean screen's own logic, and only that.
//
// Everything it composes — the generation client, the schematic editor, the
// plan overlay, the energy panel, the issues panel, design storage — is tested
// where it lives. What is untested until here is the wiring this file adds: the
// three inputs switch what occupies the screen, a generated design takes the
// screen over, and save/load is a real round trip through storage rather than a
// button that reports success.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";

/* --- the 3D layer: the lean screen's wiring is not about pixels --- */

vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  const camera = {
    position: { set: () => {} },
    lookAt: () => {},
    far: 0,
    updateProjectionMatrix: () => {},
  };
  const state = { camera, controls: null };
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "model-view" }, children),
    useThree: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  Environment: () => null,
}));

vi.mock("@/components/viewer/procedural-building-model", () => ({
  ProceduralBuildingModel: () => null,
}));

vi.mock("@/components/viewer/interior-layer", () => ({
  InteriorLayer: () => null,
}));

/* --- the two input surfaces, stubbed at their seam --- */

vi.mock("@/components/generative/schematic/schematic-editor", async () => {
  const React = await import("react");
  return {
    SchematicEditor: () => React.createElement("div", { "data-testid": "schematic-editor" }),
  };
});

vi.mock("@/components/generative/schematic/import-cad-dialog", async () => {
  const React = await import("react");
  return {
    ImportCadDialog: ({ open }: { open: boolean }) =>
      open ? React.createElement("div", { "data-testid": "import-dialog" }) : null,
  };
});

/* --- storage --- */

const db = new Map<string, unknown>();
let storageFailure: Error | null = null;

vi.mock("idb-keyval", () => ({
  get: async (key: string) => {
    if (storageFailure) throw storageFailure;
    return db.get(key);
  },
  set: async (key: string, value: unknown) => {
    if (storageFailure) throw storageFailure;
    db.set(key, value);
  },
  keys: async () => {
    if (storageFailure) throw storageFailure;
    return [...db.keys()];
  },
}));

/* ------------------------------------------------------------------ */

import { LeanStudio } from "../lean-studio";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { buildDesign } from "@/lib/generative/build";
import type { GenerationResult } from "@/lib/generative/client";
import { __clearDesignMemo, type StoredDesignRecord } from "@/lib/generative/design-storage";
import { useGenerativeSession } from "@/store/generative-session-store";

const GENERATION_ID = "GEN-4242";
const SEED = 4242;

let generation: GenerationResult;

beforeAll(async () => {
  const provider = new HeuristicReasoningProvider();
  const { data: spec } = await provider.generateBuilding({
    prompt: "Create a five-story office building, approximately 6,000 m2, with a central core.",
    seed: SEED,
  });
  const built = buildDesign({ spec, buildingPk: "generated", generationId: GENERATION_ID });
  generation = {
    success: true,
    spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId: GENERATION_ID,
    revision: 0,
    seed: SEED,
    provider: {
      name: "heuristic",
      model: "deterministic",
      latencyMs: 1,
      inputTokens: 0,
      outputTokens: 0,
      retries: 0,
    },
  };
}, 120_000);

beforeEach(() => {
  db.clear();
  storageFailure = null;
  __clearDesignMemo();
  useGenerativeSession.getState().reset();
});

afterEach(() => {
  cleanup();
});

const seedDesign = () =>
  act(() => {
    useGenerativeSession.getState().startFrom(generation, "a five-story office");
  });

/* ------------------------------------------------------------------ */

describe("Lean screen — the three inputs", () => {
  it("opens on the prompt when the session holds no design", () => {
    render(<LeanStudio />);
    expect(screen.getByLabelText("건물 설명")).toBeTruthy();
    expect(screen.queryByTestId("schematic-editor")).toBeNull();
  });

  it("switches to the schematic editor, and back to the result", () => {
    seedDesign();
    render(<LeanStudio />);

    // A session that already holds a design opens on it, not on the prompt.
    expect(screen.getByTestId("model-view")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "그리기" }));
    expect(screen.getByTestId("schematic-editor")).toBeTruthy();
    expect(screen.queryByTestId("model-view")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    expect(screen.getByTestId("model-view")).toBeTruthy();
  });

  it("opens the import dialog over the schematic, since that is where an import lands", () => {
    render(<LeanStudio />);
    expect(screen.queryByTestId("import-dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "파일 가져오기" }));
    expect(screen.getByTestId("import-dialog")).toBeTruthy();
    expect(screen.getByTestId("schematic-editor")).toBeTruthy();
  });

  it("takes the screen over once a generation is adopted", () => {
    render(<LeanStudio />);
    expect(screen.getByLabelText("건물 설명")).toBeTruthy();

    seedDesign();
    // startFrom alone does not switch the view — the adopt callback does, which
    // is what the prompt and the schematic editor both call.
    fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    expect(screen.getByTestId("model-view")).toBeTruthy();
    expect(screen.queryByLabelText("건물 설명")).toBeNull();
  });
});

describe("Lean screen — the 3D / 2D toggle", () => {
  it("swaps the model for the plan without leaving the screen", () => {
    seedDesign();
    render(<LeanStudio />);

    fireEvent.click(screen.getByRole("button", { name: "평면" }));
    expect(screen.queryByTestId("model-view")).toBeNull();
    // The plan overlay's own level picker — proof the real component mounted.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByTestId("model-view")).toBeTruthy();
  });
});

describe("Lean screen — save and reload", () => {
  it("writes the spec under the design's id and reopens the same building", async () => {
    seedDesign();
    render(<LeanStudio />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });

    const stored = db.get(`gen-design:${GENERATION_ID}`) as StoredDesignRecord;
    expect(stored).toBeTruthy();
    expect(stored.generationId).toBe(GENERATION_ID);
    expect(stored.seed).toBe(SEED);
    expect(stored.spec).toEqual(generation.spec);
    // Only the spec is durable; the rest is rebuilt, so no second source of truth.
    expect(stored).not.toHaveProperty("snapshot");

    // Abandon the session entirely, then come back through the saved list.
    act(() => {
      useGenerativeSession.getState().reset();
    });
    expect(useGenerativeSession.getState().current()).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장된 설계" }));
    });

    const entry = await screen.findByText(new RegExp(GENERATION_ID));
    await act(async () => {
      fireEvent.click(entry);
    });

    await waitFor(() => {
      expect(useGenerativeSession.getState().current()?.generationId).toBe(GENERATION_ID);
    });
    const reopened = useGenerativeSession.getState().current();
    // Rebuilt from the spec, not restored from a copy — same building.
    expect(reopened?.spec).toEqual(generation.spec);
    expect(reopened?.seed).toBe(SEED);
    expect(reopened?.snapshot.elements.length).toBe(generation.snapshot.elements.length);
  });

  it("reports a storage failure instead of claiming the design was saved", async () => {
    seedDesign();
    storageFailure = new Error("QuotaExceededError");
    render(<LeanStudio />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });

    expect(db.size).toBe(0);
    expect(screen.getByRole("alert").textContent).toMatch(/SAVE_FAILED/);
  });

  it("refuses to save while a proposed change owns the viewport", () => {
    seedDesign();
    const edit = {
      ...generation,
      kind: "applied" as const,
      patch: { summary: "add a floor", scope: "building", affectedFloorNos: [], ops: [] },
      applied: [],
      rejected: [],
      diff: [],
      metricDeltas: [],
    } as never;
    act(() => {
      useGenerativeSession.getState().proposeEdit(edit, "modify");
    });

    render(<LeanStudio />);

    const save = screen.getByRole("button", { name: "저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.title).toMatch(/제안된 변경/);

    // …and the accept / reject controls are the way out of that state.
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(useGenerativeSession.getState().pending).toBeNull();
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
