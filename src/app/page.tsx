"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, MapPin, Search, Download, LayoutGrid, X, FileBox, ArrowRight } from "lucide-react";
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
import { useWorkflowStore } from "@/store/workflow-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { makeCadDraftPk } from "@/lib/workflow/cad-draft";
import { useT } from "@/lib/i18n";
import { useHydration } from "@/hooks/use-hydration";
import { useBuildingSearch } from "@/hooks/use-building-search";
import { useCampusBuildings } from "@/hooks/use-campus-buildings";
import { compareBuildings } from "@/lib/campus/comparison-engine";
import { exportToCsv, exportToJson } from "@/lib/export";
import type { SearchBuildingsParams } from "@/lib/api-client";
import type { BrTitleInfo } from "@/lib/types";
import type { BuildingMetrics } from "@/lib/campus/portfolio-aggregator";
import type { CampusBounds } from "@/lib/campus/campus-types";

// Lazy-load heavy components
const RegionSearchForm = lazy(() =>
  import("@/components/search/region-search-form").then((m) => ({ default: m.RegionSearchForm }))
);
const AddressSearchForm = lazy(() =>
  import("@/components/search/address-search-form").then((m) => ({ default: m.AddressSearchForm }))
);
const SearchResultsTable = lazy(() =>
  import("@/components/search/search-results-table").then((m) => ({ default: m.SearchResultsTable }))
);
const SearchPagination = lazy(() =>
  import("@/components/search/search-pagination").then((m) => ({ default: m.SearchPagination }))
);
const PortfolioDashboard = lazy(() =>
  import("@/components/campus/portfolio-dashboard").then((m) => ({ default: m.PortfolioDashboard }))
);
const ComparisonView = lazy(() =>
  import("@/components/campus/comparison-view").then((m) => ({ default: m.ComparisonView }))
);

// ─── Campus helpers ───────────────────────────────────────────────────────────

/** Derive a loose era label from a YYYYMMDD permit-date string */
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

/** Default campus bounds (Korea center — used as placeholder when we have no real coords) */
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

