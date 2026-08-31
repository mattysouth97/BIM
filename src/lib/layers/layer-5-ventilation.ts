// src/lib/layers/layer-5-ventilation.ts
// Layer 5: MEP Ventilation 환기
//
// GRAPH-DRIVEN since the 2026-08-31 MEP realism rework: geometry derives from
// the canonical MEP model (src/lib/mep) — supply/return/OA/exhaust duct
// networks with real topology (AHU → riser → corridor main → zone branch →
// diffuser), engineered sizes, explicit fittings and hangers — instead of the
// old decorative constant-size boxes. The subsystem keeps its cyan x-ray
// language, the AHU GLB hero, and the animated `airflow-streamlines` batch
// (same name, same uTime shader contract, same cap) so the layer-store
// toggle, tests and e2e behavior carry over.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planMepSystemsForRecipe, type MepModel } from "@/lib/mep";
import type { LayerGenerator } from "./types";
import type { AhuParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";
import { renderMepEquipment, renderMepSystems } from "./mep-render";

const CYAN = 0x06b6d4;
const SUPPLY_AIR = new THREE.Color(0x67e8f9);
const RETURN_AIR = new THREE.Color(0x94a3b8);
const AIRFLOW_SAMPLES = 14;
export const MAX_AIRFLOW_LANE_BUNDLES = 40;

// Streamline shader: a faint continuous line plus asymmetric moving pulses —
// carried over unchanged from the pre-graph implementation (direction cue
// with zero per-frame CPU work).
const airflowVertexShader = /* glsl */ `
  attribute float lineProgress;
  attribute float phase;
  attribute vec3 color;
  varying float vLineProgress;
  varying float vPhase;
  varying vec3 vColor;
  void main() {
    vLineProgress = lineProgress;
    vPhase = phase;
    vColor = color;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const airflowFragmentShader = /* glsl */ `
  uniform float uTime;
  varying float vLineProgress;
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    float travel = fract(vLineProgress * 3.0 - uTime * 0.7 + vPhase);
    float pulse = pow(1.0 - travel, 5.0);
    vec3 color = mix(vColor, vec3(1.0), pulse * 0.35);
    gl_FragColor = vec4(color, 0.38 + pulse * 0.62);
  }
`;

const AIR_SYSTEMS = ["sa", "ra", "oa", "ex"];

/**
 * Supply-air throw fans from every air terminal in the model: three lanes
 * spreading down and outward from each diffuser (supply/OA), rising into
 * grilles for return/exhaust. Deterministic; capped for tall buildings.
 */
function buildAirflowStreamlines(model: MepModel, density: number): THREE.LineSegments | null {
  if (density <= 0) return null;
  const supplyIds = new Set(["sa", "oa"]);
  const returnIds = new Set(["ra", "ex"]);
  const terminals = model.nodes.filter(
    (n) => n.terminal && (supplyIds.has(n.systemId) || returnIds.has(n.systemId)) && n.floorNo !== null,
  );
  const bundles = terminals.slice(0, MAX_AIRFLOW_LANE_BUNDLES);
  if (bundles.length === 0) return null;

  const positions: number[] = [];
  const progress: number[] = [];
  const phases: number[] = [];
  const colors: number[] = [];
  const lanes = [-1, 0, 1];

  for (const [ti, terminal] of bundles.entries()) {
    const isSupply = supplyIds.has(terminal.systemId);
    const color = isSupply ? SUPPLY_AIR : RETURN_AIR;
    const p = terminal.position;
    for (const [li, lane] of lanes.entries()) {
      const phase = ((ti * 3 + li) % 7) / 7;
      const spread = 0.55 + Math.abs(lane) * 0.75;
      // Quadratic bezier: mouth → spread point → settled point.
      const p0 = new THREE.Vector3(p.x, p.y - (isSupply ? 0.04 : 1.6), p.z);
      const p1 = new THREE.Vector3(p.x + lane * spread * 0.5, p.y - (isSupply ? 0.9 : 1.0), p.z + spread * 0.35);
      const p2 = new THREE.Vector3(p.x + lane * spread, p.y - (isSupply ? 1.7 : 0.06), p.z + spread * 0.7);
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const pts = curve.getPoints(AIRFLOW_SAMPLES);
      for (let i = 0; i < pts.length - 1; i += 1) {
        const t0 = i / (pts.length - 1);
        const t1 = (i + 1) / (pts.length - 1);
        positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        // Return-air lanes animate toward the grille (reverse progress).
        progress.push(isSupply ? t0 : 1 - t0, isSupply ? t1 : 1 - t1);
        phases.push(phase, phase);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("lineProgress", new THREE.Float32BufferAttribute(progress, 1));
  geo.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: airflowVertexShader,
    fragmentShader: airflowFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = "airflow-streamlines";
  lines.frustumCulled = false;
  lines.renderOrder = 20;
  lines.userData = { type: "vent-airflow" };
  return lines;
}

export class VentilationLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density = 1,
    equipParams: Partial<AhuParams> = {},
  ): THREE.Group {
    void equipParams; // AHU dims now derive from engineered airflow (rule A7)
    void DEFAULT_MEP_EQUIPMENT_PARAMS;
    const group = new THREE.Group();
    group.name = "layer-5-ventilation";
    this.group = group;

    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0 || density <= 0) return group;

    const model = planMepSystemsForRecipe(recipe);

    renderMepSystems(model, group, {
      systems: AIR_SYSTEMS,
      style: {
        color: CYAN,
        emissiveIntensity: 0.4,
        opacity: 0.8,
        runTag: "vent-duct-run",
        terminalTag: "vent-diffuser",
      },
      density,
    });

    // AHU / OA unit / exhaust fan heroes from the graph's equipment nodes.
    // Interior units keep the cyan x-ray language; the renderer falls back to
    // primitives when the GLB cache is cold (same contract as before).
    renderMepEquipment(model, group, {
      systems: AIR_SYSTEMS,
      material: new THREE.MeshStandardMaterial({
        color: CYAN,
        emissive: CYAN,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.9,
        roughness: 0.5,
        metalness: 0.3,
      }),
    });

    const streamlines = buildAirflowStreamlines(model, density);
    if (streamlines) group.add(streamlines);

    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    this.group = null;
  }
}
