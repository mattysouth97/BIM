// src/lib/cad-reconstruction/claims.ts
//
// The prompt module's deterministic reader.
//
// A user sentence is evidence like any other: it enters the pipeline as a
// typed claim carrying the words it was read from and a grade that reflects
// how it was obtained. "정면 폭 12m를 실측했습니다" is A-VERIFIED; "폭은 12m
// 정도일 겁니다" is D-INFERRED. The distinction survives into the DXF, so it
// is made here rather than by whoever draws the wall.
//
// This module is also the normaliser for the model-read path: whatever the
// reasoning provider returns is re-validated against the same ranges before
// anything downstream trusts it.

import type { ClaimKind, EvidenceGrade, ReconstructionClaim } from "./types";

const SQM_PER_PYEONG = 3.305785;

/**
 * Plausibility envelope per claim kind. A value outside its range is dropped
 * with a note rather than clamped — a clamped 400 m frontage silently becomes
 * a fabricated dimension.
 */
const RANGES: Record<ClaimKind, [number, number] | null> = {
  overall_width_m: [2, 400],
  overall_depth_m: [2, 400],
  footprint_area_sqm: [5, 200_000],
  site_area_sqm: [5, 1_000_000],
  building_height_m: [2, 600],
  floor_to_floor_m: [2, 20],
  storeys_above: [1, 200],
  storeys_below: [0, 20],
  wall_thickness_mm: [80, 1500],
  window_ratio: [0.01, 0.95],
  entrance_orientation: null,
  core_position: null,
  roof_form: null,
  structure: null,
  note: null,
};

/** Words that turn a belief into a measurement. */
const MEASURED_MARKERS = [
  "실측",
  "측정",
  "재었",
  "재봤",
  "줄자",
  "레이저",
  "도면에",
  "도면상",
  "확인했",
  "확인함",
  "measured",
  "surveyed",
  "laser",
  "tape",
  "verified",
  "from the drawing",
  "on the drawing",
];

function toMetres(value: number, unit: string | undefined): number {
  const u = (unit ?? "m").toLowerCase();
  if (u === "mm") return value / 1000;
  if (u === "cm") return value / 100;
  if (u === "km") return value * 1000;
  return value;
}

function toSqm(value: number, unit: string | undefined): number {
  const u = (unit ?? "m2").toLowerCase();
  if (u.includes("평")) return value * SQM_PER_PYEONG;
  return value;
}

function num(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ""));
}

/** The sentence a match sits in — the quote that must survive into the ledger. */
function sentenceAround(text: string, index: number): string {
  const before = text.slice(0, index);
  const start = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("\n"),
    before.lastIndexOf("。"),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
  );
  const rest = text.slice(index);
  const endRel = rest.search(/[.\n。!?]/);
  const end = endRel === -1 ? text.length : index + endRel + 1;
  return text.slice(start + 1, end).trim();
}

interface PatternDef {
  kind: ClaimKind;
  re: RegExp;
  /** Reads the matched groups into a canonical value. */
  read: (m: RegExpExecArray) => number | string | null;
  unit: string | null;
  reasonKo: string;
}

const LEN = String.raw`(-?[\d,]+(?:\.\d+)?)\s*(mm|cm|km|m|미터|메터)?`;
const AREA = String.raw`([\d,]+(?:\.\d+)?)\s*(㎡|m2|m²|제곱미터|평)?`;

