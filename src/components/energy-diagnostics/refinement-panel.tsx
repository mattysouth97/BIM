"use client";

/**
 * "Make this match the real building."
 *
 * The register baseline arrives with its envelope, systems and operation set
 * from era code tables. This panel is where the user replaces those with what
 * they actually know — from a survey, a datasheet, a commissioning report or a
 * drawing they have registered — and sees the energy answer move.
 *
 * Every row states where its current value came from, so the difference
 * between "the 2000s code said so" and "we measured it" is never lost.
 */

import { useMemo, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  refinableFacts,
  type FactUpgrade,
  type RefinableGroup,
} from "@/lib/energy-diagnostics/refinement";
import type { CanonicalEnergyModel, EnergyFact } from "@/lib/energy-diagnostics/types";
import { cn } from "@/lib/utils";

import { factKeyLabel } from "./fact-label";
import type { DiagnosisLocale } from "./types";

const GROUPS: readonly RefinableGroup[] = ["envelope", "systems", "usage"];

const GROUP_LABEL: Record<
  RefinableGroup,
  Record<DiagnosisLocale, { title: string; lead: string }>
> = {
  envelope: {
    ko: {
      title: "외피",
      lead: "단열·창호·기밀은 대장에 없습니다. 실제 값을 알고 있다면 바꿔 주세요.",
    },
    en: {
      title: "Envelope",
      lead: "Insulation, glazing and airtightness are not on the register. Replace them with what you know.",
    },
  },
  systems: {
    ko: {
      title: "설비 · 기계/전기",
      lead: "보일러 효율, 냉방 COP, 환기량은 용도 기본값입니다. 장비 일람표 값으로 바꿀 수 있습니다.",
    },
    en: {
      title: "Systems · MEP",
      lead: "Boiler efficiency, cooling COP and ventilation are use-type defaults. Replace them from an equipment schedule.",
    },
  },
  usage: {
    ko: {
      title: "운전 · 조명/재실",
      lead: "조명 밀도와 재실·설정온도는 용도 기본값이며 실제 사용 실적이 아닙니다.",
    },
    en: {
      title: "Operation · lighting & occupancy",
      lead: "Lighting density, occupancy and setpoints are use-type defaults, not metered behaviour.",
    },
  },
};

function provenanceChip(
  fact: EnergyFact<number>,
  locale: DiagnosisLocale,
): Readonly<{ label: string; tone: "assumed" | "confirmed" | "measured" }> {
  if (fact.status === "defaulted" || fact.assumptionId) {
    return {
      label: locale === "ko" ? "추정 · 연식 기반" : "Assumed · era default",
      tone: "assumed",
    };
  }
  if (fact.status === "user_confirmed") {
    return {
      label: locale === "ko" ? "사용자 확인" : "Stated by you",
      tone: "confirmed",
    };
  }
  return {
    label: locale === "ko" ? "도면·문서 근거" : "From a document",
    tone: "measured",
  };
}

