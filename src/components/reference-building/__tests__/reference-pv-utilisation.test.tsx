import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { REFERENCE_BUILDING_IDS } from "@/lib/reference-buildings/manifest";
import { layoutRoofPlanes, type RoofPlaneSet, type TaggedRing } from "@/lib/retrofit/pv-layout";
import { ReferencePvUtilisation } from "../reference-pv-utilisation";

afterEach(cleanup);

describe("the roof table reconciles its rendered claims", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    for (const locale of ["ko", "en"] as const) {
      it(`${id} / ${locale}: all planes, module areas, capacities and totals describe one array`, () => {
        const input = JSON.parse(readFileSync(join(process.cwd(), "public/reference-buildings", id, "roof-planes.json"), "utf8")) as RoofPlaneSet;
        const layout = layoutRoofPlanes(input);
        const { container } = render(<ReferencePvUtilisation layout={layout} locale={locale} />);
        const rows = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
        expect(rows).toHaveLength(input.planes.length);
        const shownTotals = [...container.querySelectorAll("tfoot td")].map((cell) => Number(cell.textContent));
        const sums = [0, 0, 0, 0, 0];
        rows.forEach((row, index) => {
          const plane = layout.planes[index];
          expect(row.dataset.pvPlane).toBe(input.planes[index].id);
          expect(row.dataset.pvExcluded).toBe(plane.excludedReason ?? "");
          const shown = [...row.querySelectorAll("td")].map((cell) => Number(cell.textContent));
          // Gross follows the simplified outline, not projectedSqm (which
          // can differ on tiny IFC clipping remnants). Shoelace it afresh.
          const gross = (input.planes[index].outline as TaggedRing[]).reduce((sum, ring) => {
            const area = Math.abs(ring.points.reduce((cross, point, i) => {
              const next = ring.points[(i + 1) % ring.points.length];
              return cross + point[0] * next[1] - next[0] * point[1];
            }, 0)) / 2;
            return sum + (ring.kind === "hole" ? -area : area);
          }, 0);
          expect(shown[0]).toBe(Number(gross.toFixed(1)));
          expect(shown[1]).toBe(Number(plane.usableSqm.toFixed(1)));
          // Reconstruct panel area and power from the drawn instances, not
          // from the table's precomputed moduleCount/area/kWp fields.
          expect(shown[3]).toBe(plane.modules.length);
          expect(shown[2]).toBeCloseTo(plane.modules.length * 1.7, 8);
          expect(shown[4]).toBeCloseTo(plane.modules.length * 0.4, 8);
          shown.forEach((value, col) => { sums[col] += value; });
        });
        // Areas sum before rounding; the caption explicitly discloses this.
        [0, 1].forEach((col) => expect(Math.abs(shownTotals[col] - sums[col])).toBeLessThanOrEqual((rows.length + 1) * 0.05));
        [2, 3, 4].forEach((col) => expect(shownTotals[col]).toBeCloseTo(sums[col], 8));
        const summary = container.querySelector('[data-testid="reference-pv-summary"]')!.textContent!;
        const count = locale === "ko" ? summary.match(/배치안 (\d+)장/) : summary.match(/Proposed (\d+) modules/);
        expect(Number(count?.[1])).toBe(sums[3]);
        expect(Number(summary.match(/([\d.]+) kWp/)?.[1])).toBeCloseTo(sums[4], 8);
        const explanation = container.querySelector('[data-testid="reference-pv-assumptions"]')!.textContent!;
        const formula = explanation.match(/(\d+)(?:장)? × ([\d.]+) = ([\d.]+) kWp/)!;
        expect(formula).not.toBeNull();
        expect(Number(formula[1]) * Number(formula[2])).toBeCloseTo(Number(formula[3]), 8);
        expect(Number(formula[3])).toBe(shownTotals[4]);
        expect(explanation).toContain("A-PV-SETBACK");
        expect(explanation).toContain(layout.latitudeDeg.toFixed(2));
        if (input.siteLatitudeDeg != null) {
          expect(explanation).toContain(locale === "ko" ? "원본 부지 위도" : "source site latitude");
          expect(explanation).not.toContain(locale === "ko" ? "서울 위도" : "Seoul latitude");
        }
        expect(explanation).toContain(locale === "ko" ? "용량이 줄어들 수" : "may reduce capacity");
        expect(container.querySelector('th[scope="col"]')?.textContent).toContain(locale === "ko" ? "지붕면" : "Roof plane");
        expect(container.querySelector('div[role="region"]')?.getAttribute("tabindex")).toBe("0");
        expect(container.querySelector("details")?.open).toBe(false);
      });
    }
  }

  it("a positive usable area with no fitting module is never labelled zero area", () => {
    const layout = layoutRoofPlanes({
      kind: "bimfit_reference_building_roof_planes", buildingId: "narrow", northAssumed: true,
      planes: [{
        id: "narrow", elementName: "Narrow deck", elementType: "IfcRoof", normal: [0, 1, 0],
        tiltDeg: 0, azimuthDeg: null, surfaceSqm: 22, projectedSqm: 22, minElevationM: 5, maxElevationM: 5,
        outline: [[[0, 0], [2.2, 0], [2.2, 10], [0, 10], [0, 0]]],
      }],
    });
    expect(layout.planes[0].usableSqm).toBeGreaterThan(0);
    expect(layout.totalModules).toBe(0);
    const { container } = render(<ReferencePvUtilisation layout={layout} locale="en" />);
    expect(container.textContent).toContain("No module fits after setbacks / clearances");
    expect(container.textContent).not.toContain("no usable area");
  });

  it("missing data is not a zero-area table", () => {
    const { container } = render(<ReferencePvUtilisation layout={null} locale="en" />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("data is not available yet");
  });
});
