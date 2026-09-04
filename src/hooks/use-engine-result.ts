"use client";

// src/hooks/use-engine-result.ts
//
// Wires the pure Agentic BIM Engine (src/lib/engine) into the UI:
//
//  - `result` (HITL flags, validation, confidences) is computed with the
//    PURE `createCountingWriteSession()` (no WASM) inside an effect, so it's
//    safe and cheap to (re)compute on every recipe/footprint change,
//    including during render-adjacent effects. NEVER call
//    `getSharedIfcWriteSession()` here.
//  - `exportIfc()` is the ONLY path that touches the real WASM write session
//    (`getSharedIfcWriteSession()`), and only runs on the explicit "Export
//    IFC" click. Wrapped in try/catch with a sonner toast on failure.
//
// `buildEngineInput` returns null for footprintSource "parcel" | null (or
// when there is no recipe yet) — the engine is honestly unavailable rather
// than fabricating a footprint (AFF-6).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { runEngine } from "@/lib/engine";
import type { BimEngineResult } from "@/lib/engine";
import { buildEngineInput } from "@/lib/engine/build-engine-input";
import { createCountingWriteSession } from "@/lib/engine/counting-session";
import { downloadIfc } from "@/lib/engine/engine-download";
import { getSharedIfcWriteSession } from "@/lib/ifc/ifc-session";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { FootprintSource } from "@/lib/fidelity/input-provenance";

export interface UseEngineResultArgs {
  buildingPk: string;
  /** May be undefined while the recipe hasn't resolved yet — treated as unavailable. */
  recipe: BuildingRecipe | undefined;
  footprintSource: FootprintSource;
  ledgerHeit: number;
}

export interface UseEngineResultReturn {
  /** True when a real footprint (cad/ifc/building) + recipe are present. */
  available: boolean;
  /** The last successfully-computed pure (counting-session) engine result. */
  result: BimEngineResult | null;
  /** True while the real (WASM) export is in flight. */
  exporting: boolean;
  /** Runs the real WASM pipeline and downloads the resulting .ifc file. No-op when unavailable. */
  exportIfc: () => Promise<void>;
  /** Non-null, human-checkable reason the engine is unavailable (e.g. "needs-outline"). */
  unavailableReason: string | null;
}

const NEEDS_OUTLINE = "needs-outline";

export function useEngineResult(args: UseEngineResultArgs): UseEngineResultReturn {
  const { buildingPk, recipe, footprintSource, ledgerHeit } = args;
  const { t } = useT();

  // Pure input for the cheap (counting-session) pass — recomputed whenever
  // any source input changes. null whenever the engine is not applicable.
  const input = useMemo(() => {
    if (!recipe) return null;
    return buildEngineInput({
      pk: buildingPk,
      title: recipe.buildingName,
      recipe,
      footprintSource,
      ledgerHeit,
    });
  }, [buildingPk, recipe, footprintSource, ledgerHeit]);

  const [result, setResult] = useState<BimEngineResult | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!input) {
      setResult(null);
      return;
    }
    let cancelled = false;
    runEngine(input, createCountingWriteSession())
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult(null);
        // Pure-session run should never throw in practice (no WASM, no I/O);
        // log defensively rather than silently swallowing a real bug.
        console.error("useEngineResult: pure engine pass failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  const exportIfc = useCallback(async () => {
    if (!recipe) return;
    const exportInput = buildEngineInput({
      pk: buildingPk,
      title: recipe.buildingName,
      recipe,
      footprintSource,
      ledgerHeit,
    });
    if (!exportInput) return;

    setExporting(true);
    try {
      // ONLY call site for the real WASM write session — explicit user action.
      const session = await getSharedIfcWriteSession();
      const r = await runEngine(exportInput, session);
      downloadIfc(r.ifcBytes, `${recipe.buildingName || buildingPk}.ifc`);
    } catch (err) {
      console.error("useEngineResult: IFC export failed", err);
      toast.error(
        t("IFC 내보내기에 실패했습니다.", "IFC export failed."),
      );
    } finally {
      setExporting(false);
    }
  }, [recipe, buildingPk, footprintSource, ledgerHeit, t]);

  return {
    available: input !== null,
    result,
    exporting,
    exportIfc,
    unavailableReason: input !== null ? null : NEEDS_OUTLINE,
  };
}
