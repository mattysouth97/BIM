"use client";

import React from "react";
import { DoorOpen, AppWindow, Wrench, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DOOR_PRESETS,
  WINDOW_PRESETS,
  MEP_PRESETS,
  STAIR_PRESETS,
} from "@/lib/components/component-types";
import type { ComponentPreset, ComponentCategory } from "@/lib/components/component-types";
import { useComponentStore } from "@/store/component-store";

// Lucide doesn't export a "Stairs" icon in the version used — use a generic icon
import { ArrowUpFromLine } from "lucide-react";

const ALL_PRESETS: ComponentPreset[] = [
  ...DOOR_PRESETS,
  ...WINDOW_PRESETS,
  ...MEP_PRESETS,
  ...STAIR_PRESETS,
];

const CATEGORY_ICONS: Record<ComponentCategory, React.ReactNode> = {
  door: <DoorOpen className="size-4 text-muted-foreground" />,
  window: <AppWindow className="size-4 text-muted-foreground" />,
  mep: <Wrench className="size-4 text-muted-foreground" />,
  stair: <ArrowUpFromLine className="size-4 text-muted-foreground" />,
};

const doorCount = DOOR_PRESETS.length;
const windowCount = WINDOW_PRESETS.length;
const mepCount = MEP_PRESETS.length;
const stairCount = STAIR_PRESETS.length;

interface PresetCardProps {
  preset: ComponentPreset;
  isActive: boolean;
  onSelect: (preset: ComponentPreset) => void;
}

function PresetCard({ preset, isActive, onSelect }: PresetCardProps) {
  const wMm = Math.round(preset.width * 1000);
  const hMm = Math.round(preset.height * 1000);
  const dMm = Math.round(preset.depth * 1000);

  return (
    <button
      className={`flex w-full items-start gap-2 rounded-md border p-2 text-left transition-colors hover:bg-muted/60 ${
        isActive ? "border-primary bg-primary/10" : "border-border bg-background"
      }`}
      onClick={() => onSelect(preset)}
      title={`${preset.name} — click to start placing`}
    >
      <div className="mt-0.5 shrink-0">{CATEGORY_ICONS[preset.category]}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{preset.nameKo}</div>
        <div className="text-xs text-muted-foreground">{preset.name}</div>
        <div className="text-xs text-muted-foreground/70">
          {wMm}×{hMm}×{dMm}mm
        </div>
      </div>
    </button>
  );
}

function PresetList({
  presets,
  draggingId,
  onSelect,
}: {
  presets: ComponentPreset[];
  draggingId: string | null;
  onSelect: (preset: ComponentPreset) => void;
}) {
  if (presets.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">No presets</p>;
  }
  return (
    <div className="flex flex-col gap-1 p-2">
      {presets.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          isActive={draggingId === preset.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function ComponentCatalog() {
  const dragging = useComponentStore((s) => s.dragging);
  const draggingId = dragging?.id ?? null;

  function handleSelect(preset: ComponentPreset) {
    useComponentStore.getState().setDragging(preset);
  }

  function handleCancel() {
    useComponentStore.getState().setDragging(null);
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Components</span>
        {dragging && (
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            onClick={handleCancel}
            title="Cancel placement"
          >
            <X className="size-3" />
            Cancel
          </button>
        )}
      </div>

      {/* Active drag indicator */}
      {dragging && (
        <div className="mx-2 mt-2 rounded-md bg-primary/10 border border-primary/30 px-2 py-1.5">
          <p className="text-xs text-primary font-medium">
            Placing: {dragging.nameKo}
          </p>
          <p className="text-xs text-muted-foreground">Click in 3D scene to place</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="all" className="flex-1">
        <div className="px-2 pt-2">
          <TabsList className="grid w-full grid-cols-5 h-auto p-0.5">
            <TabsTrigger value="all" className="text-xs px-1 py-1">
              All ({ALL_PRESETS.length})
            </TabsTrigger>
            <TabsTrigger value="door" className="text-xs px-1 py-1">
              Doors ({doorCount})
            </TabsTrigger>
            <TabsTrigger value="window" className="text-xs px-1 py-1">
              Win ({windowCount})
            </TabsTrigger>
            <TabsTrigger value="mep" className="text-xs px-1 py-1">
              MEP ({mepCount})
            </TabsTrigger>
            <TabsTrigger value="stair" className="text-xs px-1 py-1">
              Stairs ({stairCount})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all">
          <PresetList presets={ALL_PRESETS} draggingId={draggingId} onSelect={handleSelect} />
        </TabsContent>
        <TabsContent value="door">
          <PresetList presets={DOOR_PRESETS} draggingId={draggingId} onSelect={handleSelect} />
        </TabsContent>
        <TabsContent value="window">
          <PresetList presets={WINDOW_PRESETS} draggingId={draggingId} onSelect={handleSelect} />
        </TabsContent>
        <TabsContent value="mep">
          <PresetList presets={MEP_PRESETS} draggingId={draggingId} onSelect={handleSelect} />
        </TabsContent>
        <TabsContent value="stair">
          <PresetList presets={STAIR_PRESETS} draggingId={draggingId} onSelect={handleSelect} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
