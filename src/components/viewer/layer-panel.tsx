"use client";

import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, ALL_LAYER_IDS } from "@/lib/layers/types";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface LayerPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function LayerPanel({ visible, onClose }: LayerPanelProps) {
  const visibility = useLayerStore((s) => s.visibility);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const isKo = useAppStore((s) => s.language) === "ko";

  if (!visible) return null;

  return (
    <div className="absolute right-4 top-16 z-20 w-80 max-h-[520px] overflow-y-auto rounded-lg border bg-card/95 backdrop-blur shadow-lg animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-2.5">
        <span className="text-sm font-semibold">{isKo ? "건물 시스템 레이어" : "Building Systems"}</span>
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
            <button
              key={id}
              type="button"
              onClick={() => toggleLayer(id)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
            >
              {/* Colored dot */}
              <span
                className="size-2.5 shrink-0 rounded-full border-2 transition-colors"
                style={{
                  borderColor: config.color,
                  backgroundColor: active ? config.color : "transparent",
                }}
              />

              {/* Layer name */}
              <span className={`flex-1 ${active ? "font-medium" : "text-muted-foreground"}`}>
                {isKo ? config.nameKo : config.name}
              </span>

              {/* ZEB badge */}
              {config.zebLoad && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  ZEB
                </span>
              )}

              {/* Animated indicator */}
              {config.animated && active && (
                <span className="text-xs opacity-60" title="Animated">~</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
