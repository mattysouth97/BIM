"use client";

// src/components/generative/schematic/schematic-toolbar.tsx
//
// Tool selection and the settings a drawn object inherits: which levels it
// lands on, what a void is for, what a zone is programmed as.
//
// Those settings are not decoration — they are the difference between a
// rectangle and an atrium on levels 1–6. They sit next to the tool that uses
// them so the choice is made BEFORE the mark, not repaired afterwards.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  familiesForTool,
  getAuthoringFamily,
} from "@/lib/bim/family-catalog";
import {
  CIRCULATION_NODE_KINDS,
  ZONE_PROGRAMS,
  isPlacementTool,
  useBlueprintStore,
  type SchematicTool,
} from "@/store/blueprint-store";

import { ImportCadDialog } from "./import-cad-dialog";

const PLAN_TOOLS: Array<{ id: SchematicTool; label: string; hint: string }> = [
  { id: "select", label: "Select", hint: "Select and pan (drag to pan, Delete removes)" },
  { id: "boundary", label: "Boundary", hint: "The floor plate outline" },
  { id: "void", label: "Void", hint: "Atrium or courtyard punched through the plate" },
  { id: "core", label: "Core", hint: "Vertical core: stairs, lifts, shafts" },
  { id: "entrance", label: "Entrance", hint: "An entrance anchored on a boundary edge" },
  { id: "circulation", label: "Circulation", hint: "Route nodes, linked as you click" },
  { id: "zone", label: "Zone", hint: "A programmed area" },
];

const AUTHORING_TOOLS: Array<{ id: SchematicTool; label: string; hint: string }> = [
  { id: "column", label: "Column", hint: "Place a pillar on the plan — generate compiles it into the BIM" },
  { id: "lighting", label: "Light", hint: "Place a light on the plan — generate compiles it into the BIM" },
  { id: "furniture", label: "Furniture", hint: "Place furniture on the plan — generate compiles it into the BIM" },
];

