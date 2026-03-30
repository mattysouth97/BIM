"use client";

import React from "react";
import { Layers, Square, Home, Package } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { usePlanStore } from "@/store/plan-store";
import { useComponentStore } from "@/store/component-store";
import { useSelectionStore } from "@/store/selection-store";

interface SceneOutlinerProps {
  /** The building PK — used to scope placed component selection */
  buildingPk: string;
}

export function SceneOutliner({ buildingPk }: SceneOutlinerProps) {
  const walls = usePlanStore((s) => s.walls);
  const rooms = usePlanStore((s) => s.rooms);
  const openings = usePlanStore((s) => s.openings);
  const floorCount = usePlanStore((s) => s.floorCount);
  const placed = useComponentStore((s) => s.placed);
  const selectedId = useSelectionStore((s) => s.selectedId);

  const placedForBuilding = placed[buildingPk] ?? [];

  // Build array of floor indices [0, 1, ..., floorCount-1]
  const floors = Array.from({ length: floorCount }, (_, i) => i);

  // Default all floors open
  const defaultOpenValues = floors.map((f) => `floor-${f}`);

  if (walls.length === 0 && rooms.length === 0 && placedForBuilding.length === 0) {
    return (
      <div className="p-3">
        <p className="text-xs text-muted-foreground text-center py-4">No elements yet</p>
      </div>
    );
  }

  return (
    <div className="px-1 py-1">
      <Accordion type="multiple" defaultValue={defaultOpenValues}>
        {floors.map((floorIndex) => {
          const floorWalls = walls.filter((w) => w.floor === floorIndex);
          const floorRooms = rooms.filter((r) => r.floor === floorIndex);
          const floorOpenings = openings.filter((o) => o.floor === floorIndex);

          // Components don't have a floor property — show all under every floor's section
          // but only on floor 0 to avoid duplication
          const showComponents = floorIndex === 0;
          const hasContent =
            floorWalls.length > 0 ||
            floorRooms.length > 0 ||
            floorOpenings.length > 0 ||
            (showComponents && placedForBuilding.length > 0);

          return (
            <AccordionItem key={floorIndex} value={`floor-${floorIndex}`}>
              <AccordionTrigger className="px-2 py-2 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-1.5">
                  <Layers className="size-3.5 text-muted-foreground" />
                  Floor {floorIndex + 1}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                {!hasContent && (
                  <p className="px-6 py-1 text-xs text-muted-foreground">Empty floor</p>
                )}

                {/* Walls section */}
                {floorWalls.length > 0 && (
                  <div className="mb-1">
                    <div className="px-6 py-0.5 text-xs text-muted-foreground font-medium">
                      Walls ({floorWalls.length})
                    </div>
                    {floorWalls.map((wall) => (
                      <button
                        key={wall.id}
                        className={`flex w-full items-center gap-1.5 px-8 py-1 text-xs text-left hover:bg-muted/60 rounded transition-colors ${
                          selectedId === wall.id ? "bg-accent text-accent-foreground" : ""
                        }`}
                        onClick={() =>
                          useSelectionStore.getState().select("wall", wall.id, buildingPk)
                        }
                      >
                        <Square className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">Wall {wall.id.slice(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Rooms section */}
                {floorRooms.length > 0 && (
                  <div className="mb-1">
                    <div className="px-6 py-0.5 text-xs text-muted-foreground font-medium">
                      Rooms ({floorRooms.length})
                    </div>
                    {floorRooms.map((room) => (
                      <button
                        key={room.id}
                        className={`flex w-full items-center gap-1.5 px-8 py-1 text-xs text-left hover:bg-muted/60 rounded transition-colors ${
                          selectedId === room.id ? "bg-accent text-accent-foreground" : ""
                        }`}
                        onClick={() =>
                          useSelectionStore.getState().select("room", room.id, buildingPk)
                        }
                      >
                        <Home className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate capitalize">
                          {room.type} — {room.area.toFixed(1)}m²
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Components section — only on floor 0 */}
                {showComponents && placedForBuilding.length > 0 && (
                  <div className="mb-1">
                    <div className="px-6 py-0.5 text-xs text-muted-foreground font-medium">
                      Components ({placedForBuilding.length})
                    </div>
                    {placedForBuilding.map((comp) => (
                      <button
                        key={comp.instanceId}
                        className={`flex w-full items-center gap-1.5 px-8 py-1 text-xs text-left hover:bg-muted/60 rounded transition-colors ${
                          selectedId === comp.instanceId ? "bg-accent text-accent-foreground" : ""
                        }`}
                        onClick={() =>
                          useSelectionStore.getState().select(
                            "component",
                            comp.instanceId,
                            buildingPk
                          )
                        }
                      >
                        <Package className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{comp.presetId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
