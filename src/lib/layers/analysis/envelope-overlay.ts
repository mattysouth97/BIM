// src/lib/layers/analysis/envelope-overlay.ts
//
// 외피 (Envelope) analysis overlay — translucent shells per envelope element
// class, graded by that class's share of the building's heat-loss coefficient.
//
// EVERY number here comes from `calculateHeatLoss` (ISO 13789 H = H_tr + H_ve),
// which the caller passes in. This module never re-derives U-values, areas or
// ΔT; it converts an already-computed `HeatLossResult` into (a) a legend model
// and (b) geometry. The share denominator is Σ h [W/K] over ALL elements the
// physics returned, ventilation included — so the shares on screen sum to the
// same 100 % the energy panel reports.
//
// Orientation WWR comes from the material store's per-orientation
// windowToWallRatio applied to gross wall area measured off the recipe's
// footprint ring. It is reported ONLY when the recipe carries a real polygon:
// a bounding box has no per-orientation truth to report.
//
// Pure module: no React, no store access. Deterministic for a given input.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ElementHeatLoss } from "@/lib/energy/heat-loss";
import { isVentilationElement } from "@/lib/energy/heat-loss";
import {
  analysisBandColor,
  analysisBandIndex,
  buildCapGeometry,
  buildRingBandGeometry,
  edgeOutwardNormal,
  ENVELOPE_OVERLAY_GROUP,
  isUsableRings,
  offsetRings,
  overlayMaterial,
  rectRing,
  type Ring,
} from "./overlay-types";

/* ------------------------------------------------------------------ */
/* Element classes                                                     */
/* ------------------------------------------------------------------ */

/** Which surface an envelope heat-loss element is drawn as. */
export type EnvelopeSurface = "wall" | "window" | "roof" | "ground" | "none";

interface ClassMeta {
  surface: EnvelopeSurface;
  labelKo: string;
  labelEn: string;
}

/**
 * Element names are the canonical strings `calculateHeatLoss` pushes.
 * Anything unrecognised is still shown in the legend (with its own share) but
 * draws no surface — inventing a shell for an element we cannot place would be
 * a fabricated reading.
 */
const CLASS_META: Record<string, ClassMeta> = {
  Walls: { surface: "wall", labelKo: "외벽", labelEn: "Walls" },
  Windows: { surface: "window", labelKo: "창호", labelEn: "Windows" },
  Roof: { surface: "roof", labelKo: "지붕", labelEn: "Roof" },
  "Ground Floor": { surface: "ground", labelKo: "최하층 바닥", labelEn: "Ground floor" },
};

const VENTILATION_META: ClassMeta = {
  surface: "none",
  labelKo: "침기/환기",
  labelEn: "Infiltration/Ventilation",
};

export interface EnvelopeShare {
  /** Verbatim element name from the physics result. */
  element: string;
  labelKo: string;
  labelEn: string;
  surface: EnvelopeSurface;
  /** Heat-loss coefficient h = U·A (or 0.34·ACH·V), W/K. */
  hCoefficientWPerK: number;
  /** Surface area m² — conditioned volume m³ for the ventilation term. */
  area: number;
  /** U-value W/m²·K — effective ACH for the ventilation term. */
  uValue: number;
  /** h ÷ Σh over every element, 0..1. */
  share: number;
  /** 0..4, monotone in `share`. */
  bandIndex: number;
  /** Band colour for `share`. */
  color: string;
}

/**
 * Convert a `HeatLossResult.elements` array into the overlay's legend model.
 * Input order is preserved so the legend ordering is stable across rebuilds.
 */