const PATTERNS: PatternDef[] = [
  {
    kind: "overall_width_m",
    re: new RegExp(
      String.raw`(?:정면\s*)?(?:폭|가로|전면|너비|frontage|width)\s*(?:은|는|이|가|:|=)?\s*` +
        LEN,
      "gi",
    ),
    read: (m) => toMetres(num(m[1]), m[2]),
    unit: "m",
    reasonKo: "사용자가 진술한 전체 폭",
  },
  {
    kind: "overall_depth_m",
    re: new RegExp(
      String.raw`(?:깊이|안길이|세로|길이|depth)\s*(?:은|는|이|가|:|=)?\s*` + LEN,
      "gi",
    ),
    read: (m) => toMetres(num(m[1]), m[2]),
    unit: "m",
    reasonKo: "사용자가 진술한 전체 깊이",
  },
  {
    kind: "floor_to_floor_m",
    re: new RegExp(
      String.raw`(?:층고|층\s*높이|floor[\s-]*to[\s-]*floor|storey\s*height)\s*(?:은|는|이|가|:|=)?\s*` +
        LEN,
      "gi",
    ),
    read: (m) => toMetres(num(m[1]), m[2]),
    unit: "m",
    reasonKo: "사용자가 진술한 층고",
  },
  {
    kind: "building_height_m",
    re: new RegExp(
      String.raw`(?:건물\s*)?(?:전체\s*)?(?:높이|height)\s*(?:은|는|이|가|:|=)?\s*` +
        LEN,
      "gi",
    ),
    read: (m) => toMetres(num(m[1]), m[2]),
    unit: "m",
    reasonKo: "사용자가 진술한 건물 높이",
  },
  {
    kind: "wall_thickness_mm",
    re: new RegExp(
      String.raw`(?:외벽|벽)\s*(?:두께)?\s*(?:은|는|이|가|:|=)?\s*` +
        LEN +
        String.raw`|wall\s*thickness\s*(?:is|:|=)?\s*` +
        LEN,
      "gi",
    ),
    read: (m) => {
      const raw = m[1] ?? m[3];
      const unit = m[2] ?? m[4] ?? "mm";
      if (raw === undefined) return null;
      return Math.round(toMetres(num(raw), unit) * 1000);
    },
    unit: "mm",
    reasonKo: "사용자가 진술한 외벽 두께",
  },
  {
    kind: "footprint_area_sqm",
    re: new RegExp(
      String.raw`(?:건축면적|바닥\s*면적|footprint\s*area)\s*(?:은|는|이|가|:|=)?\s*` +
        AREA,
      "gi",
    ),
    read: (m) => toSqm(num(m[1]), m[2]),
    unit: "m2",
    reasonKo: "사용자가 진술한 건축면적",
  },
  {
    kind: "site_area_sqm",
    re: new RegExp(
      String.raw`(?:대지\s*면적|부지\s*면적|site\s*area)\s*(?:은|는|이|가|:|=)?\s*` +
        AREA,
      "gi",
    ),
    read: (m) => toSqm(num(m[1]), m[2]),
    unit: "m2",
    reasonKo: "사용자가 진술한 대지면적",
  },
  {
    kind: "storeys_below",
    re: /지하\s*([\d]+)\s*층|basement\s*(?:levels?\s*)?([\d]+)|([\d]+)\s*basement/gi,
    read: (m) => Number.parseInt(m[1] ?? m[2] ?? m[3], 10),
    unit: null,
    reasonKo: "사용자가 진술한 지하 층수",
  },
  {
    kind: "storeys_above",
    re: /지상\s*([\d]+)\s*층|([\d]+)\s*(?:개?층|storeys?|stories|floors?)\s*(?:건물|building)?/gi,
    read: (m) => Number.parseInt(m[1] ?? m[2], 10),
    unit: null,
    reasonKo: "사용자가 진술한 지상 층수",
  },
  {
    kind: "window_ratio",
    re: /(?:창(?:면적)?\s*비율?|창면적비|창호\s*비율|wwr|window[\s-]*to[\s-]*wall)\s*(?:은|는|이|가|:|=)?\s*([\d.]+)\s*(%|퍼센트)?/gi,
    read: (m) => {
      const v = num(m[1]);
      return m[2] || v > 1 ? v / 100 : v;
    },
    unit: "ratio",
    reasonKo: "사용자가 진술한 창면적비",
  },
];

