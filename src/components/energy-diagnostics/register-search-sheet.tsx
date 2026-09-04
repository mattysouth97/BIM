"use client";

import Image from "next/image";
import Link from "next/link";
import { FileText, FileUp, PenTool } from "lucide-react";

import { LedgerLookup } from "@/components/energy-diagnostics/ledger-lookup";
import { landingCopy } from "@/lib/landing/copy";
import { BANNER_LAYER_META } from "@/lib/landing/layers";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

/**
 * 처리절차 — the four steps, each with the outcome it produces.
 *
 * Korean official forms print their process this way, so the numbering is the
 * subject's own vernacular rather than decoration; the order is also real, and
 * the reader needs it. Each step states what the user gets, not what the system
 * does, so this sheet teaches the whole product before anyone commits to it.
 */
const WORKFLOW_STEPS = [
  {
    id: "search",
    ko: "건물 검색",
    en: "Find the building",
    koOutcome: "대장에서 고르면 기준 모델이 바로 만들어집니다",
    enOutcome: "Pick one and its baseline model is built for you",
  },
  {
    id: "upload",
    ko: "도면 업로드",
    en: "Upload drawings",
    koOutcome: "가지고 있는 도면으로 형상을 실제에 맞춥니다",
    enOutcome: "Match the shape to the real building",
  },
  {
    id: "twin",
    ko: "디지털 트윈",
    en: "Digital twin",
    koOutcome: "아는 값을 넣으면 에너지 결과가 다시 계산됩니다",
    enOutcome: "Enter what you know and the result recalculates",
  },
  {
    id: "report",
    ko: "보고서",
    en: "Report",
    koOutcome: "진단과 개선안을 PDF로 내보냅니다",
    enOutcome: "Export the diagnosis and the retrofit case",
  },
] as const;

const FALLBACKS = [
  {
    href: "/diagnostics/new?method=upload",
    testId: "diagnostic-method-upload",
    icon: FileUp,
    ko: "도면으로 시작",
    en: "Start from a drawing",
    koNote: "PDF · DXF · DWG",
    enNote: "PDF · DXF · DWG",
  },
  {
    href: "/diagnostics/new?method=create",
    testId: "diagnostic-method-create",
    icon: PenTool,
    ko: "형상 직접 그리기",
    en: "Draw the geometry",
    koNote: "도면이 없을 때",
    enNote: "When there is no drawing",
  },
  {
    href: "/building/demo",
    testId: "landing-sample-diagnostic",
    icon: FileText,
    ko: "샘플 건물 열기",
    en: "Open the sample",
    koNote: "완성된 진단 보기",
    enNote: "See a finished diagnosis",
  },
] as const;

/**
 * Step 1 of the workflow: choose a real building out of the 건축물대장.
 *
 * This sheet used to BE the landing page. `/` is now a gallery of the models
 * the project has taken in, so the sheet moved to its own address —
 * `/diagnostics/new?method=ledger`, linked from the header on every page. It
 * is unchanged otherwise, and it is still the only place the register lookup
 * lives: moving it kept the product's primary door open, where deleting it
 * with the landing page would have closed it.
 *
 * One sheet: what this is, what the four steps produce, and the single field
 * group you have to fill in.
 */
