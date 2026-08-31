// src/lib/mep/systems/air.ts
//
// Air-side HVAC topology (rules T1–T4, A1–A7). Archetype-driven:
//   central-ahu  — roof AHU, SA/RA risers in the mechanical shaft, per-floor
//                  corridor mains, zone branches, diffusers + return grilles
//   vrf          — roof condensing units, refrigerant riser, ceiling
//                  cassettes per zone, dedicated-OA duct network
//   packaged     — rooftop packaged unit, SA network, sparse returns
//   residential  — exhaust-air only (wet stacks); heating is hydronic floors
//
// Supply and return are separate systems with separate topology (rule T2).
// Coordination: SA rides the upper duct band; RA/OA/exhaust share the lower
// duct band with distinct channels, branch offsets and mutual dips (§15).

import type { MepBuildingContext, MepFloorContext } from "../context";
import { MepGraphBuilder, clearOfColumns, v3 } from "../graph";
import { buildFloorNet, buildRiser, mainZLines, sprinklerBranchXs, waterBranchXs, waterTakeoffXs } from "../route";
import { wetServiceXs, wetServiceZs } from "./plumbing";
import { SPINE_CHANNELS } from "../rules";
import type { MepAssumption, MepRiser } from "../types";

export interface PlanAccumulator {
  assumptions: MepAssumption[];
  risers: MepRiser[];
}

function note(acc: PlanAccumulator, id: string, ruleId: string, text: string, textKo?: string): void {
  acc.assumptions.push({ id, ruleId, text, textKo, basis: "estimated" });
}

/** AHU body from total airflow — rule A7 (H): ~1 m² per 1000 m³/h + core. */
function ahuDims(totalM3h: number): { widthM: number; heightM: number; depthM: number } {
  const areaM2 = Math.max(4, totalM3h / 1000 + 2.5);
  const widthM = Math.min(9, Math.sqrt(areaM2 * 2.2));
  return { widthM, heightM: 2.2, depthM: Math.max(1.8, areaM2 / widthM) };
}

interface AirCoordination {
  zMains: number[];
  xAvoid: number[];
  raMainZ: number;
  oaMainZ: number;
}

function coordinationFor(ctx: MepBuildingContext, floor: MepFloorContext): AirCoordination {
  const columnsZ = ctx.columns.map((c) => c.z);
  return {
    zMains: [...mainZLines(ctx), ...wetServiceZs(ctx)],
    xAvoid: [
      ...sprinklerBranchXs(ctx, floor.zones),
      ...waterBranchXs(ctx, floor.zones),
      ...waterTakeoffXs(ctx),
      ...wetServiceXs(ctx),
    ],
    raMainZ: clearOfColumns(ctx.spine.z + SPINE_CHANNELS.returnDuct, columnsZ, 0.55),
    oaMainZ: clearOfColumns(ctx.spine.z + SPINE_CHANNELS.outdoorAirDuct, columnsZ, 0.55),
  };
}

export function planAirSystems(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  const { archetype } = ctx.archetype;
  if (archetype === "residential-hydronic") {
    planExhaust(ctx, g, acc, true);
    return;
  }
  if (archetype === "vrf") {
    planVrfAir(ctx, g, acc);
    planExhaust(ctx, g, acc, false);
    return;
  }
  planCentralAir(ctx, g, acc, archetype === "packaged");
  planExhaust(ctx, g, acc, false);
}

// ---------------------------------------------------------------------------

