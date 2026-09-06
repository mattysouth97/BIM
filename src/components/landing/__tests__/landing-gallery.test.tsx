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
    // Direct children only. A selected card carries its own prose lists, so
    // counting every listitem in the subtree counts those too and would drift
    // every time a card gains a bullet.
    expect(gallery.querySelectorAll(":scope > li")).toHaveLength(
      GALLERY_ITEMS.length,
    );
    expect(screen.getByTestId("gallery-item-clinic")).toBeTruthy();
    expect(screen.getByTestId("gallery-item-schependomlaan")).toBeTruthy();

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

    expect(within(card).getByText("4,314.2 m²")).toBeTruthy();
    expect(
      within(card).getByText("259 × GSA BIM Area, ROOF·OPEN TO BELOW·MECH. YARD 제외"),
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

  it("opens its own model, and exactly one link does it", () => {
    render(<LandingPage />);
    const card = screen.getByTestId("gallery-item-clinic");

    expect(screen.getByTestId("gallery-item-clinic-status").textContent).toBe(
      "모델링 중",
    );
    // A card must never navigate to a DIFFERENT building, and the figures
    // must not each become a link — one target, and it is this building's.
    const links = within(card).queryAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(
      "/models/bs-medical-dental-clinic",
    );
  });
});

describe("gallery record", () => {
  // By id and narrowed, not GALLERY_ITEMS[0]: the gallery has more than one
  // card now and not all of them have been measured.
  const clinic = GALLERY_ITEMS.find((i) => i.id === "clinic")!;

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
    expect(rooms).toBe(259);
    // Ten spaces an area plan counts and a floor schedule does not: six ROOF,
    // three OPEN TO BELOW, one MECH. YARD.
    expect(excluded).toBe(10);
    expect(rooms + excluded).toBe(269);
  });

  it("keeps the storey areas adding up to the stated floor area", () => {
    // 64.8 + 1,723.7 + 2,525.7 = 4,314.2, matching the card and the generated
    // manifest. The first floor lost 80.1 m² when MECH. YARD was recognised as
    // an outdoor yard rather than floor.
    const summed = clinic.datums.reduce((t, d) => t + d.roomAreaSqm, 0);
    expect(summed).toBeCloseTo(4314.2, 0);

    const stated = clinic.figures.find((f) => f.id === "floor-area");
    expect(stated?.value).toBe("4,314.2 m²");
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

  it("states no airtightness, HVAC or climate, and a U-value only where the file states one", () => {
    // The rule was "no U-value figure at all", written when no published
    // model stated one — so any that appeared had been assumed somewhere and
    // was being shown as a fact. FZK Haus states 33 of them, in
    // IfcPropertySingleValue 'ThermalTransmittance', and that it does so is
    // the whole distinction between it and the other four. Forbidding the
    // figure would suppress the most load-bearing thing on its card.
    //
    // So the rule is now about PROVENANCE, not about the word: a U-value
    // figure is admissible exactly when its `read` names the IFC property or
    // quantity that carries it. Airtightness, HVAC and climate stay
    // forbidden outright — no coordination model in this gallery states any
    // of them, so there is no honest version of those figures yet.
    const alwaysForbidden = /airtight|기밀|hvac|설비|climate|기후/i;
    const thermal = /u-?value|열관류/i;
    // The property/quantity names an IFC file can actually carry one in.
    const statesItsSource =
      /IfcPropertySingleValue|IfcThermalTransmittanceMeasure|IfcElementQuantity|Pset[_A-Za-z]*/;

    for (const item of GALLERY_ITEMS) {
      for (const figure of item.figures) {
        const label = `${figure.ko} ${figure.en} ${figure.read}`;
        expect(label, `${item.id}/${figure.id}: ${label}`).not.toMatch(alwaysForbidden);
        if (thermal.test(label)) {
          expect(
            figure.read,
            `${item.id}/${figure.id} states a U-value figure, so its \`read\` must name ` +
              `the IFC property or quantity that carries it ` +
              `(IfcPropertySingleValue / IfcThermalTransmittanceMeasure / Pset / ` +
              `IfcElementQuantity). Got: "${figure.read}"`,
          ).toMatch(statesItsSource);
        }
      }
    }
  });

  it("a U-value figure that cites nothing is still refused", () => {
    // The point of loosening the rule was provenance, not the word. A card
    // claiming a U-value with a `read` that does not name where it is stated
    // must still fail — otherwise the change reads as "U-values are fine now".
    const statesItsSource =
      /IfcPropertySingleValue|IfcThermalTransmittanceMeasure|IfcElementQuantity|Pset[_A-Za-z]*/;
    expect("era table default, 1990-1999").not.toMatch(statesItsSource);
    expect("IfcPropertySingleValue 'ThermalTransmittance', 요소당 1개").toMatch(
      statesItsSource,
    );
  });

  it("every card opens its own building, never a sibling's", () => {
    // A card that navigates to a different building is the same lie as a card
    // illustrated with a different building's render, and it gets easier to
    // make with every building added.
    for (const item of GALLERY_ITEMS) {
      if (item.href === null) continue;
      expect(item.href.startsWith("/models/")).toBe(true);
    }
    expect(new Set(GALLERY_ITEMS.map((i) => i.href)).size).toBe(GALLERY_ITEMS.length);
  });
});

