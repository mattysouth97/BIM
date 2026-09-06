import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { ReferenceArchitecturalDetails } from "../reference-architectural-details";

afterEach(cleanup);

// Only these sources publish this layer. A future model with no selected
// architectural classes must not be required to invent detail geometry.
const DETAIL_BUILDING_IDS = ["bs-medical-dental-clinic", "schependomlaan", "duplex-apartment", "fzk-haus", "kit-office"] as const;

function sourceFor(id: string) {
  const directory = join(process.cwd(), "public/reference-buildings", id);
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as ReferenceBuildingManifest;
  const layer = manifest.architecturalDetails;
  if (!layer) throw new Error(`${id}: expected a published architectural detail layer`);
  const index = JSON.parse(readFileSync(join(directory, layer.indexFile), "utf8")) as {
    entities: { sourceRole: string; ifcType: string; expressId: number }[];
  };
  return { directory, layer, index };
}

describe("architectural details source claims", () => {
  for (const id of DETAIL_BUILDING_IDS) {
    for (const isKo of [true, false]) {
      it(`${id}/${isKo ? "ko" : "en"}: the rendered counts reconcile with the source-element index`, () => {
        const { layer, index } = sourceFor(id);
        const { container } = render(<ReferenceArchitecturalDetails
          layer={layer} active status="ready" baseUrl={`/reference-buildings/${id}`}
          isKo={isKo} onToggle={() => {}} onRetry={() => {}}
        />);
        const counts = [...screen.getByTestId("reference-details-source-summary").textContent!.matchAll(/[\d,]+/g)]
          .map((match) => Number(match[0].replaceAll(",", "")));
        const queried = layer.sourceFiles.flatMap((source) => source.types).reduce((sum, row) => sum + row.candidates, 0);
        const included = index.entities.length;
        expect(layer.elements).toBe(included);
        expect(counts).toEqual(isKo ? [queried, included, queried - included] : [included, queried, queried - included]);

        const tableRows = [...container.querySelectorAll("tbody tr")];
        let rowIndex = 0;
        for (const source of layer.sourceFiles) {
          for (const type of source.types) {
            const actual = index.entities.filter((entity) => entity.sourceRole === source.role && entity.ifcType === type.type).length;
            const row = tableRows[rowIndex++];
            expect(row.querySelector("th")!.textContent).toBe(type.type);
            const values = [...row.querySelectorAll("td")].map((cell) => Number(cell.textContent!.replaceAll(",", "")));
            expect(values).toEqual([type.candidates, actual, type.candidates - actual]);
          }
        }
        expect(tableRows).toHaveLength(rowIndex);
        const link = container.querySelector("a[download]")!;
        expect(link.getAttribute("href")).toBe(`/reference-buildings/${id}/${layer.indexFile}`);
      });
    }

    it(`${id}: the separately loaded GLB fits the published payload and draw-call limits`, () => {
      const { directory, layer } = sourceFor(id);
      const bytes = readFileSync(join(directory, layer.file));
      const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12))) as {
        nodes: { mesh?: number }[];
        meshes: { primitives: unknown[] }[];
      };
      const drawCalls = gltf.nodes.reduce((sum, node) => sum + (node.mesh === undefined ? 0 : gltf.meshes[node.mesh].primitives.length), 0);
      expect(bytes.length).toBe(layer.byteLength);
      expect(bytes.length).toBeLessThanOrEqual(20 * 1024 * 1024);
      expect(drawCalls).toBe(layer.drawCalls);
      expect(drawCalls).toBeLessThanOrEqual(200);
    });
  }

  it("keeps loading, failed, off and loaded states distinct, with an explicit retry action", () => {
    const { layer } = sourceFor("fzk-haus");
    const onRetry = vi.fn();
    const onToggle = vi.fn();
    const props = { layer, active: true, baseUrl: "/reference-buildings/fzk-haus", isKo: false, onRetry, onToggle };
    const { rerender } = render(<ReferenceArchitecturalDetails {...props} status="waiting" />);
    expect(screen.getByRole("status").textContent).toContain("after the base model");
    rerender(<ReferenceArchitecturalDetails {...props} status="loading" />);
    expect(screen.getByRole("status").textContent).toContain("Loading architectural details");
    rerender(<ReferenceArchitecturalDetails {...props} status="error" />);
    expect(screen.getByRole("alert").textContent).toContain("Other model layers remain available");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<ReferenceArchitecturalDetails {...props} active={false} status="error" />);
    expect(screen.getByRole("status").textContent).toBe("Layer off");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry loading" })).toBeNull();
    fireEvent.click(screen.getByTestId("reference-model-layer-details"));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<ReferenceArchitecturalDetails {...props} status="ready" />);
    expect(screen.getByRole("status").textContent).toBe("Source details loaded");
  });
});
