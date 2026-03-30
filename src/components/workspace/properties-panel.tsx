"use client";

import React from "react";
import { MousePointerClick, Ruler, Box, Component } from "lucide-react";
import { useSelectionStore } from "@/store/selection-store";
import { usePlanStore } from "@/store/plan-store";
import { useComponentStore } from "@/store/component-store";
import { useEnergyDelta } from "@/hooks/use-energy-delta";
import { ROOM_TYPES, type RoomType } from "@/lib/plan/room-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────────────────────────────────────
// Wall properties editor
// ─────────────────────────────────────────────────────────────────────────────

function WallProperties({
  wallId,
  buildingPk,
}: {
  wallId: string;
  buildingPk: string | null;
}) {
  const wall = usePlanStore((s) => s.walls.find((w) => w.id === wallId));
  const updateWall = usePlanStore((s) => s.updateWall);
  const energyDelta = useEnergyDelta(buildingPk ?? "");

  if (!wall) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs p-4">
        <span>Wall not found.</span>
      </div>
    );
  }

  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const conductivity = wall.thermalConductivity ?? 0.5;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Ruler className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Wall</span>
        <Badge variant="secondary" className="text-xs ml-auto">
          Floor {wall.floor + 1}
        </Badge>
      </div>

      <Separator />

      {/* Read-only: length */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Length (m)</Label>
        <Input
          readOnly
          value={length.toFixed(3)}
          className="h-8 text-xs bg-muted/30"
        />
      </div>

      {/* Editable: thickness */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Thickness (m)</Label>
        <Input
          type="number"
          min={0.05}
          max={2}
          step={0.05}
          value={wall.thickness}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) updateWall(wall.id, { thickness: v });
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Editable: height */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Height (m)</Label>
        <Input
          type="number"
          min={0.5}
          max={50}
          step={0.1}
          value={wall.height}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) updateWall(wall.id, { height: v });
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Editable: thermal conductivity — energy-affecting slider with delta annotation */}
      <div className="grid gap-1.5">
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">
            Thermal Conductivity (W/m·K)
          </Label>
          {energyDelta.demandDelta !== null && (
            <span
              className={cn(
                "text-[10px] font-medium tabular-nums ml-2 transition-opacity duration-300",
                energyDelta.isImprovement ? "text-green-600" : "text-amber-600"
              )}
            >
              {energyDelta.demandDelta > 0 ? "+" : ""}
              {energyDelta.demandDelta.toFixed(1)} kWh/m²
            </span>
          )}
        </div>
        <Input
          type="number"
          min={0.01}
          max={10}
          step={0.01}
          value={conductivity}
          onFocus={() => energyDelta.snapshot()}
          onPointerDown={() => energyDelta.snapshot()}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) updateWall(wall.id, { thermalConductivity: v });
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Read-only: floor */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Floor</Label>
        <Input
          readOnly
          value={`Floor ${wall.floor + 1}`}
          className="h-8 text-xs bg-muted/30"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Room properties editor
// ─────────────────────────────────────────────────────────────────────────────

function RoomProperties({ roomId }: { roomId: string }) {
  const room = usePlanStore((s) => s.rooms.find((r) => r.id === roomId));
  const setRoomType = usePlanStore((s) => s.setRoomType);

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs p-4">
        <span>Room not found.</span>
      </div>
    );
  }

  const roomMeta = ROOM_TYPES[room.type];

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Box className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Room</span>
        <Badge variant="secondary" className="text-xs ml-auto">
          Floor {room.floor + 1}
        </Badge>
      </div>

      <Separator />

      {/* Room type selector */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Room Type</Label>
        <Select
          value={room.type}
          onValueChange={(v) => setRoomType(room.id, v as RoomType)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROOM_TYPES) as RoomType[]).map((key) => (
              <SelectItem key={key} value={key} className="text-xs">
                {ROOM_TYPES[key].name} ({ROOM_TYPES[key].nameKo})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Read-only: area */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Area (m²)</Label>
        <Input
          readOnly
          value={room.area.toFixed(2)}
          className="h-8 text-xs bg-muted/30"
        />
      </div>

      {/* Read-only: floor */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Floor</Label>
        <Input
          readOnly
          value={`Floor ${room.floor + 1}`}
          className="h-8 text-xs bg-muted/30"
        />
      </div>

      {/* Current type badge */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Display Name</Label>
        <Badge variant="outline" className="text-xs">
          {roomMeta.name} / {roomMeta.nameKo}
        </Badge>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component properties editor
// ─────────────────────────────────────────────────────────────────────────────

function ComponentProperties({
  instanceId,
  buildingPk,
}: {
  instanceId: string;
  buildingPk: string | null;
}) {
  const pk = buildingPk ?? "__current__";
  const component = useComponentStore(
    (s) =>
      (s.placed[pk] ?? s.placed["__current__"] ?? []).find(
        (c) => c.instanceId === instanceId
      )
  );
  const updatePosition = useComponentStore((s) => s.updatePosition);

  if (!component) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs p-4">
        <span>Component not found.</span>
      </div>
    );
  }

  const [px, py, pz] = component.position;
  const [_rx, ry, _rz] = component.rotation;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Component className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold truncate">{component.presetId}</span>
      </div>

      <Separator />

      {/* Read-only: preset id */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Preset</Label>
        <Input
          readOnly
          value={component.presetId}
          className="h-8 text-xs bg-muted/30"
        />
      </div>

      {/* Editable: position x */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Position X (m)</Label>
        <Input
          type="number"
          step={0.1}
          value={px}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              updatePosition(pk, instanceId, [v, py, pz]);
            }
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Editable: position y */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Position Y (m)</Label>
        <Input
          type="number"
          step={0.1}
          value={py}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              updatePosition(pk, instanceId, [px, v, pz]);
            }
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Editable: position z */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Position Z (m)</Label>
        <Input
          type="number"
          step={0.1}
          value={pz}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              updatePosition(pk, instanceId, [px, py, v]);
            }
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Editable: rotation y */}
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Rotation Y (rad)</Label>
        <Input
          type="number"
          step={0.1}
          value={ry}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              // component-store only has updatePosition, so we use it for position
              // Rotation update would require an additional store action
              // For now, display only (rotation editing requires updateRotation)
            }
          }}
          readOnly
          className="h-8 text-xs bg-muted/30"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptySelection() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-4">
      <MousePointerClick className="h-8 w-8 opacity-40" />
      <p className="text-xs text-center leading-relaxed">
        Select an element in the viewport to view and edit its properties.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main PropertiesPanel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Properties panel — renders in the right dock of WorkspaceShell.
 * Reads selection from useSelectionStore and displays the appropriate editor.
 */
export function PropertiesPanel() {
  const selectedType = useSelectionStore((s) => s.selectedType);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const buildingPk = useSelectionStore((s) => s.buildingPk);

  if (!selectedType || !selectedId) {
    return <EmptySelection />;
  }

  if (selectedType === "wall") {
    return <WallProperties wallId={selectedId} buildingPk={buildingPk} />;
  }

  if (selectedType === "room") {
    return <RoomProperties roomId={selectedId} />;
  }

  if (selectedType === "component") {
    return <ComponentProperties instanceId={selectedId} buildingPk={buildingPk} />;
  }

  return <EmptySelection />;
}