export default function Home() {
  const hydrated = useHydration();
  const apiKey = useAppStore((state) => state.apiKey);
  const { t } = useT();
  const router = useRouter();

  // P2-24 — CAD-first standalone entry: mint a draft PK (cad-<uuid>), open its
  // workspace at the upload stage. No ledger search, no API key needed.
  const startCadDraft = useCallback(() => {
    const pk = makeCadDraftPk();
    useActiveBuildingStore.getState().setActiveBuilding(pk);
    useWorkflowStore.getState().setStage("upload");
    router.push(`/building/${pk}`);
  }, [router]);

  // ─── Campus mode state ────────────────────────────────────────────────────
  const [campusMode, setCampusMode] = useState(false);
  const [campusParams, setCampusParams] = useState<{ sigunguCd: string; bjdongCd?: string } | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  const { data: campusData, isLoading: campusLoading, error: campusError } = useCampusBuildings(
    campusParams ? { bounds: DEFAULT_BOUNDS, sigunguCd: campusParams.sigunguCd, bjdongCd: campusParams.bjdongCd } : null
  );

  const campusMetrics = useMemo<BuildingMetrics[]>(
    () => campusData?.buildings.map((cb) => toBuildingMetrics(cb.building)) ?? [],
    [campusData]
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
      }))
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

  // ─── Individual search state ──────────────────────────────────────────────
  const [searchParams, setSearchParams] = useState<SearchBuildingsParams | null>(null);
  const [useFilter, setUseFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = useBuildingSearch(
    searchParams ?? { sigunguCd: "", bjdongCd: "" },
  );

  // Client-side filtering — the HUB API ignores mainPurpsCd
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
      // Store filter separately — the HUB API ignores mainPurpsCd, so we filter client-side
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
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Hero */}
      <section className="mb-10 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("그린리모델링 투자 시뮬레이터", "GreenRetrofit Simulator")}
          </h2>
          <p className="max-w-lg text-muted-foreground">
            {t(
              "건축물대장 데이터를 3D 디지털 트윈으로 변환하고, 단열·설비·태양광 개보수의 에너지 절감과 투자 회수(NPV·IRR·회수기간)를 시뮬레이션하세요. 먼저 건물을 검색하여 시작합니다.",
              "Turn building-ledger data into a 3D digital twin and simulate the energy savings and investment return (NPV, IRR, payback) of envelope, HVAC, and solar retrofits. Start by searching for a building.",
            )}
          </p>
        </div>
      </section>

      {/* Shared demo-key notice — search works without a key (the server uses an
          embedded, rate-limited shared key). This only invites heavy users to
          add their own key. Rendered after hydration to avoid SSR mismatch. */}
      {hydrated && !apiKey && (
        <div className="mb-8 flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
          <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {t("공용 데모 키로 조회 중입니다.", "Browsing with the shared demo key.")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                "별도 설정 없이 건축물대장을 조회할 수 있습니다. 사용량이 많다면 오른쪽 상단의 열쇠 아이콘에서 본인 API 키를 등록하세요.",
                "You can query the building ledger with no setup. For heavier use, add your own API key via the key icon in the top-right.",
              )}
            </p>
          </div>
        </div>
      )}

      {/* P2-24 — CAD-first standalone entry */}
      <button
        type="button"
        onClick={startCadDraft}
        data-testid="cad-first-entry"
        className="group mb-8 flex w-full items-center gap-4 rounded-xl border border-dashed bg-card p-5 text-left shadow-sm transition-colors hover:border-primary hover:bg-primary/5"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <FileBox className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">
            {t("CAD 도면으로 시작", "Start from a CAD file")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(
              "건축물대장 없이 DXF·DWG·PDF 도면을 업로드하고 층수·연도·지역만 입력하면 트윈과 개보수 보고서가 생성됩니다.",
              "No building ledger? Upload a DXF/DWG/PDF outline, enter floors, year, and region — the twin and retrofit report follow.",
            )}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>

      {/* Campus Mode toggle */}
      <div className="mb-6 flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">
          {t("캠퍼스 모드", "Campus Mode")}
        </span>
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
          {campusMode
            ? t("캠퍼스 모드 ON", "Campus Mode ON")
            : t("캠퍼스 모드 OFF", "Campus Mode OFF")}
        </Button>
      </div>

      {campusMode ? (
        /* ─── Campus Mode ─────────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Campus search — reuse RegionSearchForm, it already has sigungu/bjdong pickers */}
          <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                {t("캠퍼스 검색 (지역 일괄조회)", "Campus Search (Area Batch)")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "시/군/구 + 법정동을 선택하면 해당 지역의 건물 목록을 한 번에 불러옵니다 (최대 20동).",
                  "Select a district and dong to load all buildings in the area at once (up to 20).",
                )}
              </p>
            </div>
            <Suspense fallback={<FormSkeleton />}>
              <RegionSearchForm onSearch={handleCampusSearch} isLoading={campusLoading} />
            </Suspense>
          </div>

          {/* Campus error */}
          {campusError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {t("오류가 발생했습니다", "An error occurred")}
              </p>
              <p className="mt-1 text-sm text-destructive/80">
                {campusError instanceof Error ? campusError.message : String(campusError)}
              </p>
            </div>
          )}

          {/* Campus results */}
          {campusParams && !campusError && (
            <div className="space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">
                    {campusLoading
                      ? t("불러오는 중…", "Loading…")
                      : t(`건물 ${campusMetrics.length}동`, `${campusMetrics.length} buildings`)}
                  </h3>
                  {campusMetrics.length > 0 && (
                    <Badge variant="secondary">
                      {t("에너지 데이터: 트윈 생성 후 제공", "Energy data: available after twin generation")}
                    </Badge>
                  )}
                </div>

                {/* Compare button — visible once 2+ buildings selected */}
                {selectedForCompare.size >= 2 && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowComparison((v) => !v)}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    {showComparison
                      ? t("비교 닫기", "Close Comparison")
                      : t(`${selectedForCompare.size}동 비교하기`, `Compare ${selectedForCompare.size} buildings`)}
                  </Button>
                )}
              </div>

              {/* Building selection hint */}
              {campusMetrics.length > 0 && !showComparison && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "건물을 2~4개 선택하면 비교 분석이 가능합니다.",
                    "Select 2–4 buildings to enable comparison analysis.",
                  )}
                </p>
              )}

              {/* Comparison view */}
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
                      {t("닫기", "Close")}
                    </Button>
                    <ComparisonView result={comparisonResult} />
                  </div>
                </Suspense>
              )}

              {/* Portfolio dashboard with per-building select checkboxes */}
              {campusMetrics.length > 0 && (
                <Suspense fallback={<FormSkeleton />}>
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    {/* Selection strip */}
                    {campusMetrics.length > 0 && (
                      <div className="border-b px-6 py-3 flex flex-wrap gap-2 items-center bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground mr-1">
                          {t("비교 선택:", "Compare:")}
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
                    )}
                    <PortfolioDashboard
                      buildings={campusMetrics}
                      title={t("캠퍼스 에너지 포트폴리오", "Campus Energy Portfolio")}
                    />
                  </div>
                </Suspense>
              )}

              {/* Empty state */}
              {!campusLoading && campusMetrics.length === 0 && (
                <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                  {t("해당 지역에 건물 데이터가 없습니다.", "No building data found for this area.")}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ─── Individual Search Mode ──────────────────────────────────── */
        <>
          {/* Search tabs */}
          <Tabs defaultValue="region" className="space-y-6">
            <div className="mx-auto max-w-3xl">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="region" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  {t("지역 검색", "Region Search")}
                </TabsTrigger>
                <TabsTrigger value="address" className="gap-2">
                  <Search className="h-4 w-4" />
                  {t("주소 검색", "Address Search")}
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

          {/* Error */}
          {error && (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {t("오류가 발생했습니다", "An error occurred")}
              </p>
              <p className="mt-1 text-sm text-destructive/80">
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          )}

          {/* Results */}
          {searchParams?.sigunguCd && (
            <div className="mt-8 space-y-4">
              {hasResults && (
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {t(
                      `검색 결과 (${filteredItems.length}건${useFilter && data ? ` / 전체 ${data.totalCount}` : ""})`,
                      `Results (${filteredItems.length}${useFilter && data ? ` of ${data.totalCount}` : ""} records)`,
                    )}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        {t("내보내기", "Export")}
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
                <SearchResultsTable
                  data={filteredItems}
                  isLoading={isLoading}
                />
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
    </div>
  );
}