const ORIENTATION_WORDS: Array<[RegExp, string]> = [
  [/북(?:쪽|측|향|side)?|north/i, "north"],
  [/동(?:쪽|측|향|side)?|east/i, "east"],
  [/남(?:쪽|측|향|side)?|south/i, "south"],
  [/서(?:쪽|측|향|side)?|west/i, "west"],
];

const CORE_WORDS: Array<[RegExp, string]> = [
  [/중앙|가운데|중심|cent(?:er|re)/i, "centre"],
  [/북(?:쪽|측)|north/i, "north"],
  [/동(?:쪽|측)|east/i, "east"],
  [/남(?:쪽|측)|south/i, "south"],
  [/서(?:쪽|측)|west/i, "west"],
];

const ROOF_WORDS: Array<[RegExp, string]> = [
  [/평지붕|평슬래브|flat\s*roof/i, "flat"],
  [/박공|맞배|gable/i, "gable"],
  [/모임지붕|우진각|hip(?:ped)?\s*roof/i, "hip"],
  [/경사지붕|sloped?\s*roof/i, "sloped"],
];

const STRUCTURE_WORDS: Array<[RegExp, string]> = [
  [/철근\s*콘크리트|\brc\b|reinforced\s*concrete/i, "rc"],
  [/철골\s*철근|src/i, "src"],
  [/철골|steel/i, "steel"],
  [/조적|벽돌|masonry|brick/i, "masonry"],
  [/목조|목구조|timber|wood/i, "timber"],
];

function categorical(
  text: string,
  trigger: RegExp,
  words: Array<[RegExp, string]>,
): { value: string; quote: string } | null {
  trigger.lastIndex = 0;
  const m = trigger.exec(text);
  if (!m) return null;
  const quote = sentenceAround(text, m.index);
  for (const [re, value] of words) {
    if (re.test(quote)) return { value, quote };
  }
  return null;
}

function gradeFor(quote: string): { grade: EvidenceGrade; measured: boolean } {
  const lower = quote.toLowerCase();
  const measured = MEASURED_MARKERS.some((w) => lower.includes(w.toLowerCase()));
  return { grade: measured ? "A-VERIFIED" : "D-INFERRED", measured };
}

/**
 * Read a free-text statement into typed claims.
 *
 * Deterministic: same text in, same claims out, in a stable order. This is the
 * offline path for the prompt module and the fallback whenever no reasoning
 * provider is configured.
 */
