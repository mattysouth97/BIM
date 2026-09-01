"use client";

/**
 * 구성층(레이어) 편집기 — the material-aware view of an envelope assembly.
 *
 * Edits here are WHAT-IF values: the layer table recomputes the assembly U
 * live via the ISO-6946 sum (R = Rsi + Σd/λ + Rse), shows the 별표1 ceiling
 * for the assembly's element and region, and the evaluate button runs the
 * REAL engine as a delta-only scenario. The baseline model and its layer
 * facts are never mutated by this panel (mission §7/§9: no cosmetic
 * controls, no hidden baseline drift).
 */

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateAssembly,
  type AssemblyLayerInput,
  type HeatFlowDirection,
} from "@/lib/energy-standards/assembly";
import {
  genericMaterialsByCategory,
  genericMaterialById,
} from "@/lib/energy-standards/materials";
import type {
  CanonicalEnergyModel,
  ConstructionAssembly,
  EnergyFact,
} from "@/lib/energy-diagnostics/types";
import {
  assessStandards,
  type StandardsAssessment,
} from "@/lib/energy-diagnostics/standards-assessment";
import { limitForElement } from "@/lib/energy-diagnostics/standards-assessment";
import { cn } from "@/lib/utils";

import type { DiagnosisLocale } from "./types";

type LayerDraft = Readonly<{
  layerId: string;
  name: string;
  thicknessMm: number;
  conductivityWPerMK: number;
  isInsulation: boolean;
  /** Set when the user swapped the insulation to a library material. */
  materialId?: string;
}>;

function draftsFor(construction: ConstructionAssembly): LayerDraft[] {
  return construction.layers.map((layer) => {
    const name = String(layer.name.value ?? layer.id);
    return {
      layerId: layer.id,
      name,
      thicknessMm: Math.round(((layer.thicknessM.value as number) ?? 0) * 1000 * 10) / 10,
      conductivityWPerMK: (layer.conductivityWPerMK.value as number) ?? 0,
      isInsulation: name.includes("단열재"),
    };
  });
}

function directionFor(model: CanonicalEnergyModel, constructionId: string): HeatFlowDirection {
  for (const surface of model.geometry.surfaces) {
    if (surface.constructionId.value !== constructionId) continue;
    if (surface.type === "roof") return "upward";
    if (surface.type === "ground_floor") return "downward";
    return "horizontal";
  }
  return "horizontal";
}

function computedU(drafts: readonly LayerDraft[], direction: HeatFlowDirection): number | null {
  try {
    const inputs: AssemblyLayerInput[] = drafts.map((draft) => ({
      id: draft.layerId,
      thicknessM: draft.thicknessMm / 1000,
      conductivityWPerMK: draft.conductivityWPerMK,
    }));
    return calculateAssembly(inputs, direction).uValueWPerM2K;
  } catch {
    return null;
  }
}

