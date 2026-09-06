import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ReferenceConstructionCard, ReferenceMaterialDetails } from "../reference-material-details";
import { solveConstructions } from "@/lib/reference-buildings/constructions";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";

afterEach(cleanup);
function manifest(id: string): ReferenceBuildingManifest {
  return JSON.parse(readFileSync(resolve("public/reference-buildings", id, "manifest.json"), "utf8"));
}

describe("material details explain source, illustrative appearance and assumed heat transfer", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: exposes actual layer sets, full source names and the illustrative limit`, () => {
      const view = render(<ReferenceMaterialDetails manifest={manifest(id)} isKo={false} />);
      const cards = view.getAllByTestId("reference-material-construction");
      expect(cards.length).toBeGreaterThan(0);
      expect(within(cards[0]).getByTestId("material-construction-toggle").getAttribute("aria-expanded")).toBe("true");
      expect(view.getAllByTestId("material-appearance-basis")[0].textContent).toContain("Actual colour, finish and installation direction are unverified");
      expect(view.container.textContent).toContain("The building energy input may instead use ground coupling, combined wall leaves or a source-stated U");
    });
  }

  it("labels KIT and FZK material-only sets without claiming envelope placement", () => {
    for (const id of ["kit-office", "fzk-haus"]) {
      const view = render(<ReferenceMaterialDetails manifest={manifest(id)} isKo={false} />);
      expect(view.container.textContent).toContain("Names alone do not establish wall, roof or floor placement");
      expect(view.getAllByTestId("reference-material-construction")).toHaveLength(manifest(id).assemblies!.length);
      cleanup();
    }
  });

  it("selects a named metal stud, shows its air-R assumption, and reproduces the displayed percentage", () => {
    const construction = solveConstructions(manifest("bs-medical-dental-clinic")).find((row) => row.id === "assembly-basic-wall-exterior-insul-panel-on-mtl-stud")!;
    const view = render(<ReferenceConstructionCard construction={construction} buildingId="bs-medical-dental-clinic" isKo={false} initiallyOpen />);
    fireEvent.click(view.getByRole("button", { name: /Metal - Stud Layer/ }));
    const detail = view.getByTestId("material-layer-detail");
    expect(detail.querySelector("[data-material-sample]")?.getAttribute("data-material-sample")).toBe("framing");
    expect(detail.textContent).toContain("Fixed R 0.180 m²K/W");
    expect(detail.textContent).not.toContain("λ ");
    expect(detail.textContent).toContain("Steel stud bridging is likewise ignored");
    const share = within(detail).getByTestId("material-resistance-share");
    const percent = Number(share.textContent!.match(/([\d.]+)%/)![1]);
    const expected = 100 * 0.18 / construction.result!.totalResistanceM2KPerW;
    expect(percent).toBe(Number(expected.toFixed(1)));
  });

  it("retains the measured 110 mm even when the source material name says 70 mm", () => {
    const construction = solveConstructions(manifest("schependomlaan")).find((row) => row.id === "assembly-ifc-isolatie-110mm-glaswol")!;
    const view = render(<ReferenceConstructionCard construction={construction} buildingId="schependomlaan" isKo={false} initiallyOpen />);
    const detail = view.getByTestId("material-layer-detail");
    expect(detail.textContent).toContain("99 Isolatie - Glaswol 70mm");
    expect(detail.textContent).toContain("Thickness stated in model: 110.0 mm");
    expect(detail.textContent).toContain(construction.layers[0].ref);
  });

  it("shows known layers of an unresolved roof without publishing a partial U or resistance percentage", () => {
    const construction = solveConstructions(manifest("duplex-apartment")).find((row) => row.id.includes("live-roof"))!;
    const view = render(<ReferenceConstructionCard construction={construction} buildingId="duplex-apartment" isKo={false} initiallyOpen />);
    fireEvent.click(view.getByRole("button", { name: /Rigid insulation/ }));
    const detailText = view.getByTestId("material-layer-detail").textContent!;
    const displayedLambda = Number(detailText.match(/λ ([\d.]+) W\/mK/)![1]);
    const displayedThickness = Number(detailText.match(/Thickness stated in model: ([\d.]+) mm/)![1]) / 1000;
    const displayedR = Number(detailText.match(/R ([\d.]+) m²K\/W/)![1]);
    expect(displayedLambda).toBe(0.0253);
    expect(displayedR).toBeCloseTo(displayedThickness / displayedLambda, 3);
    expect(view.queryByTestId("material-resistance-share")).toBeNull();
    expect(view.container.textContent).toContain("U unresolved");
    expect(view.container.textContent).toContain("Textures illustrate materials");
  });

  it("keeps the unidentified FZK Solid material visible without zero-valued properties", () => {
    const construction = solveConstructions(manifest("fzk-haus")).find((row) => row.id.includes("solid"))!;
    const view = render(<ReferenceConstructionCard construction={construction} buildingId="fzk-haus" isKo initiallyOpen />);
    expect(view.getByTestId("material-layer-detail").querySelector("[data-material-sample]")?.getAttribute("data-material-sample")).toBe("unknown");
    expect(view.container.textContent).toContain("물성 미확인");
    expect(view.container.textContent).toContain("R — m²K/W");
    expect(view.container.textContent).not.toContain("R 0.000");
  });
});
