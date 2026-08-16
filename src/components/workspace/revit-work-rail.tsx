"use client";

import { REVIT_WORK_MODES } from "@/lib/workflow/revit-workflow";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function RevitWorkRail() {
  const { t, lang } = useT();
  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const setWorkMode = useRevitWorkflowStore((s) => s.setWorkMode);
  const active = REVIT_WORK_MODES.find((m) => m.id === workMode);

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1 border-b bg-background px-3"
      data-testid="revit-work-rail"
    >
      <span className="mr-1 hidden text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:inline">
        {t("레빗 작업", "Revit")}
      </span>
      {REVIT_WORK_MODES.map((mode) => {
        const selected = mode.id === workMode;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => setWorkMode(mode.id)}
            className={cn(
              "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={lang === "ko" ? mode.hintKo : mode.hintEn}
          >
            {lang === "ko" ? mode.labelKo : mode.labelEn}
          </button>
        );
      })}
      {active && (
        <span className="ml-auto hidden max-w-[42%] truncate text-[10px] text-muted-foreground lg:inline">
          {lang === "ko" ? active.hintKo : active.hintEn}
        </span>
      )}
    </div>
  );
}
