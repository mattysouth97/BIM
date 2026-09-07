"use client";

import type { FootprintCandidate } from "@/lib/cad/dxf-parser";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FootprintPreview } from "./footprint-preview";

interface LayerPickerProps {
  candidates: FootprintCandidate[];
  /**
   * Index into `candidates`, not a layer name: two closed rings on the same
   * DXF layer (layer "0" is the common case) are different footprints, and
   * keying by name highlighted both and committed the first match.
   */
  selectedIndex: number | null;
  onPreview: (index: number, candidate: FootprintCandidate) => void;
  onConfirm: (candidate: FootprintCandidate) => void;
  lang?: "ko" | "en";
}

/**
 * Displayed when the parsed DXF has more than one closed polyline candidate.
 * The user picks which ring represents the building footprint.
 *
 * Two-step flow:
 *   1. Click a card  → calls onPreview (parent shows preview, Continue stays disabled)
 *   2. Click Confirm → calls onConfirm (parent transitions to ready, Continue enabled)
 */
// Pattern: Kokonut UI "avatar-picker" (kokonutui.com) — large stage of the current choice over an aria-pressed thumbnail strip, rebuilt on shadcn tokens with index keying.
export function LayerPicker({
  candidates,
  selectedIndex,
  onPreview,
  onConfirm,
  lang = "en",
}: LayerPickerProps) {
  const stage: FootprintCandidate | undefined = candidates[selectedIndex ?? 0];

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

      {stage && (
        <div
          className="flex flex-col items-center gap-2 rounded-md border bg-muted/30 p-4"
          data-testid="layer-picker-stage"
        >
          <FootprintPreview polygon={stage.polygon} size={260} className="text-primary" />
          <p className="text-xs text-muted-foreground">
            {pick(lang, "미리보기", "Preview")} ·{" "}
            <span className="font-medium text-foreground">{stage.layer}</span> ·{" "}
            <span className="tabular-nums">
              {stage.areaSqm.toFixed(0)} m² · {stage.vertexCount}{" "}
              {pick(lang, "정점", "vertices")}
            </span>
          </p>
        </div>
      )}

      <div
        role="group"
        aria-label={pick(lang, "후보 외곽선", "Candidate outlines")}
        className="flex flex-wrap gap-2"
      >
        {candidates.map((cand, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={`${index}-${cand.layer}`}
              type="button"
              data-layer={cand.layer}
              data-candidate-index={index}
              aria-pressed={isSelected}
              onClick={() => onPreview(index, cand)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors motion-reduce:transition-none",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-ring/40"
                  : "border-muted-foreground/25 hover:border-muted-foreground/60",
              )}
            >
              <FootprintPreview
                polygon={cand.polygon}
                size={96}
                className={isSelected ? "text-primary" : "text-foreground"}
              />
              <span
                className="max-w-[6rem] truncate text-[11px] font-medium"
                title={cand.layer}
              >
                {cand.layer}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {cand.areaSqm.toFixed(0)} m²
              </span>
            </button>
          );
        })}
      </div>

      {selectedIndex !== null && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            data-testid="layer-picker-confirm"
            onClick={() => {
              const chosen =
                selectedIndex === null ? undefined : candidates[selectedIndex];
              if (chosen) onConfirm(chosen);
            }}
          >
            {/* "This outline", not "this layer": two rings can share a layer,
                and the card the user pressed is the ring that is committed. */}
            {pick(lang, "이 외곽선으로 확정", "Confirm this outline")}
          </Button>
        </div>
      )}
    </div>
  );
}
