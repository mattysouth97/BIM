/* @vitest-environment happy-dom */
//
// The import dialog's 3D-mesh branch. A DXF holding nothing but 3DFACEs used to
// end at "no geometry this reader supports"; it now becomes an offer, with the
// one control the reading actually turns on — the cut height — and the SAME
// preview and adoption step every other import uses.
//
// Kept in its own file so the 2D/SVG suite next door stays untouched.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useBlueprintStore } from "@/store/blueprint-store";

import { BOX_DXF, EMPTY_DXF } from "@/lib/generative/__tests__/mesh-dxf-fixture";

import { ImportCadDialog } from "../import-cad-dialog";

function dxfFile(name: string, text: string): File {
  const file = new File([text], name, { type: "application/dxf" });
  if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
    Object.defineProperty(file, "text", { value: async () => text });
  }
  return file;
}

async function upload(file: File, until: string) {
  const input = screen.getByTestId("import-cad-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByTestId(until)).toBeTruthy());
}

beforeEach(() => {
  useBlueprintStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("ImportCadDialog — 3D mesh", () => {
  it("offers plan extraction, with the mesh's own stats, instead of failing", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile("box.dxf", BOX_DXF), "import-mesh-panel");

    expect(screen.getByText("3D 모델에서 평면 추출")).toBeTruthy();
    const stats = screen.getByTestId("import-mesh-stats").textContent ?? "";
    expect(stats).toContain("faces 6");
    expect(stats).toContain("0.00–3.00 m");
    expect(stats).toContain("~1 floors");

    // The suggested cut is offered, not silently applied behind a hidden default.
    expect((screen.getByTestId("import-mesh-slice-z") as HTMLInputElement).value).toBe(
      "1.20",
    );
    // And the preview is the real import.
    expect(screen.getByTestId("import-cad-preview")).toBeTruthy();
    expect(screen.getByTestId("import-mesh-notes").textContent).toContain(
      "horizontal cut at Z = 1.20 m",
    );
    // Nothing adopted yet.
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);
  });

  it("adopts the extracted plan, carrying how it was made", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile("box.dxf", BOX_DXF), "import-mesh-panel");

    fireEvent.click(screen.getByText("Use as schematic"));

    const state = useBlueprintStore.getState();
    expect(state.blueprint.boundaries).toHaveLength(1);
    expect(state.blueprint.source).toBe("dxf");
    expect(state.validation.counts.critical).toBe(0);
    expect(state.activeImport()?.fileName).toBe("box.dxf");
    expect(state.activeImport()?.format).toBe("dxf");
    expect(
      state.blueprint.assumptions.some((a) => a.id === "mesh-extraction"),
    ).toBe(true);

    // One undo step back to the blank schematic.
    useBlueprintStore.getState().undo();
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);
  });

  it("re-cuts at a height the user types, and previews that cut", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile("box.dxf", BOX_DXF), "import-mesh-panel");

    fireEvent.change(screen.getByTestId("import-mesh-slice-z"), {
      target: { value: "2.5" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("import-mesh-notes").textContent).toContain(
        "horizontal cut at Z = 2.50 m",
      ),
    );
    fireEvent.click(screen.getByText("Use as schematic"));
    expect(
      useBlueprintStore
        .getState()
        .blueprint.assumptions.find((a) => a.id === "mesh-extraction")?.statement,
    ).toContain("2.50 m");
  });

  it("switches to the footprint projection when asked", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile("box.dxf", BOX_DXF), "import-mesh-panel");

    fireEvent.click(screen.getByTestId("import-mesh-use-projection"));

    await waitFor(() =>
      expect(screen.getByTestId("import-mesh-notes").textContent).toContain(
        "footprint projection",
      ),
    );
    // The cut height stops applying, and the panel says what a projection is.
    expect((screen.getByTestId("import-mesh-slice-z") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("import-mesh-panel").textContent).toContain(
      "모든 면을 지면에 눌러",
    );
  });

  it("still reports a drawing with neither 2D geometry nor a mesh", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    const input = screen.getByTestId("import-cad-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [dxfFile("empty.dxf", EMPTY_DXF)],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("EMPTY_DRAWING");
    expect(screen.queryByTestId("import-mesh-panel")).toBeNull();
    expect(screen.queryByTestId("import-cad-preview")).toBeNull();
  });
});
