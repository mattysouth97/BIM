"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useMaterialStore } from "@/store/material-store";
import { useEquipmentStore } from "@/store/equipment-store";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { SEED_SCHEDULES } from "@/lib/bim/schedules/schedule-definitions";
import {
  collectScheduleElements,
  runBuildingSchedule,
} from "@/lib/bim/schedules/schedule-source";
import { scheduleToCsv } from "@/lib/bim/schedules/schedule-csv-export";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SchedulePanel() {
  const { t } = useT();
  const buildingPk = useActiveBuildingPk();
  const recipe = useEffectiveRecipe(buildingPk);
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const equipment = useEquipmentStore((s) => s.params[buildingPk]);
  const activeScheduleId = useRevitWorkflowStore((s) => s.activeScheduleId);
  const setActiveScheduleId = useRevitWorkflowStore((s) => s.setActiveScheduleId);

  const definition = SEED_SCHEDULES[activeScheduleId] ?? SEED_SCHEDULES["wall-schedule-v1"];

  const result = useMemo(() => {
    if (!recipe || !definition) return null;
    const bag = collectScheduleElements(buildingPk, recipe, materials, equipment);
    return runBuildingSchedule(definition, bag);
  }, [buildingPk, recipe, materials, equipment, definition]);

  function downloadCsv() {
    if (!result) return;
    const csv = scheduleToCsv(result);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${definition.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-[220px] flex-col" data-testid="schedule-panel">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
        {Object.values(SEED_SCHEDULES).map((schedule) => (
          <button
            key={schedule.id}
            type="button"
            onClick={() => setActiveScheduleId(schedule.id)}
            className={cn(
              "h-6 shrink-0 rounded-md px-2 text-[11px]",
              schedule.id === definition.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {schedule.name}
          </button>
        ))}
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={downloadCsv}
          disabled={!result || result.rowCount === 0}
        >
          <Download className="size-3" />
          CSV
        </Button>
      </div>

      {!recipe && (
        <p className="p-3 text-xs text-muted-foreground">
          {t("건물을 불러오면 일람표가 채워집니다.", "Schedules fill once a building recipe loads.")}
        </p>
      )}

      {result && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                {definition.columns.map((col) => (
                  <th key={col.id} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) =>
                row._isGroupHeader ? (
                  <tr key={`g-${index}`} className="bg-muted/40">
                    <td colSpan={definition.columns.length} className="px-2 py-1 font-medium">
                      {String(row._groupValue ?? "")}
                    </td>
                  </tr>
                ) : (
                  <tr key={`r-${index}`} className="border-t border-border/60">
                    {definition.columns.map((col) => (
                      <td key={col.id} className="px-2 py-1 whitespace-nowrap">
                        {String(row[col.id] ?? "—")}
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
          <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
            {t(`${result.rowCount}개 항목 · 모델에서 라이브 집계`, `${result.rowCount} items · live from the model`)}
          </p>
        </div>
      )}
    </div>
  );
}
