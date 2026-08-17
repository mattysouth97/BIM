"use client";

// src/components/generative/schematic/import-cad-dialog.tsx
//
// Import a DWG/DXF drawing as a schematic — under review, never behind the
// user's back.
//
// The flow is deliberately three separate acts:
//
//   1. READ    — the file becomes a CadDocument through the same path the CAD
//                viewer uses (DXF text, or DWG via `parseDwgFile`'s converter
//                tiers). Failures name the file and the reason.
//   2. CONFIRM — every layer is listed with its entity count and the role that
//                was GUESSED for it. Nothing is applied until the user has seen
//                this table; a guess made from geometry rather than a layer
//                name says so.
//   3. ADOPT   — "Use as schematic" hands the interpreted blueprint to the
//                store as ONE undo step, with the confirmed mapping recorded.
//
// The preview re-runs the real import pipeline on every mapping change and
// draws its output with the editor's own display tessellation, so what is on
// screen is the blueprint that would be adopted — not an illustration of it.

import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CadDocument } from "@/lib/cad/doc/types";
import {
  CAD_LAYER_ROLES,
  DEFAULT_ZONE_PROGRAM,
  guessLayerAssignments,
  importCadDocument,
  summariseLayers,
  type CadImportOutcome,
  type CadLayerAssignments,
  type CadLayerRole,
  type CadLayerSummary,
} from "@/lib/generative/blueprint/import-cad-file";
import {
  ACCEPTED_CAD_EXTENSIONS,
  readCadFile,
  type CadFileFormat,
} from "@/lib/generative/blueprint/read-cad-file";
import type { SpaceType } from "@/lib/generative/spec/building-spec";
import { cn } from "@/lib/utils";
import { ZONE_PROGRAMS, useBlueprintStore } from "@/store/blueprint-store";

import {
  blueprintBounds,
  pathOf,
  schematicShapes,
  ZONE_DEFAULT_FILL,
  ZONE_FILL,
} from "./schematic-geometry";
import { fitTransform, toScreen } from "./view-transform";

const PREVIEW_WIDTH = 420;
const PREVIEW_HEIGHT = 260;

const BASIS_NOTE: Record<CadLayerSummary["basis"], string> = {
  "layer-name": "from the layer name",
  "largest-closed-shape":
    "no layer name suggested an outline — nominated because it holds the largest closed shape",
  "no-match": "no keyword matched, so it is left out unless you say otherwise",
};

interface LoadedFile {
  file: File;
  doc: CadDocument;
  format: CadFileFormat;
  layers: CadLayerSummary[];
  warnings: string[];
}

