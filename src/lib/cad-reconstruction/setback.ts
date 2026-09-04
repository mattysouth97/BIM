// src/lib/cad-reconstruction/setback.ts
//
// P2-31 — where a step goes.
//
// `makeLevel` used to turn a smaller registered floor area into a plate by
// scaling the footprint about its centroid. That gets the AREA right and the
// SHAPE wrong: it splits one real step across four faces, so every face's wall
// area, every orientation's solar gain and every terrace edge lands somewhere
// the building does not have one. After P2-30 those are numbers the diagnosis
// reports, not just pixels.
//
// The division of labour here is the thing to preserve:
//
//   the 건축법 rule decides WHICH face steps back
//   the register's 층별개요 decides HOW MUCH
//
// This module therefore computes no setback distance and encodes no figure
// from 제86조 — not 1.5 m, not H/2. It only picks a face. A rule that
// contributes no numbers cannot contribute a wrong one, and the amount stays
// sourced to the register where it belongs.
//
// Units: millimetres, local frame, X = east, Y = north (same as the model).

import {
  areaSqm,
  bbox,
  edgeFacing,
  isSelfIntersecting,
  longestEdgeIndex,
  toCounterClockwise,
} from "./geometry";
import type { Orientation, RingMm } from "./types";

/* ------------------------------------------------------------------ */
/* 용도지역 — 건축법 시행령 제86조 applicability                        */
/* ------------------------------------------------------------------ */

/**
 * The 용도지역 in which 정북방향 일조권 사선제한 applies (건축법 시행령
 * 제86조 제1항): 전용주거지역 and 일반주거지역.
 *
 * 준주거지역 is deliberately absent. It reads like a 주거지역 and is not one
 * for this rule — 제86조 lists 전용주거지역 and 일반주거지역 only.
 *
 * Values are matched against VWorld `LT_C_UQ111.uname`, which returns the
 * district verbatim ("제3종일반주거지역", "일반상업지역").
 */
export const DAYLIGHT_SETBACK_DISTRICTS: readonly string[] = [
  "제1종전용주거지역",
  "제2종전용주거지역",
  "제1종일반주거지역",
  "제2종일반주거지역",
  "제3종일반주거지역",
] as const;

/**
 * Whether the north-setback rule reaches this district.
 *
 * An absent or unrecognised district is **unknown**, never residential. The
 * rule may only be claimed when a source actually said which district this is.
 */
export function isDaylightSetbackDistrict(
  district: string | null | undefined,
): boolean {
  if (!district) return false;
  const trimmed = district.trim();
  return DAYLIGHT_SETBACK_DISTRICTS.includes(trimmed);
}

/* ------------------------------------------------------------------ */
/* Choosing the face                                                   */
/* ------------------------------------------------------------------ */

export type SetbackReason =
  /** 정북방향 일조권 사선제한, corroborated by northern slack in the lot. */
  | "daylight_setback"
  /** The lot has room on one side and the building is pushed off it. */
  | "lot_slack"
  /** No parcel and no district: the direction is not determined by evidence. */
  | "undetermined";

export interface SetbackChoice {
  /** The face area is removed from, or null when nothing determined one. */
  facing: Orientation | null;
  /** Index of that edge in the counter-clockwise footprint ring. */
  edgeIndex: number | null;
  reason: SetbackReason;
  /** The 용도지역 that was read, verbatim — including when it ruled the rule out. */
  district: string | null;
  /** Korean sentence for the assumption ledger. Always populated. */
  note: string;
}

export interface SetbackContext {
  /** Above-grade outline, millimetres. */
  footprint: RingMm;
  /** Parcel outline in the same frame, when GIS returned one. */
  parcel: RingMm | null;
  /** 용도지역 name from VWorld `LT_C_UQ111.uname`, when it answered. */
  district: string | null;
}

/** Slack on each side: how far the parcel extends beyond the building, mm. */
function lotSlack(footprint: RingMm, parcel: RingMm) {
  const b = bbox(footprint);
  const p = bbox(parcel);
  return {
    north: p.maxY - b.maxY,
    south: b.minY - p.minY,
    east: p.maxX - b.maxX,
    west: b.minX - p.minX,
  };
}

/**
 * The ring edge whose outward normal points a given way. When several do — a
 * stepped or irregular outline — the longest wins, because that is the face a
 * setback would actually be taken off.
 */
