// src/lib/fidelity/input-provenance.ts
// P2-27: Pure function deriving InputProvenance from available data signals.
// No 'use client' — server/test-agnostic (AFF-1).

import type { InputProvenance } from "@/components/twin/fidelity-badge";

/**
 * Footprint source discriminator.
 *
 * - 'cad' | 'ifc' | 'building': actual building outline → measured
 * - 'parcel': cadastral lot boundary (NOT the building outline) → estimated
 *   (AFF-6: parcel ≠ building; must not soften this to measured)
 * - null: era procedural rectangle → estimated
 */
export type FootprintSource = "cad" | "ifc" | "building" | "parcel" | null;

export interface DeriveInputProvenanceInputs {
  /** Which source provided the footprint geometry. */
  footprintSource: FootprintSource;
  /**
   * Ledger 'heit' field (meters). AFF-6: 0 means unavailable, not a real zero.
   * When > 0, heights are measured from the official building ledger.
   */
  ledgerHeit: number;
  /**
   * VWorld GIS건물통합정보 buld_hg (meters), or null when absent.
   * AFF-6: 0 means unavailable — only > 0 counts as measured.
   */
  measuredHeightM: number | null;
  /**
   * Whether a BuildingCalibration was applied (P2-12 calibration registry).
   * Calibration implies per-floor height overrides from a traceable source doc,
   * and also signals that facade properties were refined beyond era defaults.
   */
  calibrationApplied: boolean;
}

/**
 * Derive per-input provenance flags for the FidelityBadge.
 *
 * footprint:
 *   'measured' when footprintSource is 'cad' | 'ifc' | 'building'
 *             (all three are actual building outlines from authoritative sources).
 *   'estimated' for 'parcel' (lot boundary ≠ building — AFF-6) and null (era box).
 *
 * heights:
 *   'measured' when ledgerHeit > 0 OR measuredHeightM > 0 OR calibrationApplied.
 *   'estimated' otherwise (all height signals absent or zero).
 *
 * facade:
 *   'measured' only when calibrationApplied (P2-12 semantics: calibration overrides
 *             carry traceable source documents for facade/material properties).
 *   'estimated' when no calibration exists (era-recipe defaults apply).
 *
 * Note: fidelity-assessor.ts (assessFidelity) does not expose a facade signal —
 * it tracks data-source breadth (hasIfcModel, hasEnergyBills, …) at the
 * FidelityReport level, not per-input measurement status. The calibration flag
 * is therefore the correct facade signal, consistent with P2-12's intent.
 */
export function deriveInputProvenance(
  inputs: DeriveInputProvenanceInputs,
): InputProvenance {
  const { footprintSource, ledgerHeit, measuredHeightM, calibrationApplied } =
    inputs;

  const footprint: InputProvenance["footprint"] =
    footprintSource === "cad" ||
    footprintSource === "ifc" ||
    footprintSource === "building"
      ? "measured"
      : "estimated";

  const heights: InputProvenance["heights"] =
    ledgerHeit > 0 ||
    (measuredHeightM !== null && measuredHeightM > 0) ||
    calibrationApplied
      ? "measured"
      : "estimated";

  const facade: InputProvenance["facade"] = calibrationApplied
    ? "measured"
    : "estimated";

  return { footprint, heights, facade };
}