function formatValue(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

export type RefinementPanelProps = Readonly<{
  model: CanonicalEnergyModel;
  locale: DiagnosisLocale;
  busy?: boolean;
  onApply: (upgrades: readonly FactUpgrade[]) => void;
}>;

export function RefinementPanel({
  model,
  locale,
  busy = false,
  onApply,
}: RefinementPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        facts: refinableFacts(model, group),
      })).filter((entry) => entry.facts.length > 0),
    [model],
  );

  const assumedCount = useMemo(
    () =>
      groups.reduce(
        (total, entry) =>
          total +
          entry.facts.filter(
            (fact) => fact.status === "defaulted" || fact.assumptionId,
          ).length,
        0,
      ),
    [groups],
  );

  const pending = useMemo(() => {
    const upgrades: FactUpgrade[] = [];
    for (const entry of groups) {
      for (const fact of entry.facts) {
        const draft = drafts[fact.id];
        if (draft == null || draft.trim() === "") continue;
        const value = Number(draft);
        if (!Number.isFinite(value) || value === fact.value) continue;
        upgrades.push({
          targetFactId: fact.id,
          value,
          provenance: {
            kind: "stated_by_user",
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
      }
    }
    return upgrades;
  }, [groups, drafts, note]);

  return (
    <section className="space-y-4" data-testid="refinement-panel">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {locale === "ko" ? "실제 건물에 맞추기" : "Match the real building"}
          </h3>
          <span
            className="text-[11px] text-muted-foreground"
            data-testid="refinement-assumed-count"
          >
            {locale === "ko"
              ? `추정값 ${assumedCount}개 남음`
              : `${assumedCount} values still assumed`}
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {locale === "ko"
            ? "건축물대장에 없는 값은 연식·용도 기본값으로 채워져 있습니다. 아는 값을 넣으면 그 즉시 진단에 반영되고, 기준선은 그대로 남습니다."
            : "Anything the register does not record is filled from era and use-type defaults. Enter what you know and the diagnosis updates; the baseline itself is kept."}
        </p>
      </header>

      {groups.map(({ group, facts }) => (
        <div key={group} className="rounded-lg border bg-card">
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold">
              {GROUP_LABEL[group][locale].title}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {GROUP_LABEL[group][locale].lead}
            </p>
          </div>
          <ul className="divide-y">
            {facts.map((fact) => {
              const chip = provenanceChip(fact, locale);
              // refinableFacts only yields numeric facts; the canonical type is
              // `T | null` because a missing fact carries null.
              const current = fact.value as number;
              return (
                <li
                  key={fact.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                  data-testid={`refinable-${fact.key}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {factKeyLabel(fact.key, locale)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          "rounded px-1 py-px font-medium",
                          chip.tone === "assumed" &&
                            "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                          chip.tone === "confirmed" &&
                            "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
                          chip.tone === "measured" &&
                            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {chip.label}
                      </span>
                      <span className="tabular-nums">
                        {formatValue(current)}
                        {fact.unit ? ` ${fact.unit}` : ""}
                      </span>
                    </p>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="h-8 w-28 text-xs"
                    placeholder={formatValue(current)}
                    value={drafts[fact.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [fact.id]: event.target.value,
                      }))
                    }
                    aria-label={`${factKeyLabel(fact.key, locale)}${
                      fact.unit ? ` (${fact.unit})` : ""
                    }`}
                    data-testid={`refine-input-${fact.key}`}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="space-y-2 rounded-lg border bg-card p-3">
        <label
          className="block text-[11px] font-medium text-muted-foreground"
          htmlFor="refinement-note"
        >
          {locale === "ko"
            ? "근거 (선택) — 어디서 나온 값입니까?"
            : "Source (optional) — where did these values come from?"}
        </label>
        <Input
          id="refinement-note"
          className="h-8 text-xs"
          placeholder={
            locale === "ko"
              ? "예: 2022 기밀시험 성적서, 장비 일람표"
              : "e.g. 2022 blower-door report, equipment schedule"
          }
          value={note}
          onChange={(event) => setNote(event.target.value)}
          data-testid="refinement-note"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            {pending.length > 0
              ? locale === "ko"
                ? `${pending.length}개 값을 바꿉니다.`
                : `${pending.length} value(s) will change.`
              : locale === "ko"
                ? "바꿀 값을 입력하세요."
                : "Enter a value to change."}
          </p>
          <div className="flex items-center gap-2">
            {Object.keys(drafts).length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDrafts({})}
                data-testid="refinement-clear"
              >
                <RotateCcw className="size-3.5" />
                {locale === "ko" ? "입력 지우기" : "Clear"}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={pending.length === 0 || busy}
              onClick={() => {
                onApply(pending);
                setDrafts({});
              }}
              data-testid="refinement-apply"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              {locale === "ko" ? "적용하고 다시 진단" : "Apply and re-run"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
