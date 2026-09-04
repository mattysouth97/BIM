/* @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GALLERY_ITEMS, datumRange, occupiedDatums } from "@/lib/landing/gallery";
import { LandingPage } from "../landing-page";

afterEach(() => cleanup());

describe("landing gallery", () => {
  it("renders one card per model and nothing else", () => {
    render(<LandingPage />);

    const gallery = screen.getByTestId("landing-gallery");
    expect(within(gallery).getAllByRole("listitem")).toHaveLength(
      GALLERY_ITEMS.length,
    );
    expect(screen.getByTestId("gallery-item-clinic")).toBeTruthy();

    // The register sheet used to be this page. None of it is left.
    expect(screen.queryByTestId("landing-ledger-lookup")).toBeNull();
    expect(screen.queryByTestId("diagnostic-method-upload")).toBeNull();
    expect(screen.queryByTestId("landing-sample-diagnostic")).toBeNull();
  });

  it("carries no image at all — the plate is gone, not hidden", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector(".landing-plate")).toBeNull();
  });

  it("shows the clinic's stated figures beside what states them", () => {
    render(<LandingPage />);
    const card = screen.getByTestId("gallery-item-clinic");

    expect(within(card).getByText("4,394.3 m²")).toBeTruthy();
    expect(
      within(card).getByText("260 × GSA BIM Area, ROOF·OPEN TO BELOW 제외"),
    ).toBeTruthy();
    expect(within(card).getByText("IfcWindow")).toBeTruthy();
    expect(within(card).getByText("Clinic_Architectural.ifc")).toBeTruthy();
  });

  it("shows the area-plan total nowhere — it is not a floor area", () => {
    const { container } = render(<LandingPage />);
    // 6,935.8 m² is the sum of all 269 GSA BIM Area quantities, and it counts
    // six ROOF spaces and three OPEN TO BELOW voids as floor. It reads like
    // the answer, is 58% high, and was on this card once.
    expect(container.textContent).not.toContain("6,935.8");
  });

  it("credits the model, because its licence requires it", () => {
    render(<LandingPage />);
    const credit = screen.getByTestId("gallery-item-clinic-attribution");
    expect(credit.textContent).toContain("buildingSMART International");
    expect(credit.textContent).toContain("CC BY 4.0");
  });

  it("says the model is still being taken in rather than linking nowhere", () => {
    render(<LandingPage />);
    const card = screen.getByTestId("gallery-item-clinic");

    expect(screen.getByTestId("gallery-item-clinic-status").textContent).toBe(
      "모델링 중",
    );
    // A card with nothing to open must not navigate to a different building.
    expect(within(card).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("gallery record", () => {
  const clinic = GALLERY_ITEMS[0];

  it("keeps every figure attached to the thing that states it", () => {
    for (const item of GALLERY_ITEMS) {
      for (const figure of item.figures) {
        expect(figure.read.length).toBeGreaterThan(0);
      }
    }
  });

  it("reads the clinic's storey stack the way the model records it", () => {
    // Four datums; the footing carries no spaces and is therefore a reference
    // line, not a floor. Guarding this keeps the section diagram from drawing
    // an occupied band under the building.
    expect(clinic.datums).toHaveLength(4);
    expect(occupiedDatums(clinic.datums).map((d) => d.name)).toEqual([
      "Roof - Main",
      "Second Floor",
      "First Floor",
    ]);
    expect(datumRange(clinic.datums)).toEqual({ minM: -1, maxM: 9.25 });

    // 1 + 105 + 154 rooms, and 5 + 4 excluded ROOF/void spaces, is the 269
    // IfcSpace entities the file holds. If either column drifts from the
    // extraction, this stops adding up.
    const rooms = clinic.datums.reduce((total, d) => total + d.rooms, 0);
    const excluded = clinic.datums.reduce(
      (total, d) => total + d.excludedSpaces,
      0,
    );
    expect(rooms).toBe(260);
    expect(excluded).toBe(9);
    expect(rooms + excluded).toBe(269);
  });

  it("keeps the storey areas adding up to the stated floor area", () => {
    // 64.8 + 1,723.7 + 2,605.7 = 4,394.2, and the card says 4,394.3 — the
    // difference is one rounding step, not a fourth storey nobody drew.
    const summed = clinic.datums.reduce((t, d) => t + d.roomAreaSqm, 0);
    expect(summed).toBeCloseTo(4394.3, 0);

    const stated = clinic.figures.find((f) => f.id === "floor-area");
    expect(stated?.value).toBe("4,394.3 m²");
  });

  it("names what each figure excludes, not only what it counts", () => {
    // The roof/void exclusion is the whole reason the number is right, so it
    // has to be visible on the card rather than buried in this file.
    const area = clinic.figures.find((f) => f.id === "floor-area");
    const rooms = clinic.figures.find((f) => f.id === "rooms");
    expect(area?.read).toMatch(/ROOF/);
    expect(rooms?.read).toMatch(/ROOF/);
    expect(rooms?.read).toMatch(/OPEN TO BELOW/);
  });

  it("states no U-value, airtightness, HVAC or climate", () => {
    // A coordination model carries none of these. If one ever appears in a
    // figure label, it was assumed somewhere and is being shown as a fact.
    const forbidden = /u-?value|열관류|airtight|기밀|hvac|설비|climate|기후/i;
    for (const item of GALLERY_ITEMS) {
      for (const figure of item.figures) {
        expect(`${figure.ko} ${figure.en} ${figure.read}`).not.toMatch(forbidden);
      }
    }
  });
});
