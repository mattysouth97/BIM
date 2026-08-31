// src/lib/mep/systems/hydronic.ts
//
// Hydronic topology (rules W1–W4). Two-pipe supply/return pairs run in
// parallel with a small plan offset (rule W2); flows derive from zone loads
// via Q = P/(ρ·cp·ΔT) (rule W3).
//
//   central-ahu          — roof chiller + tower (condenser water), basement
//                          boiler; CHW + HW pairs → AHU coils + perimeter FCUs
//   residential-hydronic — heating-water risers → per-floor underfloor loops
//   vrf / packaged       — no hydronic distribution (refrigerant handles it)

import type { MepBuildingContext, MepFloorContext } from "../context";
import { MepGraphBuilder, clearOfColumns, v3 } from "../graph";
import { buildFloorNet, buildRiser, isPerimeterZone, mainZLines, sprinklerBranchXs, waterTakeoffXs } from "../route";
import { wetServiceXs } from "./plumbing";
import { CHW_LPS_PER_KW, HW_LPS_PER_KW, SPINE_CHANNELS } from "../rules";
import type { MepSystem } from "../types";
import type { PlanAccumulator } from "./air";

interface PairSpec {
  idPrefix: string;
  supplyType: "chilled-water-supply" | "heating-water-supply" | "domestic-hot-water";
  returnType: "chilled-water-return" | "heating-water-return" | "dhw-return";
  name: string;
  nameKo: string;
  channel: number;
  /** Branch lines shift off the zone columns by this much (coordination). */
  branchOffsetX: number;
  lpsPerKw: number;
  /** Other water-band main channels this pair's branches must dip at. */
  dipChannels: number[];
  /** Base terminal dz — each of the four hookup lines gets a distinct z. */
  terminalDz: number;
}

/**
 * Builds a supply/return pair sharing one topology: identical floor nets with
 * a 0.18 m plan offset so the pair reads as parallel piping (rule W2).
 */
function planPair(
  ctx: MepBuildingContext,
  g: MepGraphBuilder,
  acc: PlanAccumulator,
  spec: PairSpec,
  plant: { x: number; z: number; y: number; label: string },
  riserX: number,
  riserZ: number,
  zoneFilter: (floor: MepFloorContext) => MepFloorContext["zones"],
  bandOf: (floor: MepFloorContext) => number,
  terminalYOf: (floor: MepFloorContext) => number,
  terminalLabel: string,
  terminalEquipment?: boolean,
): { supply: MepSystem; return: MepSystem } {
  const pair: { supply?: MepSystem; return?: MepSystem } = {};
  (["supply", "return"] as const).forEach((side, i) => {
    const system = g.addSystem(
      `${spec.idPrefix}${side === "supply" ? "s" : "r"}`,
      side === "supply" ? spec.supplyType : spec.returnType,
      "hvac",
      `${spec.name} ${side === "supply" ? "Supply" : "Return"}`,
      `${spec.nameKo} ${side === "supply" ? "공급" : "환수"}`,
      "lps",
    );
    const off = i * 0.18;
    const source = g.addNode(system.id, "source", v3(plant.x + off, plant.y, plant.z), null, { label: plant.label });
    system.sourceNodeId = source.id;
    const taps = buildRiser(
      g,
      system,
      source,
      riserX + off,
      riserZ,
      ctx.floors.map((f) => ({ floorNo: f.floorNo, y: bandOf(f) })).sort((a, b) => (plant.y > 0 ? -1 : 1) * (a.y - b.y)),
      null,
      ["W1", "W2", "T4"],
    );
    const columnsZ = ctx.columns.map((c) => c.z);
    for (const floor of ctx.floors) {
      const tap = taps.taps.find((t) => t.floorNo === floor.floorNo);
      const zones = zoneFilter(floor);
      if (!tap || zones.length === 0) continue;
      buildFloorNet(g, {
        system,
        tap: tap.node,
        floor,
        ctx,
        channel: spec.channel + off,
        bandY: bandOf(floor),
        terminalY: terminalYOf(floor),
        zones,
        demandOf: (z) => (spec.lpsPerKw === HW_LPS_PER_KW ? z.heatingKw : z.coolingKw) * spec.lpsPerKw,
        branchOffsetX: spec.branchOffsetX + off,
        dipAtZ: spec.dipChannels.map((ch) => clearOfColumns(ctx.spine.z + ch, columnsZ, 0.55)),
        dipDy: 0.11 * floor.bands.depth,
        avoidDropZ: mainZLines(ctx),
        avoidDropX: [...sprinklerBranchXs(ctx, floor.zones), ...waterTakeoffXs(ctx), ...wetServiceXs(ctx)],
        terminalPoint: () => ({ dx: 0.7 + off, dz: spec.terminalDz - i * 0.15 }),
        rules: ["W1", "W2", "W3"],
        insulated: true,
        terminal:
          side === "supply" && terminalEquipment
            ? () => ({
                label: terminalLabel,
                equipment: {
                  tag: "heating-fan-coil",
                  assetId: "fan-coil",
                  widthM: 1.1,
                  heightM: 0.36,
                  depthM: 0.62,
                  rotationY: 0,
                  clearance: { front: 0, back: 0, left: 0, right: 0, top: 0.6 },
                },
              })
            : () => ({ label: terminalLabel }),
      });
    }
    pair[side] = system;
  });
  acc.risers.push({
    id: `riser-${spec.idPrefix}`,
    shaft: "wet",
    x: riserX,
    z: riserZ,
    fromY: Math.min(plant.y, ctx.floors[0]?.y ?? 0),
    toY: Math.max(plant.y, ctx.roofY),
    systemIds: [pair.supply?.id ?? "", pair.return?.id ?? ""],
  });
  return pair as { supply: MepSystem; return: MepSystem };
}

