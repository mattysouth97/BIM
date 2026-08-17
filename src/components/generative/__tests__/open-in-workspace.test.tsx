/* @vitest-environment happy-dom */
//
// "Open in workspace" — the studio's one door into /building/[id].
//
// The design in the studio is session state; the workspace is a URL. This
// action is the seam between them, so what it must guarantee is narrow: the
// SPEC is durably written before anything navigates, the id it navigates to is
// the id it wrote, and a storage failure is reported rather than swallowed —
// navigating to a workspace that will 404 is the one outcome worse than not
// navigating at all.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

/* ------------------------------------------------------------------ */
/* The 3D layer and the router                                         */
/* ------------------------------------------------------------------ */

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
      React.createElement("div", { "data-testid": "r3f-canvas" }, children),
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

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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

import { GenerativeStudio } from "../generative-studio";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { buildDesign } from "@/lib/generative/build";
import type { GenerationResult } from "@/lib/generative/client";
import type { StoredDesignRecord } from "@/lib/generative/design-storage";
import { useGenerativeSession } from "@/store/generative-session-store";

const GENERATION_ID = "GEN-4242";
const SEED = 4242;

let generation: GenerationResult;

beforeAll(async () => {
  const provider = new HeuristicReasoningProvider();
  const { data: spec } = await provider.generateBuilding({
    prompt:
      "Create a five-story office building, approximately 6,000 m2, with a central core.",
    seed: SEED,
  });
  const built = buildDesign({
    spec,
    buildingPk: "generated",
    generationId: GENERATION_ID,
  });
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
  push.mockClear();
  useGenerativeSession.getState().reset();
  act(() => {
    useGenerativeSession.getState().startFrom(generation, "a five-story office");
  });
});

afterEach(() => {
  cleanup();
});

const header = () => within(screen.getByRole("banner"));
const openButton = () =>
  header().getByRole("button", { name: /Open in workspace|Saving/ }) as HTMLButtonElement;

/* ------------------------------------------------------------------ */

describe("Open in workspace", () => {
  it("saves the spec under the design's id, then navigates to it", async () => {
    render(<GenerativeStudio />);

    await act(async () => {
      fireEvent.click(openButton());
    });

    const stored = db.get(`gen-design:${GENERATION_ID}`) as StoredDesignRecord;
    expect(stored).toBeTruthy();
    expect(stored.generationId).toBe(GENERATION_ID);
    expect(stored.seed).toBe(SEED);
    expect(stored.revision).toBe(0);
    expect(stored.name).toBe(generation.spec.project.name);
    expect(stored.spec).toEqual(generation.spec);
    // Only the spec: the snapshot is rebuilt from it, so a stored copy could
    // only ever be a second, drifting source of truth.
    expect(stored).not.toHaveProperty("snapshot");

    expect(push).toHaveBeenCalledWith(`/building/${GENERATION_ID}`);
  });

  it("reports a storage failure instead of navigating to a design that was never written", async () => {
    storageFailure = new Error("QuotaExceededError");
    render(<GenerativeStudio />);

    await act(async () => {
      fireEvent.click(openButton());
    });

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/SAVE_FAILED/);
    // Still offered — the failure may be transient (a full disk that was freed).
    expect(openButton().disabled).toBe(false);
  });

  it("is disabled with its reason while a proposed change owns the viewport", async () => {
    // The workspace opens the design in HISTORY. With a candidate on screen the
    // two would disagree, so the action names that rather than silently
    // exporting the older building.
    // A candidate whose CONTENT is irrelevant here — what matters is that one
    // is pending. Its shape is the applied-edit shape the diff preview reads.
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

    render(<GenerativeStudio />);

    const button = openButton();
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/Apply or discard the proposed change first/);

    fireEvent.click(button);
    expect(push).not.toHaveBeenCalled();
    expect(db.size).toBe(0);
  });
});
