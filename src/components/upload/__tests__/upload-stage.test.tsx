/* @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { UploadStage } from "../upload-stage";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import type { MaterialProperties } from "@/lib/material-types";
import * as dwgParser from "@/lib/cad/dwg-parser";
import {
  CAD_CLIENT_MAX_FILE_BYTES,
  CAD_SERVER_FALLBACK_MAX_FILE_BYTES,
  formatFileSizeMiB,
} from "@/lib/cad/import-limits";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// UploadStage now hosts the evidence-to-CAD prompt module, which reads the
// register through React Query and the route id through the App Router. Both
// are supplied by the real app shell; these tests provide the minimum.
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "11110-10300-0-0001-0001" }),
}));

// The prompt module asks the server which statement reader is configured.
const originalFetch = globalThis.fetch;

function renderStage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UploadStage />
    </QueryClientProvider>,
  );
}

// PdfTracer imports pdfjs eagerly when its branch mounts. These tests exercise
// only the upload handoff, so keep the browser-only renderer behind one stable
// module-level mock (Vitest hoists module mocks).
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: new Promise<never>(() => {
      /* intentionally unresolved */
    }),
  }),
}));

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

// Two closed LWPOLYLINEs on the SAME layer "0" with different shapes, so the
// only thing that tells them apart is which one was clicked:
//   ring 0: 20×15 rectangle = 300 m², 4 vertices   (sorted first, larger)
//   ring 1: L-shape 10×4 + 4×4 = 56 m², 6 vertices (sorted second)
const TWO_RINGS_LAYER0_DXF = [
  "0", "SECTION",
  "2", "HEADER",
  "9", "$INSUNITS",
  "70", "6",
  "0", "ENDSEC",
  "0", "SECTION",
  "2", "ENTITIES",
  "0", "LWPOLYLINE",
  "8", "0",
  "90", "4",
  "70", "1",
  "10", "0",  "20", "0",
  "10", "20", "20", "0",
  "10", "20", "20", "15",
  "10", "0",  "20", "15",
  "0", "LWPOLYLINE",
  "8", "0",
  "90", "6",
  "70", "1",
  "10", "30", "20", "0",
  "10", "40", "20", "0",
  "10", "40", "20", "4",
  "10", "34", "20", "4",
  "10", "34", "20", "8",
  "10", "30", "20", "8",
  "0", "ENDSEC",
  "0", "EOF",
  "",
].join("\n");

/** Shoelace area of a ring, so the committed polygon can be checked by value. */
function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

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
    activePk: TEST_PK,
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
    activePk: "",
    selectedElement: { type: null },
  });
  useActiveBuildingStore.getState().clearActiveBuilding();
}

