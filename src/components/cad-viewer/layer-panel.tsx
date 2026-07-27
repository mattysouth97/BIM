// src/components/cad-viewer/layer-panel.tsx
"use client";

import { Eye, EyeOff, Plus } from "lucide-react";
import { aciToHex } from "@/lib/cad/doc/aci-colors";
import type { CadLayer } from "@/lib/cad/doc/types";

export function LayerPanel({
  layers, visibility, onToggle, onAll, isKo,
  activeLayer, onSetActive, onAddLayer,
}: {
  layers: CadLayer[];
  visibility: Record<string, boolean>;
  onToggle: (name: string) => void;
  onAll: (visible: boolean) => void;
  isKo: boolean;
  activeLayer?: string;
  onSetActive?: (name: string) => void;
  onAddLayer?: (name: string) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/20 p-2 text-sm">
      <div className="flex items-center justify-between px-1 pb-1 text-xs font-semibold text-muted-foreground">
        <span>{isKo ? "레이어" : "Layers"} ({layers.length})</span>
        <span className="flex gap-1">
          <button type="button" className="hover:text-foreground" onClick={() => onAll(true)} title={isKo ? "모두 표시" : "Show all"}>
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => onAll(false)} title={isKo ? "모두 숨기기" : "Hide all"}>
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {layers.map((l) => (
        <div
          key={l.name}
          className={`flex items-center gap-1 rounded px-1 ${
            visibility[l.name] === false ? "opacity-40" : ""
          }`}
        >
          {onSetActive && (
            <button
              type="button"
              onClick={() => onSetActive(l.name)}
              title={isKo ? "활성 레이어로" : "Set active layer"}
              data-testid={`cad-layer-active-${l.name}`}
              className="p-0.5"
            >
              <span
                className={`block h-2 w-2 rounded-full border ${
                  activeLayer === l.name ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}
              />
            </button>
          )}
          <button
            type="button"
            data-testid={`cad-layer-${l.name}`}
            onClick={() => onToggle(l.name)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded px-0.5 py-1 text-left hover:bg-muted"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-sm border"
              style={{ backgroundColor: aciToHex(l.colorIndex) }}
            />
            <span className="truncate">{l.name}</span>
          </button>
        </div>
      ))}
      {onAddLayer && (
        <button
          type="button"
          data-testid="cad-add-layer"
          className="mt-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => {
            const name = window.prompt(isKo ? "새 레이어 이름:" : "New layer name:");
            if (name?.trim()) onAddLayer(name.trim().toUpperCase());
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {isKo ? "레이어 추가" : "Add layer"}
        </button>
      )}
    </div>
  );
}
