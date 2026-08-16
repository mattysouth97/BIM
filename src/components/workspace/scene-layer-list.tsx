"use client";

import { useAppStore } from "@/store/app-store";
import { useLayerStore } from "@/store/layer-store";
import {
  LAYER_CONFIGS,
  ALL_LAYER_IDS,
  MEP_SUB_IDS,
  MEP_SUB_CONFIGS,
  type LayerId,
} from "@/lib/layers/types";

const PANEL_LAYER_IDS = ALL_LAYER_IDS.filter((id) => id !== "retrofit-targets");

export function SceneLayerList() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const visibility = useLayerStore((s) => s.visibility);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const toggleMepSub = useLayerStore((s) => s.toggleMepSub);

  return (
    <div className="border-b px-2 py-2" data-testid="scene-layer-list">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {isKo ? "레이어" : "Layers"}
      </p>
      <ul className="space-y-0.5">
        {PANEL_LAYER_IDS.map((id: LayerId) => {
          const config = LAYER_CONFIGS[id];
          const active = visibility[id];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggleLayer(id)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent/50"
              >
                <span
                  className="size-2 shrink-0 rounded-full border-2"
                  style={{
                    borderColor: config.color,
                    backgroundColor: active ? config.color : "transparent",
                  }}
                />
                <span className={active ? "font-medium" : "text-muted-foreground"}>
                  {isKo ? config.nameKo : config.name}
                </span>
              </button>
              {id === "mep" && active && (
                <ul className="ml-5 mb-1 space-y-0.5">
                  {MEP_SUB_IDS.map((sub) => {
                    const subCfg = MEP_SUB_CONFIGS[sub];
                    const on = mepSubVisibility[sub];
                    return (
                      <li key={sub}>
                        <button
                          type="button"
                          onClick={() => toggleMepSub(sub)}
                          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[10px] hover:bg-accent/40"
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: on ? subCfg.color : "transparent", outline: `1px solid ${subCfg.color}` }}
                          />
                          <span className={on ? "" : "text-muted-foreground"}>
                            {isKo ? subCfg.nameKo : subCfg.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