function planCentralAir(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator, packaged: boolean): void {
  const shaft = ctx.shafts.find((s) => s.kind === "mechanical");
  if (!shaft || ctx.floors.length === 0) return;
  const totalSupply = ctx.floors.reduce((s, f) => s + f.zones.reduce((a, z) => a + z.supplyAirM3h, 0), 0);
  const dims = ahuDims(totalSupply);

  const sa = g.addSystem("sa", "supply-air", "hvac", "Supply Air", "급기", "m3h");
  const ahuY = ctx.roofY + dims.heightM / 2;
  const ahu = g.addNode(sa.id, "source", v3(shaft.x, ahuY, shaft.z), null, {
    label: packaged ? "RTU-1" : "AHU-1",
    equipment: {
      assetId: "ahu",
      tag: "vent-ahu",
      widthM: dims.widthM,
      heightM: dims.heightM,
      depthM: dims.depthM,
      rotationY: 0,
      clearance: { front: dims.widthM, back: 0.8, left: 0.6, right: 0.6, top: 0.5 },
      ports: [
        { id: "sa", system: "supply-air", offset: v3(0, -dims.heightM / 2, 0) },
        { id: "ra", system: "return-air", offset: v3(-dims.widthM * 0.35, -dims.heightM / 2, 0) },
        { id: "oa", system: "outdoor-air", offset: v3(dims.widthM * 0.45, 0, 0) },
      ],
    },
  });
  sa.sourceNodeId = ahu.id;
  note(
    acc,
    "ahu-sizing",
    "A7",
    `AHU sized from estimated ${Math.round(totalSupply)} m³/h total supply; no mechanical schedule available.`,
    "기계설비 일람표 없음 — AHU 용량은 추정 급기량 기준",
  );

  const saTaps = buildRiser(
    g,
    sa,
    ahu,
    shaft.x,
    shaft.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.ductSupply })).reverse(),
    null,
    ["T4", "A1"],
  );
  acc.risers.push({
    id: "riser-sa",
    shaft: "mechanical",
    x: shaft.x,
    z: shaft.z,
    fromY: ctx.floors[0].y,
    toY: ahuY,
    systemIds: [sa.id],
  });

  for (const floor of ctx.floors) {
    const tap = saTaps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!tap || floor.zones.length === 0) continue;
    const coord = coordinationFor(ctx, floor);
    buildFloorNet(g, {
      system: sa,
      tap: tap.node,
      floor,
      ctx,
      channel: SPINE_CHANNELS.supplyDuct,
      bandY: floor.soffitY - floor.bands.ductSupply,
      terminalY: floor.soffitY - floor.bands.ceiling,
      zones: floor.zones,
      demandOf: (z) => z.supplyAirM3h,
      avoidDropZ: coord.zMains,
      avoidDropX: coord.xAvoid,
      rules: ["A1", "A5", "Z4"],
      insulated: true,
      terminal: () => ({ label: "diffuser" }),
    });
  }

  // Return air: separate topology, sparser grilles (plenum return practice).
  // RA port on the +x side of the AHU and its riser offset in BOTH x and z so
  // the roof hookup never crosses the SA riser (§15 roof coordination).
  const ra = g.addSystem("ra", "return-air", "hvac", "Return Air", "환기(리턴)", "m3h");
  const raNode = g.addNode(ra.id, "source", v3(shaft.x + dims.widthM * 0.35, ahuY, shaft.z), null, { label: "AHU-1 RA" });
  ra.sourceNodeId = raNode.id;
  const raRiserX = clearOfColumns(shaft.x + 1.6, ctx.columns.map((c) => c.x), 1.3);
  const raRiserZ = clearOfColumns(shaft.z - 1.5, ctx.columns.map((c) => c.z), 1.3);
  const raTaps = buildRiser(
    g,
    ra,
    raNode,
    raRiserX,
    raRiserZ,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.ductReturn })).reverse(),
    null,
    ["T2", "T4"],
  );
  acc.risers.push({
    id: "riser-ra",
    shaft: "mechanical",
    x: raRiserX,
    z: raRiserZ,
    fromY: ctx.floors[0].y,
    toY: ahuY,
    systemIds: [ra.id],
  });
  // The lower duct band is shared with OA: RA takes the front (+z) half and
  // OA the rear half, so their branches never cross the other's main —
  // structural coordination instead of dips (§15). Plenum return tolerates
  // one-sided grilles.
  const grilleStride = packaged ? 4 : 3;
  for (const floor of ctx.floors) {
    const tap = raTaps.taps.find((t) => t.floorNo === floor.floorNo);
    const grilleZones = floor.zones
      .filter((z) => (z.rect.minZ + z.rect.maxZ) / 2 > ctx.spine.z)
      .filter((_, i) => i % Math.max(1, grilleStride - 1) === 0);
    if (!tap || grilleZones.length === 0) continue;
    const coord = coordinationFor(ctx, floor);
    buildFloorNet(g, {
      system: ra,
      tap: tap.node,
      floor,
      ctx,
      channel: SPINE_CHANNELS.returnDuct,
      bandY: floor.soffitY - floor.bands.ductReturn,
      terminalY: floor.soffitY - floor.bands.ceiling,
      zones: grilleZones,
      demandOf: (z) => z.supplyAirM3h * grilleStride * 0.9,
      branchOffsetX: 0.4,
      avoidDropZ: coord.zMains,
      avoidDropX: coord.xAvoid,
      terminalPoint: () => ({ dx: 0.5, dz: -0.8 }),
      rules: ["T2", "A1"],
      terminal: () => ({ label: "return grille" }),
    });
  }
  note(
    acc,
    "ra-plenum",
    "T2",
    `Ceiling-plenum return assumed: one grille per ${grilleStride} supply zones.`,
    "천장 플레넘 리턴 가정",
  );

  // Outdoor air intake: louver → AHU, short roof run.
  const oa = g.addSystem("oa", "outdoor-air", "hvac", "Outdoor Air", "외기", "m3h");
  const oaAhu = g.addNode(oa.id, "source", v3(shaft.x + dims.widthM * 0.45, ahuY, shaft.z + 1.7), null);
  oa.sourceNodeId = oaAhu.id;
  const louver = g.addNode(oa.id, "terminal", v3(shaft.x + dims.widthM * 0.45 + 1.6, ahuY, shaft.z + 1.7), null, {
    label: "OA louver",
  });
  louver.terminal = { zoneId: "outdoor", demand: totalSupply * 0.2, demandUnit: "m3h" };
  g.addSegment(oa, oaAhu, louver, { role: "connector", floorNo: null, flow: totalSupply * 0.2, rules: ["A4"] });
}

