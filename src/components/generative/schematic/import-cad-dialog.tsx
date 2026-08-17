"use client";

// src/components/generative/schematic/import-cad-dialog.tsx
//
// Import a DWG/DXF/SVG drawing as a schematic — under review, never behind the
// user's back.
//
// The flow is deliberately three separate acts:
//
//   1. READ    — the file becomes geometry through the same path the rest of
//                the app uses. DXF text and DWG (via `parseDwgFile`'s converter
//                tiers) become a CadDocument; an SVG is read as text and walked
//                by `from-svg.ts`. Failures name the file and the reason.
//   2. CONFIRM — every layer is listed with its count and the role that was
//                GUESSED for it. Nothing is applied until the user has seen
//                this table; a guess made from geometry rather than a layer
//                name says so. For SVG, "layer" means an element's
//                `data-layer` (or `id`), inherited through `<g>` ancestors.
//   3. ADOPT   — "Use as schematic" hands the interpreted blueprint to the
//                store as ONE undo step, with the confirmed mapping recorded.
//
// The preview re-runs the real import pipeline on every mapping change and
// draws its output with the editor's own display tessellation, so what is on
// screen is the blueprint that would be adopted — not an illustration of it.
//
// BOTH SOURCES, ONE FLOW. The DXF/DWG and SVG readers differ only in how they
// reach a segment soup; from there they share the role vocabulary, the guess
// policy, the interpretation core, the report shape and this table/preview/
// adopt sequence. The two format-specific facts this dialog states out loud:
//
//   · units — a DXF can declare `$INSUNITS`; an SVG never declares a
//     real-world unit, so its scale comes from the field below and is reported
//     as ASSUMED until the person importing sets it.
//   · counts — an SVG layer is counted in EDGES, not entities, and its text
//     labels are not attributable to a layer at that seam, so the text column
//     reads "—" rather than a fabricated 0.

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
import type { BlueprintSpec } from "@/lib/generative/blueprint/blueprint-spec";
import { svgToSegments } from "@/lib/generative/blueprint/from-svg";
import {
  CAD_LAYER_ROLES,
  DEFAULT_ZONE_PROGRAM,
  guessLayerAssignments,
  importCadDocument,
  type CadImportOutcome,
  type CadImportReport,
  type CadLayerAssignments,
  type CadLayerRole,
  type CadLayerSummary,
} from "@/lib/generative/blueprint/import-cad-file";
import {
  guessSvgLayerAssignments,
  importSvgString,
  type SvgImportOutcome,
  type SvgReadFacts,
} from "@/lib/generative/blueprint/import-svg-file";
import {
  ACCEPTED_DRAWING_EXTENSIONS,
  classifyDrawingFile,
  readCadFile,
  readSvgFile,
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

/** What the SVG reader does not read, stated whether or not the file uses it. */
const SVG_COVERAGE_NOTE =
  "SVG geometry is read from <line>, <polyline>, <polygon>, <rect> and <path>. " +
  "<circle>, <ellipse>, <image> and anything reachable only through <use> are not read.";

/** The file, once read — the only thing that differs between the two sources. */
type LoadedFile =
  | { kind: "cad"; file: File; doc: CadDocument; format: CadFileFormat; warnings: string[] }
  | { kind: "svg"; file: File; text: string };

/**
 * The parts of an import outcome this dialog renders. Both `CadImportOutcome`
 * and `SvgImportOutcome` satisfy it, which is what lets one table, one preview
 * and one adopt button serve both readers.
 */
type ImportOutcomeView =
  | { ok: true; blueprint: BlueprintSpec; report: CadImportReport }
  | { ok: false; error: { code: string; message: string }; report: CadImportReport };

/** The outcome with its source still attached, so SVG-only facts stay typed. */
type Preview =
  | { source: "cad"; outcome: CadImportOutcome }
  | { source: "svg"; outcome: SvgImportOutcome };

function baseName(fileName: string): string {
  return fileName.replace(/\.(dxf|dwg|svg)$/i, "");
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
  /**
   * Roles the user CHANGED. The effective mapping is the guess with these laid
   * over it, so re-guessing (an SVG scale change moves which loops are
   * detected, and therefore which layer holds the largest closed shape) never
   * discards a decision the user already made.
   */
  const [overrides, setOverrides] = useState<CadLayerAssignments>({});
  /** SVG only: millimetres per SVG user unit, as typed and as parsed. */
  const [unitInput, setUnitInput] = useState("1");
  const [unitScale, setUnitScale] = useState(1);
  const [scaleTouched, setScaleTouched] = useState(false);
  const [readError, setReadError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const reset = useCallback(() => {
    setLoaded(null);
    setOverrides({});
    setUnitInput("1");
    setUnitScale(1);
    setScaleTouched(false);
    setReadError(null);
    setBusy(false);
  }, []);

  const onPick = useCallback(async (file: File) => {
    setBusy(true);
    setReadError(null);
    setLoaded(null);
    setOverrides({});
    setUnitInput("1");
    setUnitScale(1);
    setScaleTouched(false);
    try {
      const format = classifyDrawingFile(file.name);
      if (format === null) {
        setReadError({
          code: "UNSUPPORTED_EXTENSION",
          message: `"${file.name}" is not a DXF, DWG or SVG file. Export the drawing as DXF or SVG, or upload the original DWG.`,
        });
        return;
      }

      if (format === "svg") {
        const result = await readSvgFile(file);
        if (!result.ok) {
          setReadError(result.error);
          return;
        }
        setLoaded({ kind: "svg", file, text: result.text });
        return;
      }

      const result = await readCadFile(file);
      if (!result.ok) {
        setReadError(result.error);
        return;
      }
      setLoaded({
        kind: "cad",
        file,
        doc: result.doc,
        format: result.format,
        warnings: result.warnings,
      });
    } finally {
      setBusy(false);
    }
  }, []);

  // Guesses are derived, never stored: for SVG they depend on the unit scale
  // (loop detection has a 1 m² floor), so a scale correction re-guesses the
  // untouched layers instead of stranding a table full of "ignore".
  const guesses: CadLayerAssignments = useMemo(() => {
    if (!loaded) return {};
    if (loaded.kind === "cad") return guessLayerAssignments(loaded.doc);
    try {
      return guessSvgLayerAssignments(svgToSegments(loaded.text, unitScale).segments);
    } catch {
      // Malformed SVG has no layers to guess. The failure itself is not
      // swallowed — `importSvgString` below reports it with the parser's own
      // message, which is what the user sees.
      return {};
    }
  }, [loaded, unitScale]);

  const assignments: CadLayerAssignments = useMemo(
    () => ({ ...guesses, ...overrides }),
    [guesses, overrides],
  );

  // The preview IS the import: same function, same mapping, same result.
  const preview: Preview | null = useMemo(() => {
    if (!loaded) return null;
    if (loaded.kind === "cad") {
      return {
        source: "cad",
        outcome: importCadDocument(loaded.doc, assignments, {
          fileName: loaded.file.name,
          name: baseName(loaded.file.name),
        }),
      };
    }
    return {
      source: "svg",
      outcome: importSvgString(loaded.text, assignments, {
        fileName: loaded.file.name,
        name: baseName(loaded.file.name),
        svgUnitsToMm: unitScale,
        scaleConfirmed: scaleTouched,
      }),
    };
  }, [loaded, assignments, unitScale, scaleTouched]);

  const outcome: ImportOutcomeView | null = preview?.outcome ?? null;
  const layers = outcome?.report.layers ?? [];
  const svgFacts: SvgReadFacts | null =
    preview?.source === "svg" ? preview.outcome.report.svg : null;

  const setRole = useCallback((layer: string, role: CadLayerRole) => {
    setOverrides((current) => ({
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
    setOverrides((current) => ({ ...current, [layer]: { role: "zone", program } }));
  }, []);

  const onUnitInput = useCallback((raw: string) => {
    setUnitInput(raw);
    const parsed = Number.parseFloat(raw);
    // Only a usable scale is committed; an in-progress edit ("2.", "1e") keeps
    // the last valid one, and the field says so rather than silently reverting.
    if (Number.isFinite(parsed) && parsed > 0) {
      setUnitScale(parsed);
      setScaleTouched(true);
    }
  }, []);

  const adopt = useCallback(() => {
    if (!loaded || !outcome?.ok) return;
    useBlueprintStore.getState().loadBlueprint(outcome.blueprint, {
      fileName: loaded.file.name,
      format: loaded.kind === "cad" ? loaded.format : "svg",
      documentId: outcome.report.documentId,
      assignments,
      report: outcome.report,
    });
    onOpenChange(false);
    reset();
  }, [loaded, outcome, assignments, onOpenChange, reset]);

  const unitValid = (() => {
    const parsed = Number.parseFloat(unitInput);
    return Number.isFinite(parsed) && parsed > 0;
  })();

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
          <DialogTitle>Import DWG/DXF/SVG as a schematic</DialogTitle>
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
              accept={ACCEPTED_DRAWING_EXTENSIONS.join(",")}
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
              {busy
                ? "Reading…"
                : loaded
                  ? "Choose another file"
                  : "Choose a .dxf, .dwg or .svg file"}
            </Button>
            {loaded && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {loaded.file.name} ·{" "}
                {loaded.kind === "cad"
                  ? `${loaded.format.toUpperCase()} · ${loaded.doc.stats.mapped} entities`
                  : `SVG · ${svgFacts?.segmentCount ?? 0} edges`}{" "}
                · {layers.length} layers
              </span>
            )}
          </div>

          {loaded?.kind === "svg" && (
            <SvgScaleField
              value={unitInput}
              valid={unitValid}
              activeScale={unitScale}
              touched={scaleTouched}
              onChange={onUnitInput}
            />
          )}

          {readError && (
            <div role="alert" className="rounded border border-destructive/40 px-3 py-2">
              <p className="text-xs">{readError.message}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {readError.code}
              </p>
            </div>
          )}

          {loaded && (
            <ul className="flex flex-col gap-0.5">
              {loaded.kind === "cad" &&
                loaded.warnings.map((warning) => (
                  <li key={warning} className="text-[11px] text-amber-700">
                    {warning}
                  </li>
                ))}
              {loaded.kind === "svg" && (
                <li className="text-[11px] text-muted-foreground">{SVG_COVERAGE_NOTE}</li>
              )}
              {svgFacts && svgFacts.unlayeredSegmentCount > 0 && (
                <li className="text-[11px] text-amber-700">
                  {svgFacts.unlayeredSegmentCount} edge(s) carry no data-layer or id, so
                  no role can be given to them. They still take part in loop detection
                  and cannot be excluded.
                </li>
              )}
            </ul>
          )}

          {loaded && outcome && (
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="min-w-0 flex-1">
                <LayerTable
                  layers={layers}
                  assignments={assignments}
                  countLabel={loaded.kind === "svg" ? "Edges" : "Entities"}
                  showTextCounts={loaded.kind === "cad"}
                  onRole={setRole}
                  onProgram={setProgram}
                />
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[420px]">
                <BlueprintPreview outcome={outcome} />
                <ImportSummary outcome={outcome} svgFacts={svgFacts} />
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
/* SVG scale                                                           */
/* ------------------------------------------------------------------ */

/**
 * An SVG user unit means nothing on its own, so this field is the only place
 * the real-world size of an SVG import can come from. Untouched, the import is
 * reported as an ASSUMED scale (and lands carrying SCALE_UNCALIBRATED), which
 * is what the note below says in words.
 */
function SvgScaleField({
  value,
  valid,
  activeScale,
  touched,
  onChange,
}: {
  value: string;
  valid: boolean;
  activeScale: number;
  touched: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label htmlFor="import-svg-unit-scale">1 SVG user unit =</label>
        <input
          id="import-svg-unit-scale"
          data-testid="import-svg-unit-scale"
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "w-24 rounded border bg-background px-1 py-0.5 font-mono text-[11px]",
            !valid && "border-destructive",
          )}
        />
        <span>mm</span>
      </div>
      <p
        className={cn("text-[10px]", touched ? "text-muted-foreground" : "text-amber-700")}
        data-testid="import-svg-scale-note"
      >
        {touched
          ? `Scale supplied by you: 1 unit = ${activeScale} mm. The file declares no real-world unit — this is your statement, not the drawing's.`
          : "Assumed: the SVG declares no real-world unit, so 1 unit is being read as 1 mm. Sizes are proportional until you set this."}
      </p>
      {!valid && (
        <p className="text-[10px] text-destructive">
          Not a positive number — still reading at {activeScale} mm per unit.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mapping table                                                       */
/* ------------------------------------------------------------------ */

function LayerTable({
  layers,
  assignments,
  countLabel,
  showTextCounts,
  onRole,
  onProgram,
}: {
  layers: CadLayerSummary[];
  assignments: CadLayerAssignments;
  countLabel: string;
  /** False for SVG: labels are not attributable to a layer at that seam. */
  showTextCounts: boolean;
  onRole: (layer: string, role: CadLayerRole) => void;
  onProgram: (layer: string, program: SpaceType) => void;
}) {
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 py-1 font-medium">Layer</th>
            <th className="px-2 py-1 font-medium">{countLabel}</th>
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
                  {showTextCounts &&
                    layer.entityCount > 0 &&
                    layer.textCount === layer.entityCount && (
                      <div className="text-[10px] text-muted-foreground">
                        text only — its labels are read whatever role you pick
                      </div>
                    )}
                </td>
                <td className="px-2 py-1 font-mono">
                  {layer.entityCount}
                  {showTextCounts ? (
                    layer.textCount > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({layer.textCount} text)
                      </span>
                    )
                  ) : (
                    <span
                      className="text-muted-foreground"
                      title="SVG labels are not attributable to a layer, so no per-layer text count exists"
                    >
                      {" "}
                      (text —)
                    </span>
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

function BlueprintPreview({ outcome }: { outcome: ImportOutcomeView }) {
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

function ImportSummary({
  outcome,
  svgFacts,
}: {
  outcome: ImportOutcomeView;
  svgFacts: SvgReadFacts | null;
}) {
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

      {svgFacts ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>edges {svgFacts.segmentCount}</span>
            <span>labels {svgFacts.labelCount}</span>
            {svgFacts.ignoredSegmentCount > 0 && (
              <span>ignored {svgFacts.ignoredSegmentCount}</span>
            )}
            {svgFacts.unlayeredSegmentCount > 0 && (
              <span className="text-amber-700">
                unlayered {svgFacts.unlayeredSegmentCount}
              </span>
            )}
          </div>
          <div
            className={
              svgFacts.scale.confirmed ? "text-muted-foreground" : "text-amber-700"
            }
            data-testid="import-svg-scale-report"
          >
            {`scale: 1 unit → ${svgFacts.scale.svgUnitsToMm} mm (${
              svgFacts.scale.confirmed ? "stated at import" : "assumed"
            }, confidence ${svgFacts.scale.calibrationConfidence})`}
          </div>
        </>
      ) : (
        <div
          className={report.units.declared ? "text-muted-foreground" : "text-amber-700"}
        >
          {report.units.declared
            ? `units: $INSUNITS ${report.units.insUnits} → ${report.units.unitScaleToMeters} m/unit → mm ×1000 (confidence ${report.units.calibrationConfidence})`
            : `units assumed: ${report.units.assumption} (confidence ${report.units.calibrationConfidence})`}
        </div>
      )}

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
