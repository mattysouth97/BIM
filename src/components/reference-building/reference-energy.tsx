"use client";

// src/components/reference-building/reference-energy.tsx
//
// The demo twin's energy profiling, on a reference building's model page.
//
// Three pieces, one seed:
//   - `useSeedReferenceEnergy` puts the building's measured recipe and its
//     materials into the same stores `/building/demo` seeds, under a `ref:`
//     key, and makes it the active building so every consumer scopes to it.
//   - `ReferenceEnergyFrame` mounts the identical instrument frame over the
//     canvas (`EnergyInstrumentHud`) plus the analysis legend, with the
//     envelope's orientation rows from the MEASURED wall split and the
//     에너지 존 rows from the model's own IfcSpace list.
//   - `ReferenceEnergyPanel` sits in the side panel: overlay toggles, what the
//     engine was handed and where each figure came from, and every named
//     assumption in full.
//
// Nothing here computes a quantity. The physics is `useEnergyMetrics`, the
// zones are `buildReferenceEnergyZones`, and the frame is the demo's.

import { useEffect, useMemo, useState } from "react";

import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useLayerStore } from "@/store/layer-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { getClimateData } from "@/lib/energy/climate-data";
import { EnergyInstrumentHud } from "@/components/twin/energy-instrument-hud";
import { AnalysisLegend } from "@/components/viewer/analysis-legend";
import {
  useEnvelopeAnalysis,
  type EnvelopeAnalysis,
} from "@/components/viewer/envelope-layer";
import type { OrientationWwrRow } from "@/lib/layers/analysis/envelope-overlay";
import type { EnergyZone } from "@/lib/layers/analysis/zone-overlay";
import type { AnalysisOverlayId } from "@/lib/layers/analysis/overlay-types";
import type {
  ReferenceBuildingManifest,
  ReferenceBuildingSpaces,
} from "@/lib/reference-buildings/manifest";
import type {
  Orientation,
  ReferenceBuildingEnergyInputs,
} from "@/lib/reference-buildings/energy-inputs";
import { buildReferenceEnergyZones } from "@/lib/reference-buildings/zones";

const ORIENTATIONS: readonly Orientation[] = ["N", "E", "S", "W"];

/**
 * Seed the stores the demo path reads. Materials are replaced unless the
 * user has edited them (`source: "user-input"`), so a corrected constant in
 * the building's file wins over a stale persisted copy; the base recipe is
 * always the building's, and any overrides live beside it untouched.
 */
export function useSeedReferenceEnergy(energy: ReferenceBuildingEnergyInputs | null) {
  const setProperties = useMaterialStore((s) => s.setProperties);
  const setActivePk = useMaterialStore((s) => s.setActivePk);
  const setBaseRecipe = useRecipeStore((s) => s.setBaseRecipe);
  const setActiveBuilding = useActiveBuildingStore((s) => s.setActiveBuilding);

  useEffect(() => {
    if (!energy) return;
    const { buildingPk, recipe, materials, climate } = energy;
    const existing = useMaterialStore.getState().properties[buildingPk];
    if (!existing || existing.source !== "user-input") {
      setProperties(buildingPk, materials);
    }
    setBaseRecipe(buildingPk, recipe);
    setActivePk(buildingPk);
    setActiveBuilding(buildingPk, climate.sigunguCd);
  }, [energy, setProperties, setBaseRecipe, setActivePk, setActiveBuilding]);
}

/** The measured wall split, under the uniform ratio the engine applies. */
function measuredOrientationRows(
  energy: ReferenceBuildingEnergyInputs,
  wwr: Record<Orientation, number>,
): OrientationWwrRow[] {
  const net = ORIENTATIONS.reduce((sum, o) => sum + energy.wallByOrientationSqm[o], 0);
  const gross = envelopeQuantities(energy.recipe).grossWallAreaSqm;
  // Openings are not measured per orientation, so each sector's gross is
  // its measured opaque share of the whole gross — the only split that
  // keeps the four windows summing to the building's measured aperture.
  const scale = net > 0 ? gross / net : 1;
  return ORIENTATIONS.map((orientation) => {
    const grossWallAreaSqm = energy.wallByOrientationSqm[orientation] * scale;
    return {
      orientation,
      grossWallAreaSqm,
      windowAreaSqm: grossWallAreaSqm * wwr[orientation],
      wwr: wwr[orientation],
    };
  });
}

