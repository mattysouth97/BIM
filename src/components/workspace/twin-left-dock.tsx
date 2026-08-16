"use client";

import { SceneOutliner } from "./scene-outliner";
import { ProjectBrowser } from "./project-browser";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function TwinLeftDock() {
  const { t } = useT();
  const tab = useRevitWorkflowStore((s) => s.leftDockTab);
  const setLeftDockTab = useRevitWorkflowStore((s) => s.setLeftDockTab);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b">
        <button
          type="button"
          onClick={() => setLeftDockTab("insights")}
          className={cn(
            "flex-1 py-1.5 text-[11px] font-medium",
            tab === "insights"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground"
          )}
        >
          {t("개선", "Insights")}
        </button>
        <button
          type="button"
          onClick={() => setLeftDockTab("browser")}
          className={cn(
            "flex-1 py-1.5 text-[11px] font-medium",
            tab === "browser"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground"
          )}
        >
          {t("브라우저", "Browser")}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "insights" ? <SceneOutliner /> : <ProjectBrowser />}
      </div>
    </div>
  );
}