// ---------------------------------------------------------------------------

function planVrfAir(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  const shaft = ctx.shafts.find((s) => s.kind === "mechanical");
  if (!shaft || ctx.floors.length === 0) return;

  // Refrigerant network: roof condensing units → riser → floor branches →
  // ceiling cassettes (rule KR-10: dominant post-2000 office system).
  const ref = g.addSystem("ref", "refrigerant", "hvac", "VRF Refrigerant", "냉매배관", "kw");
  // CU bank sits shaft-side of its riser so the roof approach never crosses
  // the OA unit's own riser hookup (§15 roof coordination).
  const cuSlot = { x: Math.min(shaft.x + 2.4, ctx.bounds.maxX - 1.5), z: shaft.z };
  const cu = g.addNode(ref.id, "source", v3(cuSlot.x, ctx.roofY + 0.85, cuSlot.z), null, {
    label: "VRF CU bank",
    equipment: {
      assetId: "vrf-outdoor",
      tag: "heating-vrf-head",
      widthM: 1.24,
      heightM: 1.69,
      depthM: 0.77,
      rotationY: 0,
      clearance: { front: 1.0, back: 0.5, left: 0.3, right: 0.3, top: 2.0 },
    },
  });
  ref.sourceNodeId = cu.id;
  const refTaps = buildRiser(
    g,
    ref,
    cu,
    shaft.x + 0.85,
    shaft.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.water })).reverse(),
    null,
    ["T4"],
  );
  acc.risers.push({
    id: "riser-ref",
    shaft: "mechanical",
    x: shaft.x + 0.85,
    z: shaft.z,
    fromY: ctx.floors[0].y,
    toY: ctx.roofY + 0.85,
    systemIds: [ref.id],
  });
  for (const floor of ctx.floors) {
    const tap = refTaps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!tap || floor.zones.length === 0) continue;
    const coord = coordinationFor(ctx, floor);
    buildFloorNet(g, {
      system: ref,
      tap: tap.node,
      floor,
      ctx,
      channel: SPINE_CHANNELS.refrigerant,
      bandY: floor.soffitY - floor.bands.water,
      terminalY: floor.soffitY - floor.bands.ceiling + 0.12,
      zones: floor.zones,
      demandOf: (z) => z.coolingKw,
      branchOffsetX: 0.7,
      avoidDropZ: coord.zMains,
      rules: ["W1", "KR-10"],
      insulated: true,
      terminal: () => ({
        label: "ceiling cassette",
        equipment: {
          tag: "heating-fan-coil",
          assetId: "fan-coil",
          widthM: 0.84,
          heightM: 0.3,
          depthM: 0.84,
          rotationY: 0,
          clearance: { front: 0, back: 0, left: 0, right: 0, top: 0.6 },
        },
      }),
    });
  }
  note(acc, "vrf-arch", "KR-10", ctx.archetype.reason, "시스템에어컨(VRF) 관행 가정 — 대장에 설비 정보 없음");

  // Dedicated outdoor-air: rooftop ERV/OA unit + duct network, every 2nd zone.
  const oa = g.addSystem("oa", "outdoor-air", "hvac", "Outdoor Air (ERV)", "외기(전열교환)", "m3h");
  const totalOa = ctx.floors.reduce((s, f) => s + f.zones.reduce((a, z) => a + z.supplyAirM3h, 0), 0) * 0.2;
  const oaUnit = g.addNode(oa.id, "source", v3(shaft.x, ctx.roofY + 0.7, shaft.z - 1.4), null, {
    label: "OAU-1",
    equipment: {
      assetId: "ahu",
      tag: "vent-ahu",
      widthM: 2.6,
      heightM: 1.4,
      depthM: 1.6,
      rotationY: 0,
      clearance: { front: 2.0, back: 0.6, left: 0.5, right: 0.5, top: 0.5 },
    },
  });
  oa.sourceNodeId = oaUnit.id;
  const oaTaps = buildRiser(
    g,
    oa,
    oaUnit,
    shaft.x,
    shaft.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.ductReturn })).reverse(),
    null,
    ["A4", "T4"],
  );
  acc.risers.push({
    id: "riser-oa",
    shaft: "mechanical",
    x: shaft.x,
    z: shaft.z,
    fromY: ctx.floors[0].y,
    toY: ctx.roofY + 0.7,
    systemIds: [oa.id],
  });
  for (const floor of ctx.floors) {
    const tap = oaTaps.taps.find((t) => t.floorNo === floor.floorNo);
    // Rear (−z) half of the shared lower duct band — see the RA note.
    const oaZones = floor.zones.filter((z) => (z.rect.minZ + z.rect.maxZ) / 2 <= ctx.spine.z);
    if (!tap || oaZones.length === 0) continue;
    const coord = coordinationFor(ctx, floor);
    buildFloorNet(g, {
      system: oa,
      tap: tap.node,
      floor,
      ctx,
      channel: SPINE_CHANNELS.outdoorAirDuct,
      bandY: floor.soffitY - floor.bands.ductReturn,
      terminalY: floor.soffitY - floor.bands.ceiling,
      zones: oaZones,
      demandOf: (z) => z.supplyAirM3h * 0.4,
      branchOffsetX: -0.4,
      avoidDropZ: coord.zMains,
      avoidDropX: coord.xAvoid,
      terminalPoint: () => ({ dx: -0.9, dz: -0.6 }),
      rules: ["A4", "A1"],
      insulated: true,
      terminal: () => ({ label: "OA diffuser" }),
    });
  }
  note(acc, "oa-rate", "A4", `Outdoor air estimated at 20% of supply (~${Math.round(totalOa)} m³/h).`, "외기량 급기 20% 추정");
}