function useReferenceZones(
  manifest: ReferenceBuildingManifest,
  baseUrl: string,
  hvacDemandKwhYr: number | undefined,
): EnergyZone[] | null {
  const [spaces, setSpaces] = useState<ReferenceBuildingSpaces | null>(null);
  const spacesFile = manifest.spacesFile;

  useEffect(() => {
    if (!spacesFile) return;
    const controller = new AbortController();
    fetch(`${baseUrl}/${spacesFile}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ReferenceBuildingSpaces | null) => {
        if (json && json.kind === "bimfit_reference_building_spaces") setSpaces(json);
      })
      .catch(() => {
        /* aborted or unavailable: the legend says "needs Room elements" */
      });
    return () => controller.abort();
  }, [baseUrl, spacesFile]);

  return useMemo(() => {
    if (!spaces || !manifest.storeys || hvacDemandKwhYr == null) return null;
    return buildReferenceEnergyZones(spaces.spaces, manifest.storeys, hvacDemandKwhYr);
  }, [spaces, manifest.storeys, hvacDemandKwhYr]);
}

export function ReferenceEnergyFrame({
  energy,
  manifest,
  baseUrl,
  locale,
}: {
  energy: ReferenceBuildingEnergyInputs;
  manifest: ReferenceBuildingManifest;
  baseUrl: string;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";
  const { buildingPk, recipe, climate } = energy;
  const quantities = envelopeQuantities(recipe);
  const metrics = useEnergyMetrics(buildingPk, climate.sigunguCd);
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const viewerEnvelope = useEnvelopeAnalysis(buildingPk);

  const envelopeOverride = useMemo<EnvelopeAnalysis | null>(() => {
    if (!viewerEnvelope || !materials) return null;
    const wwr = materials.envelope.windows.windowToWallRatio;
    const note = isKo
      ? `벽면적은 방위별 측정값. 창면적비는 전 방위 균등 가정 (A-WWR-DENOMINATOR)${energy.northAssumed ? " · 북쪽은 모델의 −Z 축 (진북 미기재)" : ""}.`
      : `Wall areas are measured per orientation. The ratio is assumed uniform (A-WWR-DENOMINATOR)${energy.northAssumed ? " · north is the model's −Z (no true north stated)" : ""}.`;
    return {
      ...viewerEnvelope,
      orientationWwr: measuredOrientationRows(energy, wwr),
      orientationWwrNote: note,
    };
  }, [viewerEnvelope, materials, energy, isKo]);

  const zones = useReferenceZones(manifest, baseUrl, metrics?.demand.totalDemand);

  return (
    <>
      <EnergyInstrumentHud
        buildingPk={buildingPk}
        totalFloorArea={quantities.intensityFloorAreaSqm}
        footprintArea={quantities.planAreaSqm}
        roofType="flat"
        sidoPrefix={climate.sigunguCd.slice(0, 2)}
      />
      {/* The legend positions itself `absolute left-3 top-16`; this wrapper
          moves its origin below the frame's top band and stops above the
          bottom strip, and scrolls: the Clinic's zone list is ten programs
          deep and would otherwise run under the strip and be cut off. */}
      <div className="absolute bottom-40 left-0 top-32 z-10 w-80 overflow-y-auto">
        <AnalysisLegend
          buildingPk={buildingPk}
          envelopeAnalysisOverride={envelopeOverride}
          zoneAnalysisOverride={zones}
        />
      </div>
    </>
  );
}

const OVERLAYS: readonly Readonly<{ id: AnalysisOverlayId; ko: string; en: string; detailKo: string; detailEn: string }>[] = [
  {
    id: "overlay-envelope",
    ko: "외피 열손실",
    en: "Envelope heat loss",
    detailKo: "요소별 열손실계수 W/K · 방위별 창면적비",
    detailEn: "Heat-loss coefficient per element, W/K · WWR by orientation",
  },
  {
    id: "overlay-zone",
    ko: "에너지 존",
    en: "Energy zones",
    detailKo: "IfcSpace를 층×용도로 묶어 냉난방 수요를 면적 비례 배분",
    detailEn: "IfcSpace rows grouped by storey × program, HVAC demand apportioned by area",
  },
];

export function ReferenceEnergyPanel({
  energy,
  manifest,
  locale,
}: {
  energy: ReferenceBuildingEnergyInputs;
  manifest: ReferenceBuildingManifest;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";
  const overlays = useLayerStore((s) => s.analysisOverlays);
  const setOverlay = useLayerStore((s) => s.setAnalysisOverlayVisible);
  const quantities = envelopeQuantities(energy.recipe);
  const climate = getClimateData(energy.climate.sigunguCd);
  const materials = useMaterialStore((s) => s.properties[energy.buildingPk]);
  const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });
  const wwr = materials?.envelope.windows.windowToWallRatio.S;

  return (
    <section className="mt-6" data-testid="reference-model-energy">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {isKo ? "에너지 프로파일 · 분석 오버레이" : "Energy profile · analysis overlays"}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {isKo
          ? "캔버스 위의 계기판은 /building/demo와 같은 엔진(도일법)입니다. 외피 면적은 이 파일에서 측정한 값이고, U-값·창·기밀·설비·재실은 아래에 이름 붙인 가정입니다."
          : "The frame over the canvas is the same degree-day engine as /building/demo. Envelope areas are measured from this file; U-values, glazing, airtightness, systems and occupancy are the named assumptions below."}
      </p>

      <div className="mt-2">
        {OVERLAYS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOverlay(o.id, !overlays[o.id])}
            aria-pressed={overlays[o.id]}
            data-testid={`reference-model-overlay-${o.id}`}
            className="flex w-full items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition-colors hover:bg-muted/60"
          >
            <span
              aria-hidden
              className="mt-[3px] size-2.5 shrink-0 rounded-full border"
              style={{
                backgroundColor: overlays[o.id] ? "#8fd3b6" : "transparent",
                borderColor: "#8fd3b6",
              }}
            />
            <span className="min-w-0">
              <span className={`block truncate text-[11px] ${overlays[o.id] ? "text-foreground" : "text-muted-foreground"}`}>
                {isKo ? o.ko : o.en}
              </span>
              <span className="block truncate font-mono text-[9px] text-muted-foreground">
                {isKo ? o.detailKo : o.detailEn}
              </span>
            </span>
          </button>
        ))}
      </div>

      <dl className="mt-4">
        <Handed
          label={isKo ? "기후" : "Climate"}
          value={isKo ? energy.climate.labelKo : energy.climate.labelEn}
          read={`HDD ${fmt(climate.hdd, 0)} · CDD ${fmt(climate.cdd, 0)} · ${isKo ? "설계외기" : "design"} ${climate.winterDesignTemp} °C · ${energy.climate.assumptionId}`}
        />
        <Handed
          label={isKo ? "외벽 (총)" : "Gross wall"}
          value={`${fmt(quantities.grossWallAreaSqm)} m²`}
          read={
            wwr != null
              ? isKo
                ? `창 ${fmt(quantities.grossWallAreaSqm * wwr)} m² (WWR ${fmt(wwr * 100)} %) · 불투명 ${fmt(quantities.grossWallAreaSqm * (1 - wwr))} m² (문 포함)`
                : `windows ${fmt(quantities.grossWallAreaSqm * wwr)} m² (WWR ${fmt(wwr * 100)} %) · opaque ${fmt(quantities.grossWallAreaSqm * (1 - wwr))} m² (doors included)`
              : "—"
          }
        />
        <Handed
          label={isKo ? "지붕 · 바닥 · 체적" : "Roof · ground · volume"}
          value={`${fmt(quantities.roofAreaSqm)} · ${fmt(quantities.planAreaSqm)} m² · ${fmt(quantities.volumeM3, 0)} m³`}
          read={
            manifest.areas.roomVolumeNetM3 != null
              ? isKo
                ? `체적은 기밀선 내부(층고 기준). 실 솔리드 합은 ${fmt(manifest.areas.roomVolumeNetM3, 0)} m³ — 천장까지만.`
                : `Volume is inside the air barrier (storey height). The room solids sum to ${fmt(manifest.areas.roomVolumeNetM3, 0)} m³ — to the ceilings only.`
              : quantities.source
          }
        />
      </dl>
      <p className="mt-2 font-mono text-[9px] leading-relaxed text-muted-foreground">
        {energy.recipe.measuredEnvelope?.basis ?? (isKo ? "외곽선 압출" : "extruded from the footprint")}
      </p>

      <details className="mt-4 group">
        <summary className="cursor-pointer text-[11px] text-foreground">
          {isKo
            ? `가정 ${energy.assumptions.length}건 — 모두 이름 붙임`
            : `${energy.assumptions.length} assumptions, every one named`}
        </summary>
        <ol className="mt-2 space-y-2">
          {energy.assumptions.map((a) => (
            <li key={a.id} className="border-t border-border pt-2" data-testid={`reference-assumption-${a.id}`}>
              <p className="font-mono text-[10px] text-foreground">
                {a.id} · {a.assumes}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{a.why}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/** A figure the engine was handed, and how it was arrived at. */
function Handed({ label, value, read }: { label: string; value: string; read: string }) {
  return (
    <div className="border-t border-border py-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-foreground">{value}</dd>
      <dd className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">{read}</dd>
    </div>
  );
}