export function RegisterSearchSheet() {
  const language = useAppStore((state) => state.language);
  const locale = language === "ko" ? "ko" : "en";
  const isKo = locale === "ko";
  const copy = landingCopy[locale];
  const meta = BANNER_LAYER_META.all;

  return (
    <section className="landing-stage relative isolate w-full overflow-hidden">
      <a
        className="fixed left-3 top-0 z-[60] -translate-y-full rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground focus:translate-y-2"
        href="#bimfit-title"
      >
        {copy.skip}
      </a>

      {/* ── 처리절차 ─────────────────────────────────────────────────────
          The only place the workflow is stated. There used to be two
          competing "you are here" markers; a reader could not tell which
          one to trust. */}
      <nav
        aria-label={isKo ? "진단 절차" : "Diagnostic workflow"}
        className="border-b border-border bg-card"
      >
        <ol className="landing-scrollbar-none mx-auto flex w-full overflow-x-auto">
          {WORKFLOW_STEPS.map((step, index) => {
            const active = index === 0;
            return (
              <li
                key={step.id}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-w-[13.5rem] flex-1 flex-col gap-1 border-r border-border px-4 py-3 last:border-r-0",
                  active ? "bg-muted/50" : "bg-transparent",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "landing-step-num text-[11px] font-semibold",
                      active ? "text-primary" : "text-muted-foreground/70",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] font-semibold",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {isKo ? step.ko : step.en}
                  </span>
                  {active ? (
                    <span className="landing-stamp ml-auto shrink-0 text-[10px] font-semibold text-primary">
                      {isKo ? "지금" : "Now"}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] leading-4 text-muted-foreground">
                  {isKo ? step.koOutcome : step.enOutcome}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="landing-canvas relative isolate min-h-[calc(100dvh-9.5rem)] overflow-hidden bg-muted">
        <Image
          src={meta.poster}
          alt={meta.alt}
          fill
          priority
          sizes="100vw"
          className="landing-plate -z-30"
          style={{ "--landing-focus": meta.focus } as React.CSSProperties}
        />
        <div aria-hidden="true" className="landing-grid absolute inset-0 -z-20" />
        <div aria-hidden="true" className="landing-scrim absolute inset-0 -z-10" />

        {/* The render was decoration competing with the form. Naming what it
            shows turns it into an illustration of step 3 — the layers this
            product actually draws — so it earns the space it takes. */}
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden max-w-[15rem] text-right lg:block">
          <span className="landing-stamp block text-[10px] font-semibold text-foreground/70">
            {isKo ? "03 디지털 트윈" : "03 Digital twin"}
          </span>
          <span className="mt-1 block text-[11px] leading-4 text-foreground/55">
            {isKo
              ? "외피 · 구조 · 기계전기설비를 층별로 나눠 봅니다"
              : "Envelope, structure and MEP, separated floor by floor"}
          </span>
        </div>

        <div className="mx-auto grid w-full max-w-[1920px] gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[minmax(0,40rem)_1fr] lg:px-4">
          <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
            <div
              className="overflow-hidden rounded-xl border border-border bg-card/97 shadow-[0_18px_55px_rgba(30,38,36,0.13)] backdrop-blur"
              data-testid="landing-ledger-lookup"
            >
              <header className="border-b border-border px-5 py-5">
                <p className="landing-stamp text-[10px] font-semibold text-muted-foreground">
                  {copy.brand} / BASELINE 01
                </p>
                <h1
                  id="bimfit-title"
                  aria-label={`${copy.brand}: ${copy.display}`}
                  className="landing-display mt-2.5 text-balance break-keep text-foreground"
                >
                  {copy.display}
                </h1>
                <p className="mt-2.5 max-w-xl text-[13px] leading-6 text-muted-foreground">
                  {isKo
                    ? "건축물대장에 있는 실제 건물로 시작합니다. 대장이 말하는 값과 연식에서 추정한 값을 끝까지 구분해 보여 줍니다."
                    : "Start from a real building in the public register. What the register states and what was assumed from its era stay told apart, all the way through."}
                </p>
              </header>

              <div className="p-5">
                <LedgerLookup locale={locale} />
              </div>
            </div>

            {/* Fallbacks, framed as what you do when the register cannot serve
                you — not as peers of the search. */}
            <div className="rounded-xl border border-border bg-card/97 px-4 py-3 backdrop-blur">
              <p className="text-[11px] font-medium text-muted-foreground">
                {isKo ? "대장에서 찾지 못했다면" : "If the register cannot find it"}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {FALLBACKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.testId}
                      href={item.href}
                      data-testid={item.testId}
                      className="group flex items-center gap-2 rounded-md text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
                      />
                      <span className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors group-hover:decoration-foreground">
                        {isKo ? item.ko : item.en}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {isKo ? item.koNote : item.enNote}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