export function planHydronicSystems(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  const { archetype } = ctx.archetype;
  if (ctx.floors.length === 0) return;

  if (archetype === "residential-hydronic") {
    // Underfloor heating loops per unit zone; central plant assumption noted
    // (개별보일러 practice varies — labelled, reversible).
    planPair(
      ctx,
      g,
      acc,
      {
        idPrefix: "hw",
        supplyType: "heating-water-supply",
        returnType: "heating-water-return",
        name: "Heating Water",
        nameKo: "난방수",
        channel: SPINE_CHANNELS.hwSupply,
        branchOffsetX: -0.94,
        lpsPerKw: HW_LPS_PER_KW,
        dipChannels: [],
        terminalDz: 1.15,
      },
      { x: ctx.core.basementDhw.x + 1.6, z: ctx.core.basementDhw.z, y: ctx.plantY + 0.8, label: "Boiler" },
      ctx.core.serviceRiser.x,
      ctx.core.serviceRiser.z,
      (floor) => floor.zones,
      (floor) => floor.y + 0.12,
      (floor) => floor.y + 0.05,
      "floor heating loop",
    );
    acc.assumptions.push({
      id: "res-heating",
      ruleId: "KR-10",
      text: "Central heating-water plant assumed; 개별보일러/지역난방 distinction is not stated in the register.",
      textKo: "난방 방식(개별/지역/중앙)은 대장에 없음 — 중앙 난방수 계통으로 가정",
      basis: "estimated",
    });
    return;
  }

  if (archetype !== "central-ahu") return;

  // --- Chilled water: roof chiller → wet-shaft risers → AHU coil + FCUs ----
  const chw = planPair(
    ctx,
    g,
    acc,
    {
      idPrefix: "chw",
      supplyType: "chilled-water-supply",
      returnType: "chilled-water-return",
      name: "Chilled Water",
      nameKo: "냉수",
      channel: SPINE_CHANNELS.chwSupply,
      branchOffsetX: -0.7,
      lpsPerKw: CHW_LPS_PER_KW,
      dipChannels: [SPINE_CHANNELS.chwSupply, SPINE_CHANNELS.chwReturn, SPINE_CHANNELS.hwSupply, SPINE_CHANNELS.hwReturn],
      terminalDz: 1.15,
    },
    { x: ctx.core.roofChiller.x, z: ctx.core.roofChiller.z, y: ctx.roofY + 0.9, label: "CH-1" },
    ctx.core.serviceRiser.x,
    ctx.core.serviceRiser.z,
    (floor) => floor.zones.filter((z) => isPerimeterZone(z, ctx)),
    (floor) => floor.soffitY - floor.bands.water,
    (floor) => floor.soffitY - floor.bands.ceiling + 0.15,
    "FCU",
    true,
  );

  // Chiller + cooling tower equipment and the condenser-water pair between them.
  const chiller = g.nodes.find((n) => n.id === chw.supply.sourceNodeId);
  if (chiller) {
    chiller.kind = "equipment";
    chiller.equipment = {
      assetId: "chiller",
      tag: "cooling-plant",
      widthM: 3.2,
      heightM: 1.9,
      depthM: 1.6,
      rotationY: 0,
      clearance: { front: 1.2, back: 0.9, left: 0.9, right: 0.9, top: 1.0 },
    };
  }
  const cws = g.addSystem("cw", "chilled-water-supply", "hvac", "Condenser Water", "냉각수", "lps");
  const towerX = Math.min(ctx.bounds.maxX - 2, ctx.core.roofChiller.x + 4.2);
  const tower = g.addNode(cws.id, "equipment", v3(towerX, ctx.roofY + 1.6, ctx.core.roofChiller.z), null, {
    label: "CT-1",
    equipment: {
      assetId: "cooling-tower",
      tag: "cooling-tower",
      widthM: 2.6,
      heightM: 2.8,
      depthM: 2.6,
      rotationY: 0,
      clearance: { front: 1.5, back: 1.5, left: 1.5, right: 1.5, top: 3.0 },
    },
  });
  const cwSource = g.addNode(cws.id, "source", v3(ctx.core.roofChiller.x + 1.6, ctx.roofY + 0.9, ctx.core.roofChiller.z), null);
  cws.sourceNodeId = cwSource.id;
  const towerIn = g.chain(
    cws,
    cwSource,
    [v3(towerX, ctx.roofY + 0.9, ctx.core.roofChiller.z), v3(towerX, ctx.roofY + 1.6, ctx.core.roofChiller.z)],
    { role: "connector", floorNo: null, rules: ["W1"] },
  );
  tower.terminal = { zoneId: "condenser", demand: 12, demandUnit: "lps" };
  g.addSegment(cws, towerIn, tower, { role: "connector", floorNo: null });

  // --- Heating water: basement boiler → same perimeter FCUs ---------------
  const hw = planPair(
    ctx,
    g,
    acc,
    {
      idPrefix: "hw",
      supplyType: "heating-water-supply",
      returnType: "heating-water-return",
      name: "Heating Water",
      nameKo: "난방수",
      channel: SPINE_CHANNELS.hwSupply,
      branchOffsetX: -0.94,
      lpsPerKw: HW_LPS_PER_KW,
      dipChannels: [SPINE_CHANNELS.chwSupply, SPINE_CHANNELS.chwReturn, SPINE_CHANNELS.hwSupply, SPINE_CHANNELS.hwReturn],
      terminalDz: 1.45,
    },
    { x: 0.4, z: 0.3, y: ctx.plantY + 1.0, label: "B-1" },
    ctx.core.serviceRiser.x - 0.45,
    ctx.core.serviceRiser.z,
    (floor) => floor.zones.filter((z) => isPerimeterZone(z, ctx)),
    (floor) => floor.soffitY - floor.bands.water,
    (floor) => floor.soffitY - floor.bands.ceiling + 0.15,
    "FCU coil",
  );
  const boiler = g.nodes.find((n) => n.id === hw.supply.sourceNodeId);
  if (boiler) {
    boiler.kind = "equipment";
    boiler.equipment = {
      assetId: "boiler",
      tag: "heating-boiler",
      widthM: 1.9,
      heightM: 2.0,
      depthM: 2.4,
      rotationY: 0,
      clearance: { front: 1.2, back: 0.8, left: 0.8, right: 0.8, top: 0.8 },
    };
  }

  acc.assumptions.push({
    id: "chw-perimeter",
    ruleId: "A7",
    text: "Perimeter fan-coil zoning assumed for the pre-2000 central-plant office archetype.",
    textKo: "2000년 이전 업무시설: 외주부 FCU 조닝 가정",
    basis: "estimated",
  });
}
