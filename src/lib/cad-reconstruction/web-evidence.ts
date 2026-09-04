// src/lib/cad-reconstruction/web-evidence.ts
//
// What the open web says about this building, and what it is allowed to do.
//
// A search result is the weakest evidence in this pipeline and the easiest to
// fabricate, so the rules are correspondingly hard:
//
//   1. NO CITATION, NO FACT. Every fact must carry at least one http(s) URL and
//      the sentence it was read from, verbatim. Anything else is dropped before
//      it reaches the model — including anything the reasoning model was
//      confident about but could not point at.
//   2. ALWAYS D-INFERRED. A web page is somebody's assertion, not a measurement
//      we made or a document we hold. The grade is forced here and cannot be
//      raised by the model that produced the fact.
//   3. NEVER A DIMENSION. Web facts do not build geometry and never override
//      the 건축물대장. Their entire job is to CROSS-CHECK: where they disagree
//      with the register, the register keeps the value and the disagreement is
//      recorded with its citation so a human can go and look.
//
// Pure. The search itself happens in /api/cad/web-evidence.

import type { BrTitleInfo } from "@/lib/types";

import type { ConflictEntry, WebCitation, WebFact, WebFactKind } from "./types";

export const WEB_SOURCE_ID = "SRC-WEB" as const;

/** Kinds a web claim may occupy. Anything else is discarded, not coerced. */
const NUMERIC_KINDS: Record<string, { min: number; max: number; unit: string }> = {
  storeys_above: { min: 1, max: 200, unit: "floors" },
  storeys_below: { min: 1, max: 20, unit: "floors" },
  building_height_m: { min: 2, max: 800, unit: "m" },
  footprint_area_sqm: { min: 5, max: 200000, unit: "m2" },
  gross_area_sqm: { min: 5, max: 2000000, unit: "m2" },
  completion_year: { min: 1900, max: 2100, unit: "year" },
};

const TEXT_KINDS = new Set(["structure", "roof_form", "use", "name"]);

/** Height is measured to different points by different people. */
const HEIGHT_TOLERANCE_PCT = 25;
/** A gross-area figure quoted in the press is routinely rounded. */
const AREA_TOLERANCE_PCT = 20;

function citationsOf(value: unknown): WebCitation[] {
  if (!Array.isArray(value)) return [];
  const out: WebCitation[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const url = (entry as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    // Only real web locations. A javascript: or data: "citation" is not one.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    const title = (entry as { title?: unknown }).title;
    out.push({ url: parsed.href, title: typeof title === "string" && title.trim() ? title.trim() : null });
  }
  return out;
}

/**
 * Turn whatever the search step returned into facts this pipeline will accept.
 * Everything that cannot be checked by a human afterwards is dropped.
 */
export function normaliseWebFacts(raw: unknown): WebFact[] {
  if (!Array.isArray(raw)) return [];

  const out: WebFact[] = [];
  const takenKinds = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const kind = typeof record.kind === "string" ? record.kind : "";
    const numeric = NUMERIC_KINDS[kind];
    if (!numeric && !TEXT_KINDS.has(kind)) continue;
    // First mention of a kind wins; later ones are the same claim restated.
    if (takenKinds.has(kind)) continue;

    const quote = typeof record.quote === "string" ? record.quote.trim() : "";
    if (!quote) continue;

    const citations = citationsOf(record.citations);
    if (citations.length === 0) continue;

    let value: number | string;
    if (numeric) {
      const n =
        typeof record.value === "number" ? record.value : Number(String(record.value ?? ""));
      if (!Number.isFinite(n)) continue;
      // A value outside the physically plausible band is a misread, not data.
      if (n < numeric.min || n > numeric.max) continue;
      value = n;
    } else {
      const text = typeof record.value === "string" ? record.value.trim() : "";
      if (!text) continue;
      value = text;
    }

    takenKinds.add(kind);
    out.push({
      kind: kind as WebFactKind,
      value,
      unit: numeric ? numeric.unit : null,
      quote,
      citations,
      // Rule 2: forced here, never taken from the caller.
      grade: "D-INFERRED",
    });
  }

  return out;
}

function statedNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function citationList(fact: WebFact): string {
  return fact.citations.map((c) => c.url).join(", ");
}

/**
 * Where the web disagrees with the register, on values the register actually
 * stated. The register keeps the value in every case — this only produces a
 * record that somebody, somewhere, says otherwise, with the link to check.
 */
export function webFactConflicts(
  facts: readonly WebFact[],
  title: BrTitleInfo | null,
): ConflictEntry[] {
  if (!title || facts.length === 0) return [];

  const conflicts: ConflictEntry[] = [];
  const add = (c: Omit<ConflictEntry, "id">) =>
    conflicts.push({
      ...c,
      id: `CONFLICT-WEB-${String(conflicts.length + 1).padStart(3, "0")}`,
    });

  const byKind = new Map(facts.map((f) => [f.kind, f]));

  const storeys = byKind.get("storeys_above");
  const grnd = statedNumber(title.grndFlrCnt);
  if (storeys && grnd && Number(storeys.value) !== grnd) {
    add({
      subject: "지상 층수 (대장 대 웹 검색)",
      sourceA: "SRC-REG-TITLE (grndFlrCnt)",
      valueA: `${grnd}`,
      sourceB: `${WEB_SOURCE_ID} — ${citationList(storeys)}`,
      valueB: `${storeys.value} (인용: "${storeys.quote}")`,
      magnitude: `${Number(storeys.value) - grnd} 층`,
      possibleExplanation:
        "웹 문서는 증축 전후 시점이 다르거나, 옥탑·필로티를 층으로 세거나, 다른 동을 " +
        "가리킬 수 있습니다. 대장 값이 우선하며 이 항목은 대조용 기록입니다.",
      resolutionStatus: "documented",
      requiredVerification: "현장 외관에서 층수 계수 또는 대장 원본 재확인",
    });
  }

  const height = byKind.get("building_height_m");
  const heit = statedNumber(title.heit);
  if (height && heit) {
    const delta = ((Number(height.value) - heit) / heit) * 100;
    if (Math.abs(delta) > HEIGHT_TOLERANCE_PCT) {
      add({
        subject: "건물 높이 (대장 대 웹 검색)",
        sourceA: "SRC-REG-TITLE (heit)",
        valueA: `${heit.toFixed(1)} m`,
        sourceB: `${WEB_SOURCE_ID} — ${citationList(height)}`,
        valueB: `${Number(height.value).toFixed(1)} m (인용: "${height.quote}")`,
        magnitude: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`,
        possibleExplanation:
          "높이 산정 기준(옥탑·첨탑 포함 여부)이 문서마다 다릅니다. 대장 값이 우선합니다.",
        resolutionStatus: "documented",
        requiredVerification: "레이저 거리계로 파라펫 높이 측정",
      });
    }
  }

  const gross = byKind.get("gross_area_sqm");
  const totArea = statedNumber(title.totArea);
  if (gross && totArea) {
    const delta = ((Number(gross.value) - totArea) / totArea) * 100;
    if (Math.abs(delta) > AREA_TOLERANCE_PCT) {
      add({
        subject: "연면적 (대장 대 웹 검색)",
        sourceA: "SRC-REG-TITLE (totArea)",
        valueA: `${totArea.toFixed(1)} m²`,
        sourceB: `${WEB_SOURCE_ID} — ${citationList(gross)}`,
        valueB: `${Number(gross.value).toFixed(1)} m² (인용: "${gross.quote}")`,
        magnitude: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`,
        possibleExplanation:
          "웹 문서의 연면적은 지하·부속동 포함 여부가 다르거나 반올림되었을 수 있습니다.",
        resolutionStatus: "documented",
        requiredVerification: "층별개요 면적 합계와 대조",
      });
    }
  }

  return conflicts;
}
