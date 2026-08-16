"use client";

import { ChevronDown, Table2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useViewStore } from "@/lib/bim/views/view-store";
import { useBimDocumentStore } from "@/store/bim-document-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { planSortRank, viewLabel } from "@/lib/bim/views/view-label";
import type { PlanView } from "@/lib/bim/views/view-definition";
import type { ViewDefinition } from "@/lib/bim/views/view-definition";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function kindViews(views: ViewDefinition[], kind: ViewDefinition["kind"]) {
  return views.filter((v) => v.kind === kind);
}

export function BimViewBar() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const views = useViewStore((s) => s.views);
  const activeViewId = useViewStore((s) => s.activeViewId);
  const setActiveView = useViewStore((s) => s.setActiveView);
  const phase = useBimDocumentStore((s) => s.phase);
  const setPhase = useBimDocumentStore((s) => s.setPhase);
  const scheduleOpen = useBimDocumentStore((s) => s.scheduleOpen);
  const toggleSchedule = useBimDocumentStore((s) => s.toggleSchedule);
  const setBottomShelfOpen = useWorkspaceStore((s) => s.setBottomShelfOpen);

  if (views.length === 0) return null;

  const plans = kindViews(views, "plan")
    .filter((v): v is PlanView => v.kind === "plan")
    .slice()
    .sort((a, b) => planSortRank(a) - planSortRank(b));
  const elevations = kindViews(views, "elevation");
  const section = views.find((v) => v.kind === "section");
  const iso = views.find((v) => v.kind === "3d");
  const active = views.find((v) => v.id === activeViewId) ?? null;

  const pick = (id: string) => setActiveView(id);

  const openSchedule = () => {
    setBottomShelfOpen(true);
    toggleSchedule();
  };

  return (
    <div
      className="flex items-center gap-1 shrink-0"
      data-testid="bim-view-bar"
    >
      <Button
        variant={!active || active.kind === "3d" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={() => pick(iso?.id ?? "3d-iso")}
        data-testid="bim-view-3d"
      >
        3D
      </Button>

      <ViewMenu
        label={isKo ? "평면도" : "Plan"}
        views={plans}
        activeId={activeViewId}
        isKo={isKo}
        onPick={pick}
        testId="bim-view-plan"
        highlight={active?.kind === "plan"}
      />
      <ViewMenu
        label={isKo ? "입면" : "Elev"}
        views={elevations}
        activeId={activeViewId}
        isKo={isKo}
        onPick={pick}
        testId="bim-view-elev"
        highlight={active?.kind === "elevation"}
      />

      {section && (
        <Button
          variant={active?.kind === "section" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => pick(section.id)}
          data-testid="bim-view-section"
        >
          {isKo ? "단면" : "Section"}
        </Button>
      )}

      <div className="w-px h-5 bg-border mx-0.5" />

      <div
        className="inline-flex rounded-md border bg-muted/40 p-0.5"
        data-testid="bim-phase-toggle"
      >
        <button
          type="button"
          className={cn(
            "h-6 rounded px-2 text-[11px] font-medium",
            phase === "existing"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
          onClick={() => setPhase("existing")}
        >
          {isKo ? "현황" : "Existing"}
        </button>
        <button
          type="button"
          className={cn(
            "h-6 rounded px-2 text-[11px] font-medium",
            phase === "retrofit"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
          onClick={() => setPhase("retrofit")}
          data-testid="bim-phase-retrofit"
        >
          {isKo ? "개보수" : "Retrofit"}
        </button>
      </div>

      <Button
        variant={scheduleOpen ? "default" : "ghost"}
        size="sm"
        className="h-7 gap-1 px-2 text-[11px]"
        onClick={openSchedule}
        data-testid="bim-schedule-toggle"
      >
        <Table2 className="size-3.5" />
        {isKo ? "일람표" : "Schedules"}
      </Button>
    </div>
  );
}

function ViewMenu({
  label,
  views,
  activeId,
  isKo,
  onPick,
  testId,
  highlight,
}: {
  label: string;
  views: ViewDefinition[];
  activeId: string | null;
  isKo: boolean;
  onPick: (id: string) => void;
  testId: string;
  highlight: boolean;
}) {
  if (views.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={highlight ? "default" : "ghost"}
          size="sm"
          className="h-7 gap-0.5 px-2 text-[11px]"
          data-testid={testId}
        >
          {label}
          <ChevronDown className="size-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {views.map((view) => (
          <DropdownMenuItem
            key={view.id}
            onClick={() => onPick(view.id)}
            className={cn(
              "text-xs",
              activeId === view.id && "bg-accent font-medium",
            )}
          >
            {viewLabel(view, isKo)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