function edgeIndexFacing(ring: RingMm, facing: Orientation): number | null {
  const ccw = toCounterClockwise(ring);
  let best: number | null = null;
  let bestLen = -1;
  for (let i = 0; i < ccw.length; i++) {
    if (edgeFacing(ccw, i) !== facing) continue;
    const [x0, y0] = ccw[i];
    const [x1, y1] = ccw[(i + 1) % ccw.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best;
}

/** A slack margin only counts as directional when it clears this, in mm. */
const MEANINGFUL_SLACK_MM = 1_500;
/** …and when it exceeds the opposite side by this factor. */
const SLACK_DOMINANCE = 2;

/**
 * Pick the face a setback comes off, from evidence only.
 *
 * Order of preference:
 *  1. **정북방향 일조권** — the district is one 제86조 reaches AND the lot has
 *     real northern slack the building is pushed off. Both are required: the
 *     rule without the geometry is a guess about this building, and the
 *     geometry without the district is a guess about the rule.
 *  2. **Lot slack** — the parcel plainly has room on one side. Weaker, and
 *     recorded as geometry rather than as a code rule.
 *  3. **Undetermined** — say so. Concentric is the honest fallback, not the
 *     default, and the caller records that the per-orientation envelope is
 *     unreliable for this building.
 */
export function chooseSetbackFace(context: SetbackContext): SetbackChoice {
  const { footprint, parcel, district } = context;
  const named = district?.trim() ? district.trim() : null;

  if (!parcel || parcel.length < 3) {
    return {
      facing: null,
      edgeIndex: null,
      reason: "undetermined",
      district: named,
      note: named
        ? `용도지역(${named})은 확인했으나 필지 외곽이 없어 후퇴 방향을 정할 수 없습니다.`
        : "필지 외곽과 용도지역이 모두 없어 후퇴 방향을 정할 수 없습니다.",
    };
  }

  const slack = lotSlack(footprint, parcel);
  const northDominant =
    slack.north >= MEANINGFUL_SLACK_MM &&
    slack.north >= slack.south * SLACK_DOMINANCE;

  if (isDaylightSetbackDistrict(named) && northDominant) {
    const edgeIndex = edgeIndexFacing(footprint, "north");
    if (edgeIndex !== null) {
      return {
        facing: "north",
        edgeIndex,
        reason: "daylight_setback",
        district: named,
        note:
          `${named}이며 북측으로 ${(slack.north / 1000).toFixed(1)} m의 여유가 ` +
          "관측되어, 정북방향 일조권 사선제한(건축법 시행령 제86조)에 따른 " +
          "북측 후퇴로 해석했습니다. 후퇴 방향만 이 규정에서 왔고, 후퇴 양은 " +
          "층별개요의 면적에서 계산했습니다.",
      };
    }
  }

  // Widest slack that is both meaningful and dominant over its opposite.
  const pairs: Array<[Orientation, number, number]> = [
    ["north", slack.north, slack.south],
    ["south", slack.south, slack.north],
    ["east", slack.east, slack.west],
    ["west", slack.west, slack.east],
  ];
  let bestSide: Orientation | null = null;
  let bestValue = 0;
  for (const [side, value, opposite] of pairs) {
    if (value < MEANINGFUL_SLACK_MM) continue;
    if (value < opposite * SLACK_DOMINANCE) continue;
    if (value > bestValue) {
      bestValue = value;
      bestSide = side;
    }
  }

  if (bestSide) {
    const edgeIndex = edgeIndexFacing(footprint, bestSide);
    if (edgeIndex !== null) {
      return {
        facing: bestSide,
        edgeIndex,
        reason: "lot_slack",
        district: named,
        note:
          `필지에서 ${bestSide} 측으로 ${(bestValue / 1000).toFixed(1)} m의 여유가 ` +
          "관측되어 그 면으로 후퇴한 것으로 해석했습니다" +
          (named
            ? `. 용도지역은 ${named}으로, 정북방향 일조권 규정의 적용 대상이 아닙니다.`
            : ". 용도지역을 확인하지 못해 일조권 규정은 적용하지 않았습니다.") +
          " 방향 근거는 형상뿐이며 법규가 아닙니다.",
      };
    }
  }

  return {
    facing: null,
    edgeIndex: null,
    reason: "undetermined",
    district: named,
    note:
      "필지와 건물 외곽에서 뚜렷한 방향성이 관측되지 않아 후퇴 방향을 정하지 " +
      "못했습니다. 면적은 맞지만 어느 면이 후퇴했는지는 미확인이며, 방위별 " +
      "외피 면적은 신뢰할 수 없습니다." +
      (named ? ` (용도지역: ${named})` : ""),
  };
}

/* ------------------------------------------------------------------ */
/* Taking the area off that face                                       */
/* ------------------------------------------------------------------ */

/** Plate narrower than this is a sliver, not a storey. */
const MIN_PLATE_DEPTH_MM = 3_000;
/** Area tolerance for the bisection, m². */
const AREA_EPSILON_SQM = 0.05;

/**
 * Clip a ring to the half-plane behind a line, Sutherland–Hodgman.
 * `keep` is the side the interior stays on: the point is kept when
 * (p − origin)·normal <= 0.
 */
function clipToHalfPlane(
  ring: RingMm,
  originX: number,
  originY: number,
  normalX: number,
  normalY: number,
): RingMm {
  const out: RingMm = [];
  const side = (p: readonly [number, number]) =>
    (p[0] - originX) * normalX + (p[1] - originY) * normalY;

  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    const dCurrent = side(current);
    const dNext = side(next);

    if (dCurrent <= 0) out.push([current[0], current[1]]);
    if ((dCurrent <= 0 && dNext > 0) || (dCurrent > 0 && dNext <= 0)) {
      const t = dCurrent / (dCurrent - dNext);
      out.push([
        current[0] + (next[0] - current[0]) * t,
        current[1] + (next[1] - current[1]) * t,
      ]);
    }
  }
  return out;
}

/** Shortest span of a ring across its bounding box, mm. */
function minSpan(ring: RingMm): number {
  const b = bbox(ring);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY);
}

