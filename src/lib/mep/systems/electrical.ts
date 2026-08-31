// src/lib/mep/systems/electrical.ts
//
// Electrical topology (rules T5, E1–E5): utility → transformer → main
// switchboard → riser → floor panel → circuits → loads. Cable tray runs the
// corridor (rule E2); conduits hang below it; every mechanical equipment item
// registered by earlier planners becomes an electrical load (rule E4).

import type { MepBuildingContext } from "../context";
import { MepGraphBuilder, clearOfColumns, v3 } from "../graph";
import {
  buildFloorNet,
  buildRiser,
  isPerimeterZone,
  mainZLines,
  sprinklerBranchXs,
  waterBranchXs,
  zoneFacadeOffset,
} from "../route";
import { SPINE_CHANNELS } from "../rules";
import type { MepNode } from "../types";
import type { PlanAccumulator } from "./air";

/** Estimated kVA for mechanical equipment tags (rule E4/E3, ESTIMATED). */
const MECH_LOAD_KVA: Record<string, number> = {
  "vent-ahu": 15,
  "cooling-plant": 90,
  "cooling-tower": 7.5,
  "heating-boiler": 3,
  "heating-vrf-head": 45,
  "vent-exhaust-fan": 1.5,
  "dhw-storage-tank": 6,
  "safety-fire-pump": 22,
};

