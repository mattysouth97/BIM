"use client";

// src/components/upload/cad-request-panel.tsx
//
// The prompt module: "I have no drawing — build one from the evidence."
//
// The user's sentence is one source among several. The register, the GIS
// outline and the era tables are gathered automatically; the statement adds
// whatever the user actually knows. Everything is graded, the geometry is
// solved deterministically in the browser, and the result leaves through the
// SAME DXF ingestion boundary an uploaded file would use — so the twin never
// receives geometry that has not survived a round trip.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCompositeBuilding } from "@/hooks/use-composite-building";
import {
  ringCentroidLngLat,
  useOsmBuilding,
} from "@/hooks/use-osm-building";
import { parseBuildingId } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import {
  parseClaimStatements,
  runReconstruction,
  type EvidenceGrade,
  type EvidenceInput,
  type ReconstructionClaim,
  type ReconstructionDocument,
  type ReconstructionPackage,
  type WebEvidenceInput,
} from "@/lib/cad-reconstruction";

import { GradeDot, ReconstructionPreview } from "./reconstruction-preview";

interface Props {
  /**
   * Hands the finished DXF to the upload stage, which ingests it through the
   * ordinary import path. The parent decides what the twin is told about it.
   */
  onUseDrawing: (dxfText: string, fileName: string) => void;
}

const EXAMPLES: Array<{ ko: string; en: string }> = [
  {
    ko: "정면 폭 12m를 줄자로 실측했습니다. 주 출입구는 남쪽입니다.",
    en: "정면 폭 12m를 줄자로 실측했습니다. 주 출입구는 남쪽입니다.",
  },
  { ko: "층고는 3.6m 입니다. 코어는 북측에 있습니다.", en: "층고는 3.6m 입니다. 코어는 북측에 있습니다." },
  { ko: "대지면적 200평, 평지붕, 조적조입니다.", en: "대지면적 200평, 평지붕, 조적조입니다." },
];

function gradeVariant(grade: EvidenceGrade): string {
  switch (grade) {
    case "A-VERIFIED":
      return "border-emerald-500/50 text-emerald-700 dark:text-emerald-400";
    case "B-OBSERVED":
      return "border-sky-500/50 text-sky-700 dark:text-sky-400";
    case "C-CALCULATED":
      return "border-blue-500/50 text-blue-700 dark:text-blue-400";
    case "D-INFERRED":
      return "border-amber-500/60 text-amber-700 dark:text-amber-400";
    default:
      return "border-destructive/60 text-destructive";
  }
}

