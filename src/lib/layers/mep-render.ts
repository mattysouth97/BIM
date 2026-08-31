// src/lib/layers/mep-render.ts
//
// Shared THREE renderer for the canonical MEP model (src/lib/mep). The layer
// generators call renderMepSystems() with their discipline's system ids and
// their subsystem's x-ray material language; geometry always derives from the
// graph (§3) — runs as instanced cylinders/boxes, fittings as real elbows/
// tees/reducers (§21), hangers at plausible intervals (§23), terminals as
// diffusers/grilles, equipment as GLB heroes with primitive fallback.
//
// Draw-call discipline: per selected system → 1 instanced round-run mesh +
// 1 instanced rect-run mesh + 1 merged fitting mesh; plus shared instanced
// hangers/terminals. Per-instance metadata rides userData as plain JSON so
// the existing selection stack (raycast → sub-mep group → userData) and the
// new MEP inspector both work without holding THREE refs.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  buildRenderInstructions,
  type EquipmentInstruction,
  type FittingInstruction,
  type MepModel,
  type MepRenderInstructions,
  type RunInstruction,
  type TerminalInstruction,
  type Vec3,
} from "@/lib/mep";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentGeometryClone,
  getEquipmentObjectClone,
  tagEquipmentObject,
  type EquipmentAssetId,
} from "@/lib/equipment-assets";

// Instruction cache: six layer generators render from one model (§40).
const instructionCache = new WeakMap<MepModel, MepRenderInstructions>();

export function instructionsFor(model: MepModel): MepRenderInstructions {
  let instr = instructionCache.get(model);
  if (!instr) {
    instr = buildRenderInstructions(model);
    instructionCache.set(model, instr);
  }
  return instr;
}

/** Plain-JSON per-element info surfaced to the inspector (§25). */
export interface MepElementInfo {
  mepId: string;
  systemId: string;
  systemName: string;
  systemNameKo: string;
  role: string;
  sizeLabel: string;
  flowLabel: string;
  basis: string;
  floorNo: number | null;
}

export interface MepRenderStyle {
  color: number;
  emissiveIntensity?: number;
  opacity?: number;
  /** userData.type applied to run meshes (keeps the legacy selection tags). */
  runTag: string;
  fittingTag?: string;
  terminalTag?: string;
}

export interface RenderOptions {
  systems: string[];
  style: MepRenderStyle;
  /** 0..1 — below 0.35 only mains/risers render; below 0.7 no hangers. */
  density?: number;
  /** Color override mode (§24/§26): provenance tints by basis; clash marks ids red. */
  colorMode?: "system" | "provenance" | "clash";
  clashSegmentIds?: Set<string>;
  includeHangers?: boolean;
  includeTerminals?: boolean;
}

const PROVENANCE_COLORS: Record<string, number> = {
  calculated: 0x22c55e,
  estimated: 0xf59e0b,
  defaulted: 0x94a3b8,
  imported: 0x3b82f6,
  user: 0xa855f7,
};
const CLASH_COLOR = 0xef4444;

function makeMaterial(style: MepRenderStyle, colorOverride?: number): THREE.MeshStandardMaterial {
  const color = colorOverride ?? style.color;
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: style.emissiveIntensity ?? 0.35,
    transparent: true,
    opacity: style.opacity ?? 0.85,
    roughness: 0.55,
    metalness: 0.25,
  });
}

/**
 * Neutral base for instance-colored modes: instanceColor MULTIPLIES the base
 * color, so the base must be white and the emissive must not repaint the
 * system hue over it.
 */
function makeInstanceColorMaterial(style: MepRenderStyle): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x000000,
    transparent: true,
    opacity: style.opacity ?? 0.9,
    roughness: 0.55,
    metalness: 0.2,
  });
}

