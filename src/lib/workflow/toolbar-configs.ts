// src/lib/workflow/toolbar-configs.ts
// Pure data — no React imports, no hooks, no JSX.
// Defines TOOLBAR_CONFIGS keyed by WorkflowStage.

import type { LucideIcon } from "lucide-react";
import {
  Grid3x3, ArrowUp, ArrowRight, ArrowDown, Maximize2, RotateCcw,
  Pencil, PencilOff, Move, RotateCcw as RotateIcon, Scaling,
  Ruler, Square, AlignHorizontalDistributeCenter, Scissors, Trash2,
  PenTool, DoorOpen, Upload, ToggleLeft, ToggleRight,
  Settings, Layers,
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
   * Examples: "authoring.isAuthoring", "plan.viewMode===plan"
   */
  activeWhen?: string;
  /**
   * Visibility condition — evaluated at runtime by the toolbar renderer.
   * Examples: "authoring.isAuthoring", "plan.viewMode===plan"
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
      id: "view-plan-toggle",
      type: "toggle",
      icon: Grid3x3,
      labelEn: "Plan View",
      labelKo: "평면도 뷰",
      activeWhen: "plan.viewMode===plan",
    },
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
// Select stage — no extra tools; user is picking a building.
// ---------------------------------------------------------------------------

const SELECT_GROUPS: ToolbarGroup[] = [];

// ---------------------------------------------------------------------------
// Assemble stage — drawing tools, snap, floor selector, opening presets.
// ---------------------------------------------------------------------------

const ASSEMBLE_GROUPS: ToolbarGroup[] = [
  {
    id: "assemble-edit",
    labelEn: "Edit",
    labelKo: "편집",
    items: [
      {
        id: "assemble-edit-toggle",
        type: "toggle",
        icon: Pencil,
        labelEn: "Edit Mode",
        labelKo: "편집 모드",
        activeWhen: "authoring.isAuthoring",
      },
    ],
  },
  {
    id: "assemble-transform",
    labelEn: "Transform",
    labelKo: "변환",
    items: [
      {
        id: "assemble-transform-translate",
        type: "toggle",
        icon: Move,
        labelEn: "Move (G)",
        labelKo: "이동 (G)",
        activeWhen: "authoring.transformMode===translate",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-transform-rotate",
        type: "toggle",
        icon: RotateIcon,
        labelEn: "Rotate (R)",
        labelKo: "회전 (R)",
        activeWhen: "authoring.transformMode===rotate",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-transform-scale",
        type: "toggle",
        icon: Scaling,
        labelEn: "Scale (S)",
        labelKo: "크기 (S)",
        activeWhen: "authoring.transformMode===scale",
        visibleWhen: "authoring.isAuthoring",
      },
    ],
  },
  {
    id: "assemble-drawing",
    labelEn: "Drawing",
    labelKo: "그리기",
    items: [
      {
        id: "assemble-draw-wall",
        type: "toggle",
        icon: PenTool,
        labelEn: "Draw Wall",
        labelKo: "벽 그리기",
        activeWhen: "plan.drawingMode===wall",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-draw-opening",
        type: "toggle",
        icon: DoorOpen,
        labelEn: "Place Opening",
        labelKo: "개구부 배치",
        activeWhen: "plan.drawingMode===opening",
        visibleWhen: "authoring.isAuthoring",
      },
    ],
  },
  {
    id: "assemble-annotation",
    labelEn: "Annotations",
    labelKo: "주석",
    items: [
      {
        id: "assemble-annotation-dimension",
        type: "toggle",
        icon: Ruler,
        labelEn: "Dimension",
        labelKo: "치수선",
        activeWhen: "authoring.annotationMode===dimension",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-annotation-area",
        type: "toggle",
        icon: Square,
        labelEn: "Area Label",
        labelKo: "면적 레이블",
        activeWhen: "authoring.annotationMode===area",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-annotation-level",
        type: "toggle",
        icon: AlignHorizontalDistributeCenter,
        labelEn: "Level Markers",
        labelKo: "층고 마커",
        activeWhen: "authoring.annotationMode===level",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-annotation-section",
        type: "toggle",
        icon: Scissors,
        labelEn: "Section Cut",
        labelKo: "단면 절단",
        activeWhen: "authoring.annotationMode===section",
        visibleWhen: "authoring.isAuthoring",
      },
      {
        id: "assemble-annotation-clear",
        type: "button",
        icon: Trash2,
        labelEn: "Clear Annotations",
        labelKo: "주석 지우기",
        visibleWhen: "authoring.isAuthoring",
      },
    ],
  },
  {
    id: "assemble-model",
    labelEn: "Model",
    labelKo: "모델",
    items: [
      {
        id: "assemble-upload",
        type: "button",
        icon: Upload,
        labelEn: "Upload 3D Model",
        labelKo: "3D 모델 업로드",
      },
      {
        id: "assemble-model-toggle",
        type: "toggle",
        icon: ToggleLeft,
        labelEn: "Switch Model Source",
        labelKo: "모델 소스 전환",
        activeWhen: "modelSource===uploaded",
        visibleWhen: "hasUploadedModel",
      },
    ],
  },
  // NOTE: Floor selector, grid size, snap controls, drawing mode, opening
  // presets are rendered as popovers in the toolbar component when
  // viewMode === "plan" (not as static ToolbarItem entries).
];

// ---------------------------------------------------------------------------
// Configure stage — config panel, layer panel, model upload.
// ---------------------------------------------------------------------------

const CONFIGURE_GROUPS: ToolbarGroup[] = [
  {
    id: "configure-panels",
    labelEn: "Panels",
    labelKo: "패널",
    items: [
      {
        id: "configure-config-panel",
        type: "toggle",
        icon: Settings,
        labelEn: "Configuration",
        labelKo: "설정",
        activeWhen: "configPanelOpen",
      },
      {
        id: "configure-layer-panel",
        type: "toggle",
        icon: Layers,
        labelEn: "Building Layers",
        labelKo: "건물 시스템 레이어",
        activeWhen: "layerPanelOpen",
      },
    ],
  },
  {
    id: "configure-model",
    labelEn: "Model",
    labelKo: "모델",
    items: [
      {
        id: "configure-upload",
        type: "button",
        icon: Upload,
        labelEn: "Upload 3D Model",
        labelKo: "3D 모델 업로드",
      },
      {
        id: "configure-model-toggle",
        type: "toggle",
        icon: ToggleLeft,
        labelEn: "Switch Model Source",
        labelKo: "모델 소스 전환",
        activeWhen: "modelSource===uploaded",
        visibleWhen: "hasUploadedModel",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Analyze stage — layer panel + view presets (global handles view presets).
// ---------------------------------------------------------------------------

const ANALYZE_GROUPS: ToolbarGroup[] = [
  {
    id: "analyze-panels",
    labelEn: "Panels",
    labelKo: "패널",
    items: [
      {
        id: "analyze-layer-panel",
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
// Export stage — minimal, global view controls only.
// ---------------------------------------------------------------------------

const EXPORT_GROUPS: ToolbarGroup[] = [];

// ---------------------------------------------------------------------------
// TOOLBAR_CONFIGS — keyed by WorkflowStage
// ---------------------------------------------------------------------------

export const TOOLBAR_CONFIGS: Record<WorkflowStage, ToolbarGroup[]> = {
  select:    SELECT_GROUPS,
  assemble:  ASSEMBLE_GROUPS,
  configure: CONFIGURE_GROUPS,
  analyze:   ANALYZE_GROUPS,
  export:    EXPORT_GROUPS,
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
  store: "authoring" | "plan" | "workspace";
  /** Method name on the store */
  method: string;
  /** Arguments to pass — empty array for toggles, specific value for setters */
  args?: unknown[];
  /** For toggles: the method to call when already active (e.g., reset to default) */
  toggleOff?: { method: string; args?: unknown[] };
}

