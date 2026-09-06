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
  summarisePendingBias,
  pendingBadgeText,
  measuredOrientationRows,
} from "../reference-energy";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { DUPLEX_WWR_BY_SECTOR } from "@/lib/reference-buildings/duplex-apartment-energy";
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
  // The Duplex's real split, read from its own file rather than typed: it is
  // the building with genuinely uneven walls AND uneven ratios, which is the
  // only shape in which this bug is visible. (These were four invented
  // numbers summing to 341.00 m² until 2026-09-06 — plausible, arithmetically
  // consistent, and not this or any other building.)
  const duplex = referenceBuildingEnergyInputs("duplex-apartment")!;
  const GROSS = duplex.grossWallByOrientationSqm!;
  const WWR = duplex.materials.envelope.windows.windowToWallRatio;
  const PER_SECTOR = {
    N: DUPLEX_WWR_BY_SECTOR.N,
    E: DUPLEX_WWR_BY_SECTOR.E,
    S: DUPLEX_WWR_BY_SECTOR.S,
    W: DUPLEX_WWR_BY_SECTOR.W,
  };

  it("each row's window area is its OWN gross times its OWN ratio", () => {
    // Fed the per-sector ratios the file measured but does NOT hand the
    // engine (A-WWR-ENGINE-MEAN), which is what the legend is for.
    const rows = measuredOrientationRows(duplex, PER_SECTOR);

    for (const row of rows) {
      expect(row.grossWallAreaSqm).toBeCloseTo(GROSS[row.orientation], 6);
      expect(row.windowAreaSqm).toBeCloseTo(
        GROSS[row.orientation] * PER_SECTOR[row.orientation],
        6,
      );
    }
    // North holds 20.32 m² of glass. The whole-building gross (340.58) times
    // the north ratio would have claimed 121.5 — six times the truth.
    const north = rows.find((r) => r.orientation === "N")!;
    expect(north.windowAreaSqm).toBeCloseTo(20.32, 1);
    expect(340.58 * PER_SECTOR.N).toBeCloseTo(121.5, 1);

    // And the four rows sum to the aperture the openings walk counted.
    const total = rows.reduce((s, r) => s + r.windowAreaSqm, 0);
    expect(total).toBeCloseTo(64.46, 1);
  });

  it("keeps compass captions separate from the engine slots and their quantities", () => {
    const sourceLabels = { N: "NE", E: "SE", S: "SW", W: "NW" };
    const rows = measuredOrientationRows({ ...duplex, orientationLabels: sourceLabels }, PER_SECTOR);
    expect(rows.map((row) => row.orientationLabel)).toEqual(["NE", "SE", "SW", "NW"]);
    expect(rows.map((row) => row.orientation)).toEqual(["N", "E", "S", "W"]);
    for (const row of rows) expect(row.windowAreaSqm).toBeCloseTo(GROSS[row.orientation] * PER_SECTOR[row.orientation], 6);
    const defaultRows = measuredOrientationRows(duplex, PER_SECTOR);
    expect(defaultRows.map((row) => row.orientationLabel ?? row.orientation)).toEqual(["N", "E", "S", "W"]);
  });

  it("the uniform ratio the engine IS handed gives the same four grosses", () => {
    // The denominators are a property of the building, not of which ratios
    // are fed through them.
    const rows = measuredOrientationRows(duplex, WWR);
    for (const row of rows) {
      expect(row.grossWallAreaSqm).toBeCloseTo(GROSS[row.orientation], 6);
    }
  });

  it("every published building's rows sum to its measured gross and aperture", () => {
    for (const id of REFERENCE_BUILDING_IDS) {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const wwr = energy.materials.envelope.windows.windowToWallRatio;
      const rows = measuredOrientationRows(energy, wwr);
      const gross = envelopeQuantities(energy.recipe).grossWallAreaSqm;
      const aperture = gross * meanWindowToWallRatio(energy.materials);

      // A building that STATES its four sector grosses states four 2-dp
      // figures, each rounded independently of the total they are supposed
      // to reconcile with: FZK Haus's sum to 166.67 against a stated 166.68.
      // The apportioned fallback is computed from the total and is exact, so
      // it gets no slack at all. Four figures can drift by at most 4 × 0.005
      // — anything wider is a real disagreement about the envelope.
      const stated = energy.grossWallByOrientationSqm != null;
      const slack = stated ? 4 * 0.005 : 1e-6;
      const sumGross = rows.reduce((s, r) => s + r.grossWallAreaSqm, 0);
      expect(
        Math.abs(sumGross - gross),
        `${id}: the four legend rows sum to ${sumGross.toFixed(2)} m² of gross wall ` +
          `against the ${gross.toFixed(2)} m² the engine was handed — a gap of ` +
          `${Math.abs(sumGross - gross).toFixed(3)} m², wider than the ${slack} m² ` +
          `that ${stated ? "rounding four stated 2-decimal sectors" : "the apportionment"} ` +
          `can produce.`,
      ).toBeLessThanOrEqual(slack);

      // The apertures inherit the same rounding through the ratio, which is
      // below 1, so the window slack can never exceed the gross slack.
      const sumWindows = rows.reduce((s, r) => s + r.windowAreaSqm, 0);
      expect(Math.abs(sumWindows - aperture)).toBeLessThanOrEqual(slack);
    }
  });
});