function instanceColorFor(
  mode: "provenance" | "clash",
  run: RunInstruction,
  clashIds: Set<string> | undefined,
): THREE.Color {
  if (mode === "clash") {
    return new THREE.Color(clashIds?.has(run.segId) ? CLASH_COLOR : 0x475569);
  }
  return new THREE.Color(PROVENANCE_COLORS[run.basis] ?? 0x94a3b8);
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpMat = new THREE.Matrix4();
const basisMat = new THREE.Matrix4();

/** Orientation basis: local Y = run direction, local X kept horizontal. */
function runQuaternion(dir: THREE.Vector3, out: THREE.Quaternion): void {
  const y = dir;
  const ref = Math.abs(y.dot(UP)) > 0.94 ? new THREE.Vector3(1, 0, 0) : UP;
  const x = new THREE.Vector3().crossVectors(ref, y).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  basisMat.makeBasis(x, y, z);
  out.setFromRotationMatrix(basisMat);
}

function v(a: Vec3): THREE.Vector3 {
  return new THREE.Vector3(a.x, a.y, a.z);
}

function sizeLabelOf(run: RunInstruction): string {
  if (run.shape.kind === "round") return `DN ${Math.round(run.shape.diameterM * 1000)}`;
  if (run.shape.kind === "rect") {
    return `${Math.round(run.shape.widthM * 1000)}×${Math.round(run.shape.heightM * 1000)}`;
  }
  return `tray ${Math.round(run.shape.widthM * 1000)}`;
}

function flowLabelOf(run: RunInstruction): string {
  const value = run.flow >= 100 ? Math.round(run.flow) : Math.round(run.flow * 100) / 100;
  const unit = { m3h: "m³/h", lps: "L/s", kw: "kW", fu: "FU", va: "VA" }[run.flowUnit];
  return `${value} ${unit}`;
}

function infoOf(run: RunInstruction, model: MepModel): MepElementInfo {
  const system = model.systems.find((s) => s.id === run.systemId);
  return {
    mepId: run.segId,
    systemId: run.systemId,
    systemName: system?.name ?? run.systemId,
    systemNameKo: system?.nameKo ?? run.systemId,
    role: run.role,
    sizeLabel: sizeLabelOf(run),
    flowLabel: flowLabelOf(run),
    basis: run.basis,
    floorNo: run.floorNo,
  };
}

// ---------------------------------------------------------------------------

const ROUND_SEGMENTS = 10;
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, ROUND_SEGMENTS);
const unitBox = new THREE.BoxGeometry(1, 1, 1);

interface RunBuckets {
  round: RunInstruction[];
  rect: RunInstruction[];
  tray: RunInstruction[];
}

function shouldRender(run: RunInstruction, density: number): boolean {
  if (density >= 0.35) return true;
  return run.role === "riser" || run.role === "main" || run.role === "service";
}

/**
 * Renders the selected systems of a model into `group`. Returns the count of
 * meshes added (for tests).
 */
