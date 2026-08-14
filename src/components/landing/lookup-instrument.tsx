"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { AlertTriangle, Download, LayoutGrid, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/store/app-store";
import { useHydration } from "@/hooks/use-hydration";
import { useBuildingSearch } from "@/hooks/use-building-search";
import { useCampusBuildings } from "@/hooks/use-campus-buildings";
import { compareBuildings } from "@/lib/campus/comparison-engine";
import { exportToCsv, exportToJson } from "@/lib/export";
import type { SearchBuildingsParams } from "@/lib/api-client";
import type { BrTitleInfo } from "@/lib/types";
import type { BuildingMetrics } from "@/lib/campus/portfolio-aggregator";
import type { CampusBounds } from "@/lib/campus/campus-types";
import type { LandingCopy } from "@/lib/landing/copy";
import { JournalSection } from "./journal-section";

const RegionSearchForm = lazy(() =>
  import("@/components/search/region-search-form").then((m) => ({ default: m.RegionSearchForm })),
);
const AddressSearchForm = lazy(() =>
  import("@/components/search/address-search-form").then((m) => ({ default: m.AddressSearchForm })),
);
const SearchResultsTable = lazy(() =>
  import("@/components/search/search-results-table").then((m) => ({ default: m.SearchResultsTable })),
);
const SearchPagination = lazy(() =>
  import("@/components/search/search-pagination").then((m) => ({ default: m.SearchPagination })),
);
const PortfolioDashboard = lazy(() =>
  import("@/components/campus/portfolio-dashboard").then((m) => ({ default: m.PortfolioDashboard })),
);
const ComparisonView = lazy(() =>
  import("@/components/campus/comparison-view").then((m) => ({ default: m.ComparisonView })),
);

function getEraFromDate(pmsDay: string): string {
  const year = parseInt(pmsDay.slice(0, 4), 10);
  if (isNaN(year)) return "unknown";
  if (year < 1980) return "pre-1980";
  if (year < 1990) return "1980s";
  if (year < 2000) return "1990s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  return "2020s+";
}

function toBuildingMetrics(building: BrTitleInfo): BuildingMetrics {
  return {
    buildingId: building.mgmBldrgstPk || "",
    name: building.bldNm || building.platPlcNm || "Unknown",
    area: building.totArea || building.platArea || 0,
    energyDemand: 0,
    energyPerArea: 0,
    co2Emissions: 0,
    co2PerArea: 0,
    energyGrade: "-",
    useType: building.mainPurpsCdNm || "",
    era: building.pmsDay ? getEraFromDate(building.pmsDay) : "unknown",
  };
}

const DEFAULT_BOUNDS: CampusBounds = {
  minLat: 37.4,
  maxLat: 37.7,
  minLng: 126.8,
  maxLng: 127.2,
};

function FormSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="ml-auto h-10 w-24" />
    </div>
  );
}

