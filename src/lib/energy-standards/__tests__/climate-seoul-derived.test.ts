import { describe, expect, it } from "vitest";
import { SEOUL_DERIVED, SEOUL_DERIVED_ID } from "../climate-seoul-derived";
import { climateProvenanceNoticeKo, isComparableToEco2, ORIENTATIONS } from "../monthly-climate";

const annual = (o: (typeof ORIENTATIONS)[number]) =>
  SEOUL_DERIVED.solarIrradiationKwhPerM2[o].reduce((a, b) => a + b, 0);

describe("the climate is well-formed", () => {
  it("exists and carries all 12 months on all 9 orientations", () => {
    expect(SEOUL_DERIVED.id).toBe(SEOUL_DERIVED_ID);
    expect(SEOUL_DERIVED.meanExternalTemperatureC).toHaveLength(12);
    for (const o of ORIENTATIONS) {
      expect(SEOUL_DERIVED.solarIrradiationKwhPerM2[o]).toHaveLength(12);
    }
  });
});

describe("the physics the transposition must satisfy", () => {
  it("orders the facades S > E,W > N", () => {
    expect(annual("S")).toBeGreaterThan(annual("E"));
    expect(annual("S")).toBeGreaterThan(annual("W"));
    expect(annual("E")).toBeGreaterThan(annual("N"));
    expect(annual("W")).toBeGreaterThan(annual("N"));
  });

  it("keeps east and west near-symmetric", () => {
    // A large split would mean the solar azimuth sign convention is wrong -
    // the single most likely defect in a hand-rolled transposition.
    expect(Math.abs(annual("E") - annual("W")) / annual("E")).toBeLessThan(0.05);
    expect(Math.abs(annual("NE") - annual("NW")) / annual("NE")).toBeLessThan(0.15);
  });

  it("peaks the vertical south facade in a shoulder month, not midsummer", () => {
    // A vertical south wall sees least sun in June: the sun is high, so the
    // angle of incidence is worst. Peaking in June would mean the tilt was
    // never applied.
    const s = SEOUL_DERIVED.solarIrradiationKwhPerM2.S;
    const peak = s.indexOf(Math.max(...s));
    expect([0, 1, 2, 9, 10, 11]).toContain(peak);
    expect(s[5]).toBeLessThan(s[peak]); // June below the peak
  });

  it("peaks the horizontal plane in late spring", () => {
    const h = SEOUL_DERIVED.solarIrradiationKwhPerM2.horizontal;
    const peak = h.indexOf(Math.max(...h));
    expect([3, 4, 5]).toContain(peak); // Apr-Jun
  });

  it("keeps every vertical plane below the horizontal annual total", () => {
    const horiz = annual("horizontal");
    for (const o of ORIENTATIONS) {
      if (o === "horizontal") continue;
      expect(annual(o)).toBeLessThan(horiz);
    }
  });
});

describe("it does not pretend to be ECO2's weather", () => {
  it("is NOT comparable to a real ECO2 run", () => {
    expect(isComparableToEco2(SEOUL_DERIVED)).toBe(false);
  });

  it("states the substitution and all three deviations in its notice", () => {
    const notice = climateProvenanceNoticeKo(SEOUL_DERIVED);
    expect(notice).toContain("ECO2 표준기상데이터가 아님");
    expect(notice).toContain("Liu-Jordan");
    if (SEOUL_DERIVED.provenance.kind !== "derived") throw new Error("expected derived");
    const note = SEOUL_DERIVED.provenance.substitutionNote;
    expect(note).toContain("1.3K");   // cold bias
    expect(note).toContain("12월");   // the December outlier
    expect(note).toContain("17%");    // the irradiation excess
  });

  it("records the known cold bias rather than correcting it silently", () => {
    const mean =
      SEOUL_DERIVED.meanExternalTemperatureC.reduce((a, b) => a + b, 0) / 12;
    // ~11.4 C against a KMA normal near 12.7. If someone "fixes" the data to
    // match the normal without updating the provenance note, this fails.
    expect(mean).toBeGreaterThan(11.0);
    expect(mean).toBeLessThan(11.8);
  });

  it("keeps the anomalous December, since the note describes it", () => {
    expect(SEOUL_DERIVED.meanExternalTemperatureC[11]).toBeLessThan(-4);
  });
});
