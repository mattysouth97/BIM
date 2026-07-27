// src/components/cad-viewer/layer-panel.tsx
"use client";

import { Eye, EyeOff } from "lucide-react";
import { aciToHex } from "@/lib/cad/doc/aci-colors";
import type { CadLayer } from "@/lib/cad/doc/types";

export function LayerPanel({
  layers, visibility, onToggle, onAll, isKo,
}: {
  layers: CadLayer[];
  visibility: Record<string, boolean>;
  onToggle: (name: string) => void;
  onAll: (visible: boolean) => void;
  isKo: boolean;
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
        <button
          key={l.name}
          type="button"
          data-testid={`cad-layer-${l.name}`}
          onClick={() => onToggle(l.name)}
          className={`flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted ${
            visibility[l.name] === false ? "opacity-40" : ""
          }`}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-sm border"
            style={{ backgroundColor: aciToHex(l.colorIndex) }}
          />
          <span className="truncate">{l.name}</span>
        </button>
      ))}
    </div>
  );
}
