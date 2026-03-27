"use client";

import { useCallback, useState } from "react";
import { useAuthoringStore } from "@/store/authoring-store";
import { useComponentStore } from "@/store/component-store";
import { useAppStore } from "@/store/app-store";
import {
  DOOR_PRESETS,
  WINDOW_PRESETS,
  MEP_PRESETS,
  STAIR_PRESETS,
  type ComponentPreset,
  type ComponentCategory,
} from "@/lib/components/component-types";
import { DoorOpen, AppWindow, Cog, ArrowUpDown } from "lucide-react";

const CATEGORIES: {
  id: ComponentCategory;
  label: string;
  labelKo: string;
  icon: React.ReactNode;
  presets: ComponentPreset[];
}[] = [
  { id: "door", label: "Doors", labelKo: "문", icon: <DoorOpen className="h-4 w-4" />, presets: DOOR_PRESETS },
  { id: "window", label: "Windows", labelKo: "창문", icon: <AppWindow className="h-4 w-4" />, presets: WINDOW_PRESETS },
  { id: "mep", label: "MEP", labelKo: "설비", icon: <Cog className="h-4 w-4" />, presets: MEP_PRESETS },
  { id: "stair", label: "Stairs", labelKo: "계단", icon: <ArrowUpDown className="h-4 w-4" />, presets: STAIR_PRESETS },
];

function formatDim(m: number): string {
  return `${Math.round(m * 1000)}`;
}

interface PresetCardProps {
  preset: ComponentPreset;
  isKo: boolean;
  isSelected: boolean;
  onSelect: (preset: ComponentPreset) => void;
}

function PresetCard({ preset, isKo, isSelected, onSelect }: PresetCardProps) {
  return (
    <button
      type="button"
      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-accent ${
        isSelected ? "border-primary bg-primary/10" : "border-border"
      }`}
      onClick={() => onSelect(preset)}
    >
      <div className="font-medium">{isKo ? preset.nameKo : preset.name}</div>
      <div className="mt-0.5 text-muted-foreground">
        {formatDim(preset.width)} x {formatDim(preset.height)} mm
      </div>
    </button>
  );
}

export function ComponentPalette() {
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);
  const dragging = useComponentStore((s) => s.dragging);
  const setDragging = useComponentStore((s) => s.setDragging);
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";

  const [activeTab, setActiveTab] = useState<ComponentCategory>("door");

  const handleSelect = useCallback(
    (preset: ComponentPreset) => {
      if (dragging?.id === preset.id) {
        setDragging(null);
      } else {
        setDragging(preset);
      }
    },
    [dragging, setDragging]
  );

  if (!isAuthoring) return null;

  const activeCategory = CATEGORIES.find((c) => c.id === activeTab)!;

  return (
    <div className="absolute right-4 top-36 z-20 w-64 rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">
          {isKo ? "부품 팔레트" : "Component Palette"}
        </h3>
        {dragging && (
          <p className="mt-0.5 text-xs text-primary">
            {isKo
              ? `배치 중: ${dragging.nameKo} — 3D 장면을 클릭하세요`
              : `Placing: ${dragging.name} — click in 3D scene`}
          </p>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-border">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs transition-colors ${
              activeTab === cat.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(cat.id)}
            title={isKo ? cat.labelKo : cat.label}
          >
            {cat.icon}
            <span className="hidden sm:inline">{isKo ? cat.labelKo : cat.label}</span>
          </button>
        ))}
      </div>

      {/* Preset cards */}
      <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
        {activeCategory.presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isKo={isKo}
            isSelected={dragging?.id === preset.id}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