export function renderMepSystems(
  model: MepModel,
  group: THREE.Group,
  options: RenderOptions,
): number {
  const instr = instructionsFor(model);
  const wanted = new Set(options.systems);
  const density = options.density ?? 1;
  const mode = options.colorMode ?? "system";
  let meshCount = 0;

  const runs = instr.runs.filter((r) => wanted.has(r.systemId) && shouldRender(r, density));
  const bySystem = new Map<string, RunBuckets>();
  for (const run of runs) {
    let buckets = bySystem.get(run.systemId);
    if (!buckets) {
      buckets = { round: [], rect: [], tray: [] };
      bySystem.set(run.systemId, buckets);
    }
    buckets[run.shape.kind].push(run);
  }

  for (const [systemId, buckets] of bySystem) {
    // ---- Round runs: one InstancedMesh, per-instance radius via scale ----
    if (buckets.round.length > 0) {
      const im = new THREE.InstancedMesh(
        unitCylinder.clone(),
        mode === "system" ? makeMaterial(options.style) : makeInstanceColorMaterial(options.style),
        buckets.round.length,
      );
      const perInstance: MepElementInfo[] = [];
      buckets.round.forEach((run, i) => {
        const a = v(run.a);
        const b = v(run.b);
        const dir = b.clone().sub(a);
        const len = dir.length();
        dir.normalize();
        runQuaternion(dir, tmpQuat);
        tmpPos.copy(a).add(b).multiplyScalar(0.5);
        const r = (run.shape.kind === "round" ? run.shape.diameterM / 2 : 0.03) + (run.insulated ? 0.015 : 0);
        tmpScale.set(r, len, r);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        im.setMatrixAt(i, tmpMat);
        if (mode !== "system") {
          im.setColorAt(i, instanceColorFor(mode, run, options.clashSegmentIds));
        }
        perInstance.push(infoOf(run, model));
      });
      im.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false;
      im.userData = {
        type: options.style.runTag,
        mepSystemId: systemId,
        mepPerInstance: perInstance,
      };
      group.add(im);
      meshCount += 1;
    }

    // ---- Rect duct / tray runs: one InstancedMesh of unit boxes ----------
    const rectRuns = [...buckets.rect, ...buckets.tray];
    if (rectRuns.length > 0) {
      const im = new THREE.InstancedMesh(
        unitBox.clone(),
        mode === "system" ? makeMaterial(options.style) : makeInstanceColorMaterial(options.style),
        rectRuns.length,
      );
      const perInstance: MepElementInfo[] = [];
      rectRuns.forEach((run, i) => {
        const a = v(run.a);
        const b = v(run.b);
        const dir = b.clone().sub(a);
        const len = Math.max(dir.length(), 0.02);
        dir.normalize();
        runQuaternion(dir, tmpQuat);
        tmpPos.copy(a).add(b).multiplyScalar(0.5);
        const w = run.shape.kind === "round" ? 0.1 : run.shape.widthM;
        const h = run.shape.kind === "round" ? 0.1 : run.shape.heightM;
        tmpScale.set(w, len, h);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        im.setMatrixAt(i, tmpMat);
        if (mode !== "system") {
          im.setColorAt(i, instanceColorFor(mode, run, options.clashSegmentIds));
        }
        perInstance.push(infoOf(run, model));
      });
      im.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.userData = {
        type: options.style.runTag,
        mepSystemId: systemId,
        mepPerInstance: perInstance,
      };
      group.add(im);
      meshCount += 1;
    }

    // ---- Fittings: merged geometry per system (§21) ----------------------
    const fittings = instr.fittings.filter((f) => f.fitting.systemId === systemId);
    const fittingGeo = buildFittingGeometry(fittings, density);
    if (fittingGeo) {
      const mesh = new THREE.Mesh(
        fittingGeo,
        mode === "system"
          ? makeMaterial(options.style)
          : makeMaterial(options.style, 0x64748b),
      );
      mesh.userData = { type: options.style.fittingTag ?? `${options.style.runTag}-fitting`, mepSystemId: systemId };
      group.add(mesh);
      meshCount += 1;
    }
  }

  // ---- Hangers/supports (§23), shared across the selected systems --------
  if ((options.includeHangers ?? true) && density >= 0.7) {
    const hangers = instr.hangers.filter((h) => wanted.has(h.systemId));
    if (hangers.length > 0) {
      const rod = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
      const im = new THREE.InstancedMesh(
        rod,
        new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.6 }),
        hangers.length,
      );
      hangers.forEach((h, i) => {
        tmpPos.set(h.x, h.y + h.rodM / 2, h.z);
        tmpScale.set(1, h.rodM, 1);
        tmpQuat.identity(); // stale rotation from the runs loop tilts rods into fake diagonals
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        im.setMatrixAt(i, tmpMat);
      });
      im.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
      im.userData = { type: `${options.style.runTag}-hanger` };
      group.add(im);
      meshCount += 1;
    }
  }

  // ---- Terminal devices (diffusers/grilles/receptacles) ------------------
  if ((options.includeTerminals ?? true) && density >= 0.35) {
    meshCount += renderTerminals(instr, wanted, group, options);
  }

  return meshCount;
}

// ---------------------------------------------------------------------------

