"use client";

import React from "react";
import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { useWorkflowStore } from "@/store/workflow-store";
import { useT, type Lang } from "@/lib/i18n";
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContextualToolbarProps {
  /** View change handler — passed from building-scene parent */
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  /** Panel toggle handlers */
  onToggleConfigPanel?: () => void;
  configPanelOpen?: boolean;
  onToggleLayerPanel?: () => void;
  layerPanelOpen?: boolean;
  /** Building info for badges */
  buildingName?: string;
  era?: BuildingEra;
  /** Selected floor info */
  selectedFloor?: FloorGeometry | null;
}

// ---------------------------------------------------------------------------
// PropActions — prop-based handlers for panel toggles
// ---------------------------------------------------------------------------

interface PropActions {
  onToggleConfigPanel?: () => void;
  configPanelOpen?: boolean;
  onToggleLayerPanel?: () => void;
  layerPanelOpen?: boolean;
}

// ---------------------------------------------------------------------------
// resolveCondition — evaluate activeWhen/visibleWhen expressions
// ---------------------------------------------------------------------------

function resolveCondition(
  expr: string | undefined,
  props: PropActions,
): boolean {
  if (!expr) return false;

  if (expr === "configPanelOpen") return !!props.configPanelOpen;
  if (expr === "layerPanelOpen") return !!props.layerPanelOpen;

  return false;
}

// ---------------------------------------------------------------------------
// dispatchAction — dispatch a TOOLBAR_ACTIONS descriptor via store.getState()
// ---------------------------------------------------------------------------

function dispatchAction(
  item: ToolbarItem,
  isActive: boolean,
  props: PropActions,
): void {
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

  // Mirror panel state via props callbacks
  if (descriptor.method === "toggleConfigPanel") {
    props.onToggleConfigPanel?.();
  } else if (descriptor.method === "toggleLayerPanel") {
    props.onToggleLayerPanel?.();
  }
}

// ---------------------------------------------------------------------------
// ToolbarItemRenderer — renders a single ToolbarItem
// ---------------------------------------------------------------------------

function ToolbarItemRenderer({
  item,
  lang,
  props,
}: {
  item: ToolbarItem;
  lang: Lang;
  props: PropActions;
}) {
  if (item.type === "separator") {
    return <VerticalDivider />;
  }

  if (item.visibleWhen && !resolveCondition(item.visibleWhen, props)) {
    return null;
  }

  const isActive = resolveCondition(item.activeWhen, props);
  const Icon = item.icon;

  return (
    <Button
      variant={isActive ? "default" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={() => dispatchAction(item, isActive, props)}
      title={lang === "ko" ? item.labelKo : item.labelEn}
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
  lang,
  props,
}: {
  group: ToolbarGroup;
  lang: Lang;
  props: PropActions;
}) {
  return (
    <>
      {group.items.map((item) => (
        <ToolbarItemRenderer
          key={item.id}
          item={item}
          lang={lang}
          props={props}
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
  lang,
  props,
}: {
  stage: string;
  lang: Lang;
  props: PropActions;
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
            lang={lang}
            props={props}
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
  lang,
}: {
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  lang: Lang;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("front")} title={lang === "ko" ? "앞면" : "Front"}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("side")} title={lang === "ko" ? "측면" : "Side"}>
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("top")} title={lang === "ko" ? "위" : "Top"}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("iso")} title={lang === "ko" ? "등각" : "Isometric"}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("iso")} title={lang === "ko" ? "뷰 초기화" : "Reset View"}>
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
  onToggleConfigPanel,
  configPanelOpen,
  onToggleLayerPanel,
  layerPanelOpen,
  buildingName,
  era,
  selectedFloor: _selectedFloor,
}: ContextualToolbarProps) {
  const { lang } = useT();
  const stage = useWorkflowStore((s) => s.stage);

  const propActions: PropActions = {
    onToggleConfigPanel,
    configPanelOpen,
    onToggleLayerPanel,
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
          lang={lang}
          props={propActions}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Global controls — always visible */}
        <GlobalToolbarSection onViewChange={onViewChange} lang={lang} />
      </div>
    </div>
  );
}
