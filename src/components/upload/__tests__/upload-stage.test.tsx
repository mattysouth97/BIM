/* @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { UploadStage } from "../upload-stage";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import type { MaterialProperties } from "@/lib/material-types";

// Two closed LWPOLYLINE entities on different layers.
// Both rectangles are well above the MIN_AREA_SQM=10 threshold:
//   FOOTPRINT: 20×15 = 300 m²   INNER: 12×6 = 72 m²
const TWO_LAYER_DXF = [
  "0", "SECTION",
  "2", "HEADER",
  "9", "$INSUNITS",
  "70", "6",
  "0", "ENDSEC",
  "0", "SECTION",
  "2", "ENTITIES",
  // Outer rectangle on layer FOOTPRINT (20 × 15 m)
  "0", "LWPOLYLINE",
  "8", "FOOTPRINT",
  "90", "4",
  "70", "1",
  "10", "0",  "20", "0",
  "10", "20", "20", "0",
  "10", "20", "20", "15",
  "10", "0",  "20", "15",
  // Inner rectangle on layer INNER (12 × 6 m)
  "0", "LWPOLYLINE",
  "8", "INNER",
  "90", "4",
  "70", "1",
  "10", "4",  "20", "4",
  "10", "16", "20", "4",
  "10", "16", "20", "10",
  "10", "4",  "20", "10",
  "0", "ENDSEC",
  "0", "EOF",
  "",
].join("\n");

const TEST_PK = "TEST_BLDG_PK";

// Minimal DXF string: 10m × 8m closed rectangle on layer FOOTPRINT in meters.
const RECT_DXF = [
  "0", "SECTION",
  "2", "HEADER",
  "9", "$INSUNITS",
  "70", "6",
  "0", "ENDSEC",
  "0", "SECTION",
  "2", "ENTITIES",
  "0", "LWPOLYLINE",
  "8", "FOOTPRINT",
  "90", "4",
  "70", "1",
  "10", "0", "20", "0",
  "10", "10", "20", "0",
  "10", "10", "20", "8",
  "10", "0", "20", "8",
  "0", "ENDSEC",
  "0", "EOF",
  "",
].join("\n");

function seedBuilding() {
  useMaterialStore.setState({
    properties: { [TEST_PK]: {} as unknown as MaterialProperties },
    selectedElement: { type: null },
  });
}

function resetStores() {
  useWorkflowStore.setState({
    stage: "upload",
    completion: { search: false, upload: false, params: false, twin: false, report: false },
    cadSkipped: {},
  });
  useRecipeStore.setState({
    baseRecipes: {},
    overrides: {},
  });
  useMaterialStore.setState({
    properties: {},
    selectedElement: { type: null },
  });
}

describe("UploadStage", () => {
  beforeEach(() => {
    resetStores();
    seedBuilding();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders dropzone with .dxf and .dwg badges", () => {
    render(<UploadStage />);
    expect(screen.getByTestId("upload-dropzone")).toBeTruthy();
    expect(screen.getByText(".dxf")).toBeTruthy();
    expect(screen.getByText(".dwg")).toBeTruthy();
  });

  it("Continue button is disabled before any file is processed", () => {
    render(<UploadStage />);
    const button = screen.getByTestId("upload-continue") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // P2-17 — CAD-less path
  it("Continue without CAD advances to twin and records the skip, writing no footprint", () => {
    render(<UploadStage />);
    fireEvent.click(screen.getByTestId("upload-skip"));

    expect(useWorkflowStore.getState().stage).toBe("twin");
    expect(useWorkflowStore.getState().cadSkipped[TEST_PK]).toBe(true);
    // No footprint override was invented for the skipped building
    expect(useRecipeStore.getState().overrides[TEST_PK]?.footprintPolygon).toBeUndefined();
  });

  it("Continue without CAD shows an error and stays on upload when no building is active", () => {
    // Clear the seeded building so useActiveBuildingPk resolves to ""
    useMaterialStore.setState({ properties: {}, selectedElement: { type: null } });
    render(<UploadStage />);
    fireEvent.click(screen.getByTestId("upload-skip"));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(useWorkflowStore.getState().stage).toBe("upload");
    expect(useWorkflowStore.getState().cadSkipped).toEqual({});
  });

  it("processing a valid DXF enables Continue and stores footprintPolygon on confirm", async () => {
    // happy-dom File.text() polyfill — attach if missing.
    const file = new File([RECT_DXF], "plan.dxf", { type: "application/dxf" });
    if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(file, "text", {
        value: async () => RECT_DXF,
      });
    }

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    // Stub FileList with the one file.
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    // Wait for the parse + ready state to bubble through.
    await waitFor(() => {
      const button = screen.getByTestId("upload-continue") as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    // Click Continue — should write the polygon and advance workflow.
    fireEvent.click(screen.getByTestId("upload-continue"));

    // footprintPolygon was written to the recipe-store overrides.
    const overrides = useRecipeStore.getState().overrides[TEST_PK];
    expect(overrides?.footprintPolygon).toBeDefined();
    const rings = overrides!.footprintPolygon!;
    expect(rings.length).toBe(1);
    expect(rings[0].length).toBe(4);

    // Workflow advanced to "twin".
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("rejects files with unsupported extensions", async () => {
    const file = new File(["irrelevant"], "plan.txt", {
      type: "text/plain",
    });

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });

    // Continue stays disabled.
    expect(
      (screen.getByTestId("upload-continue") as HTMLButtonElement).disabled
    ).toBe(true);

    // Workflow stage did not change.
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("rejects DWG with invalid AC-version header (client-side guard)", async () => {
    // 32 zero bytes — no valid `ACxxxx` magic. parseDwgFile rejects this
    // client-side before any WASM load or server round-trip, so the user
    // sees the missing-header warning and the workflow stays on upload.
    const file = new File([new Uint8Array(32)], "plan.dwg", {
      type: "application/acad",
    });

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent ?? "").toMatch(
        /AC[\s‑\-]?version|valid DWG|\.dxf/i
      );
    });

    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("accepts .pdf and transitions to the PDF tracing UI", async () => {
    // pdfjs-dist pulls wasm/canvas machinery that happy-dom can't satisfy, so
    // we stub the module before the component mounts. Only `getDocument` is
    // called during mount; we resolve it with a never-settling promise so the
    // loading branch stays on-screen long enough for the assertion.
    vi.mock("pdfjs-dist", () => ({
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: () => ({
        promise: new Promise<never>(() => {
          /* intentionally unresolved */
        }),
      }),
    }));

    const file = new File([new Uint8Array([37, 80, 68, 70])], "plan.pdf", {
      type: "application/pdf",
    });

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    // PdfTracer renders its heading as soon as it's mounted, regardless of
    // pdfjs render state.
    await waitFor(() => {
      expect(
        screen.getByText(/Trace the footprint|외곽선 추적/)
      ).toBeTruthy();
    });

    vi.doUnmock("pdfjs-dist");
  });

  it("multi-candidate DXF: card click previews but does not enable Continue; Confirm enables it", async () => {
    const file = new File([TWO_LAYER_DXF], "plan.dxf", { type: "application/dxf" });
    if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(file, "text", { value: async () => TWO_LAYER_DXF });
    }

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    // Wait for the layer-picker to appear (needs-pick state).
    await waitFor(() => {
      expect(screen.getByText(/Select the footprint layer|풋프린트 레이어/)).toBeTruthy();
    });

    // Continue must still be disabled — no candidate committed yet.
    expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(true);

    // Click the FOOTPRINT candidate card (identified by data-layer attribute).
    const footprintCard = document.querySelector('[data-layer="FOOTPRINT"]') as HTMLElement;
    expect(footprintCard).toBeTruthy();
    fireEvent.click(footprintCard);

    // Confirm button should now be visible, but Continue is still disabled.
    await waitFor(() => {
      expect(screen.getByTestId("layer-picker-confirm")).toBeTruthy();
    });
    expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(true);

    // Click the Confirm button — commits the selection.
    fireEvent.click(screen.getByTestId("layer-picker-confirm"));

    // Now Continue should be enabled.
    await waitFor(() => {
      expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(false);
    });

    // Click Continue to advance.
    fireEvent.click(screen.getByTestId("upload-continue"));

    const overrides = useRecipeStore.getState().overrides[TEST_PK];
    expect(overrides?.footprintPolygon).toBeDefined();
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });
});

// ─── P2-24 — cad-first mode: CAD is mandatory, search does not exist ─────────

describe("UploadStage in cad-first mode (P2-24)", () => {
  const CAD_PK = "cad-test-draft";

  beforeEach(() => {
    resetStores();
    useActiveBuildingStore.getState().setActiveBuilding(CAD_PK);
  });

  afterEach(() => {
    cleanup();
    useActiveBuildingStore.getState().clearActiveBuilding();
  });

  it("hides the skip button and the back-to-search button", () => {
    render(<UploadStage />);
    expect(screen.queryByTestId("upload-skip")).toBeNull();
    expect(screen.queryByText("검색으로 돌아가기")).toBeNull();
  });

  it("committing a DXF advances to params, not twin", async () => {
    const file = new File([RECT_DXF], "plan.dxf", { type: "application/dxf" });
    if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(file, "text", {
        value: async () => RECT_DXF,
      });
    }

    render(<UploadStage />);
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("upload-continue"));

    expect(useRecipeStore.getState().overrides[CAD_PK]?.footprintPolygon).toBeDefined();
    expect(useWorkflowStore.getState().stage).toBe("params");
  });
});
