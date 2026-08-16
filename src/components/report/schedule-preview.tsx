"use client";

import { useAppStore } from "@/store/app-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useTwinDocument, TWIN_SCHEDULE_IDS } from "@/hooks/use-twin-document";
import { scheduleName } from "@/lib/bim/schedules/schedule-i18n";
import { ScheduleTable } from "@/components/workspace/bim-schedule-panel";

export function SchedulePreview() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const buildingPk = useActiveBuildingPk();
  const { schedules, sheets, phase } = useTwinDocument(
    buildingPk,
    isKo ? "ko" : "en",
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6" data-testid="schedule-preview">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "자동 산출" : "Autonomous takeoff"}
        </p>
        <h2 className="text-lg font-semibold">
          {isKo ? "일람표 · 도면 시트" : "Schedules · Sheets"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {phase === "retrofit"
            ? isKo
              ? "개보수 단계 기준. 벽·창·설비·층은 트윈에서 바로 뽑힙니다."
              : "Retrofit phase. Walls, openings, plant and floors come from the twin."
            : isKo
              ? "현황 기준. 벽·창·설비·층은 트윈에서 바로 뽑힙니다. 작성하지 않습니다."
              : "Existing phase. Walls, openings, plant and floors come from the twin — not drafted."}
        </p>
      </header>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
          {isKo ? "시트 세트" : "Sheet set"}
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {sheets.map((sheet) => (
            <li
              key={sheet.id}
              className="rounded-md border bg-card px-3 py-2 text-xs"
            >
              <p className="font-medium">{sheet.name}</p>
              <p className="text-muted-foreground">
                {sheet.pageSize} · {sheet.orientation} · {sheet.viewports.length}
                {isKo ? "개 뷰포트" : " viewports"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {TWIN_SCHEDULE_IDS.map((id) => (
        <section key={id} className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">
            {scheduleName(id, isKo)}
            {schedules[id] ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {schedules[id].rowCount}
                {isKo ? "행" : " rows"}
              </span>
            ) : null}
          </div>
          <ScheduleTable result={schedules[id]} isKo={isKo} />
        </section>
      ))}
    </div>
  );
}
