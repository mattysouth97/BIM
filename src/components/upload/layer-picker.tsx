"use client";

import type { FootprintCandidate } from "@/lib/cad/dxf-parser";
import { pick } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FootprintPreview } from "./footprint-preview";

interface LayerPickerProps {
  candidates: FootprintCandidate[];
  selectedLayer: string | null;
  onPreview: (candidate: FootprintCandidate) => void;
  onConfirm: (candidate: FootprintCandidate) => void;
  lang?: "ko" | "en";
}

/**
 * Displayed when the parsed DXF has more than one closed polyline candidate.
 * The user picks which layer represents the building footprint.
 *
 * Two-step flow:
 *   1. Click a card  → calls onPreview (parent shows preview, Continue stays disabled)
 *   2. Click Confirm → calls onConfirm (parent transitions to ready, Continue enabled)
 */
export function LayerPicker({
  candidates,
  selectedLayer,
  onPreview,
  onConfirm,
  lang = "en",
}: LayerPickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">
        {pick(lang, "풋프린트 레이어를 선택하세요", "Select the footprint layer")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {pick(
          lang,
          `${candidates.length}개의 닫힌 폴리라인이 발견되었습니다. 건물 외곽선을 선택하세요.`,
          `${candidates.length} closed polylines found. Pick the building outline.`,
        )}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {candidates.map((cand) => {
          const isSelected = cand.layer === selectedLayer;
          return (
            <button
              key={`${cand.layer}-${cand.areaSqm}`}
              type="button"
              onClick={() => onPreview(cand)}
              data-layer={cand.layer}
              aria-pressed={isSelected}
              className={`flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">
                  {cand.layer}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {cand.areaSqm.toFixed(0)} m²
                </span>
              </div>
              <FootprintPreview
                polygon={cand.polygon}
                size={140}
                className={isSelected ? "text-primary" : "text-foreground"}
              />
              <div className="text-xs text-muted-foreground">
                {cand.vertexCount} {pick(lang, "정점", "vertices")}
              </div>
            </button>
          );
        })}
      </div>

      {selectedLayer && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            data-testid="layer-picker-confirm"
            onClick={() => {
              const found = candidates.find((c) => c.layer === selectedLayer);
              if (found) onConfirm(found);
            }}
          >
            {pick(lang, "이 레이어로 확정", "Confirm selection")}
          </Button>
        </div>
      )}
    </div>
  );
}
