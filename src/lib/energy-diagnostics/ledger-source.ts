/**
 * 건축물대장 (Korean building register) → the canonical drawing-ingestion
 * boundary.
 *
 * The register enters as source document #0 of the same DrawingSet that later
 * receives DWG/DXF plans, hand-drawn schematics and MEP schedules. Routing it
 * through `ingestDrawingSet` rather than a private side door is what makes
 * provenance a construction-time invariant: every registered number arrives
 * with a real SourceReference, and anything the register does NOT state
 * cannot be fabricated here at all.
 *
 * What the register genuinely states: areas, storey counts, height, main use,
 * structure, roof type, approval and permit dates.
 * What it does NOT state, and what this module therefore never emits: any
 * U-value, window ratio, airtightness, HVAC, lighting or occupancy value, and
 * any real building outline.
 */

import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";
import { isBelowGradeRow, normalizeFloorRows } from "@/lib/ledger/floor-rows";

import type {
  DrawingSourceInput,
  ExtractionSignal,
  VectorBoundaryInput,
} from "./ingestion";
import type { Polygon2D } from "./types";

/** Assumption id for an outline synthesised from 건축면적. */
export const LEDGER_FOOTPRINT_ASSUMPTION_ID =
  "assumption.ledger-derived-footprint";

export type LedgerFootprint =
  /**
   * A ring measured off a drawing the user supplied — a DWG/DXF plan or a
   * plan they drew to scale. The strongest geometry the product accepts.
   */
  | Readonly<{
      kind: "measured_drawing";
      ringM: Polygon2D;
      /** The drawing it was taken from, for the evidence trail. */
      label?: string;
      cadLayer?: string;
    }>
  /** A real GIS building outline (VWorld LT_C_SPBD), in metres. */
  | Readonly<{ kind: "vworld_building"; ringM: Polygon2D }>
  /**
   * The outline the shared reconstruction resolved (P2-29) — the same ring the
   * twin renders, so the two cannot describe different buildings.
   *
   * `observed` is the only thing that decides how it is treated: true for a
   * traced outline, false for one solved to satisfy a stated 건축면적. A
   * reconstruction is never survey geometry either way (ADR-003).
   */
  | Readonly<{ kind: "reconstructed"; ringM: Polygon2D; observed: boolean }>
  /** No outline is known; synthesise a rectangle from 건축면적. */
  | Readonly<{ kind: "derived_rectangle" }>;

export type LedgerSourceInput = Readonly<{
  title: BrTitleInfo;
  floors?: readonly BrFloorInfo[];
  footprint?: LedgerFootprint;
}>;

function safeFileStem(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || "building-register";
}

/**
 * A documented zero means "unavailable" in this API, never a real measurement
 * (CLAUDE.md: platArea=0, heit=0, bcRat=0 are displayed as "-"). A field that
 * is zero, blank or unparseable emits NO signal: a missing fact is honest
 * where a zero would be a lie.
 */
