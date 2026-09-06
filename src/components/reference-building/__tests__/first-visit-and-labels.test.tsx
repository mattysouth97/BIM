// Three things a reader sees before they see a number.
//
//  1. The energy frame on a genuinely FIRST visit, with nothing persisted.
//  2. The flow note's supply/return split, which claimed a classification the
//     extractor does not make.
//  3. The envelope legend's "the ratio is assumed uniform", which stops being
//     true the moment a building measures its glazing per orientation.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import {
  useSeedReferenceEnergy,
  orientationWwrNote,
  measuredOrientationRows,
} from "../reference-energy";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { meanWindowToWallRatio } from "@/lib/energy/heat-loss";
import { flowNoteBody } from "../reference-building-workspace";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { REFERENCE_BUILDING_IDS } from "@/lib/reference-buildings/manifest";
import type { ReferenceBuildingId } from "@/lib/reference-buildings/manifest";

describe("first visit: the frame appears with nothing in the persisted stores", () => {
  beforeEach(() => {
    cleanup();
    // A profile that has never seen this app. `baseRecipes` is not persisted
    // at all and `properties` is, so a first-time visitor arrives with both
    // empty — which is the state that has to render, not the one where a
    // previous visit left the building behind.
    localStorage.clear();
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
    useActiveBuildingStore.setState({ buildingPk: "", sigunguCd: null });
  });

  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: seeding and the engine resolve in one mount`, () => {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;

      // Nothing is seeded before the mount. If this ever passes because a
      // previous test left the key behind, the assertion below fails first.
      expect(useMaterialStore.getState().properties[energy.buildingPk]).toBeUndefined();
      expect(useRecipeStore.getState().baseRecipes[energy.buildingPk]).toBeUndefined();

      const { result } = renderHook(() => {
        useSeedReferenceEnergy(energy);
        return useEnergyMetrics(energy.buildingPk, energy.climate.sigunguCd);
      });

      // The seed effect and the consumer are in one commit: by the time the
      // hook has settled the engine has an answer. A page that needs a
      // reload to show its energy strip fails here.
      expect(result.current).not.toBeNull();
      expect(result.current!.demand.demandPerSqm).toBeGreaterThan(0);
      expect(result.current!.heatLoss.totalHeatLoss).toBeGreaterThan(0);

      // And the seed reached all three stores the page's other consumers read.
      expect(useMaterialStore.getState().properties[energy.buildingPk]).toBeDefined();
      expect(useRecipeStore.getState().baseRecipes[energy.buildingPk]).toBeDefined();
      expect(useActiveBuildingStore.getState().buildingPk).toBe(energy.buildingPk);
      expect(useActiveBuildingStore.getState().sigunguCd).toBe(energy.climate.sigunguCd);
    });
  }

  it("a user edit survives the seed, and a stale copy of a shipped constant does not", () => {
    const energy = referenceBuildingEnergyInputs("bs-medical-dental-clinic")!;
    // A persisted copy the user edited must not be overwritten…
    const edited = { ...energy.materials, source: "user-input" as const };
    useMaterialStore.setState({ properties: { [energy.buildingPk]: edited } });
    renderHook(() => useSeedReferenceEnergy(energy));
    expect(useMaterialStore.getState().properties[energy.buildingPk].source).toBe(
      "user-input",
    );

    // …but a stale persisted copy of a SHIPPED constant must be replaced, or
    // a corrected U-value in the file would never reach a returning visitor.
    cleanup();
    useMaterialStore.setState({
      properties: { [energy.buildingPk]: { ...energy.materials, codeYear: 1900 } },
    });
    renderHook(() => useSeedReferenceEnergy(energy));
    expect(useMaterialStore.getState().properties[energy.buildingPk].codeYear).toBe(
      energy.materials.codeYear,
    );
  });
});

describe("flowNoteBody says what the extractor measured, not supply/return", () => {
  const base = {
    file: "f.json",
    ports: 100,
    connections: 485,
    directedEdges: 190,
    drawnEdges: 190,
    bidirectionalEdges: 295,
    unresolvedConnections: 0,
    ungeometried: 0,
    unreachedEdges: 0,
    plantNodes: 0,
    supplySegments: 0,
    returnSegments: 190,
    reason: null,
    wavelengthM: 26,
  };

  it("refuses to split a network with no plant in it", () => {
    const en = flowNoteBody(base, false);
    // The old sentence read "0 downstream of plant, 190 upstream" — two exact
    // counts of a classification that never ran, about a plant the file does
    // not contain.
    expect(en).not.toContain("downstream of plant");
    expect(en).not.toContain("upstream");
    expect(en).toContain("no plant is declared");
    expect(en).toContain("never classified");
    // The part that IS measured survives.
    expect(en).toContain("190 of 485 connections state a direction");

    const ko = flowNoteBody(base, true);
    expect(ko).not.toContain("상류");
    expect(ko).toContain("계산되지 않았습니다");
  });

  it("calls the split reachability when there IS a plant, and counts the plant", () => {
    const flow = { ...base, plantNodes: 2, supplySegments: 10, returnSegments: 944, drawnEdges: 954, directedEdges: 954, connections: 6529, bidirectionalEdges: 5575 };
    const en = flowNoteBody(flow, false);
    expect(en).toContain("10 reachable from the 2 declared plant nodes");
    expect(en).toContain("944 not reached");
    expect(en).not.toContain("upstream");
  });

  it("agrees with the number of plant nodes in its own singular/plural", () => {
    const one = flowNoteBody({ ...base, plantNodes: 1, supplySegments: 5, returnSegments: 185 }, false);
    expect(one).toContain("1 declared plant node,");
    expect(one).not.toContain("plant nodes");
  });

  it("every published layer's sentence is consistent with its own counts", async () => {
    for (const id of REFERENCE_BUILDING_IDS) {
      const manifest = (await import(
        `../../../../public/reference-buildings/${id}/manifest.json`
      )) as { default?: { serviceLayers?: { flow?: typeof base }[] }; serviceLayers?: { flow?: typeof base }[] };
      const layers = (manifest.default ?? manifest).serviceLayers ?? [];
      for (const layer of layers) {
        if (!layer.flow) continue;
        const en = flowNoteBody(layer.flow, false);
        // No sentence may claim a plant the layer does not declare.
        if (layer.flow.plantNodes === 0) {
          expect(en).not.toMatch(/reachable from/);
        } else {
          expect(en).toContain(`${layer.flow.plantNodes} declared plant node`);
        }
      }
    }
  });
});

describe("orientationWwrNote reads the ratios it is describing", () => {
  const uniform = { N: 0.2, S: 0.2, E: 0.2, W: 0.2 };
  // The Duplex's measured split, which is what made the hard-coded sentence
  // false: unweighted 0.233 against a wall-weighted 0.189.
  const measured = { N: 0.357, E: 0.104, S: 0.367, W: 0.105 };

  it("says 'assumed uniform' only when the four ratios really are equal", () => {
    expect(orientationWwrNote(uniform, true, false)).toContain("assumed uniform");
    expect(orientationWwrNote(uniform, true, false)).toContain("A-WWR-DENOMINATOR");
  });

  it("stops claiming uniformity once a building measures its glazing per orientation", () => {
    const en = orientationWwrNote(measured, true, false);
    expect(en).not.toContain("assumed uniform");
    expect(en).not.toContain("A-WWR-DENOMINATOR");
    expect(en).toContain("measured per orientation");
    expect(en).toContain("wall-area-weighted mean");

    const ko = orientationWwrNote(measured, true, true);
    expect(ko).not.toContain("균등 가정");
    expect(ko).toContain("가중한 평균");
  });

  it("carries the north caveat independently of which branch it took", () => {
    for (const wwr of [uniform, measured]) {
      expect(orientationWwrNote(wwr, true, false)).toContain("no true north stated");
      expect(orientationWwrNote(wwr, false, false)).not.toContain("no true north stated");
    }
  });

  it("both published buildings are still on the uniform branch", () => {
    for (const id of REFERENCE_BUILDING_IDS) {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const wwr = energy.materials.envelope.windows.windowToWallRatio;
      expect(orientationWwrNote(wwr, energy.northAssumed, false)).toContain(
        "assumed uniform",
      );
    }
  });
});

describe("the legend rows are per-sector, not the whole building repeated", () => {
  // A split like the Duplex's: uneven walls, uneven ratios.
  const GROSS = { N: 56.9, E: 78.4, S: 89.3, W: 116.4 } as const;
  const WWR = { N: 0.357, E: 0.104, S: 0.367, W: 0.105 } as const;

  it("each row's window area is its OWN gross times its OWN ratio", () => {
    const energy = referenceBuildingEnergyInputs("bs-medical-dental-clinic")!;
    const withSplit = { ...energy, grossWallByOrientationSqm: GROSS };
    const rows = measuredOrientationRows(withSplit, WWR);

    for (const row of rows) {
      expect(row.grossWallAreaSqm).toBeCloseTo(GROSS[row.orientation], 6);
      expect(row.windowAreaSqm).toBeCloseTo(
        GROSS[row.orientation] * WWR[row.orientation],
        6,
      );
    }
    // North holds 20.32 m² of glass, not the 121.5 m² the whole-building
    // gross times the north ratio would have claimed.
    const north = rows.find((r) => r.orientation === "N")!;
    expect(north.windowAreaSqm).toBeCloseTo(20.31, 1);

    // And the four rows still sum to the building's aperture.
    const total = rows.reduce((s, r) => s + r.windowAreaSqm, 0);
    expect(total).toBeCloseTo(73.46, 1);
  });

  it("both published buildings' rows still sum to their measured aperture", () => {
    for (const id of REFERENCE_BUILDING_IDS) {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const wwr = energy.materials.envelope.windows.windowToWallRatio;
      const rows = measuredOrientationRows(energy, wwr);
      const gross = envelopeQuantities(energy.recipe).grossWallAreaSqm;
      const aperture = gross * meanWindowToWallRatio(energy.materials);

      expect(rows.reduce((s, r) => s + r.grossWallAreaSqm, 0)).toBeCloseTo(gross, 6);
      expect(rows.reduce((s, r) => s + r.windowAreaSqm, 0)).toBeCloseTo(aperture, 6);
    }
  });
});