export function LookupInstrument({ copy, isKo }: { copy: LandingCopy; isKo: boolean }) {
  const hydrated = useHydration();
  const { apiKey } = useAppStore();

  const [campusMode, setCampusMode] = useState(false);
  const [campusParams, setCampusParams] = useState<{ sigunguCd: string; bjdongCd?: string } | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  const { data: campusData, isLoading: campusLoading, error: campusError } = useCampusBuildings(
    campusParams
      ? { bounds: DEFAULT_BOUNDS, sigunguCd: campusParams.sigunguCd, bjdongCd: campusParams.bjdongCd }
      : null,
  );

  const campusMetrics = useMemo<BuildingMetrics[]>(
    () => campusData?.buildings.map((cb) => toBuildingMetrics(cb.building)) ?? [],
    [campusData],
  );

  const comparisonResult = useMemo(() => {
    if (selectedForCompare.size < 2) return null;
    const selected = campusMetrics.filter((m) => selectedForCompare.has(m.buildingId));
    return compareBuildings(
      selected.map((m) => ({
        id: m.buildingId,
        name: m.name,
        energyPerArea: m.energyPerArea,
        co2PerArea: m.co2PerArea,
        wallU: 0,
        roofU: 0,
        windowU: 0,
        airtightness: 0,
      })),
    );
  }, [selectedForCompare, campusMetrics]);

  const handleCampusSearch = useCallback((params: {
    sigunguCd: string;
    bjdongCd: string;
    mainPurpsCd?: string;
    numOfRows: number;
    pageNo: number;
  }) => {
    setCampusParams({ sigunguCd: params.sigunguCd, bjdongCd: params.bjdongCd || undefined });
    setSelectedForCompare(new Set());
    setShowComparison(false);
  }, []);

  const toggleCompareSelect = useCallback((id: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const [searchParams, setSearchParams] = useState<SearchBuildingsParams | null>(null);
  const [useFilter, setUseFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = useBuildingSearch(
    searchParams ?? { sigunguCd: "", bjdongCd: "" },
  );

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!useFilter) return data.items;
    return data.items.filter((item) => item.mainPurpsCd === useFilter);
  }, [data, useFilter]);

  const hasResults = filteredItems.length > 0;

  const handleRegionSearch = useCallback(
    (params: {
      sigunguCd: string;
      bjdongCd: string;
      mainPurpsCd?: string;
      numOfRows: number;
      pageNo: number;
    }) => {
      setUseFilter(params.mainPurpsCd === "all" ? undefined : params.mainPurpsCd);
      setSearchParams({
        sigunguCd: params.sigunguCd,
        bjdongCd: params.bjdongCd,
        numOfRows: params.numOfRows,
        pageNo: params.pageNo,
      });
    },
    [],
  );

  const handleAddressSearch = useCallback(
    (params: {
      sigunguCd: string;
      bjdongCd: string;
      bun?: string;
      ji?: string;
      numOfRows: number;
      pageNo: number;
    }) => {
      setSearchParams({
        sigunguCd: params.sigunguCd,
        bjdongCd: params.bjdongCd,
        bun: params.bun,
        ji: params.ji,
        numOfRows: params.numOfRows,
        pageNo: params.pageNo,
      });
    },
    [],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      if (!searchParams) return;
      setSearchParams({ ...searchParams, pageNo: page });
    },
    [searchParams],
  );

  const handleExportCsv = () => {
    if (filteredItems.length > 0) {
      exportToCsv(
        filteredItems.map((item) => ({ ...item })),
        "building_search_results",
      );
    }
  };

  const handleExportJson = () => {
    if (filteredItems.length > 0) {
      exportToJson(filteredItems, "building_search_results");
    }
  };

  return (
    <JournalSection
      id="lookup"
      kicker={isKo ? "06  LOOKUP" : "06  LOOKUP"}
      title={copy.lookupTitle}
      titleAlt={copy.lookupTitleEn}
    >
      <p className="lj-chapter-lead">{copy.lookupLead}</p>

      {hydrated && !apiKey && (
        <div className="lj-note" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{copy.apiMissing}</p>
            <p>{copy.apiMissingBody}</p>
          </div>
        </div>
      )}

      <div className="lj-lookup-toolbar">
        <span className="lj-hint">{copy.campus}</span>
        <Button
          variant={campusMode ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => {
            setCampusMode((v) => !v);
            setCampusParams(null);
            setSelectedForCompare(new Set());
            setShowComparison(false);
          }}
        >
          <LayoutGrid className="h-4 w-4" />
          {campusMode ? copy.campusOn : copy.campusOff}
        </Button>
      </div>

      {campusMode ? (
        <div className="space-y-6">
          <div className="lj-panel space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                {isKo ? "캠퍼스 검색 (지역 일괄조회)" : "Campus Search (Area Batch)"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isKo
                  ? "시/군/구 + 법정동을 선택하면 해당 지역의 건물 목록을 한 번에 불러옵니다 (최대 20동)."
                  : "Select a district and dong to load all buildings in the area at once (up to 20)."}
              </p>
            </div>
            <Suspense fallback={<FormSkeleton />}>
              <RegionSearchForm onSearch={handleCampusSearch} isLoading={campusLoading} />
            </Suspense>
          </div>

          {campusError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {isKo ? "오류가 발생했습니다" : "An error occurred"}
              </p>
              <p className="mt-1 text-sm text-destructive/80">
                {campusError instanceof Error ? campusError.message : String(campusError)}
              </p>
            </div>
          )}

          {campusParams && !campusError && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">
                    {campusLoading
                      ? isKo ? "불러오는 중…" : "Loading…"
                      : isKo
                        ? `건물 ${campusMetrics.length}동`
                        : `${campusMetrics.length} buildings`}
                  </h3>
                  {campusMetrics.length > 0 && (
                    <Badge variant="secondary">
                      {isKo ? "에너지 데이터: 트윈 생성 후 제공" : "Energy data: available after twin generation"}
                    </Badge>
                  )}
                </div>

                {selectedForCompare.size >= 2 && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowComparison((v) => !v)}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    {showComparison
                      ? isKo ? "비교 닫기" : "Close Comparison"
                      : isKo
                        ? `${selectedForCompare.size}동 비교하기`
                        : `Compare ${selectedForCompare.size} buildings`}
                  </Button>
                )}
              </div>

              {campusMetrics.length > 0 && !showComparison && (
                <p className="text-xs text-muted-foreground">
                  {isKo
                    ? "건물을 2~4개 선택하면 비교 분석이 가능합니다."
                    : "Select 2–4 buildings to enable comparison analysis."}
                </p>
              )}

              {showComparison && comparisonResult && (
                <Suspense fallback={<FormSkeleton />}>
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 z-10 gap-1"
                      onClick={() => setShowComparison(false)}
                    >
                      <X className="h-3 w-3" />
                      {isKo ? "닫기" : "Close"}
                    </Button>
                    <ComparisonView result={comparisonResult} />
                  </div>
                </Suspense>
              )}

              {campusMetrics.length > 0 && (
                <Suspense fallback={<FormSkeleton />}>
                  <div className="lj-panel overflow-hidden">
                    <div className="border-b px-6 py-3 flex flex-wrap gap-2 items-center bg-muted/30">
                      <span className="text-xs font-medium text-muted-foreground mr-1">
                        {isKo ? "비교 선택:" : "Compare:"}
                      </span>
                      {campusMetrics.map((m) => {
                        const selected = selectedForCompare.has(m.buildingId);
                        return (
                          <button
                            key={m.buildingId}
                            type="button"
                            onClick={() => toggleCompareSelect(m.buildingId)}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border ${
                              selected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary/50"
                            } ${!selected && selectedForCompare.size >= 4 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            disabled={!selected && selectedForCompare.size >= 4}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                    <PortfolioDashboard
                      buildings={campusMetrics}
                      title={isKo ? "캠퍼스 에너지 포트폴리오" : "Campus Energy Portfolio"}
                    />
                  </div>
                </Suspense>
              )}

              {!campusLoading && campusMetrics.length === 0 && (
                <div className="lj-panel p-8 text-center text-sm text-muted-foreground">
                  {isKo ? "해당 지역에 건물 데이터가 없습니다." : "No building data found for this area."}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <Tabs defaultValue="region" className="space-y-6">
            <div className="mx-auto max-w-3xl">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="region" className="gap-2">
                  {isKo ? "지역 검색" : "Region Search"}
                </TabsTrigger>
                <TabsTrigger value="address" className="gap-2">
                  {isKo ? "주소 검색" : "Address Search"}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="region">
              <Suspense fallback={<FormSkeleton />}>
                <RegionSearchForm onSearch={handleRegionSearch} isLoading={isLoading} />
              </Suspense>
            </TabsContent>

            <TabsContent value="address">
              <Suspense fallback={<FormSkeleton />}>
                <AddressSearchForm onSearch={handleAddressSearch} isLoading={isLoading} />
              </Suspense>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {isKo ? "오류가 발생했습니다" : "An error occurred"}
              </p>
              <p className="mt-1 text-sm text-destructive/80">
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          )}

          {searchParams?.sigunguCd && (
            <div className="mt-8 space-y-4">
              {hasResults && (
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {isKo
                      ? `검색 결과 (${filteredItems.length}건${useFilter && data ? ` / 전체 ${data.totalCount}` : ""})`
                      : `Results (${filteredItems.length}${useFilter && data ? ` of ${data.totalCount}` : ""} records)`}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        {isKo ? "내보내기" : "Export"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExportCsv}>CSV</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportJson}>JSON</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              <Suspense fallback={<FormSkeleton />}>
                <SearchResultsTable data={filteredItems} isLoading={isLoading} />
              </Suspense>

              {data && Number(data.totalCount) > 0 && !useFilter && (
                <Suspense fallback={null}>
                  <SearchPagination
                    totalCount={data.totalCount}
                    pageNo={data.pageNo}
                    numOfRows={data.numOfRows}
                    onPageChange={handlePageChange}
                  />
                </Suspense>
              )}
            </div>
          )}
        </>
      )}
    </JournalSection>
  );
}
