import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import type { ArchitecturalDetailsStatus } from "../reference-architectural-details";

vi.mock("../reference-model-viewer", () => ({
  ReferenceModelViewer: ({ active, services, detailsRetry, onDetailsStatus }: {
    active: ReadonlySet<string>;
    services: readonly { id: string }[];
    detailsRetry: number;
    onDetailsStatus: (status: ArchitecturalDetailsStatus) => void;
  }) => <div data-testid="detail-test-viewer" data-active={[...active].join(",")} data-services={services.map((layer) => layer.id).join(",")} data-retry={detailsRetry}>
    <button onClick={() => onDetailsStatus("error")}>Simulate detail load failure</button>
  </div>,
}));
vi.mock("../reference-detail-geometry", () => ({ clearArchitecturalDetails: vi.fn() }));
vi.mock("../reference-energy", () => ({
  useSeedReferenceEnergy: () => {}, ReferenceEnergyFrame: () => null, ReferenceEnergyPanel: () => null,
}));
vi.mock("../reference-retrofit", () => ({ ReferenceRetrofitPanel: () => null }));

import { ReferenceBuildingWorkspace } from "../reference-building-workspace";
import { clearArchitecturalDetails } from "../reference-detail-geometry";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/reference-buildings/bs-medical-dental-clinic/manifest.json"), "utf8")) as ReferenceBuildingManifest;
const props = { manifest, modelUrl: "/fabric.glb", baseUrl: "/reference-buildings/bs-medical-dental-clinic", constructions: [], energy: null, locale: "en" as const };

describe("source detail controls in the reference workspace", () => {
  it("defaults details on and changes them independently of fabric and source services", () => {
    render(<ReferenceBuildingWorkspace {...props} />);
    const viewer = screen.getByTestId("detail-test-viewer");
    const toggle = screen.getByTestId("reference-model-layer-details");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(viewer.getAttribute("data-active")!.split(",")).toEqual(["fabric", "details"]);
    expect(viewer.getAttribute("data-services")!.split(",")).toEqual(manifest.serviceLayers!.map((layer) => layer.id));
    expect(viewer.getAttribute("data-services")).not.toContain("details");
    expect(screen.getByText("Base fabric file:").parentElement!.textContent).toContain(manifest.model.note);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(viewer.getAttribute("data-active")).toBe("fabric");
    fireEvent.click(screen.getByTestId(`reference-model-layer-${manifest.serviceLayers![0].id}`));
    fireEvent.click(toggle);
    expect(viewer.getAttribute("data-active")!.split(",")).toEqual(["fabric", manifest.serviceLayers![0].id, "details"]);
  });

  it("retries a failed detail request while keeping the base model and its controls available", () => {
    render(<ReferenceBuildingWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Simulate detail load failure" }));
    expect(screen.getByTestId("reference-details-status").getAttribute("data-status")).toBe("error");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    expect(clearArchitecturalDetails).toHaveBeenCalledWith(`${props.baseUrl}/${manifest.architecturalDetails!.file}`);
    expect(screen.getByTestId("detail-test-viewer").getAttribute("data-retry")).toBe("1");
    expect(screen.getByTestId("reference-model-layer-fabric").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not invent a detail layer for a manifest without one", () => {
    render(<ReferenceBuildingWorkspace {...props} manifest={{ ...manifest, architecturalDetails: undefined }} />);
    expect(screen.queryByTestId("reference-model-layer-details")).toBeNull();
    expect(screen.getByTestId("detail-test-viewer").getAttribute("data-active")).toBe("fabric");
  });
});
