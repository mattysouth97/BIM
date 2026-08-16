"use client";

import { useEffect } from "react";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useViewStore } from "@/lib/bim/views/view-store";
import { useSheetStore, selectActiveSheet } from "@/lib/bim/sheets/sheet-store";
import { createDefaultGxSheet } from "@/lib/bim/sheets/default-sheet";
import { getSheetDimensions } from "@/lib/bim/sheets/sheet-types";
import { Button } from "@/components/ui/button";

export function SheetComposer() {
  const { t, lang } = useT();
  const buildingPk = useActiveBuildingPk();
  const recipe = useEffectiveRecipe(buildingPk);
  const views = useViewStore((s) => s.views);
  const sheets = useSheetStore((s) => s.sheets);
  const activeSheet = useSheetStore(selectActiveSheet);
  const addSheet = useSheetStore((s) => s.addSheet);
  const setActiveSheet = useSheetStore((s) => s.setActiveSheet);

  useEffect(() => {
    if (sheets.length === 0 && views.length > 0 && recipe) {
      const sheet = createDefaultGxSheet({
        buildingName: recipe.buildingName || buildingPk,
        views,
        locale: lang,
      });
      addSheet(sheet);
    }
  }, [sheets.length, views, recipe, buildingPk, lang, addSheet]);

  function createSheet() {
    const sheet = createDefaultGxSheet({
      buildingName: recipe?.buildingName || buildingPk || "Building",
      views,
      locale: lang,
    });
    addSheet(sheet);
    setActiveSheet(sheet.id);
  }

  const dims = activeSheet ? getSheetDimensions(activeSheet) : null;

  return (
    <div className="flex h-full min-h-[240px] flex-col" data-testid="sheet-composer">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <p className="text-xs font-semibold">{t("시트 구성", "Sheet composition")}</p>
        <Button size="xs" variant="outline" onClick={createSheet}>
          <Plus className="size-3" />
          {t("A3 시트", "A3 sheet")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-40 shrink-0 overflow-y-auto border-r">
          {sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              onClick={() => setActiveSheet(sheet.id)}
              className={`block w-full truncate px-3 py-1.5 text-left text-[11px] ${
                activeSheet?.id === sheet.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "hover:bg-muted"
              }`}
            >
              {sheet.titleBlock.sheetNumber} · {sheet.name}
            </button>
          ))}
          {sheets.length === 0 && (
            <p className="p-3 text-[10px] text-muted-foreground">
              {t("시트가 없습니다.", "No sheets yet.")}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-auto bg-muted/20 p-3">
          {!activeSheet || !dims ? (
            <p className="text-xs text-muted-foreground">
              {t("시트를 선택하거나 생성하세요.", "Select or create a sheet.")}
            </p>
          ) : (
            <div
              className="relative mx-auto bg-white shadow-md"
              style={{
                width: Math.min(dims.widthMm * 1.1, 520),
                height: Math.min(dims.heightMm * 1.1, 370),
              }}
            >
              {activeSheet.viewports.map((vp) => (
                <div
                  key={vp.id}
                  className="absolute overflow-hidden border border-neutral-400 bg-neutral-50 px-1 py-0.5 text-[9px] text-neutral-600"
                  style={{
                    left: `${(vp.x / dims.widthMm) * 100}%`,
                    top: `${(vp.y / dims.heightMm) * 100}%`,
                    width: `${(vp.width / dims.widthMm) * 100}%`,
                    height: `${(vp.height / dims.heightMm) * 100}%`,
                  }}
                >
                  {vp.kind === "view" ? "VIEW" : "SCHED"} · {vp.title ?? vp.targetId}
                  {vp.scale ? ` · 1:${vp.scale}` : ""}
                </div>
              ))}
              <div className="absolute right-1 bottom-1 border border-neutral-800 bg-white px-2 py-1 text-[9px] leading-tight">
                <p className="font-semibold">{activeSheet.titleBlock.projectName}</p>
                <p>{activeSheet.titleBlock.buildingName}</p>
                <p>
                  {activeSheet.titleBlock.sheetNumber} · {activeSheet.titleBlock.revision} ·{" "}
                  {activeSheet.titleBlock.date}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