describe("the duplex apartment card", () => {
  const duplex = GALLERY_ITEMS.find((i) => i.id === "duplex-apartment")!;
  const figure = (id: string) => duplex.figures.find((f) => f.id === id)!;

  it("is on the gallery, with the licence its grant requires", () => {
    expect(duplex).toBeTruthy();
    expect(duplex.licence).toBe("CC BY 4.0");
    expect(duplex.attribution).toContain("buildingSMART International");
    expect(duplex.href).toBe("/models/duplex-apartment");
  });

  it("reads its storey stack the way the model records it", () => {
    // Two occupied storeys and a roof datum. The datum carries two ROOF
    // spaces and no floor; drawing it as occupied would put a floor where
    // the model has a roof.
    expect(occupiedDatums(duplex.datums).map((d) => d.name)).toEqual([
      "Level 2",
      "Level 1",
    ]);
    expect(datumRange(duplex.datums)).toEqual({ minM: 0, maxM: 6 });
  });

  it("reconciles rooms and excluded spaces to the 37 rows the file holds", () => {
    // 8 + 10 rooms, and 7 + 10 + 2 excluded, is 37 IfcSpace. The excluded
    // column is this building's whole finding: 18 analytical duplicates plus
    // one architectural ROOF plane.
    const rooms = duplex.datums.reduce((t, d) => t + d.rooms, 0);
    const excluded = duplex.datums.reduce((t, d) => t + d.excludedSpaces, 0);
    expect(rooms).toBe(18);
    expect(excluded).toBe(19);
    expect(rooms + excluded).toBe(37);
    expect(figure("rooms").value).toBe(String(rooms));
  });

  it("keeps the storey areas adding up to the stated floor area", () => {
    // 141.792 + 143.183 = 284.975, which the card shows to 1 dp. The 2-dp
    // storey rows would give 284.97, which is why the datums carry 3 dp.
    const summed = duplex.datums.reduce((t, d) => t + d.roomAreaSqm, 0);
    expect(summed).toBeCloseTo(284.975, 3);
    expect(figure("floor-area").value).toBe("285.0 m²");
  });

  it("the read string on every subtraction figure reproduces its own value", () => {
    // Not "the words appear" — the arithmetic in the explanation is parsed
    // back out and has to give the number printed beside it.
    const reproduces = (id: string) => {
      const f = figure(id);
      const terms = [...f.read.matchAll(/([+-−])?\s*(\d[\d,]*)/g)];
      let total = 0;
      terms.forEach((m, i) => {
        const n = Number(m[2].replace(/,/g, ""));
        const sign = m[1] === "-" || m[1] === "−" ? -1 : 1;
        total += i === 0 && !m[1] ? n : sign * n;
      });
      return { total, value: Number(f.value.replace(/[^\d.]/g, "")) };
    };
    // "IfcSpace 37 − 18 해석용 중복 − 1 ROOF" = 18
    expect(reproduces("rooms").total).toBe(reproduces("rooms").value);
    // "IfcWallStandardCase 56 + IfcWall 1" = 57
    expect(reproduces("walls").total).toBe(reproduces("walls").value);
    // "IfcWindow 24 − 2 천창(지붕에 설치)" = 22
    expect(reproduces("windows").total).toBe(reproduces("windows").value);
    // "IfcDoor 14 − 10 내부 칸막이벽" = 4
    expect(reproduces("doors").total).toBe(reproduces("doors").value);
    // "Duplex_MEP 924 + Duplex_Electrical 100 + Duplex_Plumbing 498" = 1,522
    expect(reproduces("services").total).toBe(reproduces("services").value);
  });

  it("names what the floor area excludes, since that is why it is right", () => {
    const area = figure("floor-area");
    expect(area.read).toMatch(/해석용 중복/);
    expect(area.read).toMatch(/ROOF/);
  });

  it("shows the naive totals nowhere — neither is a floor area", () => {
    // 799.76 m² is every IfcSpace row; 529.46 m² is what survives the ROOF
    // rule and is the figure this project was about to publish. Both read
    // like the answer and both are the building counted about twice.
    const text = JSON.stringify(duplex);
    expect(text).not.toContain("799.76");
    expect(text).not.toContain("529.46");
  });
});
