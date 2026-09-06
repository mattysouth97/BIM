import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { envelopeConstructions } from "@/lib/reference-buildings/constructions";
import { ReferenceMaterialDetails } from "../reference-material-details";
import { ReferenceMaterialControls } from "../reference-material-controls";

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings/bs-medical-dental-clinic/manifest.json"), "utf8")) as ReferenceBuildingManifest;
const constructions = envelopeConstructions(manifest);
const binding = manifest.materialFabric!.bindings.find((entry) => entry.assemblyRef && !constructions.some((construction) => construction.ref === entry.assemblyRef))!;
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterEach(() => {
  cleanup();
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("material surface inspection", () => {
  it("opens the exact otherwise-filtered assembly and its representative layer, including repeated picks", () => {
    const selection = { binding, revision: 1 };
    const { rerender } = render(<ReferenceMaterialDetails manifest={manifest} constructions={constructions} isKo={false} selection={selection} />);
    const cards = screen.getAllByTestId("reference-material-construction");
    expect(cards).toHaveLength(constructions.length + 1);
    const selected = cards.find((card) => card.getAttribute("data-material-selected") === "true")!;
    expect(selected).toBeDefined();
    expect(screen.getByTestId("reference-material-selection").textContent).toContain(binding.assemblyRef);
    expect(screen.getByTestId("reference-material-selection").textContent).toContain("outside the default list");
    const toggle = within(selected).getByTestId("material-construction-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    expect(within(selected).getByTestId("material-layer-detail").textContent).toContain(binding.representativeLayer!.ref);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    rerender(<ReferenceMaterialDetails manifest={manifest} constructions={constructions} isKo={false} selection={{ binding, revision: 2 }} />);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows an explicit missing association without selecting a substitute assembly", () => {
    render(<ReferenceMaterialDetails manifest={manifest} constructions={constructions} isKo={false} selection={{ binding: { ...binding, status: "unassigned", assemblyRef: null, representativeLayer: null, materialNames: [] }, revision: 1 }} />);
    expect(screen.getByTestId("reference-material-selection").textContent).toContain("No source material assignment");
    expect(screen.getAllByTestId("reference-material-construction")).toHaveLength(constructions.length);
    expect(screen.getAllByTestId("reference-material-construction").some((card) => card.getAttribute("data-material-selected") === "true")).toBe(false);
  });

  it.each([false, true])("keeps representative appearance and fallback claims explicit (Korean: %s)", (isKo) => {
    const onRetry = vi.fn();
    const props = { available: true, enabled: true, status: "error" as const, isKo, onToggle: vi.fn(), onRetry };
    const { rerender } = render(<ReferenceMaterialControls {...props} />);
    expect(screen.getByTestId("reference-material-basis").textContent).toContain(isKo ? "실제 외부 마감은 확인되지 않았습니다" : "exterior finish is unverified");
    expect(screen.getByRole("alert").textContent).toContain(isKo ? "원본 외피 보기" : "Original fabric remains available");
    fireEvent.click(screen.getByTestId("reference-material-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<ReferenceMaterialControls {...props} enabled={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("reference-material-retry")).toBeNull();
    rerender(<ReferenceMaterialControls {...props} available={false} />);
    expect(screen.queryByTestId("reference-material-toggle")).toBeNull();
    expect(screen.getByTestId("reference-material-unavailable")).toBeDefined();
  });
});
