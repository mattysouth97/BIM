// src/lib/cad-reconstruction/outline-candidates.ts
//
// Every outline the evidence scan found, reconciled into one decision.
//
// Before this module the footprint was chosen by a fixed if/else chain: the
// first source that answered won, and the others were never compared to it.
// That is only defensible while exactly one source can ever answer. Once the
// scan reaches several map sources, the interesting question stops being "which
// source do we trust" and becomes "do these sources agree, and if not, which
// disagreement is the user looking at".
//
// Three rules, all of them ADR-003 consequences:
//
//   1. A SITE boundary is never a building footprint. A cadastral parcel can be
//      the only ring available and it still does not describe the building —
//      returning it as the footprint reports a lot as a building at observed
//      confidence. It is carried for site context and excluded from selection.
//   2. Observed beats solved, always. A traced outline at B-OBSERVED outranks a
//      rectangle back-solved from an area, even when the rectangle's area is a
//      better match — area agreement is a tie-break among peers, not a promotion.
//   3. A losing outline is never deleted. When two observed sources disagree the
//      loser's ring is attached to a conflict entry so it can be drawn on
//      X-CONFLICT and the user can see the disagreement they are standing on.
//
// Units: millimetres, one local metric frame. Pure — no fetching, no I/O.

import { bbox, centroid, pointInRing } from "./geometry";
import type { ConflictEntry, EvidenceGrade, RingMm } from "./types";

/** Where an outline came from. Ordered by geometric authority. */
export type OutlineOrigin =
  | "gis_building"
  | "osm_building"
  | "gis_parcel"
  | "user_dimensions"
  | "register_area";

const ORIGIN_PRIORITY: Record<OutlineOrigin, number> = {
  gis_building: 0,
  osm_building: 1,
  user_dimensions: 2,
  register_area: 3,
  gis_parcel: 4,
};

/** Two outlines overlapping less than this describe different buildings. */
const AGREEMENT_IOU = 0.75;
/** …as do two outlines whose areas differ by more than this. */
const AGREEMENT_AREA_PCT = 15;
/** Grid resolution for the overlap estimate. 160² cells ≈ ±1 % on IoU. */
const IOU_CELLS = 160;
/**
 * Area-agreement is compared in bands this wide, so only a materially better
 * match against the register can outrank a more authoritative source.
 */
const AREA_MATCH_BUCKET = 0.05;

export interface OutlineCandidate {
  id: string;
  origin: OutlineOrigin;
  /** The SourceRecord this ring is evidence from. */
  sourceId: string;
  labelKo: string;
  ring: RingMm;
  areaSqm: number;
  grade: EvidenceGrade;
  /** True when the ring traces something real; false when it was solved. */
  observed: boolean;
  /** True for a lot boundary — carried for context, never used as a footprint. */
  siteOnly: boolean;
  method: string;
}

export interface CandidateAgreement {
  aId: string;
  bId: string;
  /** Estimated intersection-over-union, 0…1. Sampled, not exact. */
  iou: number;
  areaDeltaPct: number;
  centroidOffsetMm: number;
  agrees: boolean;
}

export interface ReconcileContext {
  /** 건축면적 from the register, when stated. The scalar cross-check. */
  registeredFootprintSqm?: number | null;
}

export interface OutlineReconciliation {
  chosen: OutlineCandidate | null;
  /** Every candidate that was eligible to be the footprint. */
  considered: OutlineCandidate[];
  /** Site-only rings, kept for the site drawing. */
  siteCandidates: OutlineCandidate[];
  agreements: CandidateAgreement[];
  conflicts: ConflictEntry[];
  rationale: string;
}

/**
 * Overlap of two rings as intersection-over-union, estimated by sampling a
 * regular grid over their combined extent.
 *
 * Exact polygon clipping would need a general boolean library for a number that
 * only ever decides "same building or not" against a 0.75 threshold. Sampling
 * is deterministic, total on self-intersecting input, and its error at 160²
 * cells is far below that decision margin.
 */