/**
 * Move one edge inward until the ring encloses `targetSqm`.
 *
 * Returns null rather than a degenerate plate: a step so deep it leaves a
 * sliver is a contradiction between the stated area and the observed outline,
 * and the caller is expected to record it as a conflict and fall back —
 * not to accept a shape no building has.
 *
 * Area decreases monotonically as the cutting line advances, so a bisection
 * converges and is deterministic for the same inputs.
 */
export function insetEdgeToArea(
  ring: RingMm,
  edgeIndex: number,
  targetSqm: number,
): RingMm | null {
  const ccw = toCounterClockwise(ring);
  if (ccw.length < 3 || !(targetSqm > 0)) return null;

  const startArea = areaSqm(ccw);
  if (!(startArea > 0)) return null;
  // A target at or above the ring's own area removes nothing.
  if (targetSqm >= startArea - AREA_EPSILON_SQM) {
    return targetSqm > startArea + AREA_EPSILON_SQM ? null : ccw.map((p) => [...p] as [number, number]);
  }

  const i = ((edgeIndex % ccw.length) + ccw.length) % ccw.length;
  const [x0, y0] = ccw[i];
  const [x1, y1] = ccw[(i + 1) % ccw.length];
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1e-6) return null;

  // Outward normal of a CCW ring: edge direction rotated −90°.
  const nx = (y1 - y0) / len;
  const ny = -(x1 - x0) / len;

  // Advance the cutting line inward by d; everything outside it is removed.
  const cut = (d: number): RingMm =>
    clipToHalfPlane(ccw, x0 - nx * d, y0 - ny * d, nx, ny);

  let lo = 0;
  let hi = minSpan(ccw);
  for (let step = 0; step < 60; step++) {
    const mid = (lo + hi) / 2;
    const area = areaSqm(cut(mid));
    if (area > targetSqm) lo = mid;
    else hi = mid;
    if (Math.abs(area - targetSqm) < AREA_EPSILON_SQM) break;
  }

  const result = cut((lo + hi) / 2).map(
    ([x, y]) => [Math.round(x), Math.round(y)] as [number, number],
  );

  if (result.length < 3) return null;
  if (isSelfIntersecting(result)) return null;
  if (minSpan(result) < MIN_PLATE_DEPTH_MM) return null;
  if (Math.abs(areaSqm(result) - targetSqm) > Math.max(1, targetSqm * 0.02)) {
    return null;
  }
  return result;
}

/** Fallback direction when a podium's street frontage is unknown. */
export function widestFaceIndex(ring: RingMm): number {
  return longestEdgeIndex(toCounterClockwise(ring));
}
