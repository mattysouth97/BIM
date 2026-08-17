/* @vitest-environment happy-dom */
//
// The import dialog end to end: a real DXF goes in, the guessed mapping is
// SHOWN (not applied), and only the explicit "Use as schematic" click puts a
// blueprint in the editor's store. The button is wired to the same pipeline the
// preview renders, so a green preview and a dead button cannot coexist.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useBlueprintStore } from "@/store/blueprint-store";

import { ImportCadDialog } from "../import-cad-dialog";

const PLAN_DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  // L-shaped outer wall.
  "0", "LWPOLYLINE", "8", "A-WALL", "90", "6", "70", "1",
  "10", "0", "20", "0",
  "10", "20000", "20", "0",
  "10", "20000", "20", "12000",
  "10", "12000", "20", "12000",
  "10", "12000", "20", "20000",
  "10", "0", "20", "20000",
  // Core.
  "0", "LWPOLYLINE", "8", "A-CORE", "90", "4", "70", "1",
  "10", "14000", "20", "2000",
  "10", "18000", "20", "2000",
  "10", "18000", "20", "6000",
  "10", "14000", "20", "6000",
  // Room.
  "0", "LWPOLYLINE", "8", "A-ZONE", "90", "4", "70", "1",
  "10", "2000", "20", "2000",
  "10", "10000", "20", "2000",
  "10", "10000", "20", "10000",
  "10", "2000", "20", "10000",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

function dxfFile(name = "plan.dxf", text = PLAN_DXF): File {
  const file = new File([text], name, { type: "application/dxf" });
  // happy-dom's File may lack .text(); the dialog depends on it.
  if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
    Object.defineProperty(file, "text", { value: async () => text });
  }
  return file;
}

async function upload(file: File) {
  const input = screen.getByTestId("import-cad-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByTestId("import-cad-preview")).toBeTruthy());
}

beforeEach(() => {
  useBlueprintStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("ImportCadDialog", () => {
  it("shows every layer with its guessed role instead of applying it", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile());

    for (const layer of ["A-WALL", "A-CORE", "A-ZONE"]) {
      expect(screen.getByText(layer)).toBeTruthy();
      expect(screen.getByLabelText(`Role for layer ${layer}`)).toBeTruthy();
    }
    expect(
      (screen.getByLabelText("Role for layer A-WALL") as HTMLSelectElement).value,
    ).toBe("boundary");
    expect(
      (screen.getByLabelText("Role for layer A-CORE") as HTMLSelectElement).value,
    ).toBe("core");

    // Nothing has been adopted: the editor still holds the blank schematic.
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);
    expect(useBlueprintStore.getState().blueprint.source).toBe("native-editor");
  });

  it("adopts the previewed blueprint, with provenance, on Use as schematic", async () => {
    let open = true;
    render(<ImportCadDialog open onOpenChange={(next) => { open = next; }} />);
    await upload(dxfFile());

    fireEvent.click(screen.getByText("Use as schematic"));

    const state = useBlueprintStore.getState();
    expect(state.blueprint.source).toBe("dxf");
    expect(state.blueprint.boundaries).toHaveLength(1);
    expect(state.blueprint.cores).toHaveLength(1);
    expect(state.blueprint.zones).toHaveLength(1);
    expect(state.validation.counts.critical).toBe(0);
    expect(state.activeImport()?.fileName).toBe("plan.dxf");
    expect(open).toBe(false);

    // One undo step, straight back to the blank schematic.
    useBlueprintStore.getState().undo();
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);
  });

  it("re-interprets when a role is changed, and adopts what is on screen", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile());

    fireEvent.change(screen.getByLabelText("Role for layer A-ZONE"), {
      target: { value: "void" },
    });
    fireEvent.click(screen.getByText("Use as schematic"));

    const blueprint = useBlueprintStore.getState().blueprint;
    expect(blueprint.zones).toHaveLength(0);
    expect(blueprint.voids).toHaveLength(1);
    expect(
      useBlueprintStore
        .getState()
        .activeImport()
        ?.assignments["A-ZONE"].role,
    ).toBe("void");
  });

  it("names the failure and disables adoption when no boundary layer is mapped", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(dxfFile());

    fireEvent.change(screen.getByLabelText("Role for layer A-WALL"), {
      target: { value: "ignore" },
    });

    await waitFor(() => expect(screen.getByTestId("import-cad-error")).toBeTruthy());
    expect(screen.getByTestId("import-cad-error").textContent).toContain(
      "NO_BOUNDARY_LAYER",
    );
    expect(
      (screen.getByText("Use as schematic").closest("button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(useBlueprintStore.getState().blueprint.source).toBe("native-editor");
  });

  it("reports an unreadable file by name, with no preview", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    const input = screen.getByTestId("import-cad-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [dxfFile("scan.png", "not a drawing")],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("scan.png");
    expect(screen.queryByTestId("import-cad-preview")).toBeNull();
  });
});
