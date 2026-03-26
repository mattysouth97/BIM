"use client";

import { useAppStore } from "@/store/app-store";
import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, ALL_LAYER_IDS, type LayerId } from "@/lib/layers/types";
import { Slider } from "@/components/ui/slider";
import { Eye, EyeOff } from "lucide-react";

interface LayersTabProps {
  buildingPk: string;
}

/** Context-specific density label per layer */
const DENSITY_LABELS: Record<LayerId, { ko: string; en: string }> = {
  1: { ko: "디테일 수준", en: "Detail Level" },
  2: { ko: "루버 밀도", en: "Louver Density" },
  3: { ko: "냉방 배관 밀도", en: "Cooling Pipe Density" },
  4: { ko: "난방 배관 밀도", en: "Heating Pipe Density" },
  5: { ko: "환기 덕트 밀도", en: "Vent Duct Density" },
  6: { ko: "급탕 배관 밀도", en: "DHW Pipe Density" },
  7: { ko: "조명 밀도", en: "Light Fixture Density" },
  8: { ko: "특수 배관 수", en: "Media Conduit Count" },
  9: { ko: "슈트 수", en: "Chute Count" },
  10: { ko: "센서 밀도", en: "Sensor Density" },
  11: { ko: "노드 밀도", en: "Node Density" },
  12: { ko: "엘리베이터 수", en: "Elevator Count" },
  13: { ko: "방화구역 수", en: "Fire Zone Count" },
  14: { ko: "PV 패널 수", en: "PV Panel Count" },
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
            {/* Header row: colored dot, name, ZEB badge, toggle */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-[11px] font-medium flex-1 truncate">
                {isKo ? config.nameKo : config.name}
              </span>
              {config.zebLoad && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  ZEB
                </span>
              )}
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
