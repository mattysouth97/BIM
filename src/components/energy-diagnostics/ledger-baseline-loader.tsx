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
import { AlertTriangle } from "lucide-react";

import { PhaseRing } from "@/components/ui/phase-ring";
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

/**
 * The pipeline step the loading screen is describing. `useLedgerBaseline`
 * reports "loading" for as long as the record is null, so the caller has to
 * say which step is actually running:
 *
 * - "record": the four register endpoints and the VWorld outline are in flight
 *   (use-ledger-record.ts waits on the outline and proceeds without it).
 * - "sample": the bundled sample — its register is `demoTitle` and its outline
 *   is served from the fixture, so nothing is fetched.
 * - "baseline": the record is in hand and `buildLedgerBaseline` is running.
 */
export type LedgerLoadingStage = "record" | "sample" | "baseline";

const LOADING_COPY: Record<
  LedgerLoadingStage,
  Record<DiagnosisLocale, Readonly<{ line1: string; line2: string }>>
> = {
  record: {
    ko: {
      line1: "건축물대장과 외곽선을 불러오는 중…",
      line2:
        "표제부·층별개요 등 대장 4개 항목을 따로 조회합니다 · 외곽선은 VWorld에서 가져오며, 없어도 진행합니다",
    },
    en: {
      line1: "Fetching the register record and the site outline…",
      line2:
        "Four register queries run separately (title, floors and more) · the outline comes from VWorld and the baseline proceeds without it",
    },
  },
  sample: {
    ko: {
      line1: "내장된 샘플 대장과 외곽선을 읽는 중…",
      line2:
        "샘플 대장과 외곽선은 앱에 내장되어 있어 조회하지 않습니다 · 실제 건물은 대장 4개 항목과 VWorld 외곽선을 따로 조회합니다",
    },
    en: {
      line1: "Reading the bundled sample register and outline…",
      line2:
        "The sample register and outline ship with the app and are not fetched · a real building queries four register endpoints and the VWorld outline",
    },
  },
  baseline: {
    ko: {
      line1: "대장 값으로 기준 모델을 만들고 첫 실행을 하는 중…",
      line2:
        "대장이 말하는 값은 사실로, 나머지는 연식 기준 코드표의 가정으로 채웁니다",
    },
    en: {
      line1: "Building the baseline model from the register and running it…",
      line2:
        "What the register states is a fact; everything else is filled from era-indexed code tables as a named assumption",
    },
  },
};

export function LedgerBaselineStatus({
  state,
  locale,
  stage,
}: Readonly<{
  state: LedgerBaselineState;
  locale: DiagnosisLocale;
  /** Which step is running while `state.phase` is "loading". */
  stage: LedgerLoadingStage;
}>) {
  if (state.phase === "loading") {
    const { line1, line2 } = LOADING_COPY[stage][locale];
    return (
      <section
        role="status"
        aria-live="polite"
        className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-background px-6 text-muted-foreground"
        data-testid="ledger-baseline-loading"
      >
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          {/* Pattern: Kokonut UI "loader" (kokonutui.com) — one indeterminate ring, via the foundation PhaseRing. */}
          <PhaseRing className="text-muted-foreground" />
          <p className="text-sm text-foreground">{line1}</p>
          <p className="text-xs leading-5 text-muted-foreground">{line2}</p>
        </div>
      </section>
    );
  }

  const message = state.phase === "ready" ? "" : state.message;
  return (
    <section
      className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-background px-6 text-foreground"
      data-testid="ledger-baseline-unavailable"
    >
      <div className="max-w-md space-y-3 text-center">
        <AlertTriangle className="mx-auto size-7 text-amber-600 dark:text-amber-400" />
        <h2 className="text-base font-medium">
          {locale === "ko"
            ? "이 대장 정보만으로는 모델을 만들 수 없습니다"
            : "This register record is not enough to build a model"}
        </h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">
          {locale === "ko"
            ? "빠진 값을 지어내지 않고 여기서 멈춥니다. 도면을 업로드하면 진단을 이어갈 수 있습니다."
            : "We stop here rather than invent the missing values. Uploading a drawing lets the diagnosis continue."}
        </p>
      </div>
    </section>
  );
}
