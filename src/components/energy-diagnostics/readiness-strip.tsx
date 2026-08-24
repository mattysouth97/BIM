import { AlertTriangle, Check, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CanonicalModelValidation } from "@/lib/energy-diagnostics/validation";

import type { DiagnosisLocale } from "./types";

const CATEGORY_LABEL = {
  ko: {
    geometry: "형상",
    envelope: "외피",
    usage: "사용",
    systems: "설비",
    simulation: "시뮬레이션",
  },
  en: {
    geometry: "Geometry",
    envelope: "Envelope",
    usage: "Usage",
    systems: "Systems",
    simulation: "Simulation",
  },
} as const;

const STATUS_LABEL = {
  ko: {
    ready: "준비됨",
    assumptions_required: "가정 확인",
    blocked: "차단",
  },
  en: {
    ready: "Ready",
    assumptions_required: "Assumptions",
    blocked: "Blocked",
  },
} as const;

export function ReadinessStrip({
  validation,
  locale,
  onCategorySelect,
}: Readonly<{
  validation: CanonicalModelValidation;
  locale: DiagnosisLocale;
  onCategorySelect: (category: CanonicalModelValidation["readiness"][number]["category"]) => void;
}>) {
  return (
    <section
      aria-label={locale === "ko" ? "범주별 모델 준비도" : "Model readiness by category"}
      className="grid grid-cols-2 border-b bg-card sm:grid-cols-5"
      data-testid="energy-readiness-strip"
    >
      {validation.readiness.map((category) => {
        const Icon =
          category.status === "ready"
            ? Check
            : category.status === "blocked"
              ? LockKeyhole
              : AlertTriangle;
        return (
          <button
            key={category.category}
            type="button"
            onClick={() => onCategorySelect(category.category)}
            className={cn(
              "group flex min-h-16 items-center gap-2 border-r px-3 py-2 text-left outline-none transition-colors last:border-r-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              category.status === "blocked" && "bg-rose-500/[0.06] hover:bg-rose-500/10",
              category.status === "assumptions_required" &&
                "bg-amber-500/[0.06] hover:bg-amber-500/10",
              category.status === "ready" && "hover:bg-emerald-500/[0.06]",
            )}
            data-testid={`readiness-${category.category}`}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border",
                category.status === "ready" &&
                  "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                category.status === "assumptions_required" &&
                  "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                category.status === "blocked" &&
                  "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                {CATEGORY_LABEL[locale][category.category]}
              </span>
              <span className="mt-0.5 block text-xs font-medium">
                {STATUS_LABEL[locale][category.status]}
              </span>
              <span className="block truncate font-mono text-[9px] text-muted-foreground">
                {category.verifiedCount}V · {category.assumedCount}A · {category.missingCount}M
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
