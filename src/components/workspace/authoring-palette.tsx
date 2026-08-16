"use client";

import {
  AppWindow,
  Armchair,
  Box,
  Columns2,
  DoorOpen,
  Droplets,
  Home,
  Layers,
  Lightbulb,
  PanelTop,
  Square,
  TreePine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import {
  AUTHORING_TOOLS,
  familiesForTool,
  familyIdentityLabel,
  familyTypeLabel,
  getAuthoringFamily,
  type AuthoringToolId,
} from "@/lib/bim/family-catalog";

const TOOL_ICONS: Record<AuthoringToolId, LucideIcon> = {
  wall: Square,
  door: DoorOpen,
  window: AppWindow,
  column: Columns2,
  floor: Layers,
  roof: Home,
  ceiling: PanelTop,
  stair: Box,
  railing: Box,
  furniture: Armchair,
  plumbing: Droplets,
  lighting: Lightbulb,
  planting: TreePine,
};

export function AuthoringPalette() {
  const { t, lang } = useT();
  const tool = useRevitWorkflowStore((s) => s.activeAuthoringTool);
  const selectedFamilyId = useRevitWorkflowStore((s) => s.selectedFamilyId);
  const setActiveAuthoringTool = useRevitWorkflowStore((s) => s.setActiveAuthoringTool);
  const setSelectedFamilyId = useRevitWorkflowStore((s) => s.setSelectedFamilyId);
  const setLeftDockOpen = useWorkspaceStore((s) => s.setLeftDockOpen);

  const types = tool ? familiesForTool(tool) : [];
  const selected = getAuthoringFamily(selectedFamilyId);

  return (
    <div
      className="flex shrink-0 flex-col border-b bg-background"
      data-testid="authoring-palette"
    >
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5">
        <span className="mr-1 hidden shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:inline">
          {t("건물 작성", "Building")}
        </span>
        {AUTHORING_TOOLS.map((def) => {
          const Icon = TOOL_ICONS[def.id];
          const active = tool === def.id;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => {
                setActiveAuthoringTool(def.id);
                setLeftDockOpen(true);
              }}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={lang === "ko" ? def.categoryKo : def.categoryEn}
            >
              <Icon className="size-3.5" />
              <span>{lang === "ko" ? def.labelKo : def.labelEn}</span>
            </button>
          );
        })}
      </div>
      {tool && (
        <div className="flex items-center gap-1 overflow-x-auto border-t px-3 py-1">
          <span className="mr-1 hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
            {t("타입", "Type")}
          </span>
          {types.map((family) => {
            const active = selectedFamilyId === family.id;
            return (
              <button
                key={family.id}
                type="button"
                onClick={() => setSelectedFamilyId(family.id)}
                className={cn(
                  "h-6 shrink-0 rounded-md px-2 text-[10px] transition-colors",
                  active
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={familyIdentityLabel(family, lang)}
              >
                {familyTypeLabel(family, lang)}
              </button>
            );
          })}
          {selected && (
            <span className="ml-auto hidden truncate text-[10px] text-muted-foreground lg:inline">
              {familyIdentityLabel(selected, lang)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