/** 90° elbow (torus arc), tee collar, reducer cone, cap — merged per system. */
function buildFittingGeometry(fittings: FittingInstruction[], density: number): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const elbowCache = new Map<string, THREE.TorusGeometry>();

  for (const f of fittings) {
    const fit = f.fitting;
    if (density < 0.35 && fit.kind !== "elbow") continue;
    const node = v(fit.position);
    const dirIn = v(fit.dirIn).normalize();
    const dirOut = v(fit.dirOut).normalize();

    if (fit.shape.kind === "round") {
      const tubeR = fit.shape.diameterM / 2;
      if (fit.kind === "elbow") {
        const bendR = f.bendRadiusM;
        const key = `${bendR.toFixed(3)}|${tubeR.toFixed(3)}`;
        let torus = elbowCache.get(key);
        if (!torus) {
          torus = new THREE.TorusGeometry(bendR, tubeR, 8, 8, Math.PI / 2);
          elbowCache.set(key, torus);
        }
        const u = dirIn.clone().negate(); // back upstream
        const vv = dirOut;
        const center = node.clone().addScaledVector(u, bendR).addScaledVector(vv, bendR);
        const xAxis = vv.clone().negate();
        const yAxis = u.clone().negate();
        const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
        const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(center);
        parts.push(torus.clone().applyMatrix4(m));
      } else if (fit.kind === "tee" || fit.kind === "wye") {
        const collar = new THREE.CylinderGeometry(tubeR * 1.3, tubeR * 1.3, tubeR * 2.4 + 0.1, 8);
        const q = new THREE.Quaternion();
        runQuaternion(dirOut, q);
        const m = new THREE.Matrix4().compose(
          node.clone().addScaledVector(dirOut, tubeR + 0.04),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        parts.push(collar.applyMatrix4(m));
      } else if (fit.kind === "reducer" || fit.kind === "transition") {
        const outR = fit.shapeOut?.kind === "round" ? fit.shapeOut.diameterM / 2 : tubeR * 0.75;
        const cone = new THREE.CylinderGeometry(outR, tubeR, Math.max(0.12, tubeR * 2), 8);
        const q = new THREE.Quaternion();
        runQuaternion(dirOut, q);
        const m = new THREE.Matrix4().compose(node, q, new THREE.Vector3(1, 1, 1));
        parts.push(cone.applyMatrix4(m));
      } else if (fit.kind === "valve") {
        const body = new THREE.CylinderGeometry(tubeR * 1.5, tubeR * 1.5, tubeR * 3.2, 8);
        const qv = new THREE.Quaternion();
        runQuaternion(dirIn, qv);
        parts.push(body.applyMatrix4(new THREE.Matrix4().compose(node, qv, new THREE.Vector3(1, 1, 1))));
        const wheel = new THREE.TorusGeometry(tubeR * 1.6, 0.012, 5, 10);
        const wm = new THREE.Matrix4().setPosition(node.clone().add(new THREE.Vector3(0, tubeR * 1.6 + 0.05, 0)));
        parts.push(wheel.applyMatrix4(wm));
      } else if (fit.kind === "cap") {
        const cap = new THREE.SphereGeometry(tubeR * 1.05, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const q = new THREE.Quaternion();
        runQuaternion(dirIn, q);
        parts.push(cap.applyMatrix4(new THREE.Matrix4().compose(node, q, new THREE.Vector3(1, 1, 1))));
      }
    } else {
      // Rect duct/tray fittings: mitred corner block (LOD200 practice) for
      // elbows/tees; wedge block for transitions.
      const w = fit.shape.widthM;
      const h = fit.shape.heightM;
      if (fit.kind === "elbow" || fit.kind === "tee") {
        const block = new THREE.BoxGeometry(w * 1.02, h * 1.02, w * 1.02);
        const q = new THREE.Quaternion();
        runQuaternion(dirOut, q);
        parts.push(block.applyMatrix4(new THREE.Matrix4().compose(node, q, new THREE.Vector3(1, 1, 1))));
      } else if (fit.kind === "transition" || fit.kind === "reducer") {
        const w2 = fit.shapeOut && fit.shapeOut.kind === "rect" ? fit.shapeOut.widthM : w * 0.75;
        const block = new THREE.BoxGeometry((w + w2) / 2, h, Math.max(0.25, w * 0.6));
        const q = new THREE.Quaternion();
        runQuaternion(dirOut, q);
        parts.push(block.applyMatrix4(new THREE.Matrix4().compose(node, q, new THREE.Vector3(1, 1, 1))));
      }
    }
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// ---------------------------------------------------------------------------

function renderTerminals(
  instr: MepRenderInstructions,
  wanted: Set<string>,
  group: THREE.Group,
  options: RenderOptions,
): number {
  const terminals = instr.terminals.filter((t) => wanted.has(t.systemId));
  if (terminals.length === 0) return 0;
  let meshCount = 0;
  const byKind = new Map<string, TerminalInstruction[]>();
  for (const t of terminals) {
    const list = byKind.get(t.kind);
    if (list) list.push(t);
    else byKind.set(t.kind, [t]);
  }

  for (const [kind, list] of byKind) {
    let geo: THREE.BufferGeometry;
    if (kind === "diffuser") {
      // 4-way diffuser: face plate + neck collar (merged once, instanced).
      const plate = new THREE.BoxGeometry(1, 0.045, 1);
      const inner = new THREE.BoxGeometry(0.55, 0.06, 0.55);
      const neck = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8);
      neck.translate(0, 0.09, 0);
      geo = mergeGeometries([plate, inner, neck], false) as THREE.BufferGeometry;
    } else if (kind === "grille") {
      const frame = new THREE.BoxGeometry(1, 0.04, 0.72);
      const fins = new THREE.BoxGeometry(0.9, 0.05, 0.6);
      geo = mergeGeometries([frame, fins], false) as THREE.BufferGeometry;
    } else if (kind === "receptacle") {
      geo = new THREE.BoxGeometry(0.09, 0.12, 0.04);
    } else {
      // vent-cowl
      geo = new THREE.CylinderGeometry(0.28, 0.36, 0.5, 8);
    }
    const im = new THREE.InstancedMesh(geo, makeMaterial(options.style), list.length);
    const perInstance: { mepId: string; floorNo: number | null; label: string }[] = [];
    list.forEach((t, i) => {
      tmpPos.set(t.position.x, t.position.y, t.position.z);
      tmpQuat.identity();
      const s = t.sizeM;
      tmpScale.set(kind === "receptacle" ? 1 : s, 1, kind === "receptacle" ? 1 : s);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      im.setMatrixAt(i, tmpMat);
      perInstance.push({ mepId: t.nodeId, floorNo: t.floorNo, label: kind });
    });
    im.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
    im.userData = {
      type: options.style.terminalTag ?? `${options.style.runTag}-terminal`,
      mepPerInstance: perInstance,
    };
    group.add(im);
    meshCount += 1;
  }
  return meshCount;
}

// ---------------------------------------------------------------------------

/**
 * Places the model's equipment nodes for the given systems: GLB hero when the
 * asset exists (scaled to the engineered dims via ASSET_NATIVE_DIMS), coarse
 * primitive fallback otherwise. Ceiling terminals with equipment (cassettes,
 * FCUs) are instanced from the merged GLB geometry.
 */
export function renderMepEquipment(
  model: MepModel,
  group: THREE.Group,
  options: {
    systems: string[];
    material?: THREE.Material;
    keepAssetMaterial?: boolean;
    tagOverride?: (e: EquipmentInstruction) => string;
    filter?: (e: EquipmentInstruction) => boolean;
    /** Retrofit scenario swaps (boiler → condensing/ASHP hero). */
    assetOverride?: (e: EquipmentInstruction) => string | undefined;
  },
): number {
  const instr = instructionsFor(model);
  const wanted = new Set(options.systems);
  let placed = 0;
  const equipment = instr.equipment
    .filter((e) => wanted.has(e.systemId) && (options.filter ? options.filter(e) : true))
    .map((e) => {
      const override = options.assetOverride?.(e);
      return override ? { ...e, assetId: override } : e;
    });

  // Instanced ceiling terminals (many identical units) vs hero singletons.
  const counts = new Map<string, EquipmentInstruction[]>();
  for (const e of equipment) {
    const key = `${e.assetId ?? "box"}|${e.widthM.toFixed(2)}`;
    const list = counts.get(key);
    if (list) list.push(e);
    else counts.set(key, [e]);
  }

  for (const list of counts.values()) {
    const first = list[0];
    if (list.length >= 4 && first.assetId) {
      const native = ASSET_NATIVE_DIMS[first.assetId as keyof typeof ASSET_NATIVE_DIMS];
      const geoClone = getEquipmentGeometryClone(first.assetId as EquipmentAssetId);
      const geo = geoClone ?? new THREE.BoxGeometry(1, 1, 1);
      const mat =
        options.material ??
        new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.5, metalness: 0.3 });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const perInstance: { mepId: string; floorNo: number | null; label: string }[] = [];
      list.forEach((e, i) => {
        tmpPos.set(e.position.x, e.position.y, e.position.z);
        tmpQuat.setFromAxisAngle(UP, e.rotationY);
        if (geoClone && native) {
          tmpScale.set(e.widthM / native.w, e.heightM / native.h, e.depthM / native.d);
        } else {
          tmpScale.set(e.widthM, e.heightM, e.depthM);
        }
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        im.setMatrixAt(i, tmpMat);
        perInstance.push({ mepId: e.nodeId, floorNo: e.floorNo, label: e.label ?? e.tag });
      });
      im.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
      im.userData = {
        type: options.tagOverride ? options.tagOverride(first) : first.tag,
        mepPerInstance: perInstance,
      };
      group.add(im);
      placed += list.length;
      continue;
    }
    for (const e of list) {
      const obj = e.assetId ? getEquipmentObjectClone(e.assetId as EquipmentAssetId) : null;
      if (obj) {
        const native = ASSET_NATIVE_DIMS[e.assetId as keyof typeof ASSET_NATIVE_DIMS];
        if (native) obj.scale.set(e.widthM / native.w, e.heightM / native.h, e.depthM / native.d);
        const baseOrigin = e.assetId ? BASE_ORIGIN_ASSETS.has(e.assetId) : false;
        obj.position.set(e.position.x, e.position.y - (baseOrigin ? e.heightM / 2 : 0), e.position.z);
        obj.rotation.y = e.rotationY;
        tagEquipmentObject(
          obj,
          {
            type: options.tagOverride ? options.tagOverride(e) : e.tag,
            floorNo: e.floorNo ?? undefined,
            mepId: e.nodeId,
            mepLabel: e.label,
          },
          { castShadow: true, receiveShadow: false },
        );
        group.add(obj);
      } else {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(e.widthM, e.heightM, e.depthM),
          options.material ??
            new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6, metalness: 0.3 }),
        );
        mesh.position.set(e.position.x, e.position.y, e.position.z);
        mesh.rotation.y = e.rotationY;
        mesh.userData = {
          type: options.tagOverride ? options.tagOverride(e) : e.tag,
          floorNo: e.floorNo ?? undefined,
          mepId: e.nodeId,
          mepLabel: e.label,
        };
        group.add(mesh);
      }
      placed += 1;
    }
  }
  return placed;
}