export function parseClaimStatements(text: string): ReconstructionClaim[] {
  const claims: ReconstructionClaim[] = [];
  const rejected: string[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) return claims;

  const seen = new Set<ClaimKind>();

  for (const def of PATTERNS) {
    def.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = def.re.exec(trimmed)) !== null) {
      if (m[0].length === 0) {
        def.re.lastIndex += 1;
        continue;
      }
      const value = def.read(m);
      if (value === null || (typeof value === "number" && !Number.isFinite(value))) {
        continue;
      }
      const range = RANGES[def.kind];
      if (range && typeof value === "number") {
        if (value < range[0] || value > range[1]) {
          rejected.push(
            `${m[0].trim()} → ${def.kind} ${value} 은(는) 허용 범위 ` +
              `${range[0]}–${range[1]} 밖이라 무시했습니다`,
          );
          continue;
        }
      }
      // One claim per kind: the first statement wins, later ones become notes,
      // so a contradiction is visible instead of being overwritten.
      if (seen.has(def.kind)) {
        rejected.push(
          `${m[0].trim()} → ${def.kind} 값이 이미 진술되어 있어 두 번째 값은 채택하지 않았습니다`,
        );
        continue;
      }
      seen.add(def.kind);
      const quote = sentenceAround(trimmed, m.index);
      const { grade, measured } = gradeFor(quote);
      claims.push({
        id: "",
        kind: def.kind,
        value,
        unit: def.unit,
        grade,
        measured,
        quote,
        reason: def.reasonKo,
      });
    }
  }

  const categoricals: Array<{
    kind: ClaimKind;
    trigger: RegExp;
    words: Array<[RegExp, string]>;
    reasonKo: string;
  }> = [
    {
      kind: "entrance_orientation",
      trigger: /주\s*출입(?:구|문)|출입구|현관|entrance|main\s*door/i,
      words: ORIENTATION_WORDS,
      reasonKo: "사용자가 진술한 주출입구 방위",
    },
    {
      kind: "core_position",
      trigger: /코어|계단실|계단|엘리베이터|승강기|core|stair|elevator|lift/i,
      words: CORE_WORDS,
      reasonKo: "사용자가 진술한 코어 위치",
    },
    {
      kind: "roof_form",
      trigger: /지붕|roof/i,
      words: ROOF_WORDS,
      reasonKo: "사용자가 진술한 지붕 형식",
    },
    {
      kind: "structure",
      trigger: /구조|structure|조적|철골|목조|콘크리트|concrete|steel|timber|masonry/i,
      words: STRUCTURE_WORDS,
      reasonKo: "사용자가 진술한 구조 형식",
    },
  ];

  for (const c of categoricals) {
    const hit = categorical(trimmed, c.trigger, c.words);
    if (!hit) continue;
    const { grade, measured } = gradeFor(hit.quote);
    claims.push({
      id: "",
      kind: c.kind,
      value: hit.value,
      unit: null,
      // A stated orientation is something the user looked at, not something
      // they measured — B-OBSERVED is the ceiling unless they say otherwise.
      grade: grade === "A-VERIFIED" ? "A-VERIFIED" : "B-OBSERVED",
      measured,
      quote: hit.quote,
      reason: c.reasonKo,
    });
  }

  for (const message of rejected) {
    claims.push({
      id: "",
      kind: "note",
      value: null,
      unit: null,
      grade: "X-UNRESOLVED",
      measured: false,
      quote: message,
      reason: "범위를 벗어났거나 중복된 진술",
    });
  }

  return claims.map((c, i) => ({
    ...c,
    id: `CLAIM-${String(i + 1).padStart(3, "0")}`,
  }));
}

/**
 * Re-validate claims that arrived from a reasoning provider. Model output is
 * untrusted input: ranges, grades and quotes are re-derived here so a provider
 * cannot promote a guess to A-VERIFIED.
 */
export function normaliseProvidedClaims(
  raw: Array<{
    kind: string;
    value: number | string | null;
    unit?: string | null;
    measured?: boolean;
    quote?: string;
    reason?: string;
  }>,
  sourceText: string,
): ReconstructionClaim[] {
  const out: ReconstructionClaim[] = [];
  for (const item of raw) {
    if (!(item.kind in RANGES)) continue;
    const kind = item.kind as ClaimKind;
    const range = RANGES[kind];
    if (range) {
      if (typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
      if (item.value < range[0] || item.value > range[1]) continue;
    }
    const quote = (item.quote ?? "").trim();
    // A quote the user never wrote cannot license an A-VERIFIED grade.
    const quoted =
      quote.length > 0 && sourceText.includes(quote.slice(0, Math.min(12, quote.length)));
    const { grade, measured } = gradeFor(quoted ? quote : "");
    out.push({
      id: "",
      kind,
      value: item.value ?? null,
      unit: item.unit ?? null,
      grade: range ? grade : grade === "A-VERIFIED" ? "A-VERIFIED" : "B-OBSERVED",
      measured,
      quote: quoted ? quote : sourceText.trim().slice(0, 200),
      reason: item.reason?.trim() || "모델이 사용자 문장에서 읽은 값",
    });
  }
  return out.map((c, i) => ({
    ...c,
    id: `CLAIM-${String(i + 1).padStart(3, "0")}`,
  }));
}

/** Strongest claim of a kind, preferring measured statements. */
export function claimOf(
  claims: readonly ReconstructionClaim[],
  kind: ClaimKind,
): ReconstructionClaim | null {
  const matches = claims.filter((c) => c.kind === kind && c.value !== null);
  if (matches.length === 0) return null;
  const measured = matches.find((c) => c.measured);
  return measured ?? matches[0];
}
