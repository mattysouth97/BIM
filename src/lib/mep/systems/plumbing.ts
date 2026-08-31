// src/lib/mep/systems/plumbing.ts
//
// Domestic water + sanitary drainage (rules P1–P7). The two behave
// differently by construction: water is pressurized tree-from-riser; sanitary
// is gravity — every path from a fixture to the building drain is monotone
// non-increasing in elevation, branches carry real slope (rule P1), and the
// stack sits in the stacked wet core (rule P2/P6, Korean practice).

import { keepOnPlate } from "@/lib/layers/plate";
import type { MepBuildingContext } from "../context";
import { MepGraphBuilder, clearOfColumns, v3 } from "../graph";
import { buildRiser, clearOfLines, dipAxisRun, waterBranchXs, waterTakeoffXs } from "../route";
import { WATER_BAND_CHANNELS, WET_ZONE_FIXTURE_UNITS, drainSlope } from "../rules";
import type { PlanAccumulator } from "./air";

interface FixtureSpec {
  id: string;
  label: string;
  labelKo: string;
  dx: number;
  dz: number;
  /** Domestic water demand, L/s (estimated). */
  waterLps: number;
  /** Drainage fixture units (rule P4). */
  drainFu: number;
  hot: boolean;
}

const RESTROOM_FIXTURES: FixtureSpec[] = [
  { id: "wc", label: "WC", labelKo: "양변기", dx: -0.7, dz: 0.55, waterLps: 0.12, drainFu: 4, hot: false },
  { id: "lav", label: "Lavatory", labelKo: "세면기", dx: 0.5, dz: 0.55, waterLps: 0.1, drainFu: 1, hot: true },
  { id: "fd", label: "Floor drain", labelKo: "바닥배수", dx: -0.1, dz: -0.4, waterLps: 0, drainFu: 2, hot: false },
];

const KITCHEN_FIXTURES: FixtureSpec[] = [
  { id: "sink", label: "Sink", labelKo: "싱크", dx: 0, dz: 0, waterLps: 0.15, drainFu: 2, hot: true },
];

function fixturePoints(ctx: MepBuildingContext): { spot: { x: number; z: number }; fixtures: FixtureSpec[] }[] {
  return [
    { spot: ctx.core.wetZones.restroom, fixtures: RESTROOM_FIXTURES },
    { spot: ctx.core.wetZones.kitchen, fixtures: KITCHEN_FIXTURES },
  ];
}

/**
 * Fixture x-lines shift off the water-band branch/takeoff lines so their
 * vertical drops and z-runs never ride another system's line (§15). Shared
 * by the water AND drainage planners so both halves of a fixture align.
 */
function fixtureX(ctx: MepBuildingContext, rawX: number): number {
  const zones = ctx.floors[0]?.zones ?? [];
  return clearOfLines(rawX, [...waterBranchXs(ctx, zones), ...waterTakeoffXs(ctx)], 0.3);
}

/**
 * All wet-core vertical x-lines (fixture drops, exhaust grille line) —
 * exported so the hydronic/refrigerant planners keep their runout jogs off
 * them (§15).
 */
export function wetServiceXs(ctx: MepBuildingContext): number[] {
  const lines: number[] = [];
  for (const { spot, fixtures } of fixturePoints(ctx)) {
    for (const f of fixtures) {
      lines.push(fixtureX(ctx, spot.x + f.dx));
      if (f.hot) lines.push(fixtureX(ctx, spot.x + f.dx) + 0.12);
    }
  }
  lines.push(ctx.core.wetZones.restroom.x + 1.1, ctx.core.wetZones.kitchen.x + 0.35);
  return lines;
}

/** The wet-core z-lines (riser branches, fixture rows) drops must also avoid. */
export function wetServiceZs(ctx: MepBuildingContext): number[] {
  const sr = ctx.core.serviceRiser;
  const lines = [sr.z, sr.z + 0.15, sr.z - 0.15];
  for (const { spot, fixtures } of fixturePoints(ctx)) {
    for (const f of fixtures) lines.push(spot.z + f.dz);
  }
  const wetShaft = ctx.shafts.find((s) => s.kind === "wet");
  if (wetShaft) lines.push(wetShaft.z + 0.35, wetShaft.z + 0.85);
  return lines;
}

export function planPlumbingSystems(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  if (ctx.floors.length === 0) return;
  planDomesticWater(ctx, g, acc);
  planSanitary(ctx, g, acc);
}

// ---------------------------------------------------------------------------

