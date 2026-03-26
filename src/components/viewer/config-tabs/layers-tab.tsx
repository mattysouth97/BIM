"use client";

import { useAppStore } from "@/store/app-store";
import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, type LayerId } from "@/lib/layers/types";
import { Slider } from "@/components/ui/slider";
import { Eye, EyeOff } from "lucide-react";

interface LayersTabProps {
  buildingPk: string;
}

/** Context-specific density label per layer */
const DENSITY_LABELS: Record<LayerId, { ko: string; en: string }> = {
  1: { ko: "디테일 수준", en: "Detail Level" },
  2: { ko: "배관 밀도", en: "Pipe Density" },
  3: { ko: "센서 간격", en: "Sensor Spacing" },
  4: { ko: "엘리베이터 수", en: "Elevator Count" },
  5: { ko: "스프링클러 밀도", en: "Sprinkler Density" },
  6: { ko: "배선 수", en: "Conduit Count" },
  7: { ko: "배터리 유닛", en: "Battery Units" },
  8: { ko: "노드 밀도", en: "Node Density" },
  9: { ko: "슈트 수", en: "Chute Count" },
  10: { ko: "패널 디테일", en: "Panel Detail" },
};

const ALL_LAYER_IDS: LayerId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
          <div key={id} className="rounded-md border p-2.5 space-y-2">
            {/* Header row: colored dot, name, toggle */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-xs font-medium flex-1 truncate">
                {config.name}
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
            <div className="space-y-1">
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
