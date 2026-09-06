import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { layerMappingsFor, solveConstructions } from "../constructions";
import { layerThermalDetail, sourceMaterialSample } from "../material-appearance";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "../manifest";

function manifest(id: string): ReferenceBuildingManifest {
  return JSON.parse(readFileSync(resolve("public/reference-buildings", id, "manifest.json"), "utf8"));
}

describe("source material appearance remains independent of thermal approximations", () => {
  it("keeps stud framing visible when its thermal property is a fixed air resistance", () => {
    expect(layerMappingsFor("bs-medical-dental-clinic").find((row) => row.ifcName === "Metal - Stud Layer")?.materialId).toBe("air-iso-h25");
    expect(sourceMaterialSample("bs-medical-dental-clinic", "Metal - Stud Layer").kind).toBe("framing");
  });
  it("does not paint calcium-silicate or concrete block as the thermal library's surrogate brick", () => {
    expect(sourceMaterialSample("kit-office", "Kalksandstein 2816491304").kind).toBe("masonry");
    expect(sourceMaterialSample("duplex-apartment", "Masonry - Concrete Block").kind).toBe("masonry");
    expect(sourceMaterialSample("duplex-apartment", "Masonry - Brick").kind).toBe("brick");
  });
  it("preserves unknown substance and does not borrow familiar names into unaudited buildings", () => {
    expect(sourceMaterialSample("fzk-haus", "Solid 397409098").kind).toBe("unknown");
    expect(sourceMaterialSample("unknown-building", "Masonry - Brick").kind).toBe("unknown");
    expect(sourceMaterialSample("kit-office", "Masonry - Brick").kind).toBe("unknown");
    // A function-only resilient floor layer has an EPS thermal approximation,
    // but the source itself did not identify EPS as its substance.
    expect(sourceMaterialSample("schependomlaan", "99 Isolatie - zwevende dekvloer").kind).toBe("unknown");
  });
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: texture assets exist and each R share includes surface resistance`, () => {
      for (const construction of solveConstructions(manifest(id))) {
        let summedShare = 0;
        for (const layer of construction.layers) {
          const sample = sourceMaterialSample(id, layer.ifcName);
          const path = sample.image?.match(/url\('([^']+)'\)/)?.[1];
          if (path) expect(existsSync(resolve("public", path.slice(1)))).toBe(true);
          const detail = layerThermalDetail(layer, construction);
          if (!construction.result) {
            expect(detail.shareOfTotal).toBeNull();
          } else {
            const independentlySummedR = construction.layers.reduce((sum, row) => sum + row.resistanceM2KPerW!, 0) + construction.result.surface.rsi + construction.result.surface.rse;
            expect(detail.shareOfTotal).toBeCloseTo(layer.resistanceM2KPerW! / independentlySummedR, 12);
            summedShare += detail.shareOfTotal!;
          }
        }
        if (construction.result) {
          const surfaceShare = (construction.result.surface.rsi + construction.result.surface.rse) / construction.result.totalResistanceM2KPerW;
          expect(summedShare + surfaceShare).toBeCloseTo(1, 12);
        }
      }
    });
  }
});
