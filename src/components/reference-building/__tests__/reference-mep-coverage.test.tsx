import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { ReferenceMepCoverage } from "../reference-mep-coverage";

afterEach(cleanup);

const IDS = ["bs-medical-dental-clinic", "schependomlaan", "duplex-apartment", "fzk-haus", "kit-office"];

describe("MEP source coverage claims", () => {
  for (const id of IDS) {
    for (const isKo of [true, false]) {
      it(`${id}/${isKo ? "ko" : "en"}: counts are source-file occurrences and reconcile by IFC class`, () => {
        const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/reference-buildings", id, "manifest.json"), "utf8")) as ReferenceBuildingManifest;
        const coverage = manifest.mepCoverage!;
        const { container } = render(<ReferenceMepCoverage coverage={coverage} isKo={isKo} />);
        const typed = coverage.sources.reduce((sum, source) => sum + Object.values(source.entitiesByType).reduce((count, n) => count + n, 0), 0);
        const ports = coverage.sources.reduce((sum, source) => sum + source.distributionPorts, 0);
        expect(coverage.typedElementCount).toBe(typed);
        expect(coverage.distributionPortCount).toBe(ports);
        const counts = [...screen.getByTestId("reference-mep-counts").textContent!.matchAll(/[\d,]+/g)]
          .map((match) => Number(match[0].replaceAll(",", "")));
        expect(counts).toEqual([coverage.sources.length, typed, ports]);
        expect(screen.getByTestId("reference-mep-summary").textContent).toBe(isKo ? coverage.summary.ko : coverage.summary.en);
        expect(container.textContent).toContain(isKo ? "실제 설치된 고유 기기나 계통의 수가 아닙니다" : "not counts of unique installed equipment or systems");
        for (const limitation of coverage.limitations) expect(container.textContent).toContain(isKo ? limitation.ko : limitation.en);
        const published = new Set(manifest.serviceLayers?.map((layer) => layer.id) ?? []);
        for (const layerId of coverage.publishedLayerIds) expect(published.has(layerId)).toBe(true);
        if (coverage.status === "no_typed_mep_occurrences") {
          expect(typed).toBe(0);
          expect(coverage.publishedLayerIds).toHaveLength(0);
          expect(container.textContent).toContain(isKo ? "완전성 조사가 아닙니다" : "not a completeness survey");
        }
      });
    }
  }

  it("does not turn an unaudited source into a zero-equipment claim", () => {
    render(<ReferenceMepCoverage isKo={false} />);
    expect(screen.getByTestId("reference-mep-coverage").getAttribute("data-coverage")).toBe("not-audited");
    expect(screen.queryByTestId("reference-mep-counts")).toBeNull();
    expect(screen.getByText(/does not establish that equipment is absent/)).toBeDefined();
  });
});
