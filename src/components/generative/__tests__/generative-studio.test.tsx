/* @vitest-environment happy-dom */
//
// The composed generative workspace (brief §51, §55, §56, §61, §117).
//
// The studio is the one component that puts the whole session together: the
// empty GENERATE door, the workspace chrome around the model, the right rail,
// the navigation tree and the single command surface. These tests drive it the
// way a user does — through the real Zustand session store and the real child
// panels — with only the WebGL layer stubbed out, because happy-dom has no
// canvas to give @react-three/fiber.
//
// Nothing here touches the network. Every design is built offline by the
// deterministic heuristic provider and seeded straight into the store, so the
// component's generate/modify/repair/evaluate paths never fire.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

/* ------------------------------------------------------------------ */
/* The 3D layer                                                        */
/* ------------------------------------------------------------------ */

// `Canvas` still renders its children so `CameraRig` mounts and runs — the rig
// is real logic the studio owns, and a Canvas that swallowed its children would
// hide a crash in it. Only the pieces that genuinely demand a GL context are
// replaced.
vi.mock("@react-three/fiber", async () => {
  const React = await import("react");

  // A camera stand-in with the two methods the rig calls. It is deliberately
  // NOT a THREE.PerspectiveCamera: the rig's `instanceof` guard then skips the
  // projection tweak, which is exactly the "no perspective camera" branch and
  // is fine to exercise here.
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

vi.mock("@react-three/drei", () => {
  const useGLTF = Object.assign(() => ({ scene: null }), {
    preload: vi.fn(),
  });
  return {
    OrbitControls: () => null,
    Environment: () => null,
    useGLTF,
  };
});

vi.mock("@/components/viewer/procedural-building-model", () => ({
  ProceduralBuildingModel: () => null,
}));

vi.mock("@/components/viewer/interior-layer", () => ({
  InteriorLayer: () => null,
}));

// The header's "Open in workspace" action navigates. There is no app router
// around a bare render, so the hook gets a stand-in; nothing here clicks it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

/* ------------------------------------------------------------------ */

import { GenerativeStudio } from "../generative-studio";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { buildDesign, generationIdFor } from "@/lib/generative/build";
import { applySpecPatch } from "@/lib/generative/patch/apply";
import { diffMetrics, diffSpecs } from "@/lib/generative/patch/diff";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import type { AppliedEdit, GenerationResult } from "@/lib/generative/client";
import { useGenerativeSession } from "@/store/generative-session-store";
import { useAppStore } from "@/store/app-store";
import { useBlueprintStore } from "@/store/blueprint-store";
import { footprintToBlueprint } from "@/lib/generative/blueprint/from-footprint";
import {
  clearSeedBlueprint,
  stashSeedBlueprint,
} from "@/lib/generative/blueprint/seed-handoff";

const PROMPT =
  "Create a five-story office building, approximately 6,000 m2, with a central core.";
const SEED = 4242;

const PROVIDER_SUMMARY = {
  name: "heuristic",
  model: "deterministic",
  latencyMs: 1,
  inputTokens: 0,
  outputTokens: 0,
  retries: 0,
};

const provider = new HeuristicReasoningProvider();

/** A real generation, produced offline — the same shape `startFrom` receives. */
async function makeGeneration(prompt = PROMPT): Promise<GenerationResult> {
  const { data: spec } = await provider.generateBuilding({ prompt, seed: SEED });
  const built = buildDesign({
    spec,
    buildingPk: "generated",
    generationId: "GEN-0001",
  });
  return {
    success: true,
    spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId: "GEN-0001",
    revision: 0,
    seed: SEED,
    provider: PROVIDER_SUMMARY,
  };
}

/**
 * The server's edit loop, inlined: ask the offline provider for a patch, apply
 * it, rebuild, and measure the diff off the two builds. This is the exact
 * `AppliedEdit` the modify route returns, so a pending change seeded with it is
 * indistinguishable from one the studio produced itself.
 */
async function makeAppliedEdit(
  base: GenerationResult,
  instruction: string,
): Promise<AppliedEdit> {
  const built = buildDesign({
    spec: base.spec,
    buildingPk: "generated",
    generationId: base.generationId,
  });
  const { data: patch } = await provider.modifyBuilding({
    spec: base.spec,
    summary: built.summary,
    instruction,
    scope: { kind: "building", label: "Whole building" },
    locked: [],
  });

  const application = applySpecPatch({ spec: base.spec, patch, locks: [] });
  if (!application.ok) throw new Error("expected the patch to apply");

  const revision = base.revision + 1;
  const generationId = generationIdFor(application.spec.generationSeed, revision);
  const next = buildDesign({
    spec: application.spec,
    buildingPk: "generated",
    generationId,
  });

  return {
    kind: "applied",
    success: true,
    generationId,
    revision,
    patch,
    applied: application.applied,
    rejected: application.rejected.map((r) => ({
      path: r.op.path,
      reason: r.reason,
      kind: r.kind,
    })),
    diff: diffSpecs(base.spec, application.spec),
    metricDeltas: diffMetrics(base.metrics, next.metrics),
    spec: application.spec,
    recipe: next.recipe,
    snapshot: next.snapshot,
    metrics: next.metrics,
    validation: next.validation,
    status: next.status,
    approximations: next.approximations,
    provider: PROVIDER_SUMMARY,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const store = () => useGenerativeSession.getState();

/** The header strip: project name, status, undo/redo, New building. */
const header = () => within(screen.getByRole("banner"));

/**
 * The command bar's own row. Scoping to it separates the scope chip from the
 * identically-worded root of the navigation tree.
 */
function commandBar() {
  const input = screen.getByLabelText(/Describe a change/i);
  const row = input.parentElement;
  if (!row) throw new Error("the command input has no row around it");
  return within(row as HTMLElement);
}

/** Radix activates a tab on mousedown, not click. */
function selectTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
}

function seed(result: GenerationResult, prompt = PROMPT) {
  act(() => {
    store().startFrom(result, prompt);
  });
}

/* ------------------------------------------------------------------ */
/* Fixtures — built once, offline                                      */
/* ------------------------------------------------------------------ */

let generation: GenerationResult;
let addFloor: AppliedEdit;

beforeAll(async () => {
  generation = await makeGeneration();
  addFloor = await makeAppliedEdit(generation, "add a floor");
}, 60_000);

beforeEach(() => {
  store().reset();
  useAppStore.setState({ language: "ko" });
});

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */

describe("GenerativeStudio — the empty session", () => {
  it("opens on the generate door and shows no workspace around it", () => {
    render(<GenerativeStudio />);

    expect(
      screen.getByRole("heading", { name: "Generate a building" }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Describe the building you want to create"),
    ).toBeTruthy();

    // None of the workspace chrome exists yet: no rail, no tree, no command bar.
    expect(screen.queryByRole("tab", { name: /Summary/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Model" })).toBeNull();
    expect(screen.queryByLabelText(/Describe a change/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "New building" })).toBeNull();
  });

  it("keeps the diagnosis workspace synchronized with the global language", () => {
    const { rerender } = render(<GenerativeStudio initialStart="diagnose" />);
    expect(
      screen.getByRole("heading", { name: "설계단계 에너지 진단" }),
    ).toBeTruthy();

    act(() => useAppStore.getState().setLanguage("en"));
    rerender(<GenerativeStudio initialStart="diagnose" />);

    expect(
      screen.getByRole("heading", { name: "Design-stage energy diagnosis" }),
    ).toBeTruthy();
  });
});

describe("GenerativeStudio — a seed handed over from the twin workspace", () => {
  // "Generate alternative" in the building toolbar stashes the plate the user
  // was looking at and navigates here. Arriving on the prompt box with an empty
  // schematic behind it would read as the handoff having silently failed.
  const seed = () =>
    footprintToBlueprint({
      name: "Seeded plate",
      footprintPolygonM: [
        [
          [-10, -6],
          [10, -6],
          [10, 6],
          [-10, 6],
        ],
      ],
      floors: 3,
    });

  beforeEach(() => {
    clearSeedBlueprint();
    useGenerativeSession.getState().reset();
  });
  afterEach(() => clearSeedBlueprint());

  it("opens on the schematic, carrying the stashed drawing", () => {
    const stashed = seed();
    stashSeedBlueprint(stashed);

    render(<GenerativeStudio />);

    // The draw door is the one that is open.
    expect(
      screen.getByRole("button", { name: "도면 그리기", pressed: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "글로 설명하기", pressed: false }),
    ).toBeTruthy();

    // And it is THIS drawing, not a blank one.
    const loaded = useBlueprintStore.getState().blueprint;
    expect(loaded.boundaries.length).toBe(stashed.boundaries.length);
    expect(loaded.boundaries.length).toBeGreaterThan(0);
    expect(JSON.stringify(loaded.boundaries)).toBe(JSON.stringify(stashed.boundaries));
  });

  it("consumes the seed once, so a later visit is not re-seeded", () => {
    stashSeedBlueprint(seed());

    render(<GenerativeStudio />);
    expect(
      screen.getByRole("button", { name: "도면 그리기", pressed: true }),
    ).toBeTruthy();
    cleanup();

    // Second visit: nothing was stashed this time, so the studio opens on its
    // own default door rather than re-opening the drawing the user moved on from.
    render(<GenerativeStudio />);
    expect(
      screen.getByRole("button", { name: "글로 설명하기", pressed: true }),
    ).toBeTruthy();
  });

  it("opens on the prompt box when nothing was handed over", () => {
    render(<GenerativeStudio />);
    expect(
      screen.getByRole("button", { name: "글로 설명하기", pressed: true }),
    ).toBeTruthy();
  });

  it("opens on the schematic when the landing draw door asked it to", () => {
    render(<GenerativeStudio initialStart="draw" />);
    expect(
      screen.getByRole("button", { name: "도면 그리기", pressed: true }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate BIM" })).toBeTruthy();
  });
});

describe("GenerativeStudio — the workspace", () => {
  beforeEach(() => {
    seed(generation);
  });

  it("names the design and states what it is prepared to claim about it", () => {
    render(<GenerativeStudio />);

    expect(
      screen.getByRole("heading", { level: 1, name: generation.spec.project.name }),
    ).toBeTruthy();

    // The status badge is derived from evidence, never asserted (§10).
    const status = STATUS_LABEL[generation.status.level];
    expect(header().getByText(status)).toBeTruthy();
    expect(status).toBe("Geometrically Valid");
  });

  it("puts the navigation tree, the right rail and the command bar around the model", () => {
    render(<GenerativeStudio />);

    // Semantic navigation, browsed by what things ARE.
    expect(screen.getByRole("heading", { name: "Model" })).toBeTruthy();
    expect(screen.getByText("Systems")).toBeTruthy();
    expect(screen.getByText("Levels")).toBeTruthy();

    // Evidence rail.
    for (const name of [/^Summary/, /^Issues/, /^Explain/, /^History/, /^Options/]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }

    // One command surface, scoped to the whole building until told otherwise.
    expect(screen.getByLabelText(/Describe a change/i)).toBeTruthy();
    expect(commandBar().getByText("Whole building")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();

    // Summary is the tab you land on.
    expect(screen.getByRole("heading", { name: "Design intent" })).toBeTruthy();
  });

  it("switches the rail's content when another tab is chosen", () => {
    render(<GenerativeStudio />);

    selectTab(/^Issues/);
    expect(screen.getByRole("heading", { name: "Issues" })).toBeTruthy();
    expect(screen.getByText(/0 critical/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Design intent" })).toBeNull();

    selectTab(/^History/);
    // One design so far, and its row names the build it came from.
    expect(screen.getByText("1 design")).toBeTruthy();
    expect(screen.getByText("generated")).toBeTruthy();
    expect(screen.getByText(generation.generationId)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Issues" })).toBeNull();
  });

  it("offers nothing to undo or redo while the design is a lone root", () => {
    render(<GenerativeStudio />);

    expect((header().getByTitle(/^Undo/) as HTMLButtonElement).disabled).toBe(true);
    expect((header().getByTitle("Redo") as HTMLButtonElement).disabled).toBe(true);
  });

  it("New building clears the session and returns to the generate door", () => {
    render(<GenerativeStudio />);
    expect(store().history.currentId).not.toBeNull();

    fireEvent.click(header().getByRole("button", { name: "New building" }));

    expect(store().history.currentId).toBeNull();
    expect(screen.getByRole("heading", { name: "Generate a building" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Summary/ })).toBeNull();
  });
});

describe("GenerativeStudio — selection scopes the next instruction", () => {
  beforeEach(() => {
    seed(generation);
  });

  it("selecting a level puts it in the command bar's scope chip, and clearing it restores the whole building", () => {
    render(<GenerativeStudio />);

    const level = generation.snapshot.levels.find((l) => l.floorNo === 1);
    if (!level) throw new Error("the fixture has no level 1");

    expect(commandBar().getByText("Whole building")).toBeTruthy();

    const row = screen.getByText(level.name).closest("button");
    if (!row) throw new Error(`no clickable row for level ${level.name}`);
    fireEvent.click(row);

    // The scope travels with the next edit — the chip is where the user reads it.
    expect(store().selection?.scope.label).toBe(level.name);
    const chip = screen.getByTitle(/^Clear selection/);
    expect(within(chip).getByText(`${level.name} ×`)).toBeTruthy();
    expect(commandBar().queryByText("Whole building")).toBeNull();

    fireEvent.click(chip);

    expect(store().selection).toBeNull();
    expect(screen.queryByTitle(/^Clear selection/)).toBeNull();
    expect(commandBar().getByText("Whole building")).toBeTruthy();
  });
});

describe("GenerativeStudio — a proposed change is previewed, not applied", () => {
  beforeEach(() => {
    seed(generation);
    act(() => {
      store().proposeEdit(addFloor, "modify");
    });
  });

  it("says the viewport is showing a candidate and asks for a decision first", () => {
    render(<GenerativeStudio />);

    expect(header().getByText("previewing proposed change")).toBeTruthy();
    expect(
      screen.getByText(
        /The viewport is showing a proposed change\. Apply or discard it before making another edit\./,
      ),
    ).toBeTruthy();

    // The diff itself is on screen, measured off two real builds.
    expect(screen.getByRole("heading", { name: addFloor.patch.summary })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply change" })).toBeTruthy();
  });

  it("accepting it commits a new design to history and takes the preview down", () => {
    render(<GenerativeStudio />);

    const before = store().history;
    expect(Object.keys(before.nodes)).toHaveLength(1);
    const baseId = before.currentId;

    fireEvent.click(screen.getByRole("button", { name: "Apply change" }));

    const after = store().history;
    expect(Object.keys(after.nodes)).toHaveLength(2);
    expect(after.currentId).not.toBe(baseId);
    // It branches from the design the diff was computed against.
    expect(after.nodes[after.currentId!].parentId).toBe(baseId);
    expect(after.nodes[after.currentId!].label).toBe(addFloor.patch.summary);
    expect(store().pending).toBeNull();

    // And the preview state is gone from the screen.
    expect(header().queryByText("previewing proposed change")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply change" })).toBeNull();
    expect(screen.queryByText(/Apply or discard it before making another edit/)).toBeNull();

    // Undo is now a real option — there is somewhere to step back to.
    expect((header().getByTitle(/^Undo/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("discarding it leaves history exactly as it was", () => {
    render(<GenerativeStudio />);
    const baseId = store().history.currentId;

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(Object.keys(store().history.nodes)).toHaveLength(1);
    expect(store().history.currentId).toBe(baseId);
    expect(store().pending).toBeNull();
    expect(screen.queryByText(/Apply or discard it before making another edit/)).toBeNull();
  });

  it("refuses a second edit rather than silently replacing the unreviewed diff", () => {
    render(<GenerativeStudio />);
    const pendingBefore = store().pending;
    expect(pendingBefore).not.toBeNull();

    // The banner promises a decision is required first. Before this guard,
    // nothing enforced it: `proposeEdit` overwrites `pending`, so a second
    // instruction discarded a diff the user had never seen — and it would have
    // been computed against the CURRENT design, not the previewed candidate.
    const input = screen.getByRole("combobox", {
      name: /Describe a change/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "make the facade more solid" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Nothing was sent (a real request would need fetch, which is not stubbed
    // here — reaching it would throw rather than pass), and the candidate on
    // screen is untouched.
    expect(store().pending).toBe(pendingBefore);
    expect(screen.getByRole("heading", { name: addFloor.patch.summary })).toBeTruthy();

    // And the refusal is explained rather than silent.
    expect(
      screen.getByText(/Apply or discard the proposed change first/i),
    ).toBeTruthy();
  });

  it("still allows a repair to be refused for the same reason", () => {
    render(<GenerativeStudio />);
    const pendingBefore = store().pending;

    fireEvent.click(screen.getByRole("tab", { name: /Issues/ }));
    const bulk = screen.queryByRole("button", { name: /^Repair \d+ issues?$/ });
    // The fixture may be clean; the guard is only meaningful when there is
    // something to repair.
    if (bulk) {
      fireEvent.click(bulk);
      expect(store().pending).toBe(pendingBefore);
      expect(
        screen.getByText(/Apply or discard the proposed change first/i),
      ).toBeTruthy();
    }
  });
});
