"use client";

import React from "react";
import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import {
  TOOLBAR_CONFIGS,
  TOOLBAR_ACTIONS,
  type ToolbarGroup,
  type ToolbarItem,
} from "@/lib/workflow/toolbar-configs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, ArrowUp, ArrowRight, ArrowDown, Maximize2,
} from "lucide-react";
import { ModeIndicator } from "./mode-indicator";
import { BimViewBar } from "./bim-view-bar";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContextualToolbarProps {
  /** View change handler — passed from building-scene parent */
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  /** Building info for badges */
  buildingName?: string;
  era?: BuildingEra;
  /** Selected floor info */
  selectedFloor?: FloorGeometry | null;
}

// ---------------------------------------------------------------------------
// Toggle state — every `activeWhen` expression maps to exactly one
// workspace-store field. The toolbar reads the store directly, and actions
// dispatch store methods directly: panel state has a single source of truth
// (no prop mirroring, no double dispatch).
// ---------------------------------------------------------------------------

type ToolbarConditions = Record<string, boolean>;

function resolveCondition(
  expr: string | undefined,
  conditions: ToolbarConditions,
): boolean {
  if (!expr) return false;
  return !!conditions[expr];
}

// ---------------------------------------------------------------------------
// dispatchAction — dispatch a TOOLBAR_ACTIONS descriptor via store.getState()
// ---------------------------------------------------------------------------

function dispatchAction(item: ToolbarItem, isActive: boolean): void {
  const descriptor = TOOLBAR_ACTIONS[item.id];
  if (!descriptor) return;

  const state = useWorkspaceStore.getState() as unknown as Record<string, unknown>;

  if (isActive && descriptor.toggleOff) {
    const offMethod = state[descriptor.toggleOff.method];
    if (typeof offMethod === "function") {
      (offMethod as (...a: unknown[]) => void)(...(descriptor.toggleOff.args ?? []));
    }
    return;
  }

  const method = state[descriptor.method];
  if (typeof method === "function") {
    (method as (...a: unknown[]) => void)(...(descriptor.args ?? []));
  }
}

// ---------------------------------------------------------------------------
// ToolbarItemRenderer — renders a single ToolbarItem
// ---------------------------------------------------------------------------

function ToolbarItemRenderer({
  item,
  isKo,
  conditions,
}: {
  item: ToolbarItem;
  isKo: boolean;
  conditions: ToolbarConditions;
}) {
  if (item.type === "separator") {
    return <VerticalDivider />;
  }

  if (item.visibleWhen && !resolveCondition(item.visibleWhen, conditions)) {
    return null;
  }

  const isActive = resolveCondition(item.activeWhen, conditions);
  const Icon = item.icon;

  return (
    <Button
      variant={isActive ? "default" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={() => dispatchAction(item, isActive)}
      title={isKo ? item.labelKo : item.labelEn}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// ToolbarGroupRenderer — renders a ToolbarGroup's items
// ---------------------------------------------------------------------------

function ToolbarGroupRenderer({
  group,
  isKo,
  conditions,
}: {
  group: ToolbarGroup;
  isKo: boolean;
  conditions: ToolbarConditions;
}) {
  return (
    <>
      {group.items.map((item) => (
        <ToolbarItemRenderer
          key={item.id}
          item={item}
          isKo={isKo}
          conditions={conditions}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// StageToolbar — renders all groups for the current stage via TOOLBAR_CONFIGS
// ---------------------------------------------------------------------------

function StageToolbar({
  stage,
  isKo,
  conditions,
}: {
  stage: string;
  isKo: boolean;
  conditions: ToolbarConditions;
}) {
  const groups = TOOLBAR_CONFIGS[stage as keyof typeof TOOLBAR_CONFIGS] ?? [];
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group, i) => (
        <React.Fragment key={group.id}>
          {i > 0 && <VerticalDivider />}
          <ToolbarGroupRenderer
            group={group}
            isKo={isKo}
            conditions={conditions}
          />
        </React.Fragment>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// VerticalDivider — compact separator between toolbar groups
// ---------------------------------------------------------------------------

function VerticalDivider() {
  return <div className="w-px h-5 bg-border shrink-0" />;
}

// ---------------------------------------------------------------------------
// GlobalToolbarSection — always-visible view presets
// ---------------------------------------------------------------------------

function GlobalToolbarSection({
  onViewChange,
  isKo,
}: {
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  isKo: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("front")} title={isKo ? "앞면" : "Front"}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("side")} title={isKo ? "측면" : "Side"}>
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("top")} title={isKo ? "위" : "Top"}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("iso")} title={isKo ? "등각" : "Isometric"}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("iso")} title={isKo ? "뷰 초기화" : "Reset View"}>
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContextualToolbar — main export
// ---------------------------------------------------------------------------

export function ContextualToolbar({
  onViewChange,
  buildingName,
  era,
  selectedFloor: _selectedFloor,
}: ContextualToolbarProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const stage = useWorkflowStore((s) => s.stage);
  const layerPanelOpen = useWorkspaceStore((s) => s.layerPanelOpen);

  const conditions: ToolbarConditions = {
    layerPanelOpen,
  };

  return (
    <div className="relative">
      {/* Fixed-height toolbar strip — h-10 (40px) */}
      <div className="h-10 shrink-0 border-b bg-background/95 backdrop-blur flex items-center px-2 gap-1 z-20">

        {/* Mode indicator */}
        <ModeIndicator />

        {/* Building info badges — always visible when building loaded */}
        {buildingName && (
          <>
            <VerticalDivider />
            <Badge variant="secondary" className="text-xs h-6">
              {buildingName}
            </Badge>
            {era && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground h-6">
                {era === "pre-1970" ? "~1970" : era}
              </Badge>
            )}
          </>
        )}

        <VerticalDivider />

        {/* Center: Stage-specific toolbar groups — data-driven from TOOLBAR_CONFIGS[stage] */}
        <StageToolbar
          stage={stage}
          isKo={isKo}
          conditions={conditions}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {stage === "twin" ? (
          <BimViewBar />
        ) : (
          <GlobalToolbarSection onViewChange={onViewChange} isKo={isKo} />
        )}
      </div>
    </div>
  );
}
