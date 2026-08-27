/**
 * Shared 건축물대장 (Korean building register) row helpers.
 *
 * Extracted from `src/lib/building-geometry.ts` so the 3D massing path and the
 * source-traceable energy path read the register through exactly one
 * implementation. Behaviour is unchanged for the original caller.
 */

import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";
import type { BuildingEra } from "@/lib/material-types";

/**
 * The floor-outline endpoint can return rows for multiple building registers
 * and multiple use/area rows for one physical floor. Scope them to the chosen
 * title and keep one representative per floor so geometry is never duplicated.
 */
export function normalizeFloorRows(
  title: BrTitleInfo,
  floors: readonly BrFloorInfo[],
): BrFloorInfo[] {
  const titlePk = String(title.mgmBldrgstPk || "");
  const scoped = floors.filter((floor) => {
    const floorPk = String(floor.mgmBldrgstPk || "");
    return !titlePk || !floorPk || floorPk === titlePk;
  });
  const byFloor = new Map<string, BrFloorInfo>();

  for (const floor of scoped) {
    const floorNo = Number(floor.flrNo);
    if (!Number.isFinite(floorNo)) continue;
    const key = `${floor.flrGbCd || (floorNo < 0 ? "below" : "above")}:${floorNo}`;
    const existing = byFloor.get(key);
    if (!existing || Number(floor.area) > Number(existing.area)) {
      byFloor.set(key, floor);
    }
  }

  return [...byFloor.values()];
}

/** True when the register row describes a below-grade (지하) floor. */
export function isBelowGradeRow(floor: BrFloorInfo): boolean {
  const floorNo = Number(floor.flrNo);
  return (floor.flrGbCdNm || "").includes("지하") || floorNo < 0;
}

export type LedgerUseCategory =
  | "residential"
  | "office"
  | "factory"
  | "retail"
  | "default";

/**
 * 주용도코드 → the key used by the era-indexed default tables in
 * `korean-building-codes.ts` (WINDOW_RATIOS in particular).
 */
export function ledgerUseCategory(mainPurpsCd: string): LedgerUseCategory {
  if (["01000", "02000"].includes(mainPurpsCd)) return "residential";
  if (mainPurpsCd === "14000") return "office";
  if (["17000", "18000"].includes(mainPurpsCd)) return "factory";
  if (["07000", "11000"].includes(mainPurpsCd)) return "retail";
  return "default";
}

/** FLOOR_HEIGHTS is keyed more coarsely than WINDOW_RATIOS. */
export function ledgerFloorHeightCategory(
  mainPurpsCd: string,
): "residential" | "commercial" | "factory" {
  if (["01000", "02000"].includes(mainPurpsCd)) return "residential";
  if (["17000", "18000"].includes(mainPurpsCd)) return "factory";
  return "commercial";
}

export type EraResolution = Readonly<{
  era: BuildingEra;
  /**
   * False when no usable date was on the register and `era` is a stated
   * fallback rather than a reading. Callers MUST surface this — era drives
   * every U-value, the window-to-wall ratio, airtightness and floor height,
   * so a silent fallback is a fabricated building.
   */
  resolved: boolean;
  /** Which register field the year came from, when one did. */
  sourceField: "useAprDay" | "pmsDay" | null;
  /** The raw value that was read, for the provenance record. */
  rawValue: string | null;
  year: number | null;
}>;

/** The era used when the register carries no usable date. */
export const ERA_FALLBACK: BuildingEra = "1990-1999";

function yearFrom(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 4) return null;
  const year = Number.parseInt(trimmed.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1800 || year > 2200) return null;
  return year;
}

function eraForYear(year: number): BuildingEra {
  if (year < 1970) return "pre-1970";
  if (year < 1990) return "1970-1989";
  if (year < 2000) return "1990-1999";
  if (year < 2010) return "2000-2009";
  if (year < 2020) return "2010-2019";
  return "2020+";
}

/**
 * Era classification that reports whether it actually read a date.
 *
 * `classifyEra` in `material-types.ts` returns "1990-1999" for a blank, short
 * or NaN date with no way for a caller to tell a 1995 building from a building
 * with no recorded date. That is fine for choosing a facade texture and wrong
 * for an energy model, so the traceable path uses this instead.
 *
 * 사용승인일 is preferred over 허가일: the approval date is when the building
 * was actually completed to a code edition, whereas a permit can precede
 * completion by years.
 */
export function classifyEraExplicit(
  input: Readonly<{ useAprDay?: string; pmsDay?: string }>,
): EraResolution {
  const approvalYear = yearFrom(input.useAprDay);
  if (approvalYear !== null) {
    return Object.freeze({
      era: eraForYear(approvalYear),
      resolved: true,
      sourceField: "useAprDay" as const,
      rawValue: (input.useAprDay ?? "").trim(),
      year: approvalYear,
    });
  }
  const permitYear = yearFrom(input.pmsDay);
  if (permitYear !== null) {
    return Object.freeze({
      era: eraForYear(permitYear),
      resolved: true,
      sourceField: "pmsDay" as const,
      rawValue: (input.pmsDay ?? "").trim(),
      year: permitYear,
    });
  }
  return Object.freeze({
    era: ERA_FALLBACK,
    resolved: false,
    sourceField: null,
    rawValue: null,
    year: null,
  });
}
