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
    <section className="mt-5 border-y border-border py-3" aria-label={isKo ? "모델 보기" : "Model view"}>
      <div className="flex gap-1.5">
        {(["exterior", "roof"] as const).map((view) => (
          <button key={view} type="button" onClick={() => onView(view)}
            data-testid={`reference-view-${view}`}
            className="min-h-8 flex-1 rounded-md border border-border bg-card px-2 text-xs text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {view === "exterior" ? (isKo ? "외관 · 화면 맞춤" : "Fit exterior") : (isKo ? "지붕 내려다보기" : "Look down at roof")}
          </button>
        ))}
      </div>
      <button type="button" onClick={onInspection} aria-pressed={inspection}
        data-testid="reference-view-inspection"
        className="mt-2 min-h-8 w-full rounded-md border border-border px-2 text-xs text-foreground hover:bg-muted aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {inspection ? (isKo ? "에너지 패널 다시 보기" : "Show energy panels") : (isKo ? "모델 집중 보기" : "Focus on model")}
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground" data-requested-view={request.view}>
        {isKo ? "드래그 회전 · 스크롤 확대 · 우클릭 드래그 이동" : "Drag to orbit · scroll to zoom · right-drag to pan"}
      </p>
    </section>
  );
}
