"use client";

import { useAppStore } from "@/store/app-store";
import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, ALL_LAYER_IDS, type LayerId } from "@/lib/layers/types";
import { Slider } from "@/components/ui/slider";
import { Eye, EyeOff } from "lucide-react";

interface LayersTabProps {
  buildingPk: string;
}

/** Context-specific density label per Digital Twin layer */
const DENSITY_LABELS: Record<LayerId, { ko: string; en: string }> = {
  envelope: { ko: "외피 투명도", en: "Envelope Opacity" },
  structure: { ko: "구조 디테일", en: "Structure Detail" },
  mep: { ko: "설비 밀도", en: "MEP Density" },
  "energy-zones": { ko: "존 세부 수준", en: "Zone Detail Level" },
  "retrofit-targets": { ko: "표시 임계값", en: "Highlight Threshold" },
};

export function LayersTab({ buildingPk: _buildingPk }: LayersTabProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const visibility = useLayerStore((s) => s.visibility);
  const density = useLayerStore((s) => s.density);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const setDensity = useLayerStore((s) => s.setDensity);

  return (
    <div className="space-y-1 p-1">
      {ALL_LAYER_IDS.map((id) => {
        const config = LAYER_CONFIGS[id];
        const isVisible = visibility[id];
        const densityVal = density[id];
        const densityLabel = DENSITY_LABELS[id];

        return (
          <div key={id} className="rounded-md border p-2 space-y-1.5">
            {/* Header row: colored dot, name, toggle */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-[11px] font-medium flex-1 truncate">
                {isKo ? config.nameKo : config.name}
              </span>
              <button
                onClick={() => toggleLayer(id)}
                className="rounded p-1 hover:bg-muted transition-colors"
                aria-label={isVisible ? "Hide layer" : "Show layer"}
              >
                {isVisible ? (
                  <Eye className="h-3.5 w-3.5 text-foreground" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Density slider */}
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">
                  {isKo ? densityLabel.ko : densityLabel.en}
                </span>
                <span className="font-mono tabular-nums">{densityVal}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={10}
                value={[densityVal]}
                onValueChange={([v]) => setDensity(id, v)}
                disabled={!isVisible}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
