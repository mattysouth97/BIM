"use client";

/**
 * 건축물대장 lookup — the product's front door.
 *
 * Restores the register search that was unlinked when the product briefly went
 * generative-only, minus the campus/portfolio branch (that branch reported
 * every building's energy as 0 with a "available after twin generation" badge,
 * which is exactly the kind of placeholder this product must not show).
 *
 * Picking a row goes straight into the energy diagnostic rather than the older
 * twin workspace: the register alone is enough for a baseline.
 */

import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Building2, KeyRound, Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBuildingSearch } from "@/hooks/use-building-search";
import { useHydration } from "@/hooks/use-hydration";
import type { SearchBuildingsParams } from "@/lib/api-client";
import type { BrTitleInfo } from "@/lib/types";
import { useAppStore } from "@/store/app-store";

import type { DiagnosisLocale } from "./types";

const RegionSearchForm = lazy(() =>
  import("@/components/search/region-search-form").then((m) => ({
    default: m.RegionSearchForm,
  })),
);
const AddressSearchForm = lazy(() =>
  import("@/components/search/address-search-form").then((m) => ({
    default: m.AddressSearchForm,
  })),
);
const SearchResultsTable = lazy(() =>
  import("@/components/search/search-results-table").then((m) => ({
    default: m.SearchResultsTable,
  })),
);
const SearchPagination = lazy(() =>
  import("@/components/search/search-pagination").then((m) => ({
    default: m.SearchPagination,
  })),
);

function FormSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/40 p-6">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="ml-auto h-10 w-24" />
    </div>
  );
}

export function LedgerLookup({ locale }: Readonly<{ locale: DiagnosisLocale }>) {
  const hydrated = useHydration();
  const apiKey = useAppStore((state) => state.apiKey);
  const [params, setParams] = useState<SearchBuildingsParams | null>(null);
  const [useFilter, setUseFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = useBuildingSearch(
    params ?? ({ sigunguCd: "", bjdongCd: "" } as SearchBuildingsParams),
  );

  const runSearch = useCallback(
    (next: SearchBuildingsParams & { mainPurpsCd?: string }) => {
      // The register API ignores mainPurpsCd, so it is filtered client-side.
      setUseFilter(next.mainPurpsCd || undefined);
      const { mainPurpsCd: _ignored, ...query } = next;
      void _ignored;
      setParams(query);
    },
    [],
  );

  const rows = useMemo<BrTitleInfo[]>(() => {
    const items = data?.items ?? [];
    if (!useFilter) return items;
    return items.filter((item) => item.mainPurpsCd === useFilter);
  }, [data, useFilter]);

  const hrefForBuilding = useCallback(
    (buildingId: string) =>
      `/diagnostics/new?method=ledger&building=${encodeURIComponent(buildingId)}`,
    [],
  );

  return (
    <section
      className="space-y-5"
      data-testid="ledger-lookup"
      aria-label={locale === "ko" ? "건축물대장 조회" : "Building register lookup"}
    >
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <Building2 className="size-4 text-cyan-300" aria-hidden="true" />
          {locale === "ko" ? "건물 찾기" : "Find a building"}
        </h2>
        <p className="text-sm text-slate-400">
          {locale === "ko"
            ? "지역이나 주소로 건축물대장을 조회하고, 건물을 고르면 바로 기준 에너지 모델이 만들어집니다."
            : "Search the building register by district or address. Picking a building builds its baseline energy model straight away."}
        </p>
      </header>

      <Tabs defaultValue="region">
        <TabsList>
          <TabsTrigger value="region">
            {locale === "ko" ? "지역으로" : "By district"}
          </TabsTrigger>
          <TabsTrigger value="address">
            {locale === "ko" ? "주소로" : "By address"}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="region" className="mt-4">
          <Suspense fallback={<FormSkeleton />}>
            <RegionSearchForm onSearch={runSearch} isLoading={isLoading} />
          </Suspense>
        </TabsContent>
        <TabsContent value="address" className="mt-4">
          <Suspense fallback={<FormSkeleton />}>
            <AddressSearchForm onSearch={runSearch} isLoading={isLoading} />
          </Suspense>
        </TabsContent>
      </Tabs>

      {hydrated && !apiKey ? (
        <p
          className="flex items-start gap-2 rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-400"
          data-testid="ledger-shared-key-note"
        >
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {locale === "ko"
              ? "공용 조회 키로 검색합니다. 사용량이 많아 제한되면 설정에서 본인 data.go.kr 키를 넣을 수 있습니다."
              : "Searching with the shared lookup key. If it is rate-limited, add your own data.go.kr key in Settings."}
          </span>
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-200"
          data-testid="ledger-lookup-error"
        >
          {locale === "ko"
            ? "건축물대장을 불러오지 못했습니다. 잠시 후 다시 시도하거나 설정에서 본인 키를 넣어 주세요."
            : "The building register could not be loaded. Try again shortly, or add your own key in Settings."}
        </p>
      ) : null}

      {params ? (
        <div className="space-y-3">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {locale === "ko" ? "조회 중…" : "Searching…"}
            </p>
          ) : null}
          <Suspense fallback={<FormSkeleton />}>
            <SearchResultsTable
              data={rows}
              isLoading={isLoading}
              hrefForBuilding={hrefForBuilding}
            />
          </Suspense>
          {/* Paging the API while a client-side use filter is active would
              silently drop matches from other pages, so it is suppressed. */}
          {!useFilter && data?.totalCount ? (
            <Suspense fallback={null}>
              <SearchPagination
                totalCount={data.totalCount}
                pageNo={params.pageNo ?? 1}
                numOfRows={params.numOfRows ?? 20}
                onPageChange={(page) =>
                  setParams((current) =>
                    current ? { ...current, pageNo: page } : current,
                  )
                }
              />
            </Suspense>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
