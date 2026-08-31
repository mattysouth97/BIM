// src/lib/mep/geometry.ts
//
// Canonical model → pure render instructions (§3: geometry derives FROM the
// graph, never the reverse). No THREE imports — the layer generators own GPU
// concerns; this pass owns engineering-to-visual decisions: run trimming at
// elbows, hanger placement, terminal device selection.

import type {
  MepBasis,
  MepDiscipline,
  MepFitting,
  MepModel,
  MepSegment,
  MepSystemType,
  SegmentShape,
  Vec3,
} from "./types";
import { nodeById } from "./types";

export interface RunInstruction {
  segId: string;
  systemId: string;
  systemType: MepSystemType;
  discipline: MepDiscipline;
  a: Vec3;
  b: Vec3;
  shape: SegmentShape;
  role: MepSegment["role"];
  floorNo: number | null;
  insulated: boolean;
  basis: MepBasis;
  flow: number;
  flowUnit: MepSegment["flowUnit"];
}

export interface FittingInstruction {
  fitting: MepFitting;
  systemType: MepSystemType;
  discipline: MepDiscipline;
  /** Elbow bend radius (round) / throat (rect), metres. */
  bendRadiusM: number;
}

export interface HangerInstruction {
  x: number;
  y: number;
  z: number;
  /** Rod length up to the slab soffit. */
  rodM: number;
  kind: "rod" | "trapeze";
  widthM: number;
  systemId: string;
  floorNo: number | null;
}

export interface TerminalInstruction {
  nodeId: string;
  kind: "diffuser" | "grille" | "receptacle" | "vent-cowl";
  position: Vec3;
  sizeM: number;
  systemId: string;
  systemType: MepSystemType;
  floorNo: number | null;
}

export interface EquipmentInstruction {
  nodeId: string;
  systemId: string;
  assetId?: string;
  tag: string;
  position: Vec3;
  widthM: number;
  heightM: number;
  depthM: number;
  rotationY: number;
  label?: string;
  floorNo: number | null;
}

export interface MepRenderInstructions {
  runs: RunInstruction[];
  fittings: FittingInstruction[];
  hangers: HangerInstruction[];
  terminals: TerminalInstruction[];
  equipment: EquipmentInstruction[];
}

function shapeHalf(shape: SegmentShape): number {
  return shape.kind === "round" ? shape.diameterM / 2 : Math.max(shape.widthM, shape.heightM) / 2;
}

export function bendRadiusOf(shape: SegmentShape): number {
  if (shape.kind === "round") return Math.max(0.05, shape.diameterM * 1.5);
  return Math.max(0.12, Math.min(shape.widthM, 0.5));
}

const HANGER_SPACING: Record<"round" | "rect" | "tray", number> = { round: 2.4, rect: 3.0, tray: 3.0 };

export function buildRenderInstructions(model: MepModel): MepRenderInstructions {
  const nodes = nodeById(model);
  const systemById = new Map(model.systems.map((s) => [s.id, s]));
  const soffitByFloor = new Map(model.floors.map((f) => [f.floorNo, f.soffitY]));

  // Nodes that carry an elbow — their adjacent runs get trimmed.
  const elbowAt = new Map<string, MepFitting>();
  for (const fit of model.fittings) {
    if (fit.kind === "elbow") elbowAt.set(fit.nodeId, fit);
  }

  const runs: RunInstruction[] = [];
  const hangers: HangerInstruction[] = [];

  for (const seg of model.segments) {
    const system = systemById.get(seg.systemId);
    const na = nodes.get(seg.from);
    const nb = nodes.get(seg.to);
    if (!system || !na || !nb) continue;
    const a = { ...na.position };
    const b = { ...nb.position };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.02) continue;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;

    // Trim ends where an elbow fitting takes over the corner (§21).
    const trimFor = (nodeId: string): number => {
      const fit = elbowAt.get(nodeId);
      if (!fit) return 0;
      return Math.min(bendRadiusOf(fit.shape), len * 0.4);
    };
    const ta = trimFor(seg.from);
    const tb = trimFor(seg.to);
    a.x += ux * ta;
    a.y += uy * ta;
    a.z += uz * ta;
    b.x -= ux * tb;
    b.y -= uy * tb;
    b.z -= uz * tb;

    runs.push({
      segId: seg.id,
      systemId: seg.systemId,
      systemType: system.type,
      discipline: system.discipline,
      a,
      b,
      shape: seg.shape,
      role: seg.role,
      floorNo: seg.floorNo,
      insulated: Boolean(seg.insulated),
      basis: seg.sizeBasis,
      flow: seg.flow,
      flowUnit: seg.flowUnit,
    });

    // Hangers on horizontal ceiling-band runs (§23), plausible intervals.
    if (Math.abs(uy) < 0.1 && seg.floorNo !== null && seg.role !== "runout") {
      const soffit = soffitByFloor.get(seg.floorNo);
      if (soffit !== undefined) {
        const top = Math.max(a.y, b.y) + shapeHalf(seg.shape);
        const rod = soffit - top;
        if (rod > 0.03 && rod < 1.5) {
          const spacing = HANGER_SPACING[seg.shape.kind];
          const count = Math.floor(len / spacing);
          for (let i = 1; i <= count; i += 1) {
            const t = (i * spacing) / len;
            hangers.push({
              x: a.x + (b.x - a.x) * t,
              y: top,
              z: a.z + (b.z - a.z) * t,
              rodM: rod,
              kind: seg.shape.kind === "round" ? "rod" : "trapeze",
              widthM: seg.shape.kind === "round" ? shapeHalf(seg.shape) * 2 : (seg.shape as { widthM: number }).widthM,
              systemId: seg.systemId,
              floorNo: seg.floorNo,
            });
          }
        }
      }
    }
  }

  const fittings: FittingInstruction[] = model.fittings.map((fitting) => {
    const system = systemById.get(fitting.systemId);
    return {
      fitting,
      systemType: system?.type ?? "power",
      discipline: system?.discipline ?? "electrical",
      bendRadiusM: bendRadiusOf(fitting.shape),
    };
  });

  const terminals: TerminalInstruction[] = [];
  const equipment: EquipmentInstruction[] = [];
  for (const node of model.nodes) {
    const system = systemById.get(node.systemId);
    if (!system) continue;
    if (node.equipment) {
      equipment.push({
        nodeId: node.id,
        systemId: node.systemId,
        assetId: node.equipment.assetId,
        tag: node.equipment.tag,
        position: node.position,
        widthM: node.equipment.widthM,
        heightM: node.equipment.heightM,
        depthM: node.equipment.depthM,
        rotationY: node.equipment.rotationY,
        label: node.label,
        floorNo: node.floorNo,
      });
      continue;
    }
    if (!node.terminal) continue;
    let kind: TerminalInstruction["kind"] | null = null;
    let sizeM = 0.55;
    switch (system.type) {
      case "supply-air":
      case "outdoor-air":
        kind = node.label === "OA louver" ? "vent-cowl" : "diffuser";
        break;
      case "return-air":
      case "exhaust-air":
        kind = "grille";
        sizeM = 0.5;
        break;
      case "power":
        if (node.label === "receptacle circuit") {
          kind = "receptacle";
          sizeM = 0.12;
        }
        break;
      default:
        kind = null;
    }
    if (kind) {
      terminals.push({
        nodeId: node.id,
        kind,
        position: node.position,
        sizeM,
        systemId: node.systemId,
        systemType: system.type,
        floorNo: node.floorNo,
      });
    }
  }

  return { runs, fittings, hangers, terminals, equipment };
}