/**
 * GLB assets authored with a BASE origin (y ∈ [0, h]); graph equipment nodes
 * are body centres, so these clones shift down by h/2 to seat correctly.
 */
const BASE_ORIGIN_ASSETS = new Set([
  "chiller",
  "cooling-tower",
  "boiler",
  "boiler-condensing",
  "heat-pump",
  "gshp",
  "dhw-tank",
  "dhw-pump",
  "ahu",
  "vrf-outdoor",
  "exhaust-fan",
  "fire-pump",
  "emergency-generator",
  "water-meter",
  "bathroom-fixture",
  "gas-meter",
  "lpg-tank",
  "ev-charger",
]);

/** Debug: the raw graph as line segments + node points (§26 connectivity mode). */
export function renderMepGraphDebug(model: MepModel, group: THREE.Group, systems?: string[]): void {
  const wanted = systems ? new Set(systems) : null;
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const positions: number[] = [];
  for (const seg of model.segments) {
    if (wanted && !wanted.has(seg.systemId)) continue;
    const a = nodeById.get(seg.from)?.position;
    const b = nodeById.get(seg.to)?.position;
    if (!a || !b) continue;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, depthTest: false }),
  );
  lines.name = "mep-graph-debug";
  lines.renderOrder = 30;
  group.add(lines);
}