export function estimateIoU(a: RingMm, b: RingMm, cells = IOU_CELLS): number {
  if (a.length < 3 || b.length < 3) return 0;

  const ba = bbox(a);
  const bb = bbox(b);
  const minX = Math.min(ba.minX, bb.minX);
  const minY = Math.min(ba.minY, bb.minY);
  const maxX = Math.max(ba.maxX, bb.maxX);
  const maxY = Math.max(ba.maxY, bb.maxY);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return 0;

  const stepX = w / cells;
  const stepY = h / cells;
  let inA = 0;
  let inB = 0;
  let inBoth = 0;

  for (let i = 0; i < cells; i++) {
    const x = minX + (i + 0.5) * stepX;
    for (let j = 0; j < cells; j++) {
      const y = minY + (j + 0.5) * stepY;
      const p: [number, number] = [x, y];
      const hitA = pointInRing(p, a);
      const hitB = pointInRing(p, b);
      if (hitA) inA++;
      if (hitB) inB++;
      if (hitA && hitB) inBoth++;
    }
  }

  const union = inA + inB - inBoth;
  return union === 0 ? 0 : inBoth / union;
}

function compare(a: OutlineCandidate, b: OutlineCandidate): CandidateAgreement {
  const iou = estimateIoU(a.ring, b.ring);
  const areaDeltaPct =
    b.areaSqm === 0 ? 0 : ((a.areaSqm - b.areaSqm) / b.areaSqm) * 100;
  const ca = centroid(a.ring);
  const cb = centroid(b.ring);
  const centroidOffsetMm = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
  return {
    aId: a.id,
    bId: b.id,
    iou,
    areaDeltaPct,
    centroidOffsetMm,
    agrees: iou >= AGREEMENT_IOU && Math.abs(areaDeltaPct) <= AGREEMENT_AREA_PCT,
  };
}

/** How far a candidate's area sits from the register's, as a fraction. */
function areaMiss(c: OutlineCandidate, registered: number): number {
  if (registered <= 0) return Infinity;
  return Math.abs(c.areaSqm - registered) / registered;
}

function pickBest(
  candidates: OutlineCandidate[],
  registered: number | null,
): OutlineCandidate | null {
  if (candidates.length === 0) return null;

  // Rule 2: observed geometry outranks solved geometry outright. The register's
  // area only ever separates peers within the same tier.
  const observed = candidates.filter((c) => c.observed);
  const tier = observed.length > 0 ? observed : candidates;

  const sorted = [...tier].sort((a, b) => {
    if (registered !== null && registered > 0) {
      // Quantised so that only a MATERIALLY better area match can outrank the
      // more authoritative source. Comparing raw misses would let a 1 m²
      // difference flip the choice from the government layer to a crowd-sourced
      // one, which is noise deciding provenance.
      const bucket =
        Math.floor(areaMiss(a, registered) / AREA_MATCH_BUCKET) -
        Math.floor(areaMiss(b, registered) / AREA_MATCH_BUCKET);
      if (bucket !== 0) return bucket;
    }
    const priority = ORIGIN_PRIORITY[a.origin] - ORIGIN_PRIORITY[b.origin];
    if (priority !== 0) return priority;
    return a.id.localeCompare(b.id);
  });

  return sorted[0];
}

