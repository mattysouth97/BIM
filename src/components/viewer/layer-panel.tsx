"use client";

import { Fragment, useState } from "react";
import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, ALL_LAYER_IDS, MEP_SUB_IDS, MEP_SUB_CONFIGS } from "@/lib/layers/types";
import { useAppStore } from "@/store/app-store";
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
  const isKo = useAppStore((s) => s.language) === "ko";

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
          {isKo ? "디지털 트윈 레이어" : "Digital Twin Layers"}
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
                    {isKo ? config.nameKo : config.name}
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
                  <button
                    key={subId}
                    type="button"
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
                      {isKo ? subConfig.nameKo : subConfig.name}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