function planDomesticWater(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  const meter = ctx.core.waterMeter;
  const cold = ctx.core.coldRiser;
  const serviceY = -0.8;

  // --- Cold water: street meter → underground service → wet-shaft riser ---
  const dcw = g.addSystem("dcw", "domestic-cold-water", "plumbing", "Domestic Cold Water", "급수", "lps");
  const source = g.addNode(dcw.id, "source", v3(meter.x, serviceY, meter.z), null, {
    label: "Water service",
    equipment: { assetId: "water-meter", tag: "water-meter", widthM: 0.5, heightM: 0.4, depthM: 0.4, rotationY: 0 },
  });
  dcw.sourceNodeId = source.id;
  // The underground x-leg jogs 0.6 m in front of the wet-riser line so it
  // never crosses the hot-water risers at their own z (§15).
  const riserBase = g.chain(
    dcw,
    source,
    [
      v3(meter.x, serviceY, cold.z + 0.6),
      v3(cold.x, serviceY, cold.z + 0.6),
      v3(cold.x, serviceY, cold.z),
    ],
    { role: "service", floorNo: null, rules: ["P5"] },
    "junction",
  );
  // Sub-band offsets within the water band keep the three wet-core runs from
  // sharing an elevation where they cross each other (§15).
  const dcwTaps = buildRiser(
    g,
    dcw,
    riserBase,
    cold.x,
    cold.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.water - 0.045 })),
    null,
    ["P5", "T4"],
  );
  acc.risers.push({
    id: "riser-dcw",
    shaft: "wet",
    x: cold.x,
    z: cold.z,
    fromY: serviceY,
    toY: ctx.floors[ctx.floors.length - 1].soffitY,
    systemIds: [dcw.id],
  });

  // --- Hot water: basement tank → supply + return risers ------------------
  const dhwPlant = ctx.core.basementDhw;
  const dhws = g.addSystem("dhws", "domestic-hot-water", "plumbing", "Domestic Hot Water", "급탕", "lps");
  const dhwr = g.addSystem("dhwr", "dhw-return", "plumbing", "DHW Return", "급탕환수", "lps");
  const plantY = ctx.plantY + 0.9;
  const tank = g.addNode(dhws.id, "source", v3(dhwPlant.x, plantY, dhwPlant.z), null, {
    label: "DHW tank",
    equipment: {
      assetId: "dhw-tank",
      tag: "dhw-storage-tank",
      widthM: 1.2,
      heightM: 1.8,
      depthM: 1.2,
      rotationY: 0,
      clearance: { front: 0.9, back: 0.5, left: 0.5, right: 0.5, top: 0.6 },
    },
  });
  dhws.sourceNodeId = tank.id;
  const returnNode = g.addNode(dhwr.id, "source", v3(dhwPlant.x + 0.7, plantY, dhwPlant.z), null, { label: "DHW return" });
  dhwr.sourceNodeId = returnNode.id;

  const hotX = ctx.core.serviceRiser.x - 0.35;
  const hotZUp = ctx.core.serviceRiser.z + 0.15;
  const hotZDn = ctx.core.serviceRiser.z - 0.15;
  const dhwsTaps = buildRiser(
    g,
    dhws,
    tank,
    hotX,
    hotZUp,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.water })),
    null,
    ["P5", "W2"],
  );
  const dhwrTaps = buildRiser(
    g,
    dhwr,
    returnNode,
    hotX,
    hotZDn,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.water - 0.09 })),
    null,
    ["P5", "W2"],
  );
  acc.risers.push({
    id: "riser-dhw",
    shaft: "wet",
    x: hotX,
    z: ctx.core.serviceRiser.z,
    fromY: plantY,
    toY: ctx.floors[ctx.floors.length - 1].soffitY,
    systemIds: [dhws.id, dhwr.id],
  });
  // Cold feed to the DHW plant.
  g.chain(
    dcw,
    riserBase,
    [v3(dhwPlant.x, serviceY, cold.z), v3(dhwPlant.x, serviceY, dhwPlant.z), v3(dhwPlant.x, plantY, dhwPlant.z)],
    { role: "connector", floorNo: null, rules: ["P5"] },
  );

  // --- Per-floor branches to the stacked wet cores ------------------------
  for (const floor of ctx.floors) {
    const coldTap = dcwTaps.taps.find((t) => t.floorNo === floor.floorNo);
    const hotTap = dhwsTaps.taps.find((t) => t.floorNo === floor.floorNo);
    const hotReturnTap = dhwrTaps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!coldTap) continue;
    const fixtureY = floor.y + 0.45;

    // Same-band coordination: wet-core runs dip at the water-band branch
    // x-lines (ref/chw/hw zone branches) and main z-channels (§15).
    const xDips = [...waterBranchXs(ctx, floor.zones), ...waterTakeoffXs(ctx)];
    const columnsZ = ctx.columns.map((c) => c.z);
    const zDips = Object.values(WATER_BAND_CHANNELS).map((ch) =>
      clearOfColumns(ctx.spine.z + ch, columnsZ, 0.55),
    );
    const dipDy = -0.13;
    const wetRun = (
      system: typeof dcw,
      start: (typeof coldTap)["node"],
      x1: number,
      z1: number,
      y: number,
      insulated: boolean,
    ) => {
      let run = g.chain(
        system,
        start,
        dipAxisRun("x", start.position.z, y, start.position.x, x1, xDips, dipDy),
        { role: "branch", floorNo: floor.floorNo, rules: ["P5", "P6"], insulated },
        "bend",
      );
      run = g.chain(
        system,
        run,
        dipAxisRun("z", x1, y, start.position.z, z1, zDips, dipDy),
        { role: "branch", floorNo: floor.floorNo, rules: ["P5", "P6"], insulated },
        "junction",
      );
      return run;
    };

    for (const { spot, fixtures } of fixturePoints(ctx)) {
      // Cold branch: riser → wet zone → fixture drops.
      let coldRun = wetRun(dcw, coldTap.node, spot.x, spot.z, coldTap.node.position.y, false);
      for (const f of fixtures) {
        if (f.waterLps <= 0) continue;
        const fx = fixtureX(ctx, spot.x + f.dx);
        const fz = spot.z + f.dz;
        const junction = g.chain(
          dcw,
          coldRun,
          [v3(fx, coldRun.position.y, coldRun.position.z), v3(fx, coldRun.position.y, fz)],
          { role: "branch", floorNo: floor.floorNo, rules: ["P5"] },
          "junction",
        );
        const terminal = g.chain(
          dcw,
          junction,
          [v3(fx, fixtureY, fz)],
          { role: "runout", floorNo: floor.floorNo, rules: ["P5"] },
          "terminal",
        );
        terminal.terminal = { zoneId: `wet-f${floor.floorNo}`, demand: f.waterLps, demandUnit: "lps" };
        terminal.label = f.label;
        terminal.equipment = {
          assetId: "bathroom-fixture",
          tag: "water-bathroom-fixture",
          widthM: 0.55,
          heightM: 0.45,
          depthM: 0.55,
          rotationY: 0,
        };
        coldRun = junction;
      }

      // Hot branch to hot-using fixtures, with the recirc return tied back.
      const hotFixtures = fixtures.filter((f) => f.hot);
      if (hotTap && hotReturnTap && hotFixtures.length > 0) {
        for (const f of hotFixtures) {
          const fx = fixtureX(ctx, spot.x + f.dx) + 0.12;
          const fz = spot.z + f.dz;
          const hotRun = wetRun(dhws, hotTap.node, fx, fz, hotTap.node.position.y, true);
          const hotEnd = g.chain(
            dhws,
            hotRun,
            [v3(fx, fixtureY, fz)],
            { role: "runout", floorNo: floor.floorNo, rules: ["P5", "W2"], insulated: true },
            "terminal",
          );
          hotEnd.terminal = { zoneId: `wet-f${floor.floorNo}`, demand: f.waterLps * 0.7, demandUnit: "lps" };
          hotEnd.label = `${f.label} (hot)`;
          const returnEnd = wetRun(dhwr, hotReturnTap.node, fx - 0.1, fz, hotReturnTap.node.position.y, true);
          returnEnd.kind = "terminal";
          returnEnd.terminal = { zoneId: `wet-f${floor.floorNo}`, demand: f.waterLps * 0.2, demandUnit: "lps" };
        }
      }
    }
  }

  acc.assumptions.push({
    id: "dw-fixtures",
    ruleId: "P4",
    text: "Fixture layout inferred from the stacked wet cores; no plumbing drawing available.",
    textKo: "위생기구 배치는 수직 습식코어에서 추정 — 위생설비 도면 없음",
    basis: "estimated",
  });
}

