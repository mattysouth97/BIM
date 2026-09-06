"use client";

import type { ReferenceArchitecturalDetailsLayer } from "@/lib/reference-buildings/manifest";

export type ArchitecturalDetailsStatus = "waiting" | "loading" | "ready" | "error";

export function architecturalDetailsSummary(layer: ReferenceArchitecturalDetailsLayer, isKo: boolean): string {
  const rows = layer.sourceFiles.flatMap((source) => source.types);
  const queried = rows.reduce((sum, row) => sum + row.candidates, 0);
  const included = rows.reduce((sum, row) => sum + row.rendered, 0);
  const withoutMesh = rows.reduce((sum, row) => sum + row.withoutRenderedMesh, 0);
  const n = (value: number) => value.toLocaleString("en-US");
  return isKo
    ? `선택 유형의 IFC 요소 ${n(queried)}개 중 ${n(included)}개 포함 · 메시 미생성 ${n(withoutMesh)}개`
    : `${n(included)} of ${n(queried)} queried IFC elements included · ${n(withoutMesh)} without a rendered mesh`;
}

export function ReferenceArchitecturalDetails({
  layer,
  active,
  status,
  baseUrl,
  isKo,
  onToggle,
  onRetry,
}: {
  layer: ReferenceArchitecturalDetailsLayer;
  active: boolean;
  status: ArchitecturalDetailsStatus;
  baseUrl: string;
  isKo: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const size = layer.byteLength >= 1048576
    ? `${(layer.byteLength / 1048576).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(layer.byteLength / 1024))} KiB`;
  const statusText = !active
    ? isKo ? "레이어 꺼짐" : "Layer off"
    : status === "ready"
      ? isKo ? "원본 상세 불러옴" : "Source details loaded"
      : status === "error"
        ? isKo ? "건축 상세를 불러오지 못했습니다. 다른 모델 레이어는 계속 사용할 수 있습니다." : "Could not load architectural details. Other model layers remain available."
        : status === "loading"
          ? isKo ? "건축 상세 불러오는 중…" : "Loading architectural details…"
          : isKo ? "기본 모델을 불러온 뒤 상세를 표시합니다." : "Details will load after the base model.";

  return (
    <div className="mt-1" data-testid="reference-architectural-details">
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        data-testid="reference-model-layer-details"
        className="flex w-full items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className={`mt-[3px] size-2.5 shrink-0 rounded-full border border-foreground/50 ${active ? "bg-foreground/50" : "bg-transparent"}`} />
        <span className="min-w-0">
          <span className={`block text-[11px] ${active ? "text-foreground" : "text-muted-foreground"}`}>{isKo ? layer.ko : layer.en}</span>
          <span className="block text-[10px] leading-relaxed text-muted-foreground" data-testid="reference-details-source-summary">
            {architecturalDetailsSummary(layer, isKo)}
          </span>
          <span className="block font-mono text-[9px] text-muted-foreground">{size}</span>
        </span>
      </button>
      <div className="pl-6 pr-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <p role={active && status === "error" ? "alert" : "status"} data-testid="reference-details-status" data-status={active ? status : "off"}>
          {statusText}
        </p>
        {active && status === "error" ? (
          <button type="button" onClick={onRetry} className="mt-1 rounded text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="reference-details-retry">
            {isKo ? "다시 불러오기" : "Retry loading"}
          </button>
        ) : null}
        <details className="mt-1.5" data-testid="reference-details-source-breakdown">
          <summary className="cursor-pointer text-foreground/80">{isKo ? "포함한 원본 객체와 한계" : "Source objects and limits"}</summary>
          <p className="mt-1.5">
            {isKo
              ? "아래 IFC 객체 유형의 원본 형상과 배치만 포함합니다. 전체 건축·시공 상세의 완성을 뜻하지 않습니다. 색은 IFC 변환기의 원본 또는 기본 스타일이며, 거칠기 등 렌더링 설정은 가정입니다."
              : "Original geometry and placements from the IFC classes below. This is a partial architectural layer. Colours include source or tessellator default styles; rendering properties such as roughness are assumptions."}
          </p>
          {layer.sourceFiles.map((source) => (
            <div key={`${source.role}:${source.sha256}`} className="mt-2">
              <p className="break-words font-mono text-[9px]">{source.fileName} · {source.role}</p>
              <table className="mt-1 w-full text-left text-[9px]">
                <caption className="sr-only">{source.fileName} — {isKo ? "IFC 유형별 추출 범위" : "IFC extraction by class"}</caption>
                <thead><tr>
                  <th scope="col">IFC</th>
                  <th scope="col" className="text-right">{isKo ? "조회" : "Queried"}</th>
                  <th scope="col" className="text-right">{isKo ? "포함" : "Included"}</th>
                  <th scope="col" className="text-right">{isKo ? "메시 없음" : "No mesh"}</th>
                </tr></thead>
                <tbody>{source.types.map((row) => (
                  <tr key={row.type}>
                    <th scope="row" className="font-normal">{row.type}</th>
                    <td className="text-right tabular-nums">{row.candidates.toLocaleString("en-US")}</td>
                    <td className="text-right tabular-nums">{row.rendered.toLocaleString("en-US")}</td>
                    <td className="text-right tabular-nums">{row.withoutRenderedMesh.toLocaleString("en-US")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          {layer.selectionNote ? <p className="mt-2">{layer.selectionNote}</p> : null}
          <a href={`${baseUrl}/${layer.indexFile}`} download className="mt-2 inline-block underline underline-offset-2">
            {isKo ? "원본 요소 색인 내려받기 (JSON)" : "Download source element index (JSON)"}
          </a>
        </details>
      </div>
    </div>
  );
}
