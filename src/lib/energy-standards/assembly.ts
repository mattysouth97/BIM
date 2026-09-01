/**
 * ISO 6946-style assembly thermal resistance: U = 1 / (Rsi + Σ dᵢ/λᵢ + Rse).
 *
 * Traceability rows PHY-R-LAYER / PHY-R-ASM / PHY-RSI-RSE / PHY-U in
 * docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md. The surface-resistance
 * constants follow the 에너지절약설계기준 해설서 convention (heat-flow
 * direction dependent); they are the values Korean practice plugs into the
 * same ISO 6946 formula.
 *
 * Pure module: numbers in, numbers out. Provenance (which layer value is a
 * generic library entry vs a certified datasheet) is the caller's concern —
 * this module only computes, and reports enough structure for the UI to
 * show the per-layer R breakdown.
 */

export type HeatFlowDirection = "horizontal" | "upward" | "downward";

/**
 * 실내/실외 표면 열전달저항 (m²K/W).
 * horizontal → walls; upward → roofs; downward → floors.
 */
export const SURFACE_RESISTANCES: Record<
  HeatFlowDirection,
  Readonly<{ rsi: number; rse: number }>
> = {
  horizontal: { rsi: 0.11, rse: 0.043 },
  upward: { rsi: 0.086, rse: 0.043 },
  downward: { rsi: 0.15, rse: 0.043 },
};

/** One physical layer, outside → inside order is not required (R is additive). */
export type AssemblyLayerInput = Readonly<{
  /** Stable id so results can be traced back to the layer. */
  id: string;
  thicknessM: number;
  /** λ, W/(m·K). Use `fixedResistanceM2KPerW` instead for air cavities. */
  conductivityWPerMK?: number;
  /** For air gaps / membranes quoted directly as R (e.g. 중공층 0.17). */
  fixedResistanceM2KPerW?: number;
}>;

export type LayerResistance = Readonly<{
  id: string;
  resistanceM2KPerW: number;
  /** Share of the total R_T — drives the "which layer matters" UI. */
  shareOfTotal: number;
}>;

export type AssemblyCalcResult = Readonly<{
  uValueWPerM2K: number;
  totalResistanceM2KPerW: number;
  surface: Readonly<{ rsi: number; rse: number; direction: HeatFlowDirection }>;
  layers: readonly LayerResistance[];
}>;

export class AssemblyCalcError extends Error {
  constructor(
    message: string,
    readonly layerId?: string
  ) {
    super(message);
    this.name = "AssemblyCalcError";
  }
}

function layerResistance(layer: AssemblyLayerInput): number {
  if (layer.fixedResistanceM2KPerW !== undefined) {
    if (!Number.isFinite(layer.fixedResistanceM2KPerW) || layer.fixedResistanceM2KPerW <= 0) {
      throw new AssemblyCalcError(
        `Layer ${layer.id}: fixed resistance must be a positive number.`,
        layer.id
      );
    }
    return layer.fixedResistanceM2KPerW;
  }
  const { thicknessM, conductivityWPerMK } = layer;
  if (
    conductivityWPerMK === undefined ||
    !Number.isFinite(conductivityWPerMK) ||
    conductivityWPerMK <= 0
  ) {
    throw new AssemblyCalcError(
      `Layer ${layer.id}: conductivity must be a positive number (or provide a fixed resistance).`,
      layer.id
    );
  }
  if (!Number.isFinite(thicknessM) || thicknessM <= 0) {
    throw new AssemblyCalcError(`Layer ${layer.id}: thickness must be a positive number.`, layer.id);
  }
  return thicknessM / conductivityWPerMK;
}

/**
 * Compute R_T and U for a layered opaque assembly.
 * Throws AssemblyCalcError on non-physical input — a diagnostic tool must
 * refuse rather than emit a plausible-looking wrong number.
 */
export function calculateAssembly(
  layers: readonly AssemblyLayerInput[],
  direction: HeatFlowDirection
): AssemblyCalcResult {
  if (layers.length === 0) {
    throw new AssemblyCalcError("An assembly needs at least one layer.");
  }
  const surface = SURFACE_RESISTANCES[direction];
  const perLayer = layers.map((layer) => ({ id: layer.id, r: layerResistance(layer) }));
  const totalR = surface.rsi + surface.rse + perLayer.reduce((sum, l) => sum + l.r, 0);
  return {
    uValueWPerM2K: 1 / totalR,
    totalResistanceM2KPerW: totalR,
    surface: { ...surface, direction },
    layers: perLayer.map((l) => ({
      id: l.id,
      resistanceM2KPerW: l.r,
      shareOfTotal: l.r / totalR,
    })),
  };
}

/**
 * The insulation thickness (m) an assembly's named layer needs for the whole
 * assembly to reach `targetU`, keeping every other layer fixed. Returns null
 * when the target is unreachable (already exceeded by the other layers'
 * resistance alone). Used by the 재료 민감도 view to mark the code-compliance
 * point on a thickness sweep.
 */
export function thicknessForTargetU(
  layers: readonly AssemblyLayerInput[],
  direction: HeatFlowDirection,
  variableLayerId: string,
  targetU: number
): number | null {
  if (!Number.isFinite(targetU) || targetU <= 0) return null;
  const variable = layers.find((l) => l.id === variableLayerId);
  if (!variable || variable.conductivityWPerMK === undefined) return null;
  const surface = SURFACE_RESISTANCES[direction];
  const otherR = layers
    .filter((l) => l.id !== variableLayerId)
    .reduce((sum, l) => sum + layerResistance(l), 0);
  const neededLayerR = 1 / targetU - surface.rsi - surface.rse - otherR;
  if (neededLayerR <= 0) return null;
  return neededLayerR * variable.conductivityWPerMK;
}