function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonEmpty(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

/**
 * A rectangle of the registered 건축면적 at a plausible plan proportion.
 * Mirrors `estimateFootprint` in building-geometry.ts (1.5:1) so the 3D
 * massing and the energy model never disagree about the baseline shape.
 */
export function derivedFootprintRing(archAreaSqm: number): Polygon2D {
  const width = Math.sqrt(archAreaSqm * 1.5);
  const depth = Math.sqrt(archAreaSqm / 1.5);
  const halfW = Math.round((width / 2) * 100) / 100;
  const halfD = Math.round((depth / 2) * 100) / 100;
  return Object.freeze([
    Object.freeze([-halfW, -halfD]),
    Object.freeze([halfW, -halfD]),
    Object.freeze([halfW, halfD]),
    Object.freeze([-halfW, halfD]),
  ]) as unknown as Polygon2D;
}

function registeredSignal(
  key: string,
  value: unknown,
  originalText: string,
  unit?: string,
): ExtractionSignal {
  return Object.freeze({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "extracted" as const,
    confidence: 0.95,
    extractionMethod: "schedule_table" as const,
    authority: "explicit_schedule_or_specification" as const,
    entityRef: key,
    originalText,
  });
}

/**
 * Adapts a register record to a DrawingSourceInput.
 *
 * `northOrientationDeg` is deliberately never set: the register records no
 * orientation, and ingestion treats a supplied value as a confirmed reading.
 */
export function diagnosticSourceFromLedger(
  input: LedgerSourceInput,
): DrawingSourceInput {
  const { title } = input;
  const rows = normalizeFloorRows(title, input.floors ?? []);

  const signals: ExtractionSignal[] = [];
  const push = (
    key: string,
    raw: unknown,
    unit?: string,
    parse: (value: unknown) => unknown = positiveNumber,
  ) => {
    const value = parse(raw);
    if (value === null) return;
    signals.push(registeredSignal(key, value, `${key}=${String(raw)}`, unit));
  };

  push("ledger.archAreaSqm", title.archArea, "m2");
  push("ledger.totAreaSqm", title.totArea, "m2");
  push("ledger.platAreaSqm", title.platArea, "m2");
  push("ledger.heightM", title.heit, "m");
  push("ledger.grndFlrCnt", title.grndFlrCnt);
  // 지하층수 0 is a real, meaningful value (no basement), unlike an area of 0.
  const basements = Number(title.ugrndFlrCnt);
  if (Number.isFinite(basements) && basements >= 0) {
    signals.push(
      registeredSignal(
        "ledger.ugrndFlrCnt",
        basements,
        `ledger.ugrndFlrCnt=${String(title.ugrndFlrCnt)}`,
      ),
    );
  }
  push("ledger.mainPurpsCd", title.mainPurpsCd, undefined, nonEmpty);
  push("ledger.strctCd", title.strctCd, undefined, nonEmpty);
  push("ledger.roofCd", title.roofCd, undefined, nonEmpty);
  push("ledger.useAprDay", title.useAprDay, undefined, nonEmpty);
  push("ledger.pmsDay", title.pmsDay, undefined, nonEmpty);
  push("ledger.sigunguCd", title.sigunguCd, undefined, nonEmpty);
  push("ledger.platPlcNm", title.platPlcNm, undefined, nonEmpty);
  push("ledger.bldNm", title.bldNm, undefined, nonEmpty);

  for (const row of rows) {
    const floorNo = Number(row.flrNo);
    const band = isBelowGradeRow(row) ? "below" : "above";
    const stem = `ledger.floor.${band}.${Math.abs(floorNo)}`;
    const area = positiveNumber(row.area);
    if (area !== null) {
      signals.push(
        registeredSignal(
          `${stem}.areaSqm`,
          area,
          `${row.flrNoNm ?? floorNo} ${row.area}`,
          "m2",
        ),
      );
    }
    const purpose = nonEmpty(row.mainPurpsCd);
    if (purpose !== null) {
      signals.push(
        registeredSignal(
          `${stem}.mainPurpsCd`,
          purpose,
          `${row.flrNoNm ?? floorNo} ${row.mainPurpsCdNm ?? purpose}`,
        ),
      );
    }
  }

  // ── The outline ────────────────────────────────────────────────────────
  // A GIS trace outranks an invented rectangle but is still not a dimensioned
  // survey, so neither is ever labelled `dimensioned_vector_geometry`.
  const archArea = positiveNumber(title.archArea);
  const vectorBoundaries: VectorBoundaryInput[] = [];

  /** A traced outline: better than a rectangle, still not a dimensioned survey. */
  const tracedBoundary = (
    polygon: Polygon2D,
    cadLayer: string,
    entityRef: string,
  ): VectorBoundaryInput =>
    Object.freeze({
      polygon,
      cadLayer,
      entityRef,
      confidence: 0.75,
      status: "extracted" as const,
      extractionMethod: "vector_geometry" as const,
      authority: "repeated_graphical_evidence" as const,
    });

  /**
   * A ring the pipeline solved to satisfy a stated area. The shape is invented
   * even though the area is not, so it keeps the invented-outline assumption.
   */
  const solvedBoundary = (
    polygon: Polygon2D,
    cadLayer: string,
    entityRef: string,
  ): VectorBoundaryInput =>
    Object.freeze({
      polygon,
      cadLayer,
      entityRef,
      confidence: 0.4,
      status: "inferred" as const,
      extractionMethod: "rule_inference" as const,
      authority: "deterministic_rule_inference" as const,
      assumptionId: LEDGER_FOOTPRINT_ASSUMPTION_ID,
    });

  if (input.footprint?.kind === "measured_drawing") {
    // A ring taken off a scaled drawing IS dimensioned survey geometry, and is
    // the one footprint that may be labelled as such.
    vectorBoundaries.push(
      Object.freeze({
        polygon: input.footprint.ringM,
        cadLayer: input.footprint.cadLayer ?? "BIMFIT_MEASURED_PLAN",
        entityRef: `drawing:${input.footprint.label ?? "floor-plan"}`,
        confidence: 0.98,
        status: "extracted" as const,
        extractionMethod: "vector_geometry" as const,
        authority: "dimensioned_vector_geometry" as const,
      }),
    );
  } else if (input.footprint?.kind === "vworld_building") {
    vectorBoundaries.push(
      tracedBoundary(
        input.footprint.ringM,
        "VWORLD_LT_C_SPBD",
        "vworld:building-outline",
      ),
    );
  } else if (input.footprint?.kind === "reconstructed") {
    vectorBoundaries.push(
      input.footprint.observed
        ? tracedBoundary(
            input.footprint.ringM,
            "BIMFIT_RECONSTRUCTED",
            "reconstruction:observed-outline",
          )
        : solvedBoundary(
            input.footprint.ringM,
            "BIMFIT_RECONSTRUCTED",
            "reconstruction:solved-outline",
          ),
    );
  } else if (archArea !== null) {
    vectorBoundaries.push(
      solvedBoundary(
        derivedFootprintRing(archArea),
        "BIMFIT_LEDGER_DERIVED",
        "ledger:archArea-rectangle",
      ),
    );
  }

  const label =
    nonEmpty(title.bldNm) ?? nonEmpty(title.platPlcNm) ?? "building-register";

  return Object.freeze({
    fileName: `${safeFileStem(label)}.bimfit-model.json`,
    mimeType: "application/json",
    content: JSON.stringify({
      kind: "korean_building_ledger_record",
      schemaVersion: 1,
      title,
      floors: rows,
    }),
    formatHint: "bimfit_model",
    revision: nonEmpty(title.useAprDay) ?? "ledger",
    userDocumentType: "building_register_record",
    textSample: `건축물대장 표제부 ${title.platPlcNm ?? ""} ${title.bldNm ?? ""}`.trim(),
    units: "m",
    drawingScale: 1,
    vectorBoundaries: Object.freeze(vectorBoundaries),
    extractionSignals: Object.freeze(signals),
  });
}
