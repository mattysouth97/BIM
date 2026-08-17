/* @vitest-environment happy-dom */
//
// The import dialog end to end: a real DXF (or SVG) goes in, the guessed
// mapping is SHOWN (not applied), and only the explicit "Use as schematic"
// click puts a blueprint in the editor's store. The button is wired to the same
// pipeline the preview renders, so a green preview and a dead button cannot
// coexist.
//
// The SVG cases at the bottom drive the SAME table, preview and adoption step
// as the DXF ones — that is the point of the shared flow — plus the one control
// only an SVG needs: the unit scale, which is disclosed as ASSUMED until set.

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

// Same plan as PLAN_DXF: L-shaped outline, a core, a labelled room — drawn in
// millimetres on `data-layer` groups, which is what "layer" means in an SVG.
const PLAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20000 20000">
  <g data-layer="A-WALL">
    <polygon points="0,0 20000,0 20000,12000 12000,12000 12000,20000 0,20000" />
  </g>
  <g data-layer="A-CORE"><rect x="14000" y="2000" width="4000" height="4000" /></g>
  <g data-layer="A-ZONE"><rect x="2000" y="2000" width="8000" height="8000" /></g>
  <text x="6000" y="6000" font-size="300">Office</text>
</svg>`;

/** The same drawing authored in metres: unreadable until the scale is stated. */
const PLAN_SVG_METRES = `<svg viewBox="0 0 20 20">
  <g data-layer="A-WALL">
    <polygon points="0,0 20,0 20,12 12,12 12,20 0,20" />
  </g>
  <g data-layer="A-CORE"><rect x="14" y="2" width="4" height="4" /></g>
</svg>`;

function dxfFile(name = "plan.dxf", text = PLAN_DXF): File {
  const file = new File([text], name, { type: "application/dxf" });
  // happy-dom's File may lack .text(); the dialog depends on it.
  if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
    Object.defineProperty(file, "text", { value: async () => text });
  }
  return file;
}

function svgFile(name = "plan.svg", text = PLAN_SVG): File {
  return dxfFile(name, text);
}

async function upload(file: File) {
  const input = screen.getByTestId("import-cad-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByTestId("import-cad-preview")).toBeTruthy());
}

async function uploadExpectingFailure(file: File) {
  const input = screen.getByTestId("import-cad-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByTestId("import-cad-error")).toBeTruthy());
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

  it("reads an SVG through the same table, preview and adoption step", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(svgFile());

    for (const layer of ["A-WALL", "A-CORE", "A-ZONE"]) {
      expect(screen.getByLabelText(`Role for layer ${layer}`)).toBeTruthy();
    }
    expect(
      (screen.getByLabelText("Role for layer A-WALL") as HTMLSelectElement).value,
    ).toBe("boundary");
    // Nothing adopted yet.
    expect(useBlueprintStore.getState().blueprint.source).toBe("native-editor");

    fireEvent.click(screen.getByText("Use as schematic"));

    const state = useBlueprintStore.getState();
    expect(state.blueprint.source).toBe("svg");
    expect(state.blueprint.boundaries).toHaveLength(1);
    expect(state.blueprint.cores).toHaveLength(1);
    expect(state.blueprint.zones).toHaveLength(1);
    expect(state.validation.counts.critical).toBe(0);
    expect(state.activeImport()?.format).toBe("svg");
    expect(state.activeImport()?.fileName).toBe("plan.svg");

    // One undo step, straight back to the blank schematic.
    useBlueprintStore.getState().undo();
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);
  });

  it("calls the untouched SVG scale an assumption, and says so on the import", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await upload(svgFile());

    expect(screen.getByTestId("import-svg-scale-note").textContent).toContain("Assumed");
    expect(screen.getByTestId("import-svg-scale-report").textContent).toContain("assumed");

    fireEvent.click(screen.getByText("Use as schematic"));
    const blueprint = useBlueprintStore.getState().blueprint;
    expect(blueprint.coordinateSystem.calibrated).toBe(false);
    expect(
      useBlueprintStore
        .getState()
        .validation.violations.map((violation) => violation.code),
    ).toContain("SCALE_UNCALIBRATED");
  });

  it("re-reads a metre-authored SVG once the unit scale is stated", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    // At the assumed 1 unit = 1 mm the whole building is 20 mm across: no loop
    // big enough to be a room, and the failure says exactly that.
    await uploadExpectingFailure(svgFile("metres.svg", PLAN_SVG_METRES));
    expect(screen.getByTestId("import-cad-error").textContent).toContain(
      "NO_CLOSED_LOOPS",
    );

    fireEvent.change(screen.getByTestId("import-svg-unit-scale"), {
      target: { value: "1000" },
    });

    await waitFor(() => expect(screen.getByTestId("import-cad-preview")).toBeTruthy());
    expect(screen.getByTestId("import-svg-scale-note").textContent).toContain(
      "supplied by you",
    );

    fireEvent.click(screen.getByText("Use as schematic"));
    const blueprint = useBlueprintStore.getState().blueprint;
    expect(blueprint.boundaries).toHaveLength(1);
    expect(blueprint.coordinateSystem.calibrated).toBe(true);
    // Read back at real size: the 20 m plate is 20 000 mm across.
    const xs = blueprint.boundaries[0].loop.segments.map((segment) =>
      segment.kind === "polyline" ? segment.pointsMm[0].xMm : segment.startMm.xMm,
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBe(20_000);
  });

  it("surfaces a malformed SVG as a named failure, with nothing adopted", async () => {
    render(<ImportCadDialog open onOpenChange={() => {}} />);
    await uploadExpectingFailure(
      svgFile("broken.svg", '<svg><g data-layer="A-WALL"><rect x="0" y="0" width="4" height="4"/></svg>'),
    );

    expect(screen.getByTestId("import-cad-error").textContent).toContain("SVG_MALFORMED");
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