// ---------------------------------------------------------------------------

function planSanitary(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  const wetShaft = ctx.shafts.find((s) => s.kind === "wet");
  if (!wetShaft) return;
  const stackX = wetShaft.x + 0.55;
  const stackZ = wetShaft.z + 0.35;
  const exitY = -1.2;

  const san = g.addSystem("san", "sanitary-drain", "plumbing", "Sanitary Drainage", "오배수", "fu");
  // Source = building drain exit toward the street (front, +Z), below grade.
  const exit = g.addNode(san.id, "source", v3(stackX, exitY, ctx.bounds.maxZ + 1.5), null, { label: "Building drain" });
  san.sourceNodeId = exit.id;
  const stackBase = g.chain(
    san,
    exit,
    [v3(stackX, exitY, stackZ)],
    { role: "service", floorNo: null, slope: 0.01, rules: ["P1", "P2"] },
    "junction",
  );
  const stackTaps = buildRiser(
    g,
    san,
    stackBase,
    stackX,
    stackZ,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.y - 0.16 })),
    null,
    ["P2"],
  );

  // Kitchen gets its OWN stack (rule P2: stacks sit adjacent to their fixture
  // clusters — a single distant stack cannot hold 1–2% slope on long runs).
  const kSpot = keepOnPlate(ctx.core.wetZones.kitchen.x + 0.6, ctx.core.wetZones.kitchen.z + 0.7, ctx.rings, 0.6);
  const kBase = g.chain(
    san,
    stackBase,
    [v3(kSpot.x, exitY, stackZ), v3(kSpot.x, exitY, kSpot.z)],
    { role: "service", floorNo: null, slope: 0.01, rules: ["P1", "P2"] },
    "junction",
  );
  const kitchenTaps = buildRiser(
    g,
    san,
    kBase,
    kSpot.x,
    kSpot.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.y - 0.16 })),
    null,
    ["P2"],
  );
  const topFloor = ctx.floors[ctx.floors.length - 1];
  acc.risers.push({
    id: "riser-san",
    shaft: "wet",
    x: stackX,
    z: stackZ,
    fromY: exitY,
    toY: topFloor.y,
    systemIds: [san.id],
  });

  // Vent stack: parallel, terminates above the roof (rule P3, simplified).
  // Offset in z (behind the drain line) so the sanitary branch x-legs at the
  // stack z never ride through it.
  const vent = g.addSystem("vent", "sanitary-vent", "plumbing", "Vent", "통기", "fu");
  const ventZ = stackZ + 0.5;
  const cowl = g.addNode(vent.id, "source", v3(stackX + 0.35, ctx.roofY + 0.9, ventZ), null, { label: "Vent cowl" });
  vent.sourceNodeId = cowl.id;
  buildRiser(
    g,
    vent,
    cowl,
    stackX + 0.35,
    ventZ,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.y - 0.2 })).reverse(),
    null,
    ["P3"],
  );

  // Per-floor sloped branches: fixtures drop through the slab, then fall
  // toward their cluster's stack in the void below (rule P1: 2%/1%).
  for (const floor of ctx.floors) {
    const spots = fixturePoints(ctx);
    for (const [spotIndex, { spot, fixtures }] of spots.entries()) {
      const taps = spotIndex === 0 ? stackTaps : kitchenTaps;
      const sx = spotIndex === 0 ? stackX : kSpot.x;
      const sz = spotIndex === 0 ? stackZ : kSpot.z;
      const tap = taps.taps.find((t) => t.floorNo === floor.floorNo);
      if (!tap) continue;
      for (const f of fixtures) {
        if (f.drainFu <= 0) continue;
        const fx = fixtureX(ctx, spot.x + f.dx);
        const fz = spot.z + f.dz;
        const dn = f.drainFu >= 4 ? 0.1 : 0.05;
        const slope = drainSlope(dn);
        const dist = Math.abs(fx - sx) + Math.abs(fz - sz);
        const branchYAtFixture = tap.node.position.y + slope * dist;
        // Oriented away from the source: stack tap → (rising) → fixture.
        const fixtureDrop = g.chain(
          san,
          tap.node,
          [
            v3(fx, tap.node.position.y + slope * Math.abs(fx - sx), tap.node.position.z),
            v3(fx, branchYAtFixture, fz),
            v3(fx, floor.y + 0.05, fz),
          ],
          { role: "branch", floorNo: floor.floorNo, slope, rules: ["P1", "P2"] },
          "terminal",
        );
        fixtureDrop.terminal = { zoneId: `wet-f${floor.floorNo}`, demand: f.drainFu, demandUnit: "fu" };
        fixtureDrop.label = `${f.label} drain`;
      }
    }
  }

  const fuPerFloor = WET_ZONE_FIXTURE_UNITS.restroom + WET_ZONE_FIXTURE_UNITS.kitchen;
  acc.assumptions.push({
    id: "san-stack",
    ruleId: "P1",
    text: `Single sanitary stack assumed at the wet core (~${fuPerFloor} FU/floor); slopes 1–2% by diameter.`,
    textKo: "습식코어 단일 오배수 입상관 가정, 구배 1~2%",
    basis: "estimated",
  });
}
