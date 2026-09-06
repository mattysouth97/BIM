import { Download } from "lucide-react";
import type { ReferenceBuildingId } from "@/lib/reference-buildings/manifest";

/** Mount inside an existing model page or the gallery; this adds no workflow step. */
export function ReferenceDatasetDownloads({
  buildingId,
  locale = "ko",
}: {
  buildingId?: ReferenceBuildingId;
  locale?: "ko" | "en";
}) {
  const ko = locale === "ko";
  const linkClass = "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted";
  return (
    <section data-testid="reference-dataset-downloads" className="space-y-2">
      <p className="text-xs font-medium">{ko ? "에너지 데이터 다운로드" : "Download energy data"}</p>
      <p className="text-xs text-muted-foreground">
        {ko ? "공개 기준 모델 · 모델에서 측정한 형상과 가정 포함 · 에너지는 계산값" : "Published baseline · model geometry and assumptions · energy is modeled"}
      </p>
      <div className="flex flex-wrap gap-2">
        {buildingId && <a className={linkClass} href={`/api/reference-buildings/${buildingId}/dataset`} download>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />{ko ? "이 모델 JSON" : "Model JSON"}
        </a>}
        <a className={linkClass} href="/api/reference-buildings/datasets" download>{ko ? "전체 JSON" : "All JSON"}</a>
        <a className={linkClass} href="/api/reference-buildings/datasets?format=csv" download>{ko ? "목록 CSV" : "Catalogue CSV"}</a>
      </div>
    </section>
  );
}
