"use client";

import { useLayerStore } from "@/store/layer-store";
import { LAYER_CONFIGS, type LayerId } from "@/lib/layers/types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface LayerPanelProps {
  visible: boolean;
  onClose: () => void;
}

const LAYER_IDS: LayerId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function LayerPanel({ visible, onClose }: LayerPanelProps) {
  const visibility = useLayerStore((s) => s.visibility);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  if (!visible) return null;

  return (
    <div className="absolute right-4 top-16 z-20 w-72 rounded-lg border bg-card/95 backdrop-blur shadow-lg animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">Building Layers</span>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Layer rows */}
      <div className="p-2 space-y-0.5">
        {LAYER_IDS.map((id) => {
          const config = LAYER_CONFIGS[id];
          const active = visibility[id];

          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleLayer(id)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
            >
              {/* Colored dot */}
              <span
                className="size-3 shrink-0 rounded-full border-2 transition-colors"
                style={{
                  borderColor: config.color,
                  backgroundColor: active ? config.color : "transparent",
                }}
              />

              {/* Layer name */}
              <span className={active ? "font-medium" : "text-muted-foreground"}>
                {config.name}
              </span>

              {/* Animated indicator */}
              {config.animated && active && (
                <span
                  className="ml-auto text-xs opacity-60"
                  title="Animated layer"
                >
                  ~
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