function AssemblyCard({
  model,
  construction,
  assessment,
  locale,
  busy,
  onEvaluate,
  onSelectFact,
}: Readonly<{
  model: CanonicalEnergyModel;
  construction: ConstructionAssembly;
  assessment: StandardsAssessment;
  locale: DiagnosisLocale;
  busy: boolean;
  onEvaluate: (constructionId: string, uValueWPerM2K: number, label: string) => void;
  onSelectFact: (fact: EnergyFact<unknown>) => void;
}>) {
  const [drafts, setDrafts] = useState<LayerDraft[]>(() => draftsFor(construction));
  useEffect(() => {
    setDrafts(draftsFor(construction));
  }, [construction]);

  const direction = useMemo(
    () => directionFor(model, construction.id),
    [model, construction.id],
  );
  const baselineU = construction.uValueWPerM2K.value as number;
  const draftU = useMemo(() => computedU(drafts, direction), [drafts, direction]);
  const changed = useMemo(
    () => JSON.stringify(drafts) !== JSON.stringify(draftsFor(construction)),
    [drafts, construction],
  );

  const complianceRow = assessment.uValueChecks.find(
    (check) => check.constructionId === construction.id,
  );
  const limit =
    complianceRow && assessment.region
      ? limitForElement(assessment.region.region, complianceRow.element, assessment.residential)
      : null;

  const insulationOptions = genericMaterialsByCategory("insulation");

  const setDraft = (layerId: string, patch: Partial<LayerDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.layerId === layerId ? { ...draft, ...patch } : draft)),
    );
  };

  const evaluateLabel = () => {
    const insulation = drafts.find((draft) => draft.isInsulation);
    const material = insulation?.materialId
      ? genericMaterialById(insulation.materialId)?.nameKo
      : insulation?.name;
    return `${String(construction.name.value ?? construction.id)} · ${material ?? ""} ${insulation ? `${insulation.thicknessMm}mm` : ""}`.trim();
  };

  return (
    <article
      className="rounded-lg border bg-card p-4"
      data-testid={`assembly-editor-${construction.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">{construction.name.value}</p>
          <button
            type="button"
            className="mt-1 font-mono text-[9px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onSelectFact(construction.uValueWPerM2K)}
          >
            {locale === "ko" ? "기준안 U값 근거 보기" : "Baseline U-value evidence"}
          </button>
        </div>
        <Badge variant="outline" className="font-mono text-[9px]">
          {locale === "ko" ? "기준안" : "Baseline"} U {baselineU.toFixed(3)}
        </Badge>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[430px] text-left text-[10px]">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-2 font-medium">{locale === "ko" ? "구성층" : "Layer"}</th>
              <th className="py-1.5 pr-2 font-medium">{locale === "ko" ? "두께 (mm)" : "Thickness (mm)"}</th>
              <th className="py-1.5 pr-2 font-medium">λ (W/m·K)</th>
              <th className="py-1.5 font-medium">R (m²K/W)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {drafts.map((draft) => {
              const r =
                draft.conductivityWPerMK > 0
                  ? draft.thicknessMm / 1000 / draft.conductivityWPerMK
                  : 0;
              return (
                <tr key={draft.layerId} className={cn(draft.isInsulation && "bg-cyan-500/[0.04]")}>
                  <td className="py-1.5 pr-2">
                    {draft.isInsulation ? (
                      <select
                        className="w-full max-w-44 rounded border bg-background px-1 py-1 text-[10px]"
                        value={draft.materialId ?? ""}
                        aria-label={locale === "ko" ? "단열재 선택" : "Insulation material"}
                        data-testid={`assembly-material-${construction.id}`}
                        onChange={(event) => {
                          const material = genericMaterialById(event.target.value);
                          if (material?.conductivityWPerMK) {
                            setDraft(draft.layerId, {
                              materialId: material.id,
                              name: material.nameKo,
                              conductivityWPerMK: material.conductivityWPerMK,
                            });
                          }
                        }}
                      >
                        <option value="">{draft.name} (λ {draft.conductivityWPerMK})</option>
                        {insulationOptions.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.nameKo} (λ {material.conductivityWPerMK})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium">{draft.name}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0.1}
                      step={draft.isInsulation ? 5 : 1}
                      value={Number.isFinite(draft.thicknessMm) ? draft.thicknessMm : ""}
                      className="h-7 w-20 font-mono text-[10px]"
                      aria-label={`${draft.name} ${locale === "ko" ? "두께" : "thickness"}`}
                      data-testid={`assembly-thickness-${construction.id}-${draft.layerId}`}
                      onChange={(event) =>
                        setDraft(draft.layerId, { thicknessMm: Number(event.target.value) })
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2 font-mono">{draft.conductivityWPerMK}</td>
                  <td className="py-1.5 font-mono">{r.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded border px-2 py-1 font-mono text-[11px] font-semibold"
          data-testid={`assembly-computed-u-${construction.id}`}
        >
          {locale === "ko" ? "계산 U" : "Computed U"}{" "}
          {draftU != null ? draftU.toFixed(3) : "—"} W/m²K
        </span>
        {draftU != null && (
          <span className="font-mono text-[10px] text-muted-foreground">
            Δ {(draftU - baselineU >= 0 ? "+" : "") + (draftU - baselineU).toFixed(3)}
          </span>
        )}
        {limit && draftU != null && (
          <span
            className={cn(
              "rounded border px-2 py-1 text-[10px] font-semibold",
              draftU <= limit.limitWPerM2K
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
            )}
            data-testid={`assembly-limit-${construction.id}`}
            title={limit.rowKo + " — " + limit.standard}
          >
            {locale === "ko"
              ? `법정 상한 ${limit.limitWPerM2K} · ${draftU <= limit.limitWPerM2K ? "충족" : "초과"}`
              : `Limit ${limit.limitWPerM2K} · ${draftU <= limit.limitWPerM2K ? "PASS" : "FAIL"}`}
          </span>
        )}
        <Button
          type="button"
          size="xs"
          className="ml-auto"
          disabled={busy || !changed || draftU == null}
          data-testid={`assembly-evaluate-${construction.id}`}
          onClick={() => draftU != null && onEvaluate(construction.id, draftU, evaluateLabel())}
        >
          {locale === "ko" ? "대안으로 평가 (엔진 재계산)" : "Evaluate as alternative (re-run engine)"}
        </Button>
      </div>
    </article>
  );
}

export function AssemblyEditor({
  model,
  baselineRunId,
  locale,
  busy,
  onEvaluate,
  onSelectFact,
}: Readonly<{
  model: CanonicalEnergyModel;
  /** Present only so the memo refreshes when a run lands; may be undefined. */
  baselineRunId?: string;
  locale: DiagnosisLocale;
  busy: boolean;
  onEvaluate: (constructionId: string, uValueWPerM2K: number, label: string) => void;
  onSelectFact: (fact: EnergyFact<unknown>) => void;
}>) {
  const assessment = useMemo(
    () => assessStandards(model, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, baselineRunId],
  );
  const layered = model.envelope.constructions.filter(
    (construction) => construction.kind === "opaque" && construction.layers.length > 0,
  );
  if (layered.length === 0) return null;
  return (
    <section data-testid="assembly-editor">
      <div className="mb-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {locale === "ko" ? "구성층 편집" : "Assembly layers"}
        </p>
        <h2 className="mt-1 text-sm font-semibold">
          {locale === "ko"
            ? "재료·두께를 바꾸면 U값이 ISO 6946 합산으로 다시 계산됩니다"
            : "Material and thickness changes recompute U by the ISO 6946 sum"}
        </h2>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {locale === "ko"
            ? "여기의 값은 검토용 대안입니다. 기준안은 변경되지 않으며, [대안으로 평가]가 실제 엔진을 다시 실행합니다. 구성층 자체는 구조코드·연식에서 온 가정입니다(증거 아님)."
            : "Values here are what-if alternatives. The baseline is untouched; Evaluate re-runs the real engine. The layer stack itself is an assumption from structure code and era, not evidence."}
        </p>
      </div>
      <div className="space-y-3">
        {layered.map((construction) => (
          <AssemblyCard
            key={construction.id}
            model={model}
            construction={construction}
            assessment={assessment}
            locale={locale}
            busy={busy}
            onEvaluate={onEvaluate}
            onSelectFact={onSelectFact}
          />
        ))}
      </div>
    </section>
  );
}
