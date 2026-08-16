"use client";

import { Download } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useBimDocumentStore } from "@/store/bim-document-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useTwinDocument, TWIN_SCHEDULE_IDS } from "@/hooks/use-twin-document";
import { scheduleToCsv } from "@/lib/bim/schedules/schedule-csv-export";
import {
  scheduleColumnLabel,
  scheduleName,
} from "@/lib/bim/schedules/schedule-i18n";
import type { ScheduleResult } from "@/lib/bim/schedules/schedule-types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function BimSchedulePanel() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const buildingPk = useActiveBuildingPk();
  const { schedules, phase } = useTwinDocument(buildingPk, isKo ? "ko" : "en");
  const activeScheduleId = useBimDocumentStore((s) => s.activeScheduleId);
  const setActiveSchedule = useBimDocumentStore((s) => s.setActiveSchedule);

  const currentId = activeScheduleId ?? TWIN_SCHEDULE_IDS[0];
  const current = schedules[currentId];

  const download = (result: ScheduleResult | undefined) => {
    if (!result) return;
    const csv = scheduleToCsv(result);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.definition.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden border-b bg-background"
      data-testid="bim-schedule-panel"
    >
      <Tabs
        value={currentId}
        onValueChange={(id) => setActiveSchedule(id)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1">
          <TabsList variant="line" className="h-7">
            {TWIN_SCHEDULE_IDS.map((id) => (
              <TabsTrigger key={id} value={id} className="px-2 text-[11px]">
                {scheduleName(id, isKo)}
                {schedules[id] ? (
                  <span className="text-muted-foreground tabular-nums">
                    {schedules[id].rowCount}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {phase === "retrofit"
                ? isKo
                  ? "개보수 단계 · 2020 외피 기준"
                  : "Retrofit phase · 2020 envelope"
                : isKo
                  ? "현황 · 대장에서 추정"
                  : "Existing · ledger estimate"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => download(current)}
              disabled={!current}
            >
              <Download className="size-3" />
              CSV
            </Button>
          </div>
        </div>
        {TWIN_SCHEDULE_IDS.map((id) => (
          <TabsContent key={id} value={id} className="min-h-0 flex-1 overflow-auto px-1">
            <ScheduleTable result={schedules[id]} isKo={isKo} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export function ScheduleTable({
  result,
  isKo,
}: {
  result?: ScheduleResult;
  isKo: boolean;
}) {
  if (!result) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        {isKo ? "트윈이 아직 준비되지 않았습니다." : "Twin is not ready yet."}
      </p>
    );
  }

  if (result.rowCount === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        {isKo ? "이 일람표에 부재가 없습니다." : "No elements in this schedule."}
      </p>
    );
  }

  return (
    <Table data-testid={`schedule-table-${result.definition.id}`}>
      <TableHeader>
        <TableRow>
          {result.definition.columns.map((col) => (
            <TableHead key={col.id} className="h-7 px-2 text-[10px]">
              {scheduleColumnLabel(col.id, col.label, isKo)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.rows.map((row, i) => {
          if (row._isGroupHeader) {
            return (
              <TableRow key={`g-${i}`} className="bg-muted/40">
                <TableCell
                  colSpan={result.definition.columns.length}
                  className="px-2 py-1 text-[10px] font-semibold"
                >
                  {String(row._groupValue ?? "")}
                </TableCell>
              </TableRow>
            );
          }
          return (
            <TableRow key={i}>
              {result.definition.columns.map((col) => (
                <TableCell
                  key={col.id}
                  className={cn("px-2 py-1 text-[11px] tabular-nums")}
                >
                  {row[col.id] === undefined || row[col.id] === null
                    ? "—"
                    : String(row[col.id])}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