describe("the frame's measurement-state line is the contract's, not the building's prose", () => {
  // Every building answers the same question in the same shape: one sentence,
  // in the reader's language, derived from `measurementState` and the pending
  // count. The building's own `measuredEnvelope.basis` is a paragraph of
  // provenance in the file's own register — it belongs in the panel's basis
  // row, and its opening words vary per building ("FULLY MEASURED — …",
  // "PARTLY PLACEHOLDER — …", "Read from the buildingSMART Clinic IFCs …").
  // If the frame ever sourced that, four pages would answer in four shapes
  // and two languages.
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: one short sentence, in the locale, in the contract's two shapes`, () => {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const bias = summarisePendingBias(energy.pendingMeasurements);
      const awaiting = energy.measurementState === "awaiting_measurement";

      const ko = awaiting
        ? pendingBadgeText(bias, true)
        : "실측 완료 · 이 프레임의 모든 외피 면적은 이 파일에서 측정한 값입니다";
      const en = awaiting
        ? pendingBadgeText(bias, false)
        : "Measurement complete · every envelope area behind this frame is measured from the file";

      // The Korean line is Korean and the English line is not.
      expect(ko).toMatch(/[가-힣]/);
      expect(en).not.toMatch(/[가-힣]/);

      // One sentence, not a paragraph.
      expect(ko.length).toBeLessThan(140);
      expect(en.length).toBeLessThan(200);

      // And neither is the building's basis prose, whatever that says.
      const basis = energy.recipe.measuredEnvelope?.basis;
      expect(basis, `${id} states no basis`).toBeTruthy();
      expect(ko).not.toBe(basis);
      expect(en).not.toBe(basis);
      expect(basis!.length).toBeGreaterThan(200);

      // The two shapes are exclusive and exhaustive: a building is complete
      // or it is awaiting, and the sentence says which.
      if (awaiting) {
        expect(ko).toContain("측정 대기");
        expect(en).toContain("Awaiting measurement");
        expect(bias.total).toBeGreaterThan(0);
      } else {
        expect(ko).toContain("실측 완료");
        expect(en).toContain("Measurement complete");
        expect(bias.total).toBe(0);
      }
    });
  }

  it("no building's basis OPENS with a status claim — measurementState owns that", () => {
    // Two of them did. FZK's opened "FULLY MEASURED — no placeholder in this
    // building." and Schependomlaan's "PARTLY PLACEHOLDER — see
    // SCHEPENDOMLAAN_PENDING_MEASUREMENTS.", which is how a paragraph of
    // provenance in the panel came to look like the measurement-state line
    // from the frame, in the wrong language and the wrong place. It also
    // meant the same claim had two sources and nothing kept them in step.
    //
    // Provenance may still say which FIELDS are stand-ins — that is specific
    // and it is what the basis is for. What it may not do is open by
    // declaring the building's overall state.
    // A status claim stands alone as an opening clause and is closed by an
    // em-dash, colon or middot. Provenance runs straight on into a
    // preposition — "Measured from the Duplex IFC by the openings walk" is a
    // perfectly good opening and must not be caught. The first version of
    // this regex caught it, and missed both Korean forms, because \b is
    // defined on [A-Za-z0-9_] and does not fire after Hangul.
    const statusOpener =
      /^\s*(?:(?:fully|partly|not|no)\s+)?(?:measured|placeholder|complete|incomplete|awaiting|provisional)\b[^.\n]{0,60}?[—:·]|^\s*(?:실측|측정|미측정)\s*(?:완료|대기)?\s*[·—:]/i;

    // The regex is checked against the two strings it exists to have caught,
    // and against the openings that must survive — a test that asserts
    // nothing matches would pass just as well with a regex that matches
    // nothing at all.
    expect("FULLY MEASURED — no placeholder in this building. Wall…").toMatch(statusOpener);
    expect("PARTLY PLACEHOLDER — see SCHEPENDOMLAAN_PENDING_MEASUREMENTS. Wall…").toMatch(statusOpener);
    expect("실측 완료 · 모든 외피 면적은…").toMatch(statusOpener);
    expect("측정 대기 · 자리표시자 3개…").toMatch(statusOpener);
    expect("Measured from the Duplex IFC by the openings walk.").not.toMatch(statusOpener);
    expect("Read from the buildingSMART Clinic IFCs by the build script.").not.toMatch(statusOpener);

    for (const id of REFERENCE_BUILDING_IDS) {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const basis = energy.recipe.measuredEnvelope!.basis;
      expect(
        basis,
        `${id}: measuredEnvelope.basis opens with a status claim — ` +
          `"${basis.slice(0, 60)}…". measurementState is the only source of ` +
          `that, and the frame is the only place it is rendered. Keep the ` +
          `provenance, drop the opener.`,
      ).not.toMatch(statusOpener);
    }
  });

  it("the pointer Schependomlaan's opener carried survived the cut", () => {
    // The removed opener named SCHEPENDOMLAAN_PENDING_MEASUREMENTS, and the
    // closing sentence said "the direction that table records" — cutting the
    // opener alone would have left "that table" pointing at nothing.
    const basis = referenceBuildingEnergyInputs("schependomlaan")!.recipe
      .measuredEnvelope!.basis;
    expect(basis).toContain("SCHEPENDOMLAAN_PENDING_MEASUREMENTS");
    expect(basis).not.toContain("that table");
  });

  it("no building's basis is short enough to be mistaken for the contract line", () => {
    // The failure this guards is a basis string trimmed to one line, which
    // would then look like the contract sentence while saying something the
    // contract never promised.
    for (const id of REFERENCE_BUILDING_IDS) {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      expect(energy.recipe.measuredEnvelope!.basis.length).toBeGreaterThan(200);
    }
  });
});
