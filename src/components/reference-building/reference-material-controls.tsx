"use client";

import type { MaterialGeometryStatus } from "./reference-material-geometry";

export function ReferenceMaterialControls({ available, enabled, status, isKo, onToggle, onRetry }: {
  available: boolean;
  enabled: boolean;
  status: MaterialGeometryStatus;
  isKo: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  if (!available) return <p className="mb-4 text-xs leading-relaxed text-muted-foreground" data-testid="reference-material-unavailable">
    {isKo ? "이 모델은 표면과 재료층의 연결 데이터가 없어 원본 외피로 표시합니다." : "This model has no published surface-to-material bindings; original fabric appearance is shown."}
  </p>;
  return <section className="mb-4 rounded-md border border-border p-3" data-testid="reference-material-controls">
    <button type="button" aria-pressed={enabled} onClick={onToggle} data-testid="reference-material-toggle"
      className="flex min-h-9 w-full items-center justify-between gap-3 rounded-sm text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <span>{isKo ? "재료 표현" : "Material appearance"}</span>
      <span className="text-muted-foreground">{enabled ? (isKo ? "켜짐" : "On") : (isKo ? "꺼짐" : "Off")}</span>
    </button>
    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground" data-testid="reference-material-basis">
      {isKo ? "다층 구성은 가장 두꺼운 원본 층을 대표 예시로 사용합니다. 실제 외부 마감은 확인되지 않았습니다." : "Layer sets use their thickest source layer as an illustrative representative. The exterior finish is unverified."}
    </p>
    <p className={`mt-2 text-[11px] ${enabled && status === "error" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}
      role={enabled && status === "error" ? "alert" : "status"} data-testid="reference-material-status" data-status={enabled ? status : "off"}>
      {!enabled ? (isKo ? "원본 외피 표현" : "Original fabric appearance")
        : status === "ready" ? (isKo ? "재료 예시 준비됨 · 표면을 선택해 층 구성 확인" : "Material appearance ready · select a surface to inspect its layers")
        : status === "error" ? (isKo ? "재료 표현을 불러오지 못했습니다. 원본 외피 보기는 계속 사용할 수 있습니다." : "Material appearance could not load. Original fabric remains available.")
        : status === "loading" ? (isKo ? "재료 표현을 불러오는 중…" : "Loading material appearance…")
        : (isKo ? "외피가 준비되면 재료 예시를 불러옵니다." : "Material appearance loads after the fabric is ready.")}
    </p>
    {enabled && status === "error" ? <button type="button" onClick={onRetry} data-testid="reference-material-retry" className="mt-2 min-h-8 rounded-md border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring">{isKo ? "다시 불러오기" : "Retry loading"}</button> : null}
  </section>;
}
