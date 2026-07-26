"use client";

import { Fragment, useState } from "react";
import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, ALL_LAYER_IDS, MEP_SUB_IDS, MEP_SUB_CONFIGS } from "@/lib/layers/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { X, ChevronDown } from "lucide-react";

interface LayerPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function LayerPanel({ visible, onClose }: LayerPanelProps) {
  const visibility = useLayerStore((s) => s.visibility);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const toggleMepSub = useLayerStore((s) => s.toggleMepSub);
  const airflowVisible = useLayerStore((s) => s.airflowVisible);
  const toggleAirflow = useLayerStore((s) => s.toggleAirflow);
  const { t } = useT();

  const [mepExpanded, setMepExpanded] = useState(false);

  if (!visible) return null;

  return (
    <div className="absolute right-4 top-16 z-20 w-72 rounded-lg border bg-card/95 backdrop-blur shadow-lg animate-in slide-in-from-right-4 duration-200">
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
        {ALL_LAYER_IDS.map((id) => {
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
      </div>
    </div>
  );
}