function download(doc: ReconstructionDocument): void {
  const blob = new Blob([doc.content], { type: `${doc.mediaType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-md border bg-background">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">{count}</span>
        )}
      </summary>
      <div className="border-t px-3 py-2 text-xs">{children}</div>
    </details>
  );
}

export function CadRequestPanel({ onUseDrawing }: Props) {
  const { t } = useT();
  const routeParams = useParams<{ id?: string }>();
  const buildingId = typeof routeParams?.id === "string" ? routeParams.id : "";
  const parsed = useMemo(() => parseBuildingId(buildingId), [buildingId]);

  const detailParams = useMemo(
    () => ({
      sigunguCd: parsed?.sigunguCd ?? "",
      bjdongCd: parsed?.bjdongCd ?? "",
      platGbCd: parsed?.platGbCd,
      bun: parsed?.bun,
      ji: parsed?.ji,
    }),
    [parsed],
  );

  const titleQuery = useCompositeBuilding(detailParams);
  const ledgerTitle = titleQuery.title?.items?.[0] ?? null;
  const address =
    ledgerTitle?.platPlcNm || ledgerTitle?.newPlatPlc || undefined;
  const withFootprint = useCompositeBuilding(detailParams, address);

  const [statement, setStatement] = useState("");
  const [running, setRunning] = useState(false);
  const [reader, setReader] = useState<"claude" | "deterministic" | null>(null);
  const [claims, setClaims] = useState<ReconstructionClaim[]>([]);
  const [pkg, setPkg] = useState<ReconstructionPackage | null>(null);
  const [webFacts, setWebFacts] = useState<WebEvidenceInput["facts"]>([]);
  const [error, setError] = useState<string | null>(null);
  // Web search costs a model call and several seconds, so it is opt-in and
  // never runs as a side effect of pressing 도면 복원.
  const [useWeb, setUseWeb] = useState(false);
  const [webAvailable, setWebAvailable] = useState<boolean | null>(null);
  const [previewLevelId, setPreviewLevelId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/cad/web-evidence")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { available?: boolean } | null) => {
        if (alive) setWebAvailable(d?.available ?? false);
      })
      .catch(() => {
        if (alive) setWebAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/cad/reconstruct")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { reader?: "claude" | "deterministic" } | null) => {
        if (alive && d?.reader) setReader(d.reader);
      })
      .catch(() => {
        if (alive) setReader("deterministic");
      });
    return () => {
      alive = false;
    };
  }, []);

  const evidenceCount = useMemo(() => {
    let n = 0;
    if (withFootprint.title?.items?.length) n += 1;
    if (withFootprint.recap?.items?.length) n += 1;
    if (withFootprint.floors?.items?.length) n += 1;
    if (withFootprint.areas?.items?.length) n += 1;
    return n;
  }, [withFootprint]);

  const hasGisOutline =
    !!withFootprint.footprintData?.polygon &&
    withFootprint.footprintData.source === "building";

  // A second, independently digitised outline. Queried by the GIS ring's own
  // centroid when there is one — far tighter than geocoding an address — and
  // by the address only when the government layer gave us nothing to aim at.
  const gisCentroid = useMemo(
    () => ringCentroidLngLat(withFootprint.footprintData?.polygon),
    [withFootprint.footprintData?.polygon],
  );
  const osmQuery = useMemo(
    () =>
      gisCentroid
        ? { lat: gisCentroid.lat, lng: gisCentroid.lng }
        : { address: address ?? null },
    [gisCentroid, address],
  );
  const { osm, isLoading: osmLoading, hasOutline: hasOsmOutline } =
    useOsmBuilding(osmQuery, !!gisCentroid || !!address);

  // Running before the register has answered produces a "cannot reconstruct"
  // verdict about the network, not about the building. Both lookups must have
  // settled first — the address that drives the GIS query only exists once the
  // title query has resolved, so the two are genuinely sequential.
  const evidenceLoading =
    titleQuery.isLoading ||
    withFootprint.isLoading ||
    withFootprint.isFootprintLoading ||
    osmLoading;

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      let readClaims: ReconstructionClaim[] = [];
      if (statement.trim().length > 0) {
        try {
          const res = await fetch("/api/cad/reconstruct", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statement: statement.trim() }),
          });
          const data = (await res.json()) as {
            success?: boolean;
            claims?: ReconstructionClaim[];
            reader?: "claude" | "deterministic";
          };
          if (data?.success && Array.isArray(data.claims)) {
            readClaims = data.claims;
            if (data.reader) setReader(data.reader);
          } else {
            readClaims = parseClaimStatements(statement.trim());
            setReader("deterministic");
          }
        } catch {
          // The rule-based reader runs in the browser, so a network failure
          // costs interpretation quality, not the feature.
          readClaims = parseClaimStatements(statement.trim());
          setReader("deterministic");
        }
      }
      setClaims(readClaims);

      let web: WebEvidenceInput | null = null;
      if (useWeb && webAvailable) {
        try {
          const res = await fetch("/api/cad/web-evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: ledgerTitle?.bldNm ?? undefined,
              address: address ?? undefined,
            }),
          });
          const data = (await res.json()) as { success?: boolean } & WebEvidenceInput;
          if (data?.success) {
            web = {
              facts: data.facts ?? [],
              query: data.query ?? null,
              searched: data.searched ?? false,
              error: data.error ?? null,
            };
          }
        } catch {
          // A failed search is an absent source, not a failed reconstruction.
          web = { facts: [], query: null, searched: false, error: "웹 검색 요청 실패" };
        }
      }

      const input: EvidenceInput = {
        buildingPk: String(ledgerTitle?.mgmBldrgstPk ?? buildingId),
        title: ledgerTitle,
        recap: withFootprint.recap?.items?.[0] ?? null,
        floors: withFootprint.floors?.items ?? [],
        areas: withFootprint.areas?.items ?? [],
        gis: withFootprint.footprintData
          ? {
              polygon: withFootprint.footprintData.polygon,
              source: withFootprint.footprintData.source ?? null,
              attributes: withFootprint.footprintData.attributes ?? null,
              error: withFootprint.footprintData.error,
            }
          : null,
        osm,
        web,
        address: address ?? null,
        claims: readClaims,
      };

      setWebFacts(web?.facts ?? []);
      const result = runReconstruction(input);
      setPkg(result);
      setPreviewLevelId(
        result.model.levels.find((l) => !l.below)?.id ??
          result.model.levels[0]?.id ??
          null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPkg(null);
    } finally {
      setRunning(false);
    }
  }, [statement, ledgerTitle, withFootprint, address, buildingId, osm, useWeb, webAvailable]);

  const model = pkg?.model ?? null;
  const blocked = (model?.blockers.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">
          {t("도면이 없나요? 증거로 도면 복원", "No drawing? Reconstruct one from evidence")}
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {t("추정 현황 복원", "Estimated reconstruction")}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          "건축물대장·정부 GIS 외곽·OpenStreetMap 외곽·연대별 코드표를 자동으로 수집하고, " +
            "관측된 외곽선끼리 서로 대조한 뒤 형상을 복원합니다. 아는 정보를 문장으로 더하면 " +
            "출처가 추적되는 CAD를 만듭니다. 실측 도서가 아니며, 모든 선은 증거 등급을 갖습니다.",
          "The register, the government GIS outline, the OpenStreetMap outline and the era code " +
            "tables are gathered for you, and the observed outlines are cross-checked against " +
            "each other before the shape is rebuilt. Add what you know in a sentence and the " +
            "pipeline produces source-traceable CAD. This is not an as-built survey — every " +
            "line carries a confidence grade.",
        )}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ScanSearch className="h-3 w-3" />
          {t("수집된 증거", "Evidence gathered")}:
        </span>
        <Badge variant="outline" className="text-[10px]">
          {t("건축물대장", "Register")} {evidenceCount}/4
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {hasGisOutline
            ? t("GIS 건물 외곽 ✓", "GIS outline ✓")
            : withFootprint.footprintData?.source === "parcel"
              ? t("GIS 필지 경계만", "Parcel boundary only")
              : t("GIS 외곽 없음", "No GIS outline")}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {hasOsmOutline
            ? t("OSM 건물 외곽 ✓", "OSM outline ✓")
            : t("OSM 외곽 없음", "No OSM outline")}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {t("연대 코드표", "Era tables")} ✓
        </Badge>
        {reader && (
          <Badge variant="outline" className="text-[10px]">
            {t("문장 해석", "Statement reader")}:{" "}
            {reader === "claude" ? "Claude" : t("규칙 기반", "rule-based")}
          </Badge>
        )}
      </div>

      <Textarea
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        rows={3}
        data-testid="cad-request-prompt"
        placeholder={t(
          "아는 것만 적으세요. 예) 정면 폭 12m를 실측했습니다. 층고 3.6m. 주 출입구는 남쪽.",
          "Write only what you know. e.g. 정면 폭 12m를 실측했습니다. 층고 3.6m. 주 출입구는 남쪽.",
        )}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.ko}
            type="button"
            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
            onClick={() =>
              setStatement((prev) => (prev ? `${prev} ${ex.ko}` : ex.ko))
            }
          >
            {ex.ko}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          className="h-3 w-3"
          checked={useWeb}
          disabled={webAvailable === false}
          onChange={(e) => setUseWeb(e.target.checked)}
          data-testid="cad-request-web-search"
        />
        {webAvailable === false
          ? t(
              "웹 검색 보강 — 이 서버에 구성되어 있지 않습니다",
              "Web search — not configured on this server",
            )
          : t(
              "웹 검색으로 보강 (인용 URL이 있는 사실만 채택, 대장 값은 그대로 유지)",
              "Add web search (cited facts only; the register keeps every value)",
            )}
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {evidenceLoading
            ? t("증거를 수집하는 중입니다…", "Gathering evidence…")
            : t(
                "문장을 비워 두어도 대장만으로 복원할 수 있습니다.",
                "Leave the statement empty to reconstruct from the register alone.",
              )}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={running || evidenceLoading}
          onClick={() => void run()}
          data-testid="cad-request-run"
          data-evidence-ready={evidenceLoading ? "false" : "true"}
        >
          {running ? (
            <>
              <span className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("복원 중…", "Reconstructing…")}
            </>
          ) : (
            t("도면 복원", "Reconstruct drawing")
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pkg && model && (
        <div className="flex flex-col gap-3" data-testid="cad-request-result">
          {blocked ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">
                  {t("복원할 수 없습니다", "Cannot reconstruct")}
                </div>
                <ul className="mt-1 list-disc pl-4">
                  {model.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className={gradeVariant(model.footprint.grade)}>
                  {t("외곽선", "Footprint")} {model.footprint.grade}
                </Badge>
                <Badge variant="outline">
                  {model.levels.length} {t("개 층", "levels")}
                </Badge>
                <Badge variant="outline">
                  {model.footprint.areaSqm.toFixed(1)} m²
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    pkg.summary.ok
                      ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                      : "border-destructive/60 text-destructive"
                  }
                >
                  QA {pkg.summary.pass} PASS · {pkg.summary.fail} FAIL · {pkg.summary.skip} SKIP
                </Badge>
                {model.conflicts.length > 0 && (
                  <Badge variant="outline" className="border-destructive/60 text-destructive">
                    {t("불일치", "Conflicts")} {model.conflicts.length}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-start gap-4">
                {previewLevelId && (
                  <div className="flex flex-col gap-1.5">
                    <ReconstructionPreview
                      model={model}
                      levelId={previewLevelId}
                      size={260}
                    />
                    <div className="flex flex-wrap gap-1">
                      {model.levels.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setPreviewLevelId(l.id)}
                          className={`rounded border px-1.5 py-0.5 text-[10px] ${
                            previewLevelId === l.id
                              ? "border-primary bg-primary/10"
                              : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="min-w-[260px] flex-1 space-y-2">
                  <Section
                    title={t("외곽선 대조", "Outline reconciliation")}
                    count={model.outlineScan.candidates.length}
                    defaultOpen
                  >
                    <p className="mb-2 text-muted-foreground">
                      {model.outlineScan.rationale}
                    </p>

                    <table className="w-full">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left font-normal">{t("출처", "Source")}</th>
                          <th className="text-right font-normal">{t("면적", "Area")}</th>
                          <th className="text-right font-normal">{t("등급", "Grade")}</th>
                          <th className="text-right font-normal">{t("채택", "Used")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.outlineScan.candidates.map((candidate) => {
                          const chosen = candidate.id === model.outlineScan.chosenId;
                          return (
                            <tr
                              key={candidate.id}
                              className={chosen ? "font-medium" : "text-muted-foreground"}
                            >
                              <td className="py-0.5">
                                {candidate.labelKo}
                                {candidate.siteOnly && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    ({t("대지 — 외곽선 아님", "site, not a footprint")})
                                  </span>
                                )}
                              </td>
                              <td className="text-right tabular-nums">
                                {candidate.areaSqm.toFixed(1)}
                              </td>
                              <td className="text-right">
                                <GradeDot grade={candidate.grade} />
                              </td>
                              <td className="text-right">{chosen ? "✓" : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {model.outlineScan.agreements.length > 0 && (
                      <div className="mt-2 border-t pt-2">
                        <div className="mb-1 text-muted-foreground">
                          {t("관측 출처 간 일치도", "Agreement between observed sources")}
                        </div>
                        <ul className="space-y-0.5">
                          {model.outlineScan.agreements.map((a) => (
                            <li
                              key={`${a.aId}-${a.bId}`}
                              className={a.agrees ? "" : "text-destructive"}
                            >
                              {a.aId} ↔ {a.bId}: {t("겹침", "overlap")} IoU{" "}
                              <span className="tabular-nums">{a.iou.toFixed(2)}</span>,{" "}
                              {t("면적 차", "area Δ")}{" "}
                              <span className="tabular-nums">
                                {a.areaDeltaPct >= 0 ? "+" : ""}
                                {a.areaDeltaPct.toFixed(1)}%
                              </span>
                              , {t("중심 이격", "centre offset")}{" "}
                              <span className="tabular-nums">
                                {Math.round(a.centroidOffsetMm)}
                              </span>{" "}
                              mm{" "}
                              {a.agrees
                                ? t("— 일치", "— agree")
                                : t("— 불일치 (불일치 대장 기록)", "— disagree (recorded)")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {model.outlineScan.regularization && (
                      <div className="mt-2 border-t pt-2">
                        <div className="mb-1 text-muted-foreground">
                          {t("직각 정형화", "Squaring to the building axis")}
                        </div>
                        <p
                          className={
                            model.outlineScan.regularization.applied
                              ? ""
                              : "text-muted-foreground"
                          }
                        >
                          {model.outlineScan.regularization.applied
                            ? "✓ "
                            : `${t("적용 안 함", "not applied")} — `}
                          {model.outlineScan.regularization.reason}
                        </p>
                      </div>
                    )}
                  </Section>

                  {model.sources.some((src) => src.sourceId === "SRC-WEB" && src.available) && (
                    <Section
                      title={t("웹 검색 결과", "Web search findings")}
                      count={webFacts.length}
                    >
                      <p className="mb-2 text-muted-foreground">
                        {t(
                          "제3자의 진술입니다. 기하를 만들지 않으며 대장 값을 대체하지 않습니다.",
                          "Third-party statements. They build no geometry and replace no registered value.",
                        )}
                      </p>
                      <ul className="space-y-1.5">
                        {(webFacts ?? []).map((fact) => (
                          <li key={`${fact.kind}-${fact.citations[0]?.url}`}>
                            <span className="font-medium">{fact.kind}</span>:{" "}
                            <span className="tabular-nums">{String(fact.value)}</span>
                            {fact.unit ? ` ${fact.unit}` : ""}{" "}
                            <GradeDot grade={fact.grade} />
                            <div className="text-muted-foreground">
                              &ldquo;{fact.quote}&rdquo;
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {fact.citations.map((c) => (
                                <a
                                  key={c.url}
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline underline-offset-2 hover:text-foreground"
                                >
                                  {c.title ?? new URL(c.url).hostname}
                                </a>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section
                    title={t("면적 검증", "Area validation")}
                    count={model.areaValidation.length}
                    defaultOpen
                  >
                    <table className="w-full">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left font-normal">{t("항목", "Metric")}</th>
                          <th className="text-right font-normal">{t("출처", "Source")}</th>
                          <th className="text-right font-normal">{t("모델", "Model")}</th>
                          <th className="text-right font-normal">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.areaValidation.map((r) => (
                          <tr key={r.metric}>
                            <td className="py-0.5">{r.metric}</td>
                            <td className="text-right tabular-nums">
                              {r.sourceValue?.toFixed(1) ?? "-"}
                            </td>
                            <td className="text-right tabular-nums">
                              {r.modelValue?.toFixed(1) ?? "-"}
                            </td>
                            <td
                              className={`text-right tabular-nums ${
                                r.status === "REVIEW" ? "text-destructive" : ""
                              }`}
                            >
                              {r.deltaPct === null ? "-" : `${r.deltaPct.toFixed(1)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>

                  <Section
                    title={t("기하 통제망", "Geometric controls")}
                    count={model.controls.length}
                  >
                    <ul className="space-y-0.5">
                      {model.controls.map((c) => (
                        <li key={c.id} className="flex items-start gap-1.5">
                          <GradeDot grade={c.grade} />
                          <span className="font-mono text-[10px]">{c.id}</span>
                          <span className="flex-1">
                            {c.labelKo}:{" "}
                            <span className="font-medium">
                              {typeof c.value === "number"
                                ? c.value.toFixed(2)
                                : (c.value ?? "-")}
                            </span>{" "}
                            {c.unit ?? ""}{" "}
                            <span className="text-muted-foreground">— {c.method}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  {claims.length > 0 && (
                    <Section title={t("사용자 진술 해석", "Statement read")} count={claims.length}>
                      <ul className="space-y-0.5">
                        {claims.map((c) => (
                          <li key={c.id} className="flex items-start gap-1.5">
                            <GradeDot grade={c.grade} />
                            <span>
                              <span className="font-mono text-[10px]">{c.kind}</span> ={" "}
                              <span className="font-medium">{String(c.value ?? "-")}</span>{" "}
                              {c.unit ?? ""}{" "}
                              <span className="text-muted-foreground">
                                — {c.grade} · “{c.quote}”
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {model.conflicts.length > 0 && (
                    <Section
                      title={t("출처 불일치", "Source conflicts")}
                      count={model.conflicts.length}
                      defaultOpen
                    >
                      <ul className="space-y-1">
                        {model.conflicts.map((c) => (
                          <li key={c.id}>
                            <span className="font-medium">{c.subject}</span> — {c.valueA} vs{" "}
                            {c.valueB} ({c.magnitude})
                            <div className="text-muted-foreground">{c.possibleExplanation}</div>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section title={t("가정 대장", "Assumption ledger")} count={model.assumptions.length}>
                    <ul className="space-y-1">
                      {model.assumptions.map((a) => (
                        <li key={a.id}>
                          <span className="font-mono text-[10px]">{a.id}</span>{" "}
                          <span className="font-medium">{a.element}</span> — {a.assumption}
                          <div className="text-muted-foreground">
                            {a.confidence} · {t("확인", "Verify")}: {a.verificationMethod}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  <Section title={t("자동 QA", "Automated QA")} count={pkg.checks.length}>
                    <ul className="space-y-0.5">
                      {pkg.checks.map((c) => (
                        <li key={c.id} className="flex items-start gap-1.5">
                          {c.status === "PASS" ? (
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                          ) : c.status === "FAIL" ? (
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                          ) : (
                            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border" />
                          )}
                          <span>
                            {c.labelKo}{" "}
                            <span className="text-muted-foreground">— {c.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  <Section
                    title={t("현장 확인 우선순위", "Field verification priorities")}
                    count={pkg.fieldPlan.length}
                  >
                    <ol className="list-decimal space-y-1 pl-4">
                      {pkg.fieldPlan.map((p) => (
                        <li key={p.rank}>
                          <span className="font-medium">{p.measurement}</span>
                          <div className="text-muted-foreground">
                            {p.reason} · {p.method}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Section>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {pkg.documents.map((doc) => (
                  <Button
                    key={doc.name}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => download(doc)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    {doc.labelKo}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <span className="text-[11px] text-muted-foreground">
                  {t(
                    "이 도면은 추정 복원입니다. 트윈에 사용하면 정밀도가 '추정'으로 기록됩니다.",
                    "This drawing is an estimated reconstruction. Using it records the twin's precision as estimated.",
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  data-testid="cad-request-use"
                  onClick={() =>
                    onUseDrawing(
                      pkg.dxf.text,
                      pkg.documents[0]?.name ?? "reconstruction.dxf",
                    )
                  }
                >
                  {t("이 복원 도면 사용", "Use this reconstruction")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
