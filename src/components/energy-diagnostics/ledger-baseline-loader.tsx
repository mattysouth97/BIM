"use client";

/**
 * Turns a chosen 건축물대장 record into a running baseline diagnosis with no
 * further user input.
 *
 * The whole pipeline runs client-side through the same modules an uploaded
 * drawing uses: register → DrawingSourceInput → ingestDrawingSet →
 * buildLedgerBaselineModel → runBaselineModel. Nothing here is a parallel
 * "demo mode"; it is the ordinary entry path with the register as its source.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import {
  ingestDrawingSet,
  type DrawingSourceInput,
} from "@/lib/energy-diagnostics/ingestion";
import {
  buildLedgerBaselineModel,
  type LedgerBaselineOutcome,
} from "@/lib/energy-diagnostics/ledger-baseline-model";
import {
  diagnosticSourceFromLedger,
  type LedgerFootprint,
} from "@/lib/energy-diagnostics/ledger-source";
import {
  capturedRefinements,
  reapplyRefinements,
} from "@/lib/energy-diagnostics/refinement";
import type { CanonicalEnergyModel } from "@/lib/energy-diagnostics/types";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

import { runBaselineModel } from "./model-operations";
import type { DiagnosisLocale } from "./types";

export type LedgerBaselineState =
  | Readonly<{ phase: "loading" }>
  | Readonly<{
      phase: "ready";
      model: CanonicalEnergyModel;
      /** Kept so the workspace can persist the content-addressed source. */
      sources: readonly DrawingSourceInput[];
    }>
  | Readonly<{ phase: "insufficient"; reason: string; message: string }>
  | Readonly<{ phase: "error"; message: string }>;

export type LedgerRecord = Readonly<{
  title: BrTitleInfo;
  floors: readonly BrFloorInfo[];
  footprint?: LedgerFootprint;
}>;

/** The bundled sample: a real register-shaped 10F/B2 2008 office. */
export function sampleLedgerRecord(): LedgerRecord {
  return { title: demoTitle, floors: demoFloors };
}

export async function buildLedgerBaseline(
  record: LedgerRecord,
  locale: DiagnosisLocale,
): Promise<LedgerBaselineState> {
  try {
    const source = diagnosticSourceFromLedger({
      title: record.title,
      floors: record.floors,
      ...(record.footprint ? { footprint: record.footprint } : {}),
    });
    const ingestion = await ingestDrawingSet([source], {
      setName:
        record.title.bldNm?.trim() ||
        record.title.platPlcNm?.trim() ||
        "건축물대장",
    });
    const outcome: LedgerBaselineOutcome = buildLedgerBaselineModel({
      ingestion,
      title: record.title,
      floors: record.floors,
      locale,
    });
    if (outcome.status !== "created") {
      return {
        phase: "insufficient",
        reason: outcome.reason,
        message: outcome.message,
      };
    }
    // Run the baseline immediately: the product promise is that choosing a
    // building is the only input required to see a result.
    const { model } = runBaselineModel(outcome.model);
    return { phase: "ready", model, sources: [source] };
  } catch (cause) {
    return {
      phase: "error",
      message:
        cause instanceof Error
          ? cause.message
          : "The building register could not be turned into an energy model.",
    };
  }
}

/**
 * Rebuild a register baseline around a real outline measured from a drawing,
 * carrying the user's existing corrections forward.
 *
 * A better outline changes the perimeter, and the perimeter sets every
 * exterior wall and window area — so this is a rebuild, not a fact swap. Fact
 * ids necessarily change, so corrections are re-applied by key and anything
 * that no longer exists is reported rather than silently lost.
 */
export async function rebuildLedgerBaselineWithFootprint(
  record: LedgerRecord,
  footprint: LedgerFootprint,
  previousModel: CanonicalEnergyModel | null,
  locale: DiagnosisLocale,
): Promise<
  LedgerBaselineState & Readonly<{ droppedRefinementKeys?: readonly string[] }>
> {
  const carried = previousModel ? capturedRefinements(previousModel) : [];
  const rebuilt = await buildLedgerBaseline({ ...record, footprint }, locale);
  if (rebuilt.phase !== "ready" || carried.length === 0) return rebuilt;

  const { outcome, droppedKeys } = reapplyRefinements(rebuilt.model, carried);
  if (outcome.status !== "applied") {
    // The rebuilt geometry is still good; report the corrections that could
    // not travel rather than discarding the better outline.
    return { ...rebuilt, droppedRefinementKeys: carried.map((c) => c.key) };
  }
  const { model } = runBaselineModel(outcome.model);
  return {
    phase: "ready",
    model,
    sources: rebuilt.sources,
    droppedRefinementKeys: droppedKeys,
  };
}

export function useLedgerBaseline(
  record: LedgerRecord | null,
  locale: DiagnosisLocale,
): LedgerBaselineState {
  // The resolved state is stored together with the record it belongs to, so a
  // result for a previous building can never be shown for the current one.
  const [resolved, setResolved] = useState<
    Readonly<{ record: LedgerRecord | null; state: LedgerBaselineState }>
  >({ record: null, state: { phase: "loading" } });

  // `record` is memoised by the caller, so its identity is the right effect
  // key: a new object means a different building.
  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    void buildLedgerBaseline(record, locale).then((next) => {
      if (!cancelled) setResolved({ record, state: next });
    });
    return () => {
      cancelled = true;
    };
  }, [record, locale]);

  return resolved.record === record
    ? resolved.state
    : { phase: "loading" as const };
}

export function LedgerBaselineStatus({
  state,
  locale,
}: Readonly<{ state: LedgerBaselineState; locale: DiagnosisLocale }>) {
  if (state.phase === "loading") {
    return (
      <section
        className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-[#07141d] text-sm text-slate-300"
        data-testid="ledger-baseline-loading"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-slate-400" />
          <p>
            {locale === "ko"
              ? "건축물대장으로 기준 모델을 만드는 중…"
              : "Building the baseline model from the building register…"}
          </p>
        </div>
      </section>
    );
  }

  const message = state.phase === "ready" ? "" : state.message;
  return (
    <section
      className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-[#07141d] px-6 text-slate-200"
      data-testid="ledger-baseline-unavailable"
    >
      <div className="max-w-md space-y-3 text-center">
        <AlertTriangle className="mx-auto size-7 text-amber-400" />
        <h2 className="text-base font-medium">
          {locale === "ko"
            ? "이 대장 정보만으로는 모델을 만들 수 없습니다"
            : "This register record is not enough to build a model"}
        </h2>
        <p className="text-sm text-slate-400">{message}</p>
        <p className="text-xs text-slate-500">
          {locale === "ko"
            ? "빠진 값을 지어내지 않고 여기서 멈춥니다. 도면을 업로드하면 진단을 이어갈 수 있습니다."
            : "We stop here rather than invent the missing values. Uploading a drawing lets the diagnosis continue."}
        </p>
      </div>
    </section>
  );
}
