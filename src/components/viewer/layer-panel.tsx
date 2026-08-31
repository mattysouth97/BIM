"use client";

import { Fragment, useState } from "react";
import { INTERIOR_LAYER_META, useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, ALL_LAYER_IDS, MEP_SUB_IDS, MEP_SUB_CONFIGS } from "@/lib/layers/types";
import {
  ANALYSIS_OVERLAY_IDS,
  ANALYSIS_OVERLAY_CONFIGS,
} from "@/lib/layers/analysis/overlay-types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { X, ChevronDown } from "lucide-react";

interface LayerPanelProps {
  visible: boolean;
  onClose: () => void;
}

// Only layers with actual model content get a toggle. Every id here maps to
// real geometry: envelope/structure → ProceduralBuilding named groups,
// mep → LayerManager MEP sub-groups, energy-zones → the energy heatmap.
// "retrofit-targets" is excluded — no generator populates it yet, and a
// toggle with no model effect reads as a broken control.
const PANEL_LAYER_IDS = ALL_LAYER_IDS.filter((id) => id !== "retrofit-targets");

export function LayerPanel({ visible, onClose }: LayerPanelProps) {
  const visibility = useLayerStore((s) => s.visibility);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const toggleMepSub = useLayerStore((s) => s.toggleMepSub);
  const airflowVisible = useLayerStore((s) => s.airflowVisible);
  const toggleAirflow = useLayerStore((s) => s.toggleAirflow);
  const mepIsolation = useLayerStore((s) => s.mepIsolation);
  const toggleMepIsolation = useLayerStore((s) => s.toggleMepIsolation);
  const analysisOverlays = useLayerStore((s) => s.analysisOverlays);
  const toggleAnalysisOverlay = useLayerStore((s) => s.toggleAnalysisOverlay);
  const interiorVisible = useLayerStore((s) => s.interiorVisible);
  const toggleInterior = useLayerStore((s) => s.toggleInterior);
  const interiorIncludeExterior = useLayerStore((s) => s.interiorIncludeExterior);
  const toggleInteriorIncludeExterior = useLayerStore(
    (s) => s.toggleInteriorIncludeExterior,
  );
  const { t } = useT();

  const [mepExpanded, setMepExpanded] = useState(true);

  if (!visible) return null;

  return (
    // z-40 keeps the panel above the floating Scene/Properties docks (z-30) —
    // previously z-20 meant the panel opened *behind* the right dock and the
    // toolbar button appeared to do nothing.
    <div className="absolute right-4 top-16 z-40 w-72 rounded-lg border bg-card/95 backdrop-blur shadow-lg animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">
          {t("디지털 트윈 레이어", "Digital Twin Layers")}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Layer rows */}
      <div className="p-2 space-y-0.5">
        {PANEL_LAYER_IDS.map((id) => {
          const config = LAYER_CONFIGS[id];
          const active = visibility[id];

          return (
            <Fragment key={id}>
              <button
                type="button"
                onClick={() => toggleLayer(id)}
                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50"
              >
                {/* Colored dot */}
                <span
                  className="mt-0.5 size-2.5 shrink-0 rounded-full border-2 transition-colors"
                  style={{
                    borderColor: config.color,
                    backgroundColor: active ? config.color : "transparent",
                  }}
                />

                {/* Layer name + description */}
                <span className="flex-1 min-w-0">
                  <span className={`block ${active ? "font-medium" : "text-muted-foreground"}`}>
                    {t(config.nameKo, config.name)}
                  </span>
                  <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                    {config.description}
                  </span>
                </span>

                {/* Chevron for MEP row only */}
                {id === "mep" && (
                  <ChevronDown
                    className={`ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ${
                      mepExpanded ? "" : "-rotate-90"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMepExpanded((prev) => !prev);
                    }}
                  />
                )}
              </button>

              {/* 설비 강조 (MEP x-ray) — ghosts the whole massing so the
                  coordinated services read; same convention as 구조 분리. */}
              {id === "mep" && mepExpanded && (
                <button
                  type="button"
                  data-testid="mep-isolation-toggle"
                  aria-pressed={mepIsolation}
                  onClick={toggleMepIsolation}
                  className="flex w-full items-center gap-3 rounded-md pl-8 pr-3 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full border transition-colors"
                    style={{
                      borderColor: "#06b6d4",
                      backgroundColor: mepIsolation ? "#06b6d4" : "transparent",
                    }}
                  />
                  <span className={mepIsolation ? "font-medium" : "text-muted-foreground"}>
                    {t("설비 강조 (건물 반투명)", "MEP x-ray (ghost the building)")}
                  </span>
                </button>
              )}

              {/* MEP sub-toggle rows — only shown when mepExpanded */}
              {id === "mep" && mepExpanded && MEP_SUB_IDS.map((subId) => {
                const subConfig = MEP_SUB_CONFIGS[subId];
                const subActive = mepSubVisibility[subId];
                return (
                  <Fragment key={subId}>
                    <button
                      type="button"
                      aria-pressed={subActive}
                      onClick={() => toggleMepSub(subId)}
                      className="flex w-full items-start gap-3 rounded-md pl-8 pr-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
                    >
                      <span
                        className="mt-0.5 size-2 shrink-0 rounded-full border-2 transition-colors"
                        style={{
                          borderColor: subConfig.color,
                          backgroundColor: subActive ? subConfig.color : "transparent",
                        }}
                      />
                      <span className={subActive ? "font-medium" : "text-muted-foreground"}>
                        {t(subConfig.nameKo, subConfig.name)}
                      </span>
                    </button>

                    {subId === "mep-hvac" && (
                      <button
                        type="button"
                        aria-pressed={airflowVisible}
                        onClick={toggleAirflow}
                        className="flex w-full items-center gap-3 rounded-md pl-12 pr-3 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full border transition-colors"
                          style={{
                            borderColor: "#67e8f9",
                            backgroundColor: airflowVisible ? "#67e8f9" : "transparent",
                          }}
                        />
                        <span className={airflowVisible ? "font-medium" : "text-muted-foreground"}>
                          {t("공기 흐름", "Airflow")}
                        </span>
                      </button>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}

        {/* 내부 요소 — the solved interior (src/lib/interior). Model content,
            not an analysis read-out, so it belongs in this section rather than
            the overlay section below. Off by default: the massing shell is
            opaque, so this is geometry the user has to ask to see. */}
        <button
          type="button"
          data-testid="interior-layer-toggle"
          aria-pressed={interiorVisible}
          onClick={toggleInterior}
          className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50"
        >
          <span
            className="mt-0.5 size-2.5 shrink-0 rounded-full border-2 transition-colors"
            style={{
              borderColor: INTERIOR_LAYER_META.color,
              backgroundColor: interiorVisible ? INTERIOR_LAYER_META.color : "transparent",
            }}
          />
          <span className="flex-1 min-w-0">
            <span className={`block ${interiorVisible ? "font-medium" : "text-muted-foreground"}`}>
              {t(INTERIOR_LAYER_META.nameKo, INTERIOR_LAYER_META.name)}
            </span>
            <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
              {t(INTERIOR_LAYER_META.descriptionKo, INTERIOR_LAYER_META.description)}
            </span>
          </span>
        </button>

        {interiorVisible && (
          <button
            type="button"
            aria-pressed={interiorIncludeExterior}
            onClick={toggleInteriorIncludeExterior}
            className="flex w-full items-center gap-3 rounded-md pl-8 pr-3 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50"
          >
            <span
              className="size-1.5 shrink-0 rounded-full border transition-colors"
              style={{
                borderColor: INTERIOR_LAYER_META.color,
                backgroundColor: interiorIncludeExterior
                  ? INTERIOR_LAYER_META.color
                  : "transparent",
              }}
            />
            <span className={interiorIncludeExterior ? "font-medium" : "text-muted-foreground"}>
              {/* The shell already draws the facade — this overlaps it. */}
              {t("외벽·창 포함 (외피와 겹침)", "Include exterior walls (overlaps the shell)")}
            </span>
          </button>
        )}
      </div>

      {/* Analysis overlays — physics / BIM read-outs drawn on top of the twin.
          Separate section (and separate store slice) from the model layers
          above, which toggle the twin's own geometry. */}
      <div className="border-t p-2 space-y-0.5">
        <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("분석 오버레이", "Analysis overlays")}
        </p>
        {ANALYSIS_OVERLAY_IDS.map((id) => {
          const config = ANALYSIS_OVERLAY_CONFIGS[id];
          const active = analysisOverlays[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => toggleAnalysisOverlay(id)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50"
            >
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full border-2 transition-colors"
                style={{
                  borderColor: config.color,
                  backgroundColor: active ? config.color : "transparent",
                }}
              />
              <span className="flex-1 min-w-0">
                <span className={`block ${active ? "font-medium" : "text-muted-foreground"}`}>
                  {t(config.nameKo, config.name)}
                </span>
                <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {t(config.descriptionKo, config.description)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
