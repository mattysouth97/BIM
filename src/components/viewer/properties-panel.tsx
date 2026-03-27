"use client";

import { useCallback } from "react";
import { useAuthoringStore, type AuthoringElementType } from "@/store/authoring-store";
import { useAppStore } from "@/store/app-store";
import { Box, Columns3, Layers, Home, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PropertyRow {
  key: string;
  labelEn: string;
  labelKo: string;
}

const WALL_PROPS: PropertyRow[] = [
  { key: "posX", labelEn: "Position X", labelKo: "위치 X" },
  { key: "posY", labelEn: "Position Y", labelKo: "위치 Y" },
  { key: "posZ", labelEn: "Position Z", labelKo: "위치 Z" },
  { key: "scaleX", labelEn: "Scale X", labelKo: "크기 X" },
  { key: "scaleY", labelEn: "Scale Y", labelKo: "크기 Y" },
  { key: "scaleZ", labelEn: "Scale Z", labelKo: "크기 Z" },
];

const SLAB_PROPS: PropertyRow[] = [
  { key: "posX", labelEn: "Position X", labelKo: "위치 X" },
  { key: "posY", labelEn: "Elevation", labelKo: "높이" },
  { key: "posZ", labelEn: "Position Z", labelKo: "위치 Z" },
  { key: "scaleX", labelEn: "Width", labelKo: "폭" },
  { key: "scaleY", labelEn: "Thickness", labelKo: "두께" },
  { key: "scaleZ", labelEn: "Depth", labelKo: "깊이" },
];

const COLUMN_PROPS: PropertyRow[] = [
  { key: "posX", labelEn: "Position X", labelKo: "위치 X" },
  { key: "posY", labelEn: "Position Y", labelKo: "위치 Y" },
  { key: "posZ", labelEn: "Position Z", labelKo: "위치 Z" },
  { key: "scaleX", labelEn: "Size X", labelKo: "크기 X" },
  { key: "scaleY", labelEn: "Height", labelKo: "높이" },
];

const ROOF_PROPS: PropertyRow[] = [
  { key: "posX", labelEn: "Position X", labelKo: "위치 X" },
  { key: "posY", labelEn: "Elevation", labelKo: "높이" },
  { key: "posZ", labelEn: "Position Z", labelKo: "위치 Z" },
  { key: "scaleX", labelEn: "Width", labelKo: "폭" },
  { key: "scaleZ", labelEn: "Depth", labelKo: "깊이" },
];

function getPropsForType(type: AuthoringElementType): PropertyRow[] {
  switch (type) {
    case "wall": return WALL_PROPS;
    case "slab": return SLAB_PROPS;
    case "column": return COLUMN_PROPS;
    case "roof": return ROOF_PROPS;
    default: return WALL_PROPS;
  }
}

function getTypeIcon(type: AuthoringElementType) {
  switch (type) {
    case "wall": return <Box className="h-4 w-4" />;
    case "slab": return <Layers className="h-4 w-4" />;
    case "column": return <Columns3 className="h-4 w-4" />;
    case "roof": return <Home className="h-4 w-4" />;
    default: return <Box className="h-4 w-4" />;
  }
}

function getTypeName(type: AuthoringElementType, isKo: boolean): string {
  switch (type) {
    case "wall": return isKo ? "벽체" : "Wall";
    case "slab": return isKo ? "슬래브" : "Slab";
    case "column": return isKo ? "기둥" : "Column";
    case "roof": return isKo ? "지붕" : "Roof";
    case "component": return isKo ? "부재" : "Component";
    default: return isKo ? "요소" : "Element";
  }
}

/**
 * Floating properties panel shown when an element is selected in authoring mode.
 * Rendered as HTML overlay outside Canvas. Displays position/scale fields.
 * Actual 3D object manipulation is handled by TransformGizmo inside Canvas.
 */
export function PropertiesPanel() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const selectedElementId = useAuthoringStore((s) => s.selectedElementId);
  const selectedElementType = useAuthoringStore((s) => s.selectedElementType);
  const clearSelection = useAuthoringStore((s) => s.clearSelection);
  const pushEdit = useAuthoringStore((s) => s.pushEdit);

  const handleValueChange = useCallback(
    (key: string, newValue: number) => {
      if (!selectedElementId) return;
      // Push the edit to the undo stack. The actual 3D manipulation
      // is done via TransformGizmo's TransformControls in the Canvas.
      pushEdit({
        elementId: selectedElementId,
        property: key,
        oldValue: 0, // Placeholder — real old value tracked by gizmo
        newValue,
        timestamp: Date.now(),
      });
    },
    [selectedElementId, pushEdit]
  );

  const handleDelete = useCallback(() => {
    // Signal deletion — actual removal would require scene access
    clearSelection();
  }, [clearSelection]);

  if (!selectedElementId || !selectedElementType) return null;

  const props = getPropsForType(selectedElementType);

  return (
    <div className="absolute bottom-3 left-3 z-20 w-72 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getTypeIcon(selectedElementType)}
          <span className="text-sm font-semibold">
            {getTypeName(selectedElementType, isKo)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {selectedElementId.slice(0, 8)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={handleDelete}
          title={isKo ? "삭제" : "Delete"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Property rows */}
      <div className="space-y-1.5">
        {props.map((prop) => (
          <PropertyInput
            key={prop.key}
            label={isKo ? prop.labelKo : prop.labelEn}
            defaultValue={1.0}
            onChange={(v) => handleValueChange(prop.key, v)}
          />
        ))}
      </div>

      {/* Hint */}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {isKo ? "기즈모를 드래그하여 변환" : "Drag gizmo to transform"} | G/R/S
      </p>
    </div>
  );
}

function PropertyInput({
  label,
  defaultValue,
  onChange,
}: {
  label: string;
  defaultValue: number;
  onChange: (v: number) => void;
}) {
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) onChange(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = parseFloat(e.currentTarget.value);
      if (!isNaN(v)) onChange(v);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <input
        type="number"
        step="0.1"
        className="flex-1 rounded border bg-background px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
        defaultValue={defaultValue.toFixed(2)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