function ToolButton({
  id,
  label,
  hint,
  active,
}: {
  id: SchematicTool;
  label: string;
  hint: string;
  active: boolean;
}) {
  return (
    <button
      key={id}
      type="button"
      title={hint}
      aria-pressed={active}
      data-testid={`schematic-tool-${id}`}
      onClick={() => useBlueprintStore.getState().setTool(id)}
      className={cn(
        "rounded border px-2 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

const SNAP_STEPS = [0, 100, 500, 1_000, 5_000];

export function SchematicToolbar() {
  const tool = useBlueprintStore((s) => s.tool);
  const shapeMode = useBlueprintStore((s) => s.shapeMode);
  const voidKind = useBlueprintStore((s) => s.voidKind);
  const zoneProgram = useBlueprintStore((s) => s.zoneProgram);
  const nodeKind = useBlueprintStore((s) => s.circulationNodeKind);
  const placementFamilyId = useBlueprintStore((s) => s.placementFamilyId);
  const snapMm = useBlueprintStore((s) => s.snapMm);
  const floorFrom = useBlueprintStore((s) => s.floorFrom);
  const floorTo = useBlueprintStore((s) => s.floorTo);
  const selectedId = useBlueprintStore((s) => s.selectedId);
  const past = useBlueprintStore((s) => s.past);
  const future = useBlueprintStore((s) => s.future);
  const [importOpen, setImportOpen] = useState(false);

  const supportsShape = tool === "boundary" || tool === "void" || tool === "zone";
  const placementFamily = getAuthoringFamily(placementFamilyId);
  const placementTypes = isPlacementTool(tool) ? familiesForTool(tool) : [];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {PLAN_TOOLS.map((entry) => (
          <ToolButton
            key={entry.id}
            id={entry.id}
            label={entry.label}
            hint={entry.hint}
            active={tool === entry.id}
          />
        ))}
      </div>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <div className="flex flex-wrap items-center gap-1">
        {AUTHORING_TOOLS.map((entry) => (
          <ToolButton
            key={entry.id}
            id={entry.id}
            label={entry.label}
            hint={entry.hint}
            active={tool === entry.id}
          />
        ))}
      </div>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      {supportsShape && (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Shape
          <select
            value={shapeMode}
            onChange={(e) =>
              useBlueprintStore
                .getState()
                .setShapeMode(e.target.value as typeof shapeMode)
            }
            className="rounded border bg-background px-1 py-0.5 text-[11px]"
          >
            <option value="rect">Rectangle</option>
            <option value="polygon">Polygon</option>
          </select>
        </label>
      )}

      {tool === "void" && (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Void
          <select
            value={voidKind}
            onChange={(e) =>
              useBlueprintStore.getState().setVoidKind(e.target.value as typeof voidKind)
            }
            className="rounded border bg-background px-1 py-0.5 text-[11px]"
          >
            <option value="atrium">Atrium</option>
            <option value="courtyard">Courtyard</option>
          </select>
        </label>
      )}

      {tool === "zone" && (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Program
          <select
            value={zoneProgram}
            onChange={(e) =>
              useBlueprintStore
                .getState()
                .setZoneProgram(e.target.value as typeof zoneProgram)
            }
            className="rounded border bg-background px-1 py-0.5 text-[11px]"
          >
            {ZONE_PROGRAMS.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>
        </label>
      )}

      {tool === "circulation" && (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Node
          <select
            value={nodeKind}
            onChange={(e) =>
              useBlueprintStore
                .getState()
                .setCirculationNodeKind(e.target.value as typeof nodeKind)
            }
            className="rounded border bg-background px-1 py-0.5 text-[11px]"
          >
            {CIRCULATION_NODE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
      )}

      {isPlacementTool(tool) && (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Type
          <select
            value={placementFamily?.id ?? placementFamilyId}
            onChange={(e) =>
              useBlueprintStore.getState().setPlacementFamily(e.target.value)
            }
            className="max-w-[14rem] rounded border bg-background px-1 py-0.5 text-[11px]"
            aria-label="Family type to place"
            data-testid="schematic-placement-type"
          >
            {placementTypes.map((family) => (
              <option key={family.id} value={family.id}>
                {family.family} · {family.type}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Levels
        <input
          type="number"
          min={-8}
          max={120}
          value={floorFrom}
          onChange={(e) =>
            useBlueprintStore.getState().setFloors(Number(e.target.value) || 1, floorTo)
          }
          className="w-12 rounded border bg-background px-1 py-0.5 text-[11px]"
          aria-label="Lowest level for new objects"
        />
        <span aria-hidden>–</span>
        <input
          type="number"
          min={-8}
          max={120}
          value={floorTo}
          onChange={(e) =>
            useBlueprintStore.getState().setFloors(floorFrom, Number(e.target.value) || 1)
          }
          className="w-12 rounded border bg-background px-1 py-0.5 text-[11px]"
          aria-label="Highest level for new objects"
        />
      </label>

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Snap
        <select
          value={snapMm}
          onChange={(e) => useBlueprintStore.getState().setSnap(Number(e.target.value))}
          className="rounded border bg-background px-1 py-0.5 text-[11px]"
        >
          {SNAP_STEPS.map((step) => (
            <option key={step} value={step}>
              {step === 0 ? "off" : `${step} mm`}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="xs"
          variant="outline"
          onClick={() => setImportOpen(true)}
          title="Read a DWG, DXF or SVG drawing into this schematic, after reviewing the layer mapping"
          data-testid="schematic-import-cad"
        >
          Import DWG/DXF/SVG
        </Button>
        <ImportCadDialog open={importOpen} onOpenChange={setImportOpen} />
        <Button
          size="xs"
          variant="ghost"
          onClick={() => useBlueprintStore.getState().undo()}
          disabled={past.length === 0}
          title="Undo"
        >
          ←
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => useBlueprintStore.getState().redo()}
          disabled={future.length === 0}
          title="Redo"
        >
          →
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => useBlueprintStore.getState().deleteSelected()}
          disabled={!selectedId}
          title="Delete the selected object"
        >
          Delete
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => useBlueprintStore.getState().reset()}
          title="Discard the schematic and start a blank one"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
