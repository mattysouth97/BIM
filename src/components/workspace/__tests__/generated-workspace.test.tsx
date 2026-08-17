/* @vitest-environment happy-dom */
//
// The workspace for a generated design.
//
// Two things are being pinned here. First, that /building/GEN-… reaches the
// generated branch AT ALL — before this, the id 404'd and a generated building
// could only be looked at inside the studio that made it. Second, that the
// branch is a genuine alternative to the ledger one: it seeds the same pk-keyed
// stores every panel reads, and it issues no 건축물대장 request, because there
// is no ledger row to request.
//
// The ledger hooks are deliberately NOT stubbed. `useCompositeBuilding` is a
// react-query hook with no provider around these renders, so if the generated
// id ever fell through to `LedgerWorkspace` the test would throw rather than
// quietly pass.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { Suspense } from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

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
/* The heavy children                                                  */
/* ------------------------------------------------------------------ */

// The scene is the one place the synthetic title is consumed, so the stub
// reports the fields the workspace is responsible for handing it.
vi.mock("@/components/viewer/building-scene", () => ({
  BuildingScene: ({
    title,
    floors,
    buildingPk,
    recipeOverride,
    snapshot,
  }: {
    title: { mgmBldrgstPk: string; bldNm: string; totArea: number; grndFlrCnt: number };
    floors: unknown[];
    buildingPk?: string;
    recipeOverride?: { footprintPolygon?: unknown };
    snapshot?: { elements?: unknown[] };
  }) => (
    <div
      data-testid="scene"
      data-pk={title.mgmBldrgstPk}
      data-scene-pk={buildingPk ?? ""}
      data-has-recipe={recipeOverride ? "1" : "0"}
      data-has-polygon={recipeOverride?.footprintPolygon ? "1" : "0"}
      data-has-snapshot={snapshot?.elements?.length ? "1" : "0"}
      data-name={title.bldNm}
      data-tot-area={String(title.totArea)}
      data-grnd-flr={String(title.grndFlrCnt)}
      data-floor-rows={String(floors.length)}
    />
  ),
}));

vi.mock("@/components/workspace/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

vi.mock("@/components/building/building-toolbar", () => ({
  BuildingToolbar: ({
    title,
    exportData,
  }: {
    title: { bldNm: string } | null;
    exportData: Record<string, unknown>[];
  }) => (
    <div data-testid="toolbar" data-export-rows={String(exportData.length)}>
      {title?.bldNm ?? ""}
    </div>
  ),
}));

/* ------------------------------------------------------------------ */

import BuildingWorkspace from "@/app/building/[id]/building-workspace";
import { GeneratedWorkspace } from "@/components/workspace/generated-workspace";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { __clearDesignMemo, saveDesign } from "@/lib/generative/design-storage";
import { seedBuildingFromGeneratedDesign } from "@/lib/generative/energy/seed-from-design";
import { buildDesign } from "@/lib/generative/build";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useLayerStore } from "@/store/layer-store";

const GENERATION_ID = "GEN-4242";

let spec: BuildingSpec;

beforeAll(async () => {
  const provider = new HeuristicReasoningProvider();
  spec = (
    await provider.generateBuilding({
      prompt:
        "Create a five-story office building, approximately 6,000 m2, with a central core.",
      seed: 4242,
    })
  ).data;
}, 120_000);

const fetchSpy = vi.fn(async () => {
  throw new Error("no request should be made from the generated workspace");
});

beforeEach(async () => {
  db.clear();
  storageFailure = null;
  __clearDesignMemo();
  fetchSpy.mockClear();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  useMaterialStore.setState({ properties: {}, activePk: "" });
  useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  useActiveBuildingStore.getState().clearActiveBuilding();
  useRevitWorkflowStore.setState({ workMode: "energy" });
  useLayerStore.getState().setInteriorVisible(false);

  await saveDesign({
    generationId: GENERATION_ID,
    spec,
    seed: 4242,
    revision: 0,
    savedAtIso: "2026-08-17T09:00:00.000Z",
    name: "Test tower",
  });
});

afterEach(() => {
  cleanup();
});

/** `use(params)` suspends until the route promise settles inside act. */
async function renderRoute(id: string) {
  const params = Promise.resolve({ id });
  await act(async () => {
    render(
      <Suspense fallback={<div data-testid="route-pending" />}>
        <BuildingWorkspace params={params} />
      </Suspense>,
    );
    await params;
  });
}

/* ------------------------------------------------------------------ */

describe("/building/GEN-… — the branch", () => {
  it("routes a generated id to the generated workspace, not the ledger one", async () => {
    await renderRoute(GENERATION_ID);

    const scene = await screen.findByTestId("scene");
    expect(scene).toBeTruthy();
    // Reaching LedgerWorkspace would have thrown (no QueryClientProvider), so
    // this is the branch AND the absence of the ledger path in one assertion.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("makes no 건축물대장 request on this branch", async () => {
    await renderRoute(GENERATION_ID);
    await screen.findByTestId("scene");

    const urls = fetchSpy.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(urls.filter((url) => url.includes("/api/bldrgst"))).toEqual([]);
  });
});