function stubNetwork() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/api/cad/reconstruct")
      ? { reader: "deterministic", model: null }
      : { items: [], totalCount: 0 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("UploadStage", () => {
  beforeEach(() => {
    resetStores();
    seedBuilding();
    stubNetwork();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("renders dropzone with .dxf and .dwg badges", () => {
    renderStage();
    expect(screen.getByTestId("upload-dropzone")).toBeTruthy();
    expect(screen.getByText(".dxf")).toBeTruthy();
    expect(screen.getByText(".dwg")).toBeTruthy();
  });

  it("Continue button is disabled before any file is processed", () => {
    renderStage();
    const button = screen.getByTestId("upload-continue") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("offers a sample drawing so the CAD door is not a dead end", () => {
    renderStage();
    expect(screen.getByTestId("upload-sample-dxf")).toBeTruthy();
  });

  // P2-17 — CAD-less path
  it("Continue without CAD advances to twin and records the skip, writing no footprint", () => {
    renderStage();
    fireEvent.click(screen.getByTestId("upload-skip"));

    expect(useWorkflowStore.getState().stage).toBe("twin");
    expect(useWorkflowStore.getState().cadSkipped[TEST_PK]).toBe(true);
    // No footprint override was invented for the skipped building
    expect(useRecipeStore.getState().overrides[TEST_PK]?.footprintPolygon).toBeUndefined();
  });

  it("Continue without CAD shows an error and stays on upload when no building is active", () => {
    // Clear the seeded building so useActiveBuildingPk resolves to ""
    useMaterialStore.setState({ properties: {}, activePk: "", selectedElement: { type: null } });
    useActiveBuildingStore.getState().clearActiveBuilding();
    renderStage();
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

    renderStage();
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

    renderStage();
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

    renderStage();
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      // The alert must name the actual problem — a missing AC version header —
      // in either the Korean summary or the English tier warning.
      expect(screen.getByRole("alert").textContent ?? "").toMatch(
        /AC[\s‑\-]?(version|버전)|valid DWG|DWG 파일로 보이지 않습니다/i
      );
    });

    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("keeps a newer DXF when an older DWG resolves after it", async () => {
    let resolveSlowDwg: (
      result: Awaited<ReturnType<typeof dwgParser.parseDwgFile>>,
    ) => void = () => {
      throw new Error("slow DWG resolver was not initialized");
    };
    const slowDwg = new Promise<
      Awaited<ReturnType<typeof dwgParser.parseDwgFile>>
    >((resolve) => {
      resolveSlowDwg = resolve;
    });
    let firstSignal: AbortSignal | undefined;
    vi.spyOn(dwgParser, "parseDwgFile").mockImplementation(
      async (_file, options) => {
        firstSignal = options?.signal;
        return slowDwg;
      },
    );

    const oldFile = new File([new Uint8Array(32)], "old-plan.dwg", {
      type: "application/acad",
    });
    const currentFile = new File([RECT_DXF], "current-plan.dxf", {
      type: "application/dxf",
    });
    if (
      typeof (currentFile as { text?: () => Promise<string> }).text !==
      "function"
    ) {
      Object.defineProperty(currentFile, "text", {
        value: async () => RECT_DXF,
      });
    }

    renderStage();
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [oldFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(firstSignal).toBeDefined();
      expect(
        (screen.getByTestId("upload-continue") as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    Object.defineProperty(input, "files", {
      value: [currentFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(firstSignal?.aborted).toBe(true);
      expect(
        (screen.getByTestId("upload-continue") as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    await act(async () => {
      resolveSlowDwg({
        candidates: [
          {
            polygon: [
              [0, 0],
              [30, 0],
              [30, 30],
              [0, 30],
            ],
            layer: "STALE_DWG",
            areaSqm: 900,
            vertexCount: 4,
          },
        ],
        unitScaleToMeters: 1,
        warnings: [],
        diagnostics: { version: null, outcomes: [] },
      });
      await slowDwg;
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId("upload-continue"));
    expect(
      useRecipeStore.getState().overrides[TEST_PK]?.footprintPolygon,
    ).toEqual([
      [
        [-5, -4],
        [5, -4],
        [5, 4],
        [-5, 4],
      ],
    ]);
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("accepts .pdf and transitions to the PDF tracing UI", async () => {
    // pdfjs-dist pulls wasm/canvas machinery that happy-dom can't satisfy, so
    // the module-level test stub keeps it out. Only `getDocument` is
    // called during mount; we resolve it with a never-settling promise so the
    // loading branch stays on-screen long enough for the assertion.
    const file = new File([new Uint8Array([37, 80, 68, 70])], "plan.pdf", {
      type: "application/pdf",
    });

    renderStage();
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
  });

  it("multi-candidate DXF: card click previews but does not enable Continue; Confirm enables it", async () => {
    const file = new File([TWO_LAYER_DXF], "plan.dxf", { type: "application/dxf" });
    if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(file, "text", { value: async () => TWO_LAYER_DXF });
    }

    renderStage();
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

  // WF-08 — the picker is keyed by candidate index, not layer name. Two rings
  // on layer "0" used to highlight together and confirm committed the first.
  it("two rings on layer 0: only the clicked card is pressed, the stage shows it, confirm commits that ring", async () => {
    const file = new File([TWO_RINGS_LAYER0_DXF], "plan.dxf", { type: "application/dxf" });
    if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(file, "text", { value: async () => TWO_RINGS_LAYER0_DXF });
    }

    renderStage();
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/Select the footprint layer|풋프린트 레이어/)).toBeTruthy();
    });

    const cards = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-layer="0"]'),
    );
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.getAttribute("data-candidate-index"))).toEqual(["0", "1"]);
    // Nothing is pressed before a click, and no confirm button exists yet.
    expect(cards.map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    expect(screen.queryByTestId("layer-picker-confirm")).toBeNull();

    // Click the SECOND ring — the smaller L-shape.
    fireEvent.click(cards[1]);

    await waitFor(() => {
      expect(screen.getByTestId("layer-picker-confirm")).toBeTruthy();
    });
    const pressed = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-layer="0"]'),
    ).map((c) => c.getAttribute("aria-pressed"));
    expect(pressed).toEqual(["false", "true"]);

    // The stage describes the clicked ring — and its sentence must agree with
    // the parser's own numbers for that ring, not merely mention them.
    const stageText = screen.getByTestId("layer-picker-stage").textContent ?? "";
    const areaMatch = /(\d+)\s*m²/.exec(stageText);
    const vertexMatch = /(\d+)\s*(?:정점|vertices)/.exec(stageText);
    expect(areaMatch?.[1]).toBe("56");
    expect(vertexMatch?.[1]).toBe("6");
    expect(stageText).toMatch(/미리보기|Preview/);
    expect(stageText).not.toMatch(/확정|Confirm/);

    // Continue stays disabled until confirm.
    expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("layer-picker-confirm"));
    await waitFor(() => {
      expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("upload-continue"));

    // The committed ring is the one that was clicked: 6 vertices, 56 m².
    const rings = useRecipeStore.getState().overrides[TEST_PK]?.footprintPolygon;
    expect(rings).toBeDefined();
    expect(rings!.length).toBe(1);
    expect(rings![0].length).toBe(6);
    expect(ringArea(rings![0])).toBeCloseTo(56, 6);
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  // A4-WF03 — dragenter/dragleave fire on every child the cursor crosses.
  it("drag-over survives crossing a child and the sentence reads 'drop to read' only while dragging", () => {
    renderStage();
    const zone = screen.getByTestId("upload-dropzone");
    const child = zone.querySelector("svg") as SVGSVGElement;
    expect(child).toBeTruthy();

    expect(zone.className).not.toContain("border-primary");
    expect(screen.queryByText(/놓으면 읽습니다|Drop to read/)).toBeNull();

    // Only a file drag can be read, so only a file drag lights the zone:
    // dragged text or a URL must leave it idle.
    const files = { dataTransfer: { types: ["Files"] } };
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["text/plain"] } });
    expect(zone.className).not.toContain("border-primary");
    expect(screen.queryByText(/놓으면 읽습니다|Drop to read/)).toBeNull();
    fireEvent.dragLeave(zone);

    fireEvent.dragEnter(zone, files);
    expect(zone.className).toContain("border-primary");
    expect(screen.getByText(/놓으면 읽습니다|Drop to read/)).toBeTruthy();

    // Crossing into and out of a child (bubbles to the zone) must not clear it.
    fireEvent.dragEnter(child, files);
    fireEvent.dragLeave(child);
    expect(zone.className).toContain("border-primary");
    expect(screen.getByText(/놓으면 읽습니다|Drop to read/)).toBeTruthy();

    // Leaving the zone itself clears it and restores the idle sentence.
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-primary");
    expect(screen.getByText(/파일을 끌어다 놓거나|Drag and drop a file, or/)).toBeTruthy();

    // A drop resets the depth even if the browser skipped a dragleave.
    fireEvent.dragEnter(zone, files);
    fireEvent.dragEnter(child, files);
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(zone.className).not.toContain("border-primary");
    fireEvent.dragEnter(zone, files);
    expect(zone.className).toContain("border-primary");
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-primary");
  });

  it("states the import limits before a file is chosen and refuses an oversize file with exactly one alert under the zone", async () => {
    renderStage();
    const zone = screen.getByTestId("upload-dropzone");
    const clientLimit = formatFileSizeMiB(CAD_CLIENT_MAX_FILE_BYTES);
    const serverLimit = formatFileSizeMiB(CAD_SERVER_FALLBACK_MAX_FILE_BYTES);
    // The line quotes the exported constants, so it can never drift from processFile.
    const limitLine = zone.textContent ?? "";
    expect(limitLine).toContain(clientLimit);
    expect(limitLine).toContain(serverLimit);
    expect(screen.queryByRole("alert")).toBeNull();

    // One byte over the browser ceiling; no need to allocate the bytes.
    const file = new File(["x"], "huge.dxf", { type: "application/dxf" });
    Object.defineProperty(file, "size", { value: CAD_CLIENT_MAX_FILE_BYTES + 1 });
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(clientLimit);
    // Directly under the zone, and the limits line is still readable.
    expect(zone.nextElementSibling).toBe(alert);
    expect(zone.textContent).toContain(clientLimit);
    // No processing layer for a refused file, and the file is not named as read.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/읽은 파일|File read/)).toBeNull();
  });

  it("names the file being read inside the zone while parsing, and the ready card names the file that won", async () => {
    let resolveSlowDwg: (
      result: Awaited<ReturnType<typeof dwgParser.parseDwgFile>>,
    ) => void = () => {
      throw new Error("slow DWG resolver was not initialized");
    };
    const slowDwg = new Promise<
      Awaited<ReturnType<typeof dwgParser.parseDwgFile>>
    >((resolve) => {
      resolveSlowDwg = resolve;
    });
    vi.spyOn(dwgParser, "parseDwgFile").mockImplementation(async () => slowDwg);

    const oldFile = new File([new Uint8Array(32)], "old-plan.dwg", {
      type: "application/acad",
    });
    const currentFile = new File([RECT_DXF], "current-plan.dxf", {
      type: "application/dxf",
    });
    if (typeof (currentFile as { text?: () => Promise<string> }).text !== "function") {
      Object.defineProperty(currentFile, "text", { value: async () => RECT_DXF });
    }

    renderStage();
    const zone = screen.getByTestId("upload-dropzone");
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [oldFile], configurable: true });
    fireEvent.change(input);

    // The processing layer sits INSIDE the zone, names the file and its size,
    // and the input is still mounted beneath it.
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    const status = screen.getByRole("status");
    expect(zone.contains(status)).toBe(true);
    expect(status.textContent).toContain("old-plan.dwg");
    // The caption states the size a reader would measure: a 32-byte file is
    // "1 KB", not the limit-comparison rounding's "0.1 MB".
    expect(status.textContent).toContain("1 KB");
    expect(status.textContent).not.toMatch(/\d+(\.\d+)?\s*MB/);
    expect(status.textContent).toMatch(/도면 처리 중|Processing drawing/);
    expect(zone.contains(screen.getByTestId("upload-file-input"))).toBe(true);
    // Exactly one live region, and it is a status, not an alert.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();

    // A newer DXF supersedes the pending DWG.
    Object.defineProperty(input, "files", { value: [currentFile], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.queryByRole("status")).toBeNull();
    const fileLine = screen.getByText(/읽은 파일|File read/);
    expect(fileLine.textContent).toContain("current-plan.dxf");
    expect(fileLine.textContent).toContain(
      `${Math.max(1, Math.round(currentFile.size / 1024))} KB`,
    );
    expect(fileLine.textContent).not.toContain("old-plan.dwg");
    // The layer is named in a sans span, not <code> (Korean layer names are common).
    expect(document.querySelector("code")).toBeNull();

    // The stale DWG resolving later changes nothing.
    await act(async () => {
      resolveSlowDwg({
        candidates: [
          { polygon: [[0, 0], [30, 0], [30, 30], [0, 30]], layer: "STALE_DWG", areaSqm: 900, vertexCount: 4 },
        ],
        unitScaleToMeters: 1,
        warnings: [],
        diagnostics: { version: null, outcomes: [] },
      });
      await slowDwg;
      await Promise.resolve();
    });
    expect(screen.getByText(/읽은 파일|File read/).textContent).toContain("current-plan.dxf");
  });

  it("the sample path names sample-footprint.dxf as the file read, with no invented size", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/samples/sample-footprint.dxf")) {
        return new Response(RECT_DXF, { status: 200, headers: { "content-type": "application/dxf" } });
      }
      const body = url.includes("/api/cad/reconstruct")
        ? { reader: "deterministic", model: null }
        : { items: [], totalCount: 0 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    renderStage();
    fireEvent.click(screen.getByTestId("upload-sample-dxf"));

    await waitFor(() => {
      expect((screen.getByTestId("upload-continue") as HTMLButtonElement).disabled).toBe(false);
    });
    const fileLine = screen.getByText(/읽은 파일|File read/);
    expect(fileLine.textContent).toContain("sample-footprint.dxf");
    // No File object existed, so no size may be claimed.
    expect(fileLine.textContent).not.toMatch(/\d+(\.\d+)?\s*MB/);
    expect(screen.queryByText(/복원 도면|Reconstructed drawing/)).toBeNull();
  });
});

// ─── P2-24 — cad-first mode: CAD is mandatory, search does not exist ─────────

describe("UploadStage in cad-first mode (P2-24)", () => {
  const CAD_PK = "cad-test-draft";

  beforeEach(() => {
    resetStores();
    stubNetwork();
    useActiveBuildingStore.getState().setActiveBuilding(CAD_PK);
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    useActiveBuildingStore.getState().clearActiveBuilding();
  });

  it("hides the skip button and the back-to-search button", () => {
    renderStage();
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

    renderStage();
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