export function reconcileOutlines(
  candidates: readonly OutlineCandidate[],
  ctx: ReconcileContext,
): OutlineReconciliation {
  const registered =
    typeof ctx.registeredFootprintSqm === "number" && ctx.registeredFootprintSqm > 0
      ? ctx.registeredFootprintSqm
      : null;

  const siteCandidates = candidates.filter((c) => c.siteOnly);
  // Rule 1: a lot boundary is not eligible to be a building footprint.
  const considered = candidates
    .filter((c) => !c.siteOnly && c.ring.length >= 3)
    .sort((a, b) => ORIGIN_PRIORITY[a.origin] - ORIGIN_PRIORITY[b.origin] || a.id.localeCompare(b.id));

  if (considered.length === 0) {
    return {
      chosen: null,
      considered,
      siteCandidates,
      agreements: [],
      conflicts: [],
      rationale:
        siteCandidates.length > 0
          ? "관측된 링은 필지 경계뿐입니다. 필지는 건물 외곽이 아니므로 외곽선으로 채택하지 않았습니다."
          : "외곽선 후보가 없습니다.",
    };
  }

  const observed = considered.filter((c) => c.observed);
  const agreements: CandidateAgreement[] = [];
  for (let i = 0; i < observed.length; i++) {
    for (let j = i + 1; j < observed.length; j++) {
      agreements.push(compare(observed[i], observed[j]));
    }
  }

  const chosen = pickBest(considered, registered);

  // Rule 3: a disagreement between two observed sources is recorded with the
  // rejected geometry attached, never resolved by deletion.
  const conflicts: ConflictEntry[] = [];
  for (const agreement of agreements) {
    if (agreement.agrees) continue;
    const a = observed.find((c) => c.id === agreement.aId)!;
    const b = observed.find((c) => c.id === agreement.bId)!;
    const rejected = chosen && chosen.id === a.id ? b : a;
    conflicts.push({
      id: `CONFLICT-OUTLINE-${String(conflicts.length + 1).padStart(3, "0")}`,
      subject: "건물 외곽 형상 (관측 출처 간 불일치)",
      sourceA: `${a.sourceId} (${a.labelKo})`,
      valueA: `${a.areaSqm.toFixed(1)} m², 정점 ${a.ring.length}개`,
      sourceB: `${b.sourceId} (${b.labelKo})`,
      valueB: `${b.areaSqm.toFixed(1)} m², 정점 ${b.ring.length}개`,
      magnitude:
        `겹침 IoU ${agreement.iou.toFixed(2)}, 면적 차 ${agreement.areaDeltaPct >= 0 ? "+" : ""}` +
        `${agreement.areaDeltaPct.toFixed(1)}%, 중심 ${Math.round(agreement.centroidOffsetMm)} mm 이격`,
      possibleExplanation:
        "두 출처의 갱신 시점이 다르거나(증축·재건축), 한쪽이 지붕 투영선이거나, " +
        "서로 다른 동을 가리키고 있을 수 있습니다.",
      resolutionStatus: "unresolved",
      requiredVerification: "현장에서 1층 외벽 모서리 간 거리 실측 후 두 외곽과 대조",
      geometry: rejected.ring,
    });
  }

  const rationale = buildRationale(chosen, considered, agreements, registered);

  return { chosen, considered, siteCandidates, agreements, conflicts, rationale };
}

function buildRationale(
  chosen: OutlineCandidate | null,
  considered: OutlineCandidate[],
  agreements: CandidateAgreement[],
  registered: number | null,
): string {
  if (!chosen) return "외곽선 후보가 없습니다.";

  const others = considered.filter((c) => c.id !== chosen.id);
  const parts = [`${chosen.labelKo}을(를) 외곽선으로 채택 (${chosen.grade}, ${chosen.method})`];

  if (others.length > 0) {
    parts.push(
      `후보 ${considered.length}개 중 선택 — 나머지: ${others.map((o) => o.labelKo).join(", ")}`,
    );
  }
  if (registered !== null) {
    const miss = areaMiss(chosen, registered) * 100;
    parts.push(`등록 건축면적 ${registered.toFixed(1)} m² 대비 ${miss.toFixed(1)}% 차이`);
  }
  const disagreeing = agreements.filter((a) => !a.agrees).length;
  if (disagreeing > 0) {
    parts.push(`관측 출처 간 불일치 ${disagreeing}건을 불일치 대장에 기록`);
  } else if (agreements.length > 0) {
    parts.push(`관측 출처 ${agreements.length + 1}개가 서로 일치`);
  }

  return `${parts.join(". ")}.`;
}
