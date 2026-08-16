// src/lib/validation/ledger-validator.ts
// P2-13 WP4 — Ledger-fact validation module.
//
// Compares generated twin geometry against 건축물대장 ledger facts:
//   - Gross area (generated) vs totArea
//   - Above-ground floor count vs grndFlrCnt
//   - Below-ground floor count vs ugrndFlrCnt
//
// Warnings are advisory — never blocking.
// Zero-value fields mean "data unavailable" (AFF-6); those checks are skipped.
// Divergence threshold: ±15% (warn when |generated - ledger| / ledger > 0.15).

/** Fields from the 건축물대장 title record relevant to validation. */
export interface LedgerFacts {
  /** 연면적 (total floor area, m²). 0 = unavailable — skip area check. */
  totArea: number;
  /** 지상층수 (above-ground floor count). 0 = unavailable — skip check. */
  grndFlrCnt: number;
  /** 지하층수 (below-ground floor count). 0 = unavailable — skip check. */
  ugrndFlrCnt: number;
}

/** Facts derived from the generated twin. */
export interface GeneratedTwinFacts {
  /** Gross floor area (m²) computed from the generated twin geometry. */
  generatedGrossArea: number;
  /** Number of above-ground floors in the generated twin. */
  aboveGroundFloors: number;
  /** Number of below-ground floors in the generated twin. */
  belowGroundFloors: number;
}

/** A single validation warning. */
export interface LedgerWarning {
  /** Which ledger field this warning relates to. */
  field: "grossArea" | "floorCount" | "basementFloorCount";
  /** |generated - ledger| / ledger × 100 */
  divergencePct: number;
  /** Human-readable warning stating the magnitude — never vague. */
  message: string;
}

export interface LedgerValidationResult {
  /** true when all checks pass (no warnings); false when ≥1 warning. */
  valid: boolean;
  warnings: LedgerWarning[];
}

const THRESHOLD = 0.15; // 15%

function pct(generated: number, ledger: number): number {
  return Math.abs((generated - ledger) / ledger) * 100;
}

/**
 * Validate generated twin facts against ledger facts.
 * Returns { valid, warnings } — warnings are advisory, never blocking.
 */
export function validateAgainstLedger(
  ledger: LedgerFacts,
  twin: GeneratedTwinFacts,
): LedgerValidationResult {
  const warnings: LedgerWarning[] = [];

  // ── Gross area check ──────────────────────────────────────────────────────
  if (ledger.totArea > 0) {
    const divergence = pct(twin.generatedGrossArea, ledger.totArea);
    if (divergence > THRESHOLD * 100) {
      const direction = twin.generatedGrossArea > ledger.totArea ? "above" : "below";
      warnings.push({
        field: "grossArea",
        divergencePct: divergence,
        message:
          `Generated gross area (${twin.generatedGrossArea.toFixed(0)} m²) is ` +
          `${divergence.toFixed(1)}% ${direction} the ledger total area ` +
          `(${ledger.totArea.toFixed(0)} m²). Check footprint or floor count.`,
      });
    }
  }

  // ── Above-ground floor count check ───────────────────────────────────────
  if (ledger.grndFlrCnt > 0) {
    const divergence = pct(twin.aboveGroundFloors, ledger.grndFlrCnt);
    if (divergence > THRESHOLD * 100) {
      const direction = twin.aboveGroundFloors > ledger.grndFlrCnt ? "more" : "fewer";
      warnings.push({
        field: "floorCount",
        divergencePct: divergence,
        message:
          `Generated twin has ${twin.aboveGroundFloors} above-ground floors, ` +
          `${divergence.toFixed(1)}% ${direction} than the ledger (${ledger.grndFlrCnt} floors).`,
      });
    }
  }

  // ── Below-ground floor count check ───────────────────────────────────────
  if (ledger.ugrndFlrCnt > 0) {
    const divergence = pct(twin.belowGroundFloors, ledger.ugrndFlrCnt);
    if (divergence > THRESHOLD * 100) {
      const direction = twin.belowGroundFloors > ledger.ugrndFlrCnt ? "more" : "fewer";
      warnings.push({
        field: "basementFloorCount",
        divergencePct: divergence,
        message:
          `Generated twin has ${twin.belowGroundFloors} below-ground floors, ` +
          `${divergence.toFixed(1)}% ${direction} than the ledger (${ledger.ugrndFlrCnt} floors).`,
      });
    }
  }

  return { valid: warnings.length === 0, warnings };
}
