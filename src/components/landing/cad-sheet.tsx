"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Box,
  ChevronRight,
  FileText,
  FileUp,
  PenTool,
} from "lucide-react";

import { LedgerLookup } from "@/components/energy-diagnostics/ledger-lookup";
import type { LandingCopy } from "@/lib/landing/copy";
import { BANNER_LAYER_META } from "@/lib/landing/layers";
import { useAppStore } from "@/store/app-store";


const WORKFLOW_STEPS = [
  { ko: "건물 검색", en: "Building search" },
  { ko: "도면 업로드", en: "Drawing upload" },
  { ko: "디지털 트윈", en: "Digital twin" },
  { ko: "보고서", en: "Report" },
] as const;

/**
 * The landing page is the first working surface of the product. Its visual
 * hierarchy mirrors the BIM workspace: workflow first, model in the centre,
 * controls at the edges, and the real register lookup always within reach.
 */
export function CadSheet({ copy }: { copy: LandingCopy }) {
  const language = useAppStore((state) => state.language);
  const locale = language === "ko" ? "ko" : "en";
  const isKo = locale === "ko";
  const meta = BANNER_LAYER_META.all;

  return (
    <section className="relative isolate min-h-[inherit] w-full overflow-hidden">
      <nav
        aria-label={isKo ? "진단 단계" : "Diagnostic workflow"}
        className="landing-workflow border-b border-border bg-card"
      >
        <ol className="landing-scrollbar-none mx-auto flex h-11 w-full items-center gap-1 overflow-x-auto px-3 sm:px-5">
          {WORKFLOW_STEPS.map((step, index) => {
            const active = index === 0;
            return (
              <li key={step.en} className="flex shrink-0 items-center gap-1">
                <span
                  aria-current={active ? "step" : undefined}
                  className={
                    active
                      ? "flex items-center gap-2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background"
                      : "flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground"
                  }
                >
                  <span
                    aria-hidden="true"
                    className={
                      active
                        ? "size-2 rounded-full border border-background bg-background"
                        : "size-2 rounded-full border border-muted-foreground/70"
                    }
                  />
                  {isKo ? step.ko : step.en}
                </span>
                {index < WORKFLOW_STEPS.length - 1 ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground/50"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="landing-canvas relative isolate min-h-[calc(100dvh-6rem)] overflow-hidden bg-muted">
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

        <div className="relative z-20 flex h-10 items-center justify-between border-b border-border bg-card/95 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-[11px]">
            <span className="rounded-md bg-foreground px-2 py-1 font-semibold text-background">
              {isKo ? "에너지 진단" : "Energy diagnostic"}
            </span>
            <span className="hidden truncate text-muted-foreground sm:inline">
              {isKo ? "건축물대장 기준 모델" : "Register-based baseline model"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
            <Box aria-hidden="true" className="size-3.5 text-foreground" />
            <span className="font-semibold text-foreground">3D</span>
            <span aria-hidden="true" className="h-3 w-px bg-border" />
            <span>{copy.layers.all.name}</span>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[1920px] gap-3 px-3 pb-3 pt-44 sm:px-4 sm:pt-48 lg:grid-cols-[minmax(0,38rem)_1fr] lg:gap-4 lg:px-4 lg:pb-28 lg:pt-4 xl:grid-cols-[minmax(0,40rem)_1fr]">
          <div
            className="landing-console order-2 overflow-hidden rounded-xl border border-border bg-card/97 shadow-[0_18px_55px_rgba(30,38,36,0.13)] backdrop-blur lg:order-none lg:col-start-1 lg:row-start-1"
            data-testid="landing-ledger-lookup"
          >
            <header className="border-b border-border px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <p className="landing-stamp text-[9px] font-semibold text-muted-foreground sm:text-[10px]">
                  {copy.brand} / BASELINE 01
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
                  {isKo ? "새 진단" : "New diagnostic"}
                </span>
              </div>
              <h1
                id="bimfit-title"
                aria-label={`${copy.brand}: ${copy.display}`}
                className="landing-display mt-3 text-balance break-keep text-foreground"
              >
                {copy.display}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {isKo
                  ? "건축물대장에서 실제 건물을 찾으면 에너지 기준 모델과 개선안 비교가 한 흐름으로 이어집니다."
                  : "Find the real building in the public register to create a baseline model and compare retrofit options in one flow."}
              </p>

              <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border">
                <div className="min-w-0 py-2 pr-3">
                  <dt className="text-[10px] text-muted-foreground">
                    {isKo ? "기준 자료" : "Baseline"}
                  </dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold">
                    {isKo ? "건축물대장" : "Building register"}
                  </dd>
                </div>
                <div className="min-w-0 px-3 py-2">
                  <dt className="text-[10px] text-muted-foreground">
                    {isKo ? "분석 항목" : "Analysis"}
                  </dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold">EUI · CO₂</dd>
                </div>
                <div className="min-w-0 py-2 pl-3">
                  <dt className="text-[10px] text-muted-foreground">
                    {isKo ? "최종 결과" : "Output"}
                  </dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold">
                    {isKo ? "개선안 비교" : "Option comparison"}
                  </dd>
                </div>
              </dl>
            </header>

            <div className="p-4 sm:p-5">
              <LedgerLookup locale={locale} />
            </div>
          </div>

        </div>

        <div className="relative z-30 mx-3 mb-3 overflow-hidden rounded-xl border border-border bg-card/97 shadow-[0_12px_40px_rgba(30,38,36,0.16)] backdrop-blur sm:mx-4 lg:absolute lg:inset-x-4 lg:bottom-3 lg:mx-0 lg:mb-0">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
            <p className="flex items-center gap-2 text-xs">
              <span className="inline-flex size-6 items-center justify-center rounded-md bg-emerald-500 font-bold text-white">
                1
              </span>
              <span className="font-semibold">
                {isKo ? "현재 단계 · 건물 찾기" : "Current step · Find a building"}
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                {copy.heroPhrase}
              </span>
            </p>
            <span className="landing-stamp text-[9px] text-muted-foreground">
              {copy.version}
            </span>
          </div>

          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Link
              href="/diagnostics/new?method=upload"
              className="group flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              data-testid="diagnostic-method-upload"
            >
              <span className="flex items-center gap-2">
                <FileUp aria-hidden="true" className="size-4 text-sky-600" />
                <span>
                  <span className="block font-semibold">
                    {isKo ? "도면 업로드" : "Upload a drawing"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    PDF · DXF · DWG · IFC
                  </span>
                </span>
              </span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>

            <Link
              href="/diagnostics/new?method=create"
              className="group flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              data-testid="diagnostic-method-create"
            >
              <span className="flex items-center gap-2">
                <PenTool aria-hidden="true" className="size-4 text-foreground" />
                <span>
                  <span className="block font-semibold">
                    {isKo ? "형상 직접 만들기" : "Draw the geometry"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {isKo ? "도면이 없어도 시작" : "Start without a drawing"}
                  </span>
                </span>
              </span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>

            <Link
              href="/building/demo"
              className="group flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              data-testid="landing-sample-diagnostic"
            >
              <span className="flex items-center gap-2">
                <FileText aria-hidden="true" className="size-4 text-emerald-600" />
                <span>
                  <span className="block font-semibold">{copy.sampleDiagnostic}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {isKo ? "완성된 진단 확인" : "Open a completed diagnostic"}
                  </span>
                </span>
              </span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
