"use client";

// src/components/viewer/analysis-legend.tsx
// DOM legend for the three analysis overlays. Renders only for overlays the
// user has switched on, and only formats values the pure builders produced —
// no quantity is computed here.

import { useLayerStore } from "@/store/layer-store";
import { useT } from "@/lib/i18n";
import {
  ANALYSIS_BAND_COLORS,
  ANALYSIS_OVERLAY_CONFIGS,
} from "@/lib/layers/analysis/overlay-types";
import { STRUCTURE_ROLE_COLORS } from "@/lib/layers/analysis/structure-overlay";
import {
  summariseZonesByProgram,
  type EnergyZone,
} from "@/lib/layers/analysis/zone-overlay";
import {
  useEnvelopeAnalysis,
  type EnvelopeAnalysis,
} from "./envelope-layer";
import { useStructureAnalysis } from "./structure-layer";
import { useEnergyZoneAnalysis } from "./energy-zone-layer";

interface AnalysisLegendProps {
  buildingPk: string;
  envelopeAnalysisOverride?: EnvelopeAnalysis | null;
  zoneAnalysisOverride?: readonly EnergyZone[] | null;
}

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function pct(fraction: number): string {
  return `${one.format(fraction * 100)}%`;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function AnalysisLegend({
  buildingPk,
  envelopeAnalysisOverride,
  zoneAnalysisOverride,
}: AnalysisLegendProps) {
  const overlays = useLayerStore((s) => s.analysisOverlays);
  const { t } = useT();

  const viewerEnvelope = useEnvelopeAnalysis(buildingPk);
  const structure = useStructureAnalysis(buildingPk);
  const viewerZones = useEnergyZoneAnalysis(buildingPk);
  const envelope =
    envelopeAnalysisOverride === undefined
      ? viewerEnvelope
      : envelopeAnalysisOverride;
  const zones =
    zoneAnalysisOverride === undefined ? viewerZones : zoneAnalysisOverride;

  const anyOn =
    overlays["overlay-envelope"] ||
    overlays["overlay-structure"] ||
    overlays["overlay-zone"];
  if (!anyOn) return null;

  const zoneRows = zones ? summariseZonesByProgram(zones) : [];

  return (
    <div className="pointer-events-none absolute left-3 top-16 z-10 w-64 space-y-2">
      {/* Shared colour ramp */}
      <div className="rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{t("낮음", "Low")}</span>
          <span className="font-medium">{t("분담률", "Share")}</span>
          <span>{t("높음", "High")}</span>
        </div>
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full">
          {ANALYSIS_BAND_COLORS.map((color) => (
            <span key={color} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>

      {/* 외피 */}
      {overlays["overlay-envelope"] && (
        <div className="rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
          <p className="text-xs font-semibold">
            {t(
              ANALYSIS_OVERLAY_CONFIGS["overlay-envelope"].nameKo,
              ANALYSIS_OVERLAY_CONFIGS["overlay-envelope"].name,
            )}
            <span className="ml-1.5 font-normal text-[10px] text-muted-foreground">
              {envelope?.resultSemantics.source === "selected_simulation_run"
                ? t("선택 실행", "selected run")
                : t("추정", "estimated")}
            </span>
          </p>
          {!envelope ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("재료/레시피 데이터 없음", "No material or recipe data")}
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("총 열손실계수", "Total H")} {int.format(envelope.totalHWPerK)} W/K
              </p>
              <ul className="mt-1.5 space-y-1">
                {envelope.shares.map((share) => (
                  <li
                    key={share.element}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <Dot color={share.color} />
                    <span className="flex-1 truncate">
                      {t(share.labelKo, share.labelEn)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {int.format(share.hCoefficientWPerK)} W/K
                    </span>
                    <span className="w-10 text-right tabular-nums font-medium">
                      {pct(share.share)}
                    </span>
                  </li>
                ))}
              </ul>
              {envelope.orientationWwr ? (
                <div className="mt-2 border-t pt-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t("방위별 창면적비 (WWR)", "Window-to-wall ratio by orientation")}
                  </p>
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {envelope.orientationWwr.map((row) => (
                      <li
                        key={row.orientation}
                        className="flex items-center justify-between text-[10px]"
                      >
                        <span className="text-muted-foreground">{row.orientation}</span>
                        <span className="tabular-nums">
                          {pct(row.wwr)}
                          <span className="ml-1 text-muted-foreground">
                            {one.format(row.windowAreaSqm)} m²
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 border-t pt-1.5 text-[10px] text-muted-foreground">
                  {t(
                    "방위별 WWR: 외곽선 폴리곤이 있어야 산출됩니다",
                    "Orientation WWR needs a footprint polygon",
                  )}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 구조 */}
      {overlays["overlay-structure"] && (
        <div className="rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
          <p className="text-xs font-semibold">
            {t(
              ANALYSIS_OVERLAY_CONFIGS["overlay-structure"].nameKo,
              ANALYSIS_OVERLAY_CONFIGS["overlay-structure"].name,
            )}
          </p>
          {!structure ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("레시피 데이터 없음", "No recipe data")}
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {structure.source === "snapshot"
                  ? t("출처: BIM 스냅샷", "Source: BIM snapshot")
                  : t("출처: 레시피 추정", "Source: recipe (estimated)")}
              </p>
              <ul className="mt-1.5 space-y-1 text-[11px]">
                <li className="flex items-center gap-2">
                  <Dot color={STRUCTURE_ROLE_COLORS.column} />
                  <span className="flex-1">{t("기둥", "Columns")}</span>
                  <span className="tabular-nums">{int.format(structure.columns.length)}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Dot color={STRUCTURE_ROLE_COLORS.beam} />
                  <span className="flex-1">{t("보", "Framing")}</span>
                  <span className="tabular-nums">{int.format(structure.beams.length)}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Dot color={STRUCTURE_ROLE_COLORS.slab} />
                  <span className="flex-1">{t("슬래브", "Slabs")}</span>
                  <span className="tabular-nums">{int.format(structure.slabs.length)}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Dot color={STRUCTURE_ROLE_COLORS.core} />
                  <span className="flex-1">{t("코어", "Core")}</span>
                  <span className="tabular-nums">{int.format(structure.core.length)}</span>
                </li>
              </ul>
              <p className="mt-1.5 border-t pt-1.5 text-[10px] text-muted-foreground">
                {structure.grids.length > 0
                  ? t(
                      `그리드 ${structure.grids.length}선 (X/Z 축만)`,
                      `${structure.grids.length} grid lines (x/z axes only)`,
                    )
                  : t("그리드 정보 없음", "No grid lines in the model")}
              </p>
            </>
          )}
        </div>
      )}

      {/* 에너지존 */}
      {overlays["overlay-zone"] && (
        <div className="rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
          <p className="text-xs font-semibold">
            {t(
              ANALYSIS_OVERLAY_CONFIGS["overlay-zone"].nameKo,
              ANALYSIS_OVERLAY_CONFIGS["overlay-zone"].name,
            )}
            <span className="ml-1.5 font-normal text-[10px] text-muted-foreground">
              {zones?.[0]?.resultSemantics.source === "selected_simulation_run"
                ? t("선택 실행", "selected run")
                : t("추정", "estimated")}
            </span>
          </p>
          {zoneRows.length === 0 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t(
                "실(Room) 요소가 있는 모델에서만 표시됩니다",
                "Needs a model with Room elements",
              )}
            </p>
          ) : (
            <>
              <ul className="mt-1.5 space-y-1">
                {zoneRows.map((row) => (
                  <li
                    key={row.programKey}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <Dot color={row.color} />
                    <span className="flex-1 truncate">
                      {t(row.labelKo, row.labelEn)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {int.format(row.areaSqm)} m²
                    </span>
                    <span className="w-16 text-right tabular-nums font-medium">
                      {row.resultValueKwhPerYear == null
                        ? row.notApplicableZoneCount > 0
                          ? t("해당 없음", "N/A")
                          : t("값 없음", "Missing")
                        : `${int.format(row.resultValueKwhPerYear)} kWh/yr`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t pt-1.5 text-[10px] leading-tight text-muted-foreground">
                {t(
                  "존 수요 = 존 바닥면적 비율 × 건물 난방·냉방 수요. 용도별 원단위는 반영되지 않은 추정치입니다.",
                  "Zone demand = zone floor-area share × building heating+cooling demand. Uniform apportionment — per-program intensities are not modelled.",
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
