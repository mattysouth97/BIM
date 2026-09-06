"use client";

import type { ReferenceView } from "@/lib/rendering/reference-scene";

export type ReferenceViewRequest = { view: ReferenceView; revision: number };

export function ReferenceViewControls({ request, onView, inspection, onInspection, isKo }: {
  request: ReferenceViewRequest;
  onView: (view: ReferenceView) => void;
  inspection: boolean;
  onInspection: () => void;
  isKo: boolean;
}) {
  return (
    <section className="mb-3 grid shrink-0 grid-cols-3 gap-1.5" aria-label={isKo ? "모델 보기" : "Model view"} data-requested-view={request.view}>
        {(["exterior", "roof"] as const).map((view) => (
          <button key={view} type="button" onClick={() => onView(view)}
            data-testid={`reference-view-${view}`}
            className="min-h-9 rounded-md border border-border bg-card px-1.5 text-[11px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {view === "exterior" ? (isKo ? "화면 맞춤" : "Fit exterior") : (isKo ? "지붕 보기" : "Roof view")}
          </button>
        ))}
      <button type="button" onClick={onInspection} aria-pressed={inspection}
        data-testid="reference-view-inspection"
        className="min-h-9 rounded-md border border-border px-1.5 text-[11px] text-foreground hover:bg-muted aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {inspection ? (isKo ? "에너지 패널 보기" : "Show panels") : (isKo ? "모델 집중 보기" : "Focus on model")}
      </button>
    </section>
  );
}
