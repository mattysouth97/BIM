// src/lib/workflow/toolbar-configs.ts
// Pure data — no React imports, no hooks, no JSX.
// Defines TOOLBAR_CONFIGS keyed by WorkflowStage.

import type { LucideIcon } from "lucide-react";
import {
  ArrowUp, ArrowRight, ArrowDown, Maximize2, RotateCcw,
  Settings, Layers, Download, FileText,
} from "lucide-react";
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
// Global toolbar group — appears in all stages
// ---------------------------------------------------------------------------

export const GLOBAL_ITEMS: ToolbarGroup = {
  id: "global",
  labelEn: "Global",
  labelKo: "전역",
  items: [
    {
      id: "sep-view",
      type: "separator",
      labelEn: "",
      labelKo: "",
    },
    {
      id: "view-front",
      type: "button",
      icon: ArrowUp,
      labelEn: "Front",
      labelKo: "앞면",
    },
    {
      id: "view-side",
      type: "button",
      icon: ArrowRight,
      labelEn: "Side",
      labelKo: "측면",
    },
    {
      id: "view-top",
      type: "button",
      icon: ArrowDown,
      labelEn: "Top",
      labelKo: "위",
    },
    {
      id: "view-iso",
      type: "button",
      icon: Maximize2,
      labelEn: "Isometric",
      labelKo: "등각",
    },
    {
      id: "view-reset",
      type: "button",
      icon: RotateCcw,
      labelEn: "Reset View",
      labelKo: "뷰 초기화",
    },
  ],
};

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

/**
 * Item IDs whose actions come from ContextualToolbarProps, not store calls.
 */
export const PROP_ACTION_ITEMS = new Set<string>([]);
