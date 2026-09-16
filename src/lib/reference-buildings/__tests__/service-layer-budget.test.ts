import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "../manifest";
import {
  SERVICE_LAYER_BUDGET_WAIVERS,
  SERVICE_LAYER_DRAW_CALL_BUDGET,
  checkServiceLayerBudget,
  collectServiceLayerRows,
  type ServiceLayerRow,
} from "../service-layer-budget";

const read = (id: string, name: string) =>
  readFileSync(path.join(process.cwd(), "public/reference-buildings", id, name));

const manifests = REFERENCE_BUILDING_IDS.map((id) => ({
  buildingId: id,
  manifest: JSON.parse(read(id, "manifest.json").toString()) as ReferenceBuildingManifest,
}));

const rows = collectServiceLayerRows(
  manifests.map(({ buildingId, manifest }) => ({ buildingId, serviceLayers: manifest.serviceLayers })),
);

describe("service-layer draw-call budget against the live roster", () => {
  it("collects exactly 21 rows from exactly 6 publishing models", () => {
    expect(rows).toHaveLength(21);
    const publishingModels = new Set(rows.map((row) => row.buildingId));
    expect(publishingModels.size).toBe(6);
    expect(publishingModels).toEqual(
      new Set([
        "bs-medical-dental-clinic",
        "duplex-apartment",
        "schependomlaan",
        "sixty5",
        "taltech-maemaja",
        "west-riverside-hospital",
      ]),
    );
  });

  it("the 21 live rows plus the shipped waiver register produce zero findings", () => {
    const findings = checkServiceLayerBudget(rows, SERVICE_LAYER_BUDGET_WAIVERS);
    expect(findings).toEqual([]);
  });

  it("the waiver key set equals exactly the set of live keys whose drawCalls exceed 300", () => {
    const overBudgetKeys = new Set(
      rows.filter((row) => row.drawCalls > SERVICE_LAYER_DRAW_CALL_BUDGET).map((row) => row.key),
    );
    const waiverKeys = new Set(Object.keys(SERVICE_LAYER_BUDGET_WAIVERS));
    expect(waiverKeys).toEqual(overBudgetKeys);
  });

  it("bs-medical-dental-clinic/hvac (276) and west-riverside-hospital/sprinkler (249) sit under budget unwaived", () => {
    const byKey = new Map(rows.map((row) => [row.key, row] as const));
    expect(byKey.get("bs-medical-dental-clinic/hvac")?.drawCalls).toBe(276);
    expect(byKey.get("west-riverside-hospital/sprinkler")?.drawCalls).toBe(249);
    expect(SERVICE_LAYER_BUDGET_WAIVERS["bs-medical-dental-clinic/hvac"]).toBeUndefined();
    expect(SERVICE_LAYER_BUDGET_WAIVERS["west-riverside-hospital/sprinkler"]).toBeUndefined();
  });

  it("every waiver's measuredDrawCalls is above 300 and measuredOn parses as a date", () => {
    for (const waiver of Object.values(SERVICE_LAYER_BUDGET_WAIVERS)) {
      expect(waiver.measuredDrawCalls).toBeGreaterThan(SERVICE_LAYER_DRAW_CALL_BUDGET);
      expect(Number.isNaN(Date.parse(waiver.measuredOn))).toBe(false);
    }
  });

  // Known limit, worth stating because it already bit this file: this checks
  // that every digit is SOURCED, not that the sentence built from those digits
  // is true. On 2026-09-16 each reason read "N distinct geometries collapse
  // into M instanced shapes", which inverts the mechanism -- drawCalls is
  // nodes.length in scripts/lib/ifc-glb.mjs, so the M instanced shapes are the
  // ones that stayed separate at one draw call each, and the low-repetition
  // remainder is what merges into the few per-group batches. This test passed
  // before AND after that correction. An inverted relationship between correct
  // numbers is invisible here; only reading the generator catches it.
  it("every integer in every waiver's prose reason traces to that layer's own manifest row, to 300, or to the overage", () => {
    const rowsByKey: Record<string, ServiceLayerRow> = Object.fromEntries(rows.map((row) => [row.key, row]));
    for (const [key, waiver] of Object.entries(SERVICE_LAYER_BUDGET_WAIVERS)) {
      const row = rowsByKey[key];
      expect(row, `waiver key ${key} must match a live row`).toBeDefined();
      const overage = row.drawCalls - SERVICE_LAYER_DRAW_CALL_BUDGET;
      const allowed = new Set(
        [
          SERVICE_LAYER_DRAW_CALL_BUDGET,
          overage,
          row.drawCalls,
          row.elements,
          row.triangleCount,
          row.distinctGeometries,
          row.instancedShapes,
          row.instancedPlacements,
        ].map(String),
      );
      const found = [...waiver.reason.matchAll(/\d+/g)].map((match) => match[0]);
      expect(found.length).toBeGreaterThan(0);
      for (const digits of found) {
        expect(allowed.has(digits), `"${digits}" in reason for ${key} is not traceable to a manifest field, 300, or the overage`).toBe(true);
      }
    }
  });
});