export function planElectricalSystems(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  if (ctx.floors.length === 0) return;
  const shaft = ctx.shafts.find((s) => s.kind === "electrical");
  if (!shaft) return;

  // Snapshot mechanical equipment BEFORE adding electrical nodes (rule E4).
  const mechLoads = g.nodes.filter((n) => n.kind === "equipment" && n.equipment && MECH_LOAD_KVA[n.equipment.tag]);

  const elecRoomY = ctx.plantY + 0.9;

  // --- Cable tray containment (corridor highway, rule E2) -----------------
  const tray = g.addSystem("tray", "cable-tray", "electrical", "Cable Tray", "케이블트레이", "va");
  const traySource = g.addNode(tray.id, "source", v3(shaft.x - 0.4, elecRoomY, shaft.z), null, { label: "MSB tray" });
  tray.sourceNodeId = traySource.id;
  const trayTaps = buildRiser(
    g,
    tray,
    traySource,
    shaft.x - 0.4,
    shaft.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.tray })),
    ctx.roofY + 0.3,
    ["E2", "T4"],
  );
  for (const floor of ctx.floors) {
    const tap = trayTaps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!tap) continue;
    // Tray main only — corridor containment, no zone branches (rule E2).
    const bandY = floor.soffitY - floor.bands.tray;
    const runZ = clearOfColumns(ctx.spine.z + SPINE_CHANNELS.tray, ctx.columns.map((c) => c.z), 0.55);
    const entry = g.chain(
      tray,
      tap.node,
      [v3(tap.node.position.x, bandY, runZ), v3(ctx.spine.minX + 0.5, bandY, runZ)],
      { role: "connector", floorNo: floor.floorNo, rules: ["E2"] },
      "junction",
    );
    // The tray "load" is the floor's total circuit demand it contains —
    // modelled as a terminal so flow accumulation sizes the riser (rule T3).
    const floorVa = floor.zones.reduce((s, z) => s + z.lightingVa + z.powerVa, 0);
    const end = g.addNode(tray.id, "terminal", v3(ctx.spine.maxX - 0.5, bandY, runZ), floor.floorNo);
    end.terminal = { zoneId: `tray-f${floor.floorNo}`, demand: Math.max(floorVa, 10_000), demandUnit: "va" };
    g.addSegment(tray, entry, end, { role: "main", floorNo: floor.floorNo, rules: ["E2", "Z4"] });
  }
  acc.risers.push({
    id: "riser-tray",
    shaft: "electrical",
    x: shaft.x - 0.4,
    z: shaft.z,
    fromY: elecRoomY,
    toY: ctx.roofY + 0.3,
    systemIds: [tray.id],
  });

  // --- Power distribution (rule T5 hierarchy) -----------------------------
  const pw = g.addSystem("pw", "power", "electrical", "Power", "전력", "va");
  const xfmr = g.addNode(pw.id, "source", v3(shaft.x + 0.9, elecRoomY, shaft.z + 0.4), null, {
    label: "TR-1 / MSB",
    equipment: {
      assetId: "electrical-panel",
      tag: "lighting-panel",
      widthM: 2.2,
      heightM: 2.0,
      depthM: 0.8,
      rotationY: 0,
      // Working clearance in front of switchgear — rule Z2 (NEC 110.26-indicative).
      clearance: { front: 1.1, back: 0.3, left: 0.3, right: 0.3, top: 0.5 },
    },
  });
  pw.sourceNodeId = xfmr.id;

  const pwTaps = buildRiser(
    g,
    pw,
    xfmr,
    shaft.x,
    shaft.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.y + 1.4 })),
    ctx.roofY + 0.3,
    ["T5"],
  );
  acc.risers.push({
    id: "riser-pw",
    shaft: "electrical",
    x: shaft.x,
    z: shaft.z,
    fromY: elecRoomY,
    toY: ctx.roofY + 0.3,
    systemIds: [pw.id],
  });

  for (const floor of ctx.floors) {
    const tap = pwTaps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!tap || floor.zones.length === 0) continue;

    // Floor panel: wall-mounted beside the shaft (rule E1) — the ONLY place
    // circuits may originate (rule T5: loads never wire to the switchboard).
    const panel = g.addNode(pw.id, "equipment", v3(shaft.x + 0.75, floor.y + 1.4, shaft.z), floor.floorNo, {
      label: `LP-${floor.floorNo}`,
      equipment: {
        assetId: "electrical-panel",
        tag: "lighting-panel",
        widthM: 0.6,
        heightM: 1.0,
        depthM: 0.25,
        rotationY: 0,
        clearance: { front: 1.0, back: 0, left: 0.1, right: 0.1, top: 0.2 },
      },
    });
    g.addSegment(pw, tap.node, panel, { role: "connector", floorNo: floor.floorNo, rules: ["T5"] });

    // Lighting circuits: one feed per zone at the ceiling.
    const zMains = mainZLines(ctx);
    const xAvoid = [...sprinklerBranchXs(ctx, floor.zones), ...waterBranchXs(ctx, floor.zones)];
    buildFloorNet(g, {
      system: pw,
      tap: panel,
      floor,
      ctx,
      channel: SPINE_CHANNELS.conduitLighting,
      bandY: floor.soffitY - floor.bands.conduit,
      terminalY: floor.soffitY - floor.bands.ceiling,
      zones: floor.zones,
      demandOf: (z) => z.lightingVa,
      branchOffsetX: 0.55,
      avoidDropZ: zMains,
      avoidDropX: xAvoid,
      terminalPoint: () => ({ dx: 1.1, dz: -1.1 }),
      rules: ["E3", "T5"],
      terminal: () => ({ label: "lighting circuit" }),
    });

    // Receptacle drops at perimeter zones (wall outlets at the facade line).
    const perim = floor.zones.filter((z) => isPerimeterZone(z, ctx)).filter((_, i) => i % 2 === 0);
    if (perim.length > 0) {
      buildFloorNet(g, {
        system: pw,
        tap: panel,
        floor,
        ctx,
        channel: SPINE_CHANNELS.conduitPower,
        bandY: floor.soffitY - floor.bands.conduit,
        terminalY: floor.y + 0.35,
        zones: perim,
        demandOf: (z) => z.powerVa * 2,
        branchOffsetX: -0.55,
        avoidDropZ: zMains,
        avoidDropX: xAvoid,
        terminalPoint: (z) => zoneFacadeOffset(z, ctx),
        rules: ["E3", "T5"],
        terminal: () => ({ label: "receptacle circuit" }),
      });
    }
  }

  // --- Mechanical equipment feeders (rule E4) -----------------------------
  const riserTop = pwTaps.end;
  const riserBottom = xfmr;
  const bank = ctx.core.elevator;
  for (const load of mechLoads) {
    const kva = MECH_LOAD_KVA[load.equipment?.tag ?? ""] ?? 5;
    const nearTop = Math.abs(load.position.y - ctx.roofY) < Math.abs(load.position.y - elecRoomY);
    const from: MepNode = nearTop ? riserTop : riserBottom;
    const feedY = nearTop ? ctx.roofY + 0.3 : elecRoomY - 0.4;
    // Route in front of the hoistway/riser cluster — never through it — and
    // terminate at a local disconnect beside the unit, not inside its body.
    const safeZ = Math.max(from.position.z, bank.bankZ + bank.shaftDepth / 2 + 1.0);
    const dx = load.position.x + (load.equipment ? load.equipment.widthM / 2 + 0.4 : 0.7);
    const dz = load.position.z + 0.55;
    const feeder = g.chain(
      pw,
      from,
      [
        v3(from.position.x, feedY, from.position.z),
        v3(from.position.x, feedY, safeZ),
        v3(dx, feedY, safeZ),
        v3(dx, feedY, dz),
        v3(dx, nearTop ? feedY + 0.35 : feedY + 0.6, dz),
      ],
      { role: "branch", floorNo: load.floorNo, rules: ["E4", "T5"] },
      "terminal",
    );
    feeder.terminal = { zoneId: load.id, demand: kva * 1000, demandUnit: "va" };
    feeder.label = `${load.label ?? load.equipment?.tag} feeder`;
  }

  acc.assumptions.push({
    id: "elec-loads",
    ruleId: "E3",
    text: "Lighting/receptacle densities and mechanical kVA are practice estimates; no panel schedule available.",
    textKo: "조도·콘센트 밀도 및 동력부하는 관행 추정 — 분전반 일람표 없음",
    basis: "estimated",
  });
}