/**
 * Maps ToolbarItem `id` strings to their action descriptors.
 * Items not in this map either use prop-based handlers (see PROP_ACTION_ITEMS)
 * or have no action (e.g., separators).
 */
export const TOOLBAR_ACTIONS: Record<string, ToolbarActionDescriptor> = {
  "assemble-edit-toggle":           { store: "authoring", method: "toggleAuthoring" },
  "assemble-transform-translate":   { store: "authoring", method: "setTransformMode", args: ["translate"] },
  "assemble-transform-rotate":      { store: "authoring", method: "setTransformMode", args: ["rotate"] },
  "assemble-transform-scale":       { store: "authoring", method: "setTransformMode", args: ["scale"] },
  "assemble-draw-wall":             { store: "plan", method: "setDrawingMode", args: ["wall"], toggleOff: { method: "setDrawingMode", args: [null] } },
  "assemble-draw-opening":          { store: "plan", method: "setDrawingMode", args: ["opening"], toggleOff: { method: "setDrawingMode", args: [null] } },
  "assemble-annotation-dimension":  { store: "authoring", method: "setAnnotationMode", args: ["dimension"], toggleOff: { method: "setAnnotationMode", args: ["none"] } },
  "assemble-annotation-area":       { store: "authoring", method: "setAnnotationMode", args: ["area"], toggleOff: { method: "setAnnotationMode", args: ["none"] } },
  "assemble-annotation-level":      { store: "authoring", method: "setAnnotationMode", args: ["level"], toggleOff: { method: "setAnnotationMode", args: ["none"] } },
  "assemble-annotation-section":    { store: "authoring", method: "setAnnotationMode", args: ["section"], toggleOff: { method: "setAnnotationMode", args: ["none"] } },
  "assemble-annotation-clear":      { store: "authoring", method: "clearAnnotations" },
  "configure-config-panel":         { store: "workspace", method: "toggleConfigPanel" },
  "configure-layer-panel":          { store: "workspace", method: "toggleLayerPanel" },
  "analyze-layer-panel":            { store: "workspace", method: "toggleLayerPanel" },
};

/**
 * Item IDs whose actions come from ContextualToolbarProps, not store calls.
 * The renderer must use the corresponding prop handler instead of TOOLBAR_ACTIONS.
 */
export const PROP_ACTION_ITEMS = new Set([
  "assemble-upload", "assemble-model-toggle",
  "configure-upload", "configure-model-toggle",
]);
