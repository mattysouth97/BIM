// Composition smoke test.
//
// The lean studio forks nothing: it is an arrangement of modules that already
// exist. (Its /lean route was retired as an orphaned duplicate of /studio; the
// component remains the A/B candidate.) The failure mode that arrangement has,
// and that no unit test elsewhere can catch, is a broken seam — a renamed
// export, a moved file, a component that stopped being importable from a client
// boundary. Importing the studio and every module it composes is the cheapest
// honest check that the arrangement still stands.

import { describe, it, expect, vi } from "vitest";

// The 3D stack is not importable in a plain test environment; the seam being
// checked here is the module graph, not the renderer.
vi.mock("@react-three/fiber", () => ({ Canvas: () => null, useThree: () => null }));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null, Environment: () => null }));

describe("lean studio composition", () => {
  it("resolves the studio component", async () => {
    const studio = await import("../lean-studio");
    expect(typeof studio.LeanStudio).toBe("function");
  });

  it("resolves every existing module the lean screen composes", async () => {
    const [
      sessionStore,
      client,
      designStorage,
      commands,
      commandBar,
      energyPanel,
      issuesPanel,
      planOverlay,
      schematicEditor,
      importDialog,
      interiorLayer,
      buildingModel,
      blueprintStore,
    ] = await Promise.all([
      import("@/store/generative-session-store"),
      import("@/lib/generative/client"),
      import("@/lib/generative/design-storage"),
      import("@/lib/generative/session/commands"),
      import("@/components/generative/command-bar"),
      import("@/components/generative/energy-panel"),
      import("@/components/generative/issues-panel"),
      import("@/components/generative/schematic/plan-overlay"),
      import("@/components/generative/schematic/schematic-editor"),
      import("@/components/generative/schematic/import-cad-dialog"),
      import("@/components/viewer/interior-layer"),
      import("@/components/viewer/procedural-building-model"),
      import("@/store/blueprint-store"),
    ]);

    expect(typeof sessionStore.useGenerativeSession).toBe("function");
    expect(typeof client.generateBuilding).toBe("function");
    expect(typeof client.modifyBuilding).toBe("function");
    expect(typeof client.generateFromBlueprint).toBe("function");
    expect(typeof designStorage.saveDesign).toBe("function");
    expect(typeof designStorage.listDesigns).toBe("function");
    expect(typeof designStorage.getOrBuildDesign).toBe("function");
    expect(typeof commands.parseCommand).toBe("function");
    expect(typeof commandBar.CommandBar).toBe("function");
    expect(typeof energyPanel.EnergyPanel).toBe("function");
    expect(typeof issuesPanel.IssuesPanel).toBe("function");
    expect(typeof planOverlay.PlanOverlay).toBe("function");
    expect(typeof schematicEditor.SchematicEditor).toBe("function");
    expect(typeof importDialog.ImportCadDialog).toBe("function");
    expect(typeof interiorLayer.InteriorLayer).toBe("function");
    expect(typeof buildingModel.ProceduralBuildingModel).toBe("function");
    expect(typeof blueprintStore.useBlueprintStore).toBe("function");
    expect(typeof blueprintStore.fidelityForDesign).toBe("function");
  });

  it("mounts the session store's accept/undo/redo path the lean screen relies on", async () => {
    const { useGenerativeSession } = await import("@/store/generative-session-store");
    const state = useGenerativeSession.getState();
    for (const action of ["startFrom", "proposeEdit", "acceptPending", "discardPending", "undo", "redo"] as const) {
      expect(typeof state[action]).toBe("function");
    }
  });
});