export function computeEnvelopeShares(
  elements: readonly ElementHeatLoss[],
): EnvelopeShare[] {
  const totalH = elements.reduce((sum, e) => sum + Math.max(0, e.hCoefficient), 0);
  return elements.map((e) => {
    const meta = isVentilationElement(e.element)
      ? VENTILATION_META
      : (CLASS_META[e.element] ?? {
          surface: "none" as EnvelopeSurface,
          labelKo: e.element,
          labelEn: e.element,
        });
    const share = totalH > 0 ? Math.max(0, e.hCoefficient) / totalH : 0;
    return {
      element: e.element,
      labelKo: meta.labelKo,
      labelEn: meta.labelEn,
      surface: meta.surface,
      hCoefficientWPerK: e.hCoefficient,
      area: e.area,
      uValue: e.uValue,
      share,
      bandIndex: analysisBandIndex(share),
      color: analysisBandColor(share),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Orientation WWR                                                     */
/* ------------------------------------------------------------------ */

export type Orientation = "N" | "S" | "E" | "W";

export interface OrientationWwrRow {
  orientation: Orientation;
  /** Gross wall area facing this orientation, m². */
  grossWallAreaSqm: number;
  /** grossWallAreaSqm × the store's WWR for this orientation, m². */
  windowAreaSqm: number;
  /** The store's window-to-wall ratio for this orientation, 0..1. */
  wwr: number;
}

/**
 * Bucket the footprint's wall length by facing and multiply by total height.
 *
 * Axis convention follows `gis-transform` (x = east, z = north), so +z faces
 * North and +x faces East. Returns null when the recipe has no usable polygon —
 * a bbox fallback would report four identical faces that do not exist.
 */
export function computeOrientationWwr(
  recipe: BuildingRecipe,
  wwr: Record<Orientation, number>,
): OrientationWwrRow[] | null {
  if (!isUsableRings(recipe.footprintPolygon)) return null;

  const lengthByOrientation: Record<Orientation, number> = { N: 0, S: 0, E: 0, W: 0 };
  const rings = recipe.footprintPolygon;

  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r];
    if (ring.length < 3) continue;
    const isHole = r > 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len === 0) continue;
      const [nx, nz] = edgeOutwardNormal(ring, i, isHole);
      const orientation: Orientation =
        Math.abs(nz) >= Math.abs(nx) ? (nz >= 0 ? "N" : "S") : nx >= 0 ? "E" : "W";
      lengthByOrientation[orientation] += len;
    }
  }

  const height = Math.max(0, recipe.totalHeight);
  return (["N", "S", "E", "W"] as Orientation[]).map((orientation) => {
    const grossWallAreaSqm = lengthByOrientation[orientation] * height;
    const ratio = clamp01(wwr[orientation] ?? 0);
    return {
      orientation,
      grossWallAreaSqm,
      windowAreaSqm: grossWallAreaSqm * ratio,
      wwr: ratio,
    };
  });
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? 1 : n;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Render offset (m) that keeps each shell clear of the twin's own faces. */
const WALL_OFFSET_M = 0.09;
const WINDOW_OFFSET_M = 0.18;
const CAP_OFFSET_M = 0.12;

const SHELL_OPACITY = 0.34;

export interface EnvelopeOverlayInput {
  recipe: BuildingRecipe;
  shares: readonly EnvelopeShare[];
  /**
   * Average window-to-wall ratio, 0..1. Sets the height of the per-storey glazing
   * band so the band's area equals WWR × that storey's wall area — the band is an
   * abstraction of the glazed fraction, not a window schedule.
   */
  avgWwr: number;
  resultSemantics?: EnvelopeResultSemantics;
}

export type EnvelopeResultSemantics = Readonly<{
  metric: "heat_loss_coefficient";
  unit: "W/K";
  source: "viewer_energy_metrics" | "selected_simulation_run";
  inputHash: string | null;
  spatialResultCount: number;
  missingSpatialResultCount: number;
}>;

export const DEFAULT_ENVELOPE_RESULT_SEMANTICS: EnvelopeResultSemantics = {
  metric: "heat_loss_coefficient",
  unit: "W/K",
  source: "viewer_energy_metrics",
  inputHash: null,
  spatialResultCount: 0,
  missingSpatialResultCount: 0,
};

/**
 * Build the 외피 overlay group. One named child per drawable element class:
 * `envelope-shell:Walls`, `:Windows`, `:Roof`, `:Ground Floor`.
 * Elements whose surface is "none" (ventilation) contribute to the legend only.
 */
export function buildEnvelopeOverlay(input: EnvelopeOverlayInput): THREE.Group {
  const { recipe, shares, avgWwr } = input;
  const resultSemantics =
    input.resultSemantics ?? DEFAULT_ENVELOPE_RESULT_SEMANTICS;
  const group = new THREE.Group();
  group.name = ENVELOPE_OVERLAY_GROUP;

  const rings: Ring[] = isUsableRings(recipe.footprintPolygon)
    ? recipe.footprintPolygon
    : [rectRing(recipe.footprintWidth, recipe.footprintDepth)];

  const height = Math.max(0, recipe.totalHeight);
  const wwr = clamp01(avgWwr);

  for (const share of shares) {
    const geo = shellGeometry(share.surface, rings, recipe, height, wwr);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, overlayMaterial(share.color, SHELL_OPACITY));
    mesh.name = `envelope-shell:${share.element}`;
    mesh.renderOrder = 3;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = {
      type: "analysis-envelope-shell",
      element: share.element,
      share: share.share,
      hCoefficientWPerK: share.hCoefficientWPerK,
      resultSemantics,
    };
    group.add(mesh);
  }

  return group;
}

function shellGeometry(
  surface: EnvelopeSurface,
  rings: Ring[],
  recipe: BuildingRecipe,
  height: number,
  wwr: number,
): THREE.BufferGeometry | null {
  switch (surface) {
    case "wall":
      return buildRingBandGeometry(offsetRings(rings, WALL_OFFSET_M), 0, height);
    case "window":
      return windowBandGeometry(rings, recipe, wwr);
    case "roof":
      return buildCapGeometry(offsetRings(rings, CAP_OFFSET_M), height + CAP_OFFSET_M);
    case "ground":
      return buildCapGeometry(offsetRings(rings, CAP_OFFSET_M), -CAP_OFFSET_M);
    default:
      return null;
  }
}

/**
 * One horizontal band per above-grade storey, centred in the storey, of height
 * `wwr × storeyHeight` — so band area = WWR × that storey's gross wall area.
 * Merged into a single geometry so the whole class stays one draw call.
 */
function windowBandGeometry(
  rings: Ring[],
  recipe: BuildingRecipe,
  wwr: number,
): THREE.BufferGeometry | null {
  const aboveFloors = recipe.floors.filter((f) => f.type === "above");
  if (aboveFloors.length === 0 || wwr <= 0) return null;

  const offset = offsetRings(rings, WINDOW_OFFSET_M);
  const positions: number[] = [];

  for (const floor of aboveFloors) {
    const bandHeight = floor.height * wwr;
    if (bandHeight <= 0) continue;
    const centre = floor.y + floor.height / 2;
    const yBottom = centre - bandHeight / 2;
    const yTop = centre + bandHeight / 2;
    for (const ring of offset) {
      for (let i = 0; i < ring.length; i += 1) {
        const [x1, z1] = ring[i];
        const [x2, z2] = ring[(i + 1) % ring.length];
        positions.push(x1, yBottom, z1, x2, yBottom, z2, x2, yTop, z2);
        positions.push(x1, yBottom, z1, x2, yTop, z2, x1, yTop, z1);
      }
    }
  }

  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
