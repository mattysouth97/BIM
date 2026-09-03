// P2-29 acceptance — the twin and the diagnosis quote one building.
//
// Before the shared producer, the twin rendered the VWorld outline while the
// traceable engine priced a 1.5:1 rectangle solved from 건축면적. Both were
// defensible in isolation; together they described two different buildings and
// reported two different perimeters for one address.
//
// These tests run the demo building — a bundled fixture with a real outline —
// through both consumers and assert they land on the same ring.

import { describe, expect, it } from "vitest";

import { generateBuildingGeometry, toRecipe } from "@/lib/building-geometry";
import {
  applyLevelPlates,
  evidenceFromLedger,
  reconstructModel,
  twinGeometryFromModel,
} from "@/lib/cad-reconstruction/ledger-bridge";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import {
  DEMO_FOOTPRINT,
  demoFloors,
  demoTitle,
} from "@/lib/demo/demo-building";

import { ingestDrawingSet } from "../ingestion";
import { buildLedgerBaselineModel } from "../ledger-baseline-model";
import { diagnosticSourceFromLedger } from "../ledger-source";
import type { LedgerFootprint } from "../ledger-source";
import type { Polygon2D } from "../types";

const NOW = "2026-09-04T00:00:00.000Z";

function ringArea(ring: readonly (readonly [number, number])[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

function ringPerimeter(ring: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

/** The twin's side: register + the bundled VWorld outline. */
function twinSide() {
  const model = reconstructModel(
    evidenceFromLedger({
      buildingPk: String(demoTitle.mgmBldrgstPk),
      title: demoTitle,
      floors: demoFloors,
      gis: {
        polygon: DEMO_FOOTPRINT,
        source: "building",
        attributes: null,
        error: null,
      },
      address: demoTitle.platPlcNm,
      now: NOW,
    }),
  );
  return twinGeometryFromModel(model);
}

/** The diagnosis side: the same register, through the ingestion boundary. */
async function diagnosisSide(footprint?: LedgerFootprint) {
  const source = diagnosticSourceFromLedger({
    title: demoTitle,
    floors: demoFloors,
    ...(footprint ? { footprint } : {}),
  });
  const ingestion = await ingestDrawingSet([source], {
    setName: "register",
    ingestedAt: NOW,
  });
  const outcome = buildLedgerBaselineModel({
    ingestion,
    title: demoTitle,
    floors: demoFloors,
    locale: "ko",
    now: NOW,
  });
  if (outcome.status !== "created") throw new Error(outcome.message);
  return outcome.model;
}

describe("P2-29 — twin and diagnosis quote the same building", () => {
  it("the demo building resolves an observed outline", () => {
    const twin = twinSide();
    expect(twin).not.toBeNull();
    expect(twin!.observed).toBe(true);
  });

  it("the diagnosis prices the ring the twin renders", async () => {
    const twin = twinSide()!;
    const model = await diagnosisSide({
      kind: "reconstructed",
      ringM: twin.footprintPolygon[0] as unknown as Polygon2D,
      observed: twin.observed,
    });

    const boundary = model.geometry.floorPlates[0].boundary
      .value as unknown as readonly (readonly [number, number])[];
    expect(ringArea(boundary)).toBeCloseTo(twin.footprintAreaSqm, 1);
    expect(ringPerimeter(boundary)).toBeCloseTo(
      ringPerimeter(twin.footprintPolygon[0]),
      1,
    );
  });

  it("without the shared ring the two disagree — the bug this item closes", async () => {
    const twin = twinSide()!;
    const legacy = await diagnosisSide(); // the 1.5:1 rectangle from 건축면적
    const legacyRing = legacy.geometry.floorPlates[0].boundary
      .value as unknown as readonly (readonly [number, number])[];

    // The perimeter is what sets every exterior wall and window area, and it
    // is the number the two paths disagreed about.
    expect(ringPerimeter(legacyRing)).not.toBeCloseTo(
      ringPerimeter(twin.footprintPolygon[0]),
      0,
    );
  });

  it("carries a level per registered storey, above and below grade", () => {
    const twin = twinSide()!;
    expect(twin.levels.length).toBe(
      demoTitle.grndFlrCnt + demoTitle.ugrndFlrCnt,
    );
    expect(twin.levels.some((l) => l.below)).toBe(true);
  });
});

describe("P2-30 - twin and diagnosis price the same envelope", () => {
  it("the engine gross wall area matches the twin within 1 percent", async () => {
    const twin = twinSide()!;
    const model = await diagnosisSide({
      kind: "reconstructed",
      ringM: twin.footprintPolygon[0] as unknown as Polygon2D,
      observed: twin.observed,
      levelPlatesM: twin.levels
        .filter((l) => !l.below)
        .map((l) => ({
          floorNo: l.floorNo,
          ringM: l.plate[0] as unknown as Polygon2D,
        })),
    });
    const engineWall = model.geometry.surfaces
      .filter((s) => s.type === "exterior_wall")
      .reduce((sum, s) => sum + (s.areaSqm.value ?? 0), 0);

    const geo = applyLevelPlates(
      generateBuildingGeometry(demoTitle, [...demoFloors]),
      twin.levels,
    ).geometry;
    geo.footprintPolygon = twin.footprintPolygon;
    const twinWall = envelopeQuantities(toRecipe(geo)).grossWallAreaSqm;

    expect(Math.abs(engineWall - twinWall) / twinWall).toBeLessThan(0.01);
  });
});