describe("GeneratedWorkspace — a saved design", () => {
  it("shows the design's own massing facts through the synthetic title", async () => {
    render(<GeneratedWorkspace generationId={GENERATION_ID} />);
    const scene = await screen.findByTestId("scene");

    const built = buildDesign({
      spec,
      buildingPk: "generated",
      generationId: GENERATION_ID,
    });

    expect(scene.getAttribute("data-name")).toBe(spec.project.name);
    // Empty title pk, deliberately: no 건축물대장 entry exists, so consumption
    // and official-grade lookups must find nothing rather than a plausible fake.
    expect(scene.getAttribute("data-pk")).toBe("");
    // The scene itself is keyed on the generation id and handed the solved
    // recipe + snapshot — not a box re-derived from the empty title.
    expect(scene.getAttribute("data-scene-pk")).toBe(GENERATION_ID);
    expect(scene.getAttribute("data-has-recipe")).toBe("1");
    expect(scene.getAttribute("data-has-polygon")).toBe("1");
    expect(scene.getAttribute("data-has-snapshot")).toBe("1");
    // Measured off the solved building, not estimated from an era table.
    expect(scene.getAttribute("data-tot-area")).toBe(String(built.metrics.grossAreaSqm));
    expect(scene.getAttribute("data-grnd-flr")).toBe(
      String(spec.levels.filter((level) => level.floorNo > 0).length),
    );
    // There are no ledger floor rows for a design — none are invented.
    expect(scene.getAttribute("data-floor-rows")).toBe("0");
  });

  it("publishes the design to the pk-keyed stores every panel reads", async () => {
    render(<GeneratedWorkspace generationId={GENERATION_ID} />);
    await screen.findByTestId("scene");

    const built = buildDesign({
      spec,
      buildingPk: "generated",
      generationId: GENERATION_ID,
    });
    const seed = seedBuildingFromGeneratedDesign({
      spec,
      recipe: built.recipe,
      metrics: built.metrics,
      generationId: GENERATION_ID,
    });

    expect(useActiveBuildingStore.getState().buildingPk).toBe(GENERATION_ID);
    expect(useActiveBuildingStore.getState().sigunguCd).toBe(seed.sigunguCd);
    expect(useMaterialStore.getState().activePk).toBe(GENERATION_ID);
    expect(useMaterialStore.getState().properties[GENERATION_ID]).toEqual(seed.materials);
    // The generated recipe — not a recipe re-derived from a ledger estimate.
    expect(useRecipeStore.getState().baseRecipes[GENERATION_ID]).toEqual(seed.recipe);
    expect(useRevitWorkflowStore.getState().workMode).toBe("energy");
    expect(useLayerStore.getState().interiorVisible).toBe(true);
  });

  it("offers the solved storeys to the export menu", async () => {
    render(<GeneratedWorkspace generationId={GENERATION_ID} />);
    await screen.findByTestId("scene");

    const built = buildDesign({
      spec,
      buildingPk: "generated",
      generationId: GENERATION_ID,
    });
    const toolbar = await screen.findByTestId("toolbar");
    expect(toolbar.getAttribute("data-export-rows")).toBe(
      String(built.snapshot.levels.length),
    );
    expect(built.snapshot.levels.length).toBeGreaterThan(0);
  });
});

describe("GeneratedWorkspace — a design this browser does not have", () => {
  it("says so, and lists the designs it does have", async () => {
    render(<GeneratedWorkspace generationId="GEN-9999" />);

    expect(
      await screen.findByText(/GEN-9999 설계가 이 브라우저에 저장되어 있지 않습니다/),
    ).toBeTruthy();
    // Storage is per-browser: the screen says why a link that works elsewhere
    // finds nothing here, instead of implying the design was deleted.
    expect(screen.getByText(/생성된 설계는 이 브라우저에만 저장됩니다/)).toBeTruthy();

    const link = screen.getByRole("link", { name: /Test tower/ });
    expect(link.getAttribute("href")).toBe(`/building/${GENERATION_ID}`);
    expect(screen.queryByTestId("scene")).toBeNull();
  });
});

describe("GeneratedWorkspace — storage that cannot be read", () => {
  it("reports the failure instead of pretending the design is missing", async () => {
    storageFailure = new Error("InvalidStateError");
    render(<GeneratedWorkspace generationId={GENERATION_ID} />);

    expect(await screen.findByText(/설계를 열 수 없습니다/)).toBeTruthy();
    expect(screen.getByText(/LOAD_FAILED/)).toBeTruthy();
    // A storage fault is not a missing design — it must not send the user
    // hunting through a picker for something that is sitting right there.
    expect(screen.queryByText(/저장되어 있지 않습니다/)).toBeNull();
  });
});
