// src/lib/mep/systems/fire.ts
//
// Sprinkler network (rules F1–F4). The comb — riser → floor control valve →
// cross main → parallel branch lines → heads on regular spacing — is the
// single most recognizable sprinkler signature. Spacing is indicative NFPA-13
// light-hazard practice; NEVER presented as a certified fire design (§44).

import { getBuildingCodeRules } from "@/lib/layers/building-code-rules";
import { keepOnPlate, pointInPlateInset } from "@/lib/layers/plate";
import type { MepBuildingContext } from "../context";
import { MepGraphBuilder, clearOfColumns, v3 } from "../graph";
import { buildRiser, clearOfLines, dipAxisRun, sprinklerBranchXs } from "../route";
import { SPINE_CHANNELS, SPRINKLER_SPACING_M, SPRINKLER_WALL_MIN_M, WATER_BAND_CHANNELS } from "../rules";
import type { PlanAccumulator } from "./air";

export function planFireSystems(ctx: MepBuildingContext, g: MepGraphBuilder, acc: PlanAccumulator): void {
  if (ctx.floors.length === 0) return;
  const rules = getBuildingCodeRules(ctx.recipe);
  if (!rules.sprinklersRequired) {
    acc.assumptions.push({
      id: "fp-gate",
      ruleId: "F1",
      text: "Sprinklers not generated: below the indicative storey threshold.",
      textKo: "스프링클러 설치 대상 아님(층수 기준, 지표적)",
      basis: "estimated",
    });
    return;
  }

  // Fire riser beside the stair core, kept clear of the electrical riser
  // cluster ([elec−0.4, elec+0.9]) at the same core band.
  const riserSlot = keepOnPlate(ctx.core.elevator.minX - 3.0, ctx.core.elevator.bankZ, ctx.rings, 0.8);
  const elec = ctx.shafts.find((s) => s.kind === "electrical");
  if (elec && Math.abs(riserSlot.x - elec.x) < 1.6) {
    riserSlot.x = elec.x - 1.6;
  }
  const fp = g.addSystem("fp", "sprinkler", "fire", "Sprinkler", "스프링클러", "fu");

  // Fire pump in the basement at the riser base.
  const pump = g.addNode(fp.id, "source", v3(riserSlot.x, ctx.plantY + 0.6, riserSlot.z), null, {
    label: "Fire pump",
    equipment: {
      assetId: "fire-pump",
      tag: "safety-fire-pump",
      widthM: 1.6,
      heightM: 1.1,
      depthM: 0.9,
      rotationY: 0,
      clearance: { front: 1.0, back: 0.6, left: 0.6, right: 0.6, top: 0.8 },
    },
  });
  fp.sourceNodeId = pump.id;

  const taps = buildRiser(
    g,
    fp,
    pump,
    riserSlot.x,
    riserSlot.z,
    ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.soffitY - f.bands.sprinkler })),
    null,
    ["F2", "T4"],
  );
  const top = ctx.floors[ctx.floors.length - 1];
  acc.risers.push({
    id: "riser-fp",
    shaft: "core",
    x: riserSlot.x,
    z: riserSlot.z,
    fromY: ctx.plantY,
    toY: top.soffitY,
    systemIds: [fp.id],
  });

  // Head grid: regular spacing inset from walls (rule F1). Branch lines are
  // shifted clear of the water-band branch lines; head drops shift clear of
  // the water-band mains so a head never falls through a pipe (§15).
  const b = ctx.bounds;
  const zs: number[] = [];
  for (let z = b.minZ + SPRINKLER_WALL_MIN_M; z <= b.maxZ - SPRINKLER_WALL_MIN_M + 1e-6; z += SPRINKLER_SPACING_M) {
    zs.push(z);
  }
  const columnsZ = ctx.columns.map((c) => c.z);
  const waterZLines = Object.values(WATER_BAND_CHANNELS).map((ch) =>
    clearOfColumns(ctx.spine.z + ch, columnsZ, 0.55),
  );
  // Conduit mains sit just above the sprinkler band; on low floors the two
  // bands compress together, so branch lines dip toward the ceiling at the
  // conduit channels (§15).
  const conduitZLines = [SPINE_CHANNELS.conduitLighting, SPINE_CHANNELS.conduitPower].map((ch) =>
    clearOfColumns(ctx.spine.z + ch, columnsZ, 0.55),
  );

  for (const floor of ctx.floors) {
    const tap = taps.taps.find((t) => t.floorNo === floor.floorNo);
    if (!tap) continue;
    const bandY = floor.soffitY - floor.bands.sprinkler;
    const headY = floor.soffitY - floor.bands.ceiling + 0.03;

    // Floor control valve assembly at the riser tap (rule F2).
    const valve = g.addNode(fp.id, "junction", v3(riserSlot.x + 0.4, bandY, riserSlot.z), floor.floorNo, {
      label: `Zone valve ${floor.floorNo}F`,
    });
    g.addSegment(fp, tap.node, valve, { role: "connector", floorNo: floor.floorNo, rules: ["F2"] });

    const xs = sprinklerBranchXs(ctx, floor.zones);

    // Cross main along the corridor spine.
    const mainZ = clearOfColumns(ctx.spine.z + SPINE_CHANNELS.sprinklerMain, columnsZ, 0.55);
    const entry = g.chain(
      fp,
      valve,
      [v3(riserSlot.x + 0.4, bandY, mainZ)],
      { role: "main", floorNo: floor.floorNo, rules: ["F2"] },
      "junction",
    );

    // Branch lines perpendicular to the cross main, heads along each line.
    const left = xs.filter((x) => x < entry.position.x).sort((a, c) => c - a);
    const right = xs.filter((x) => x >= entry.position.x).sort((a, c) => a - c);
    for (const side of [left, right]) {
      let prev = entry;
      for (const bx of side) {
        if (!pointInPlateInset(bx, mainZ, ctx.rings, 0.4)) continue;
        const junction = g.addNode(fp.id, "junction", v3(bx, bandY, mainZ), floor.floorNo);
        g.addSegment(fp, prev, junction, { role: "main", floorNo: floor.floorNo, rules: ["F2"] });
        prev = junction;

        for (const dir of [1, -1] as const) {
          let lineNode = junction;
          const lineZs = zs
            .filter((z) => (dir === 1 ? z > mainZ + 0.4 : z < mainZ - 0.4))
            .sort((a, c) => (dir === 1 ? a - c : c - a));
          for (const rawHz of lineZs) {
            const hz = clearOfLines(rawHz, waterZLines, 0.5);
            if (!pointInPlateInset(bx, hz, ctx.rings, 0.5)) continue;
            const branchNode = g.chain(
              fp,
              lineNode,
              dipAxisRun("z", bx, bandY, lineNode.position.z, hz, conduitZLines, -0.06 * floor.bands.depth),
              { role: "branch", floorNo: floor.floorNo, rules: ["F1", "F2"] },
              "junction",
            );
            lineNode = branchNode;
            const head = g.chain(
              fp,
              branchNode,
              [v3(bx, headY, hz)],
              { role: "runout", floorNo: floor.floorNo, rules: ["F1", "F4"] },
              "terminal",
            );
            head.terminal = { zoneId: `fp-f${floor.floorNo}`, demand: 1, demandUnit: "fu" };
            head.label = "sprinkler head";
            head.equipment = {
              assetId: "sprinkler-head",
              tag: "safety-sprinkler",
              widthM: 0.12,
              heightM: 0.14,
              depthM: 0.12,
              rotationY: 0,
            };
          }
        }
      }
    }
  }

  acc.assumptions.push({
    id: "fp-indicative",
    ruleId: "F1",
    text: `Sprinkler layout is indicative (${SPRINKLER_SPACING_M} m grid, light-hazard practice) — NOT a certified fire-protection design.`,
    textKo: `스프링클러 배치는 지표적(${SPRINKLER_SPACING_M}m 격자) — 소방 인증 설계 아님`,
    basis: "estimated",
  });
}