// ---------------------------------------------------------------------------

/** Wet-zone exhaust stacks (restroom + optionally kitchen) — rule P6 stacked wet cores. */
function planExhaust(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator, includeKitchen: boolean): void {
  if (ctx.floors.length === 0) return;
  const ex = g.addSystem("ex", "exhaust-air", "hvac", "Exhaust Air", "배기", "m3h");
  const wet = ctx.core.wetZones.restroom;
  const fanY = ctx.roofY + 0.45;
  const fan = g.addNode(ex.id, "source", v3(wet.x, fanY, wet.z), null, {
    label: "EF-1",
    equipment: { assetId: "exhaust-fan", tag: "vent-exhaust-fan", widthM: 0.9, heightM: 0.7, depthM: 0.9, rotationY: 0 },
  });
  ex.sourceNodeId = fan.id;
  const taps = buildRiser(
    g,
    ex,
    fan,
    wet.x,
    wet.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.ductSupply })).reverse(),
    null,
    ["T4", "P6"],
  );
  acc.risers.push({
    id: "riser-ex",
    shaft: "wet",
    x: wet.x,
    z: wet.z,
    fromY: ctx.floors[0].y,
    toY: fanY,
    systemIds: [ex.id],
  });
  const spots = includeKitchen
    ? [ctx.core.wetZones.restroom, ctx.core.wetZones.kitchen]
    : [ctx.core.wetZones.restroom];
  for (const floor of ctx.floors) {
    const tap = taps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!tap) continue;
    for (const [i, spot] of spots.entries()) {
      const gx = spot.x + (i === 0 ? 1.1 : 0.35);
      const gz = spot.z + (i === 0 ? 0.4 : 0.5);
      let run = g.chain(
        ex,
        tap.node,
        [v3(gx, tap.node.position.y, tap.node.position.z)],
        { role: "runout", floorNo: floor.floorNo, rules: ["P6"] },
        "bend",
      );
      run = g.chain(
        ex,
        run,
        [v3(gx, tap.node.position.y, gz)],
        { role: "runout", floorNo: floor.floorNo, rules: ["P6"] },
        "bend",
      );
      const grille = g.chain(
        ex,
        run,
        [v3(gx, floor.soffitY - floor.bands.ceiling, gz)],
        { role: "runout", floorNo: floor.floorNo, rules: ["P6"] },
        "terminal",
      );
      grille.terminal = { zoneId: `wet-f${floor.floorNo}-${i}`, demand: 90, demandUnit: "m3h" };
      grille.label = i === 0 ? "restroom exhaust" : "kitchen exhaust";
    }
  }
  note(acc, "exhaust-wet", "P6", "Wet-zone exhaust stacks assumed at the stacked restroom/kitchen cores.", "욕실·주방 배기 수직 스택 가정");
}