export function ImportCadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [assignments, setAssignments] = useState<CadLayerAssignments>({});
  const [readError, setReadError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const reset = useCallback(() => {
    setLoaded(null);
    setAssignments({});
    setReadError(null);
    setBusy(false);
  }, []);

  const onPick = useCallback(async (file: File) => {
    setBusy(true);
    setReadError(null);
    setLoaded(null);
    try {
      const result = await readCadFile(file);
      if (!result.ok) {
        setReadError(result.error);
        return;
      }
      setLoaded({
        file,
        doc: result.doc,
        format: result.format,
        layers: summariseLayers(result.doc),
        warnings: result.warnings,
      });
      setAssignments(guessLayerAssignments(result.doc));
    } finally {
      setBusy(false);
    }
  }, []);

  // The preview IS the import: same function, same mapping, same result.
  const outcome: CadImportOutcome | null = useMemo(() => {
    if (!loaded) return null;
    return importCadDocument(loaded.doc, assignments, {
      fileName: loaded.file.name,
      name: loaded.file.name.replace(/\.(dxf|dwg)$/i, ""),
    });
  }, [loaded, assignments]);

  const setRole = useCallback((layer: string, role: CadLayerRole) => {
    setAssignments((current) => ({
      ...current,
      [layer]: {
        role,
        ...(role === "zone"
          ? { program: current[layer]?.program ?? DEFAULT_ZONE_PROGRAM }
          : {}),
      },
    }));
  }, []);

  const setProgram = useCallback((layer: string, program: SpaceType) => {
    setAssignments((current) => ({ ...current, [layer]: { role: "zone", program } }));
  }, []);

  const adopt = useCallback(() => {
    if (!loaded || !outcome?.ok) return;
    useBlueprintStore.getState().loadBlueprint(outcome.blueprint, {
      fileName: loaded.file.name,
      format: loaded.format,
      documentId: loaded.doc.id,
      assignments,
      report: outcome.report,
    });
    onOpenChange(false);
    reset();
  }, [loaded, outcome, assignments, onOpenChange, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import DWG/DXF as a schematic</DialogTitle>
          <DialogDescription>
            The drawing is read into a blueprint you review here first. Layer roles
            below are guesses — confirm them before adopting anything.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_CAD_EXTENSIONS.join(",")}
              className="sr-only"
              data-testid="import-cad-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onPick(file);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Reading…" : loaded ? "Choose another file" : "Choose a .dxf or .dwg file"}
            </Button>
            {loaded && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {loaded.file.name} · {loaded.format.toUpperCase()} ·{" "}
                {loaded.doc.stats.mapped} entities · {loaded.layers.length} layers
              </span>
            )}
          </div>

          {readError && (
            <div role="alert" className="rounded border border-destructive/40 px-3 py-2">
              <p className="text-xs">{readError.message}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {readError.code}
              </p>
            </div>
          )}

          {loaded && loaded.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {loaded.warnings.map((warning) => (
                <li key={warning} className="text-[11px] text-amber-700">
                  {warning}
                </li>
              ))}
            </ul>
          )}

          {loaded && outcome && (
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="min-w-0 flex-1">
                <LayerTable
                  layers={loaded.layers}
                  assignments={assignments}
                  onRole={setRole}
                  onProgram={setProgram}
                />
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[420px]">
                <BlueprintPreview outcome={outcome} />
                <ImportSummary outcome={outcome} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={adopt} disabled={!outcome?.ok}>
            Use as schematic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Mapping table                                                       */
/* ------------------------------------------------------------------ */

function LayerTable({
  layers,
  assignments,
  onRole,
  onProgram,
}: {
  layers: CadLayerSummary[];
  assignments: CadLayerAssignments;
  onRole: (layer: string, role: CadLayerRole) => void;
  onProgram: (layer: string, program: SpaceType) => void;
}) {
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 py-1 font-medium">Layer</th>
            <th className="px-2 py-1 font-medium">Entities</th>
            <th className="px-2 py-1 font-medium">Closed</th>
            <th className="px-2 py-1 font-medium">Largest</th>
            <th className="px-2 py-1 font-medium">Read as</th>
          </tr>
        </thead>
        <tbody>
          {layers.map((layer) => {
            const assignment = assignments[layer.name] ?? { role: "ignore" as const };
            const changed = assignment.role !== layer.guess.role;
            return (
              <tr key={layer.name} className="border-t align-top">
                <td className="px-2 py-1">
                  <div className="font-mono">{layer.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    guessed {layer.guess.role} — {BASIS_NOTE[layer.basis]}
                  </div>
                  {layer.entityCount > 0 && layer.textCount === layer.entityCount && (
                    <div className="text-[10px] text-muted-foreground">
                      text only — its labels are read whatever role you pick
                    </div>
                  )}
                </td>
                <td className="px-2 py-1 font-mono">
                  {layer.entityCount}
                  {layer.textCount > 0 && (
                    <span className="text-muted-foreground"> ({layer.textCount} text)</span>
                  )}
                </td>
                <td className="px-2 py-1 font-mono">{layer.closedShapeCount}</td>
                <td className="px-2 py-1 font-mono">
                  {layer.largestClosedAreaSqm > 0
                    ? `${layer.largestClosedAreaSqm.toFixed(1)} m²`
                    : "—"}
                </td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      value={assignment.role}
                      aria-label={`Role for layer ${layer.name}`}
                      onChange={(event) =>
                        onRole(layer.name, event.target.value as CadLayerRole)
                      }
                      className={cn(
                        "rounded border bg-background px-1 py-0.5 text-[11px]",
                        changed && "border-primary",
                      )}
                    >
                      {CAD_LAYER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    {assignment.role === "zone" && (
                      <select
                        value={assignment.program ?? DEFAULT_ZONE_PROGRAM}
                        aria-label={`Program for layer ${layer.name}`}
                        onChange={(event) =>
                          onProgram(layer.name, event.target.value as SpaceType)
                        }
                        className="rounded border bg-background px-1 py-0.5 text-[11px]"
                      >
                        {ZONE_PROGRAMS.map((program) => (
                          <option key={program} value={program}>
                            {program}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview + report                                                    */
/* ------------------------------------------------------------------ */

function BlueprintPreview({ outcome }: { outcome: CadImportOutcome }) {
  const shapes = useMemo(
    () => (outcome.ok ? schematicShapes(outcome.blueprint) : []),
    [outcome],
  );
  const view = useMemo(
    () =>
      fitTransform(
        outcome.ok ? blueprintBounds(outcome.blueprint) : null,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
        24,
      ),
    [outcome],
  );

  if (!outcome.ok) {
    return (
      <div
        role="alert"
        className="flex h-[260px] flex-col justify-center rounded border border-destructive/40 px-3 py-2"
        data-testid="import-cad-error"
      >
        <p className="text-xs">{outcome.error.message}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {outcome.error.code}
        </p>
      </div>
    );
  }

  const project = (point: { xMm: number; zMm: number }) => toScreen(view, point);

  return (
    <svg
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      className="w-full rounded border bg-background"
      viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
      role="img"
      aria-label="Interpreted schematic preview"
      data-testid="import-cad-preview"
    >
      <defs>
        <pattern
          id="import-void-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="#64748b" strokeWidth="1.5" />
        </pattern>
      </defs>

      {shapes
        .filter((shape) => shape.kind === "zone")
        .map((shape) => (
          <path
            key={shape.id}
            d={pathOf(shape.pointsMm.map(project))}
            fill={ZONE_FILL[shape.detail ?? ""] ?? ZONE_DEFAULT_FILL}
            fillOpacity={0.22}
            stroke="#475569"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        ))}
      {shapes
        .filter((shape) => shape.kind === "boundary")
        .map((shape) => (
          <path
            key={shape.id}
            d={pathOf(shape.pointsMm.map(project))}
            fill="#0f172a"
            fillOpacity={0.04}
            stroke="#0f172a"
            strokeWidth={2}
          />
        ))}
      {shapes
        .filter((shape) => shape.kind === "void")
        .map((shape) => (
          <path
            key={shape.id}
            d={pathOf(shape.pointsMm.map(project))}
            fill="url(#import-void-hatch)"
            fillOpacity={0.5}
            stroke="#475569"
            strokeWidth={1.5}
          />
        ))}
      {shapes
        .filter((shape) => shape.kind === "core")
        .map((shape) => (
          <path
            key={shape.id}
            d={pathOf(shape.pointsMm.map(project))}
            fill="#1e293b"
            fillOpacity={0.85}
            stroke="#0f172a"
            strokeWidth={1}
          />
        ))}
    </svg>
  );
}

function ImportSummary({ outcome }: { outcome: CadImportOutcome }) {
  const { report } = outcome;
  const loops = report.loops;

  return (
    <div className="flex flex-col gap-2 rounded border px-3 py-2 font-mono text-[10px]">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>loops {loops.detected}</span>
        <span>boundary {loops.boundary}</span>
        <span>void {loops.void}</span>
        <span>core {loops.core}</span>
        <span>zone {loops.zone}</span>
        <span>circulation {loops.circulation}</span>
        {loops.outsideBoundary > 0 && (
          <span className="text-amber-700">
            outside boundary {loops.outsideBoundary}
          </span>
        )}
      </div>

      <div className={report.units.declared ? "text-muted-foreground" : "text-amber-700"}>
        {report.units.declared
          ? `units: $INSUNITS ${report.units.insUnits} → ${report.units.unitScaleToMeters} m/unit → mm ×1000 (confidence ${report.units.calibrationConfidence})`
          : `units assumed: ${report.units.assumption} (confidence ${report.units.calibrationConfidence})`}
      </div>

      {report.boundaryLayer && (
        <div className="text-muted-foreground">
          boundary from layer {report.boundaryLayer} · {report.boundaryAreaSqm.toFixed(1)} m²
        </div>
      )}

      {report.skipped.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-muted-foreground">
          {report.skipped.map((entry) => (
            <li key={`${entry.reason}-${entry.subject}`}>
              skipped {entry.count} · {entry.subject} · {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
