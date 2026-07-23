// src/lib/workflow/toolbar-configs.ts
// Pure data — no React imports, no hooks, no JSX.
// Defines TOOLBAR_CONFIGS keyed by WorkflowStage.

import type { LucideIcon } from "lucide-react";
import { Settings, Layers, Download, FileText } from "lucide-react";
import type { WorkflowStage } from "./stages";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type ToolbarItemType = "button" | "toggle" | "separator";

export interface ToolbarItem {
  id: string;
  type: ToolbarItemType;
  icon?: LucideIcon;
  labelEn: string;
  labelKo: string;
  /**
   * Store selector path for active/pressed state.
   * Examples: "workspace.configPanelOpen"
   */
  activeWhen?: string;
  /**
   * Visibility condition — evaluated at runtime by the toolbar renderer.
   */
  visibleWhen?: string;
}

export interface ToolbarGroup {
  id: string;
  labelEn: string;
  labelKo: string;
  items: ToolbarItem[];
}

// ---------------------------------------------------------------------------
// Search stage — minimal toolbar; user is finding a building.
// ---------------------------------------------------------------------------

const SEARCH_GROUPS: ToolbarGroup[] = [];

// ---------------------------------------------------------------------------
// Upload stage — minimal toolbar; user is uploading a CAD floor plan.
// ---------------------------------------------------------------------------

const UPLOAD_GROUPS: ToolbarGroup[] = [];

// ---------------------------------------------------------------------------
// Twin stage — view controls, layer toggles, material/energy panel toggles.
// ---------------------------------------------------------------------------

const TWIN_GROUPS: ToolbarGroup[] = [
  {
    id: "twin-panels",
    labelEn: "Panels",
    labelKo: "패널",
    items: [
      {
        id: "twin-config-panel",
        type: "toggle",
        icon: Settings,
        labelEn: "Properties",
        labelKo: "속성",
        activeWhen: "configPanelOpen",
      },
      {
        id: "twin-layer-panel",
        type: "toggle",
        icon: Layers,
        labelEn: "Building Layers",
        labelKo: "건물 시스템 레이어",
        activeWhen: "layerPanelOpen",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Report stage — export buttons, report generation.
// ---------------------------------------------------------------------------

const REPORT_GROUPS: ToolbarGroup[] = [
  {
    id: "report-export",
    labelEn: "Export",
    labelKo: "내보내기",
    items: [
      {
        id: "report-export-data",
        type: "button",
        icon: Download,
        labelEn: "Export Data",
        labelKo: "데이터 내보내기",
      },
      {
        id: "report-generate",
        type: "button",
        icon: FileText,
        labelEn: "Generate Report",
        labelKo: "보고서 생성",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// TOOLBAR_CONFIGS — keyed by WorkflowStage
// ---------------------------------------------------------------------------

export const TOOLBAR_CONFIGS: Record<WorkflowStage, ToolbarGroup[]> = {
  search: SEARCH_GROUPS,
  upload: UPLOAD_GROUPS,
  twin:   TWIN_GROUPS,
  report: REPORT_GROUPS,
};

// ---------------------------------------------------------------------------
// TOOLBAR_ACTIONS — dispatch registry (no React, no store imports)
// ---------------------------------------------------------------------------

/**
 * Describes how to dispatch an action for a ToolbarItem.
 * Store resolution is handled by the renderer component at runtime.
 */
export interface ToolbarActionDescriptor {
  /** Store to call getState() on — resolved by the renderer */
  store: "workspace";
  /** Method name on the store */
  method: string;
  /** Arguments to pass — empty array for toggles, specific value for setters */
  args?: unknown[];
  /** For toggles: the method to call when already active */
  toggleOff?: { method: string; args?: unknown[] };
}

/**
 * Maps ToolbarItem `id` strings to their action descriptors.
 */
export const TOOLBAR_ACTIONS: Record<string, ToolbarActionDescriptor> = {
  "twin-config-panel": { store: "workspace", method: "toggleConfigPanel" },
  "twin-layer-panel":  { store: "workspace", method: "toggleLayerPanel" },
};
