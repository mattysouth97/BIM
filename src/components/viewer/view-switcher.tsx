"use client";

import { useViewStore } from "@/lib/bim/views/view-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** HTML overlay — does not enter the R3F canvas (3D-asset session owns that). */
export function ViewSwitcher() {
  const { t } = useT();
  const views = useViewStore((s) => s.views);
  const activeViewId = useViewStore((s) => s.activeViewId);
  const setActiveView = useViewStore((s) => s.setActiveView);

  if (views.length === 0) return null;

  return (
    <div
      className="pointer-events-auto flex max-w-[70vw] flex-wrap gap-1 rounded-md border bg-card/95 p-1 shadow-sm backdrop-blur"
      data-testid="view-switcher"
    >
      <button
        type="button"
        onClick={() => setActiveView(null)}
        className={cn(
          "h-6 rounded px-1.5 text-[10px]",
          activeViewId === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        )}
      >
        {t("자유", "Free")}
      </button>
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => setActiveView(view.id)}
          className={cn(
            "h-6 max-w-[140px] truncate rounded px-1.5 text-[10px]",
            activeViewId === view.id
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
          title={view.name}
        >
          {view.name}
        </button>
      ))}
    </div>
  );
}
