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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import type { MeshExtractionFacts } from "@/lib/generative/blueprint/from-mesh";
import {
  importMeshDrawing,
  type MeshDrawing,
  type MeshImportOutcome,
} from "@/lib/generative/blueprint/import-mesh-file";
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

/** The file, once read — the only thing that differs between the sources. */
type LoadedFile =
  | { kind: "cad"; file: File; doc: CadDocument; format: CadFileFormat; warnings: string[] }
  | { kind: "svg"; file: File; text: string }
  /**
   * A DXF/DWG holding a 3D mesh and no 2D drawing. There is no layer mapping to
   * confirm here; what the user confirms instead is the cut height, which is
   * the whole of the interpretation.
   */
  | {
      kind: "mesh";
      file: File;
      format: CadFileFormat;
      mesh: MeshDrawing;
      warnings: string[];
    };

/**
 * The parts of an import outcome this dialog renders. Both `CadImportOutcome`
 * and `SvgImportOutcome` satisfy it, which is what lets one table, one preview
 * and one adopt button serve both readers.
 */
type ImportOutcomeView =
  | { ok: true; blueprint: BlueprintSpec; report: CadImportReport }
  | { ok: false; error: { code: string; message: string }; report: CadImportReport };

/** The outcome with its source still attached, so per-source facts stay typed. */
type Preview =
  | { source: "cad"; outcome: CadImportOutcome }
  | { source: "svg"; outcome: SvgImportOutcome }
  | { source: "mesh"; outcome: MeshImportOutcome };

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
  const readGenerationRef = useRef(0);
  const activeReadRef = useRef<{
    generation: number;
    controller: AbortController;
  } | null>(null);
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
  /** Mesh only: cut height in metres, as typed and as parsed. */
  const [sliceInput, setSliceInput] = useState("");
  const [sliceZ, setSliceZ] = useState<number | null>(null);
  const [useProjection, setUseProjection] = useState(false);
  const [readError, setReadError] = useState<{
    code: string;
    message: string;
    /** Per-step explanation of the headline (DWG: one line per tier). */
    detail?: string[];
  } | null>(null);

  const invalidatePendingRead = useCallback(() => {
    readGenerationRef.current += 1;
    activeReadRef.current?.controller.abort();
    activeReadRef.current = null;
  }, []);

  const clearReadState = useCallback(() => {
    setLoaded(null);
    setOverrides({});
    setUnitInput("1");
    setUnitScale(1);
    setScaleTouched(false);
    setSliceInput("");
    setSliceZ(null);
    setUseProjection(false);
    setReadError(null);
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    invalidatePendingRead();
    clearReadState();
  }, [clearReadState, invalidatePendingRead]);

  // An external close (for example, the containing editor unmounting this
  // dialog) has the same cancellation semantics as the visible Cancel action.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(
    () => () => {
      // Browser WASM work cannot always be interrupted, but changing the
      // generation guarantees that its eventual result cannot update state.
      invalidatePendingRead();
    },
    [invalidatePendingRead],
  );

  const onPick = useCallback(async (file: File) => {
    activeReadRef.current?.controller.abort();
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    const controller = new AbortController();
    activeReadRef.current = { generation, controller };

    const isCurrent = () =>
      activeReadRef.current?.generation === generation &&
      !controller.signal.aborted;

    setBusy(true);
    setReadError(null);
    setLoaded(null);
    setOverrides({});
    setUnitInput("1");
    setUnitScale(1);
    setScaleTouched(false);
    setSliceInput("");
    setSliceZ(null);
    setUseProjection(false);
    try {
      const format = classifyDrawingFile(file.name);
      if (format === null) {
        if (!isCurrent()) return;
        setReadError({
          code: "UNSUPPORTED_EXTENSION",
          message: `"${file.name}" is not a DXF, DWG or SVG file. Export the drawing as DXF or SVG, or upload the original DWG.`,
        });
        return;
      }

      if (format === "svg") {
        const result = await readSvgFile(file, { signal: controller.signal });
        if (!isCurrent()) return;
        if (!result.ok) {
          setReadError(result.error);
          return;
        }
        setLoaded({ kind: "svg", file, text: result.text });
        return;
      }

      const result = await readCadFile(file, { signal: controller.signal });
      if (!isCurrent()) return;
      if (!result.ok) {
        // A mesh-only DXF is not a dead end — it becomes an extraction offer.
        if (result.mesh) {
          setLoaded({
            kind: "mesh",
            file,
            format: classifyDrawingFile(file.name) === "dwg" ? "dwg" : "dxf",
            mesh: result.mesh,
            warnings: result.warnings,
          });
          setSliceZ(result.mesh.stats.suggestedSliceZ);
          setSliceInput(result.mesh.stats.suggestedSliceZ.toFixed(2));
          return;
        }
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
    } catch (error) {
      if (!isCurrent()) return;
      setReadError({
        code: "FILE_READ_FAILED",
        message:
          `Could not read "${file.name}". ` +
          `${error instanceof Error ? error.message : String(error)} ` +
          "Choose another drawing or export it as DXF, then try again.",
      });
    } finally {
      if (isCurrent()) {
        activeReadRef.current = null;
        setBusy(false);
      }
    }
  }, []);

  // Guesses are derived, never stored: for SVG they depend on the unit scale
  // (loop detection has a 1 m² floor), so a scale correction re-guesses the
  // untouched layers instead of stranding a table full of "ignore".
  const guesses: CadLayerAssignments = useMemo(() => {
    if (!loaded) return {};
    if (loaded.kind === "cad") return guessLayerAssignments(loaded.doc);
    // A mesh has no layer roles to guess: the roles come out of the cut.
    if (loaded.kind === "mesh") return {};
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
    if (loaded.kind === "mesh") {
      return {
        source: "mesh",
        outcome: importMeshDrawing(loaded.mesh, {
          fileName: loaded.file.name,
          name: baseName(loaded.file.name),
          ...(sliceZ !== null ? { sliceZ } : {}),
          useProjection,
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
  }, [loaded, assignments, unitScale, scaleTouched, sliceZ, useProjection]);

  const outcome: ImportOutcomeView | null = preview?.outcome ?? null;
  const layers = outcome?.report.layers ?? [];
  const svgFacts: SvgReadFacts | null =
    preview?.source === "svg" ? preview.outcome.report.svg : null;
  const meshFacts =
    preview?.source === "mesh" && preview.outcome.ok ? preview.outcome.facts : null;

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

  const onSliceInput = useCallback((raw: string) => {
    setSliceInput(raw);
    const parsed = Number.parseFloat(raw);
    // Only a usable height is committed; a half-typed value keeps the last one
    // rather than silently snapping the preview back to the suggestion.
    if (Number.isFinite(parsed)) setSliceZ(parsed);
  }, []);

  const adopt = useCallback(() => {
    if (!loaded || !outcome?.ok) return;
    useBlueprintStore.getState().loadBlueprint(outcome.blueprint, {
      fileName: loaded.file.name,
      format: loaded.kind === "svg" ? "svg" : loaded.format,
      documentId: outcome.report.documentId,
      assignments,
      report: outcome.report,
    });
    reset();
    onOpenChange(false);
  }, [loaded, outcome, assignments, onOpenChange, reset]);

  const closeDialog = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [onOpenChange, reset]);

  const unitValid = (() => {
    const parsed = Number.parseFloat(unitInput);
    return Number.isFinite(parsed) && parsed > 0;
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else closeDialog();
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
            >
              {busy
                ? "Choose a different file"
                : loaded
                  ? "Choose another file"
                  : "Choose a .dxf, .dwg or .svg file"}
            </Button>
            {busy && (
              <span
                role="status"
                aria-live="polite"
                className="text-[11px] text-muted-foreground"
              >
                Reading drawing… You can replace or cancel this import.
              </span>
            )}
            {loaded && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {loaded.file.name} ·{" "}
                {loaded.kind === "cad"
                  ? `${loaded.format.toUpperCase()} · ${loaded.doc.stats.mapped} entities · ${layers.length} layers`
                  : loaded.kind === "mesh"
                    ? `${loaded.format.toUpperCase()} 3D · ${loaded.mesh.stats.faceCount} faces`
                    : `SVG · ${svgFacts?.segmentCount ?? 0} edges · ${layers.length} layers`}
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

          {loaded?.kind === "mesh" && (
            <MeshExtractionField
              mesh={loaded.mesh}
              sliceInput={sliceInput}
              useProjection={useProjection}
              onSliceInput={onSliceInput}
              onUseProjection={setUseProjection}
            />
          )}

          {readError && (
            <div role="alert" className="rounded border border-destructive/40 px-3 py-2">
              <p className="text-xs">{readError.message}</p>
              {readError.detail && readError.detail.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {readError.detail.map((line) => (
                    <li key={line} className="text-[11px] text-muted-foreground">
                      · {line}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {readError.code}
              </p>
            </div>
          )}

          {loaded && (
            <ul className="flex flex-col gap-0.5">
              {(loaded.kind === "cad" || loaded.kind === "mesh") &&
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
                {loaded.kind === "mesh" ? (
                  <MeshReadNotes mesh={loaded.mesh} facts={meshFacts} />
                ) : (
                  <LayerTable
                    layers={layers}
                    assignments={assignments}
                    countLabel={loaded.kind === "svg" ? "Edges" : "Entities"}
                    showTextCounts={loaded.kind === "cad"}
                    onRole={setRole}
                    onProgram={setProgram}
                  />
                )}
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[420px]">
                <BlueprintPreview outcome={outcome} />
                <ImportSummary outcome={outcome} svgFacts={svgFacts} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeDialog}>
            {busy ? "Cancel import" : "Cancel"}
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
/* Mesh extraction                                                     */
/* ------------------------------------------------------------------ */

/**
 * The mesh path's one real control. A 3D model holds no plan, so the plan has
 * to be CUT out of it, and the height of that cut is the whole interpretation —
 * which is why it is a field the person importing sets, defaulted to a
 * suggestion and labelled as one, rather than a constant buried in the reader.
 */
function MeshExtractionField({
  mesh,
  sliceInput,
  useProjection,
  onSliceInput,
  onUseProjection,
}: {
  mesh: MeshDrawing;
  sliceInput: string;
  useProjection: boolean;
  onSliceInput: (raw: string) => void;
  onUseProjection: (next: boolean) => void;
}) {
  const { stats } = mesh;
  const valid = Number.isFinite(Number.parseFloat(sliceInput));

  return (
    <div
      className="flex flex-col gap-2 rounded border px-3 py-2"
      data-testid="import-mesh-panel"
    >
      <p className="text-xs font-medium">3D 모델에서 평면 추출</p>
      <p className="text-[11px] text-muted-foreground">
        이 파일에는 2D 도면이 없고 3D 메시만 있습니다. 아래 높이에서 모델을 수평으로
        잘라 평면을 만듭니다 — 측정값이 아니라 해석입니다.
      </p>
      <div
        className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground"
        data-testid="import-mesh-stats"
      >
        <span>faces {stats.faceCount}</span>
        <span>triangles {stats.triangleCount}</span>
        <span>
          Z {stats.minZ.toFixed(2)}–{stats.maxZ.toFixed(2)} m
        </span>
        <span>~{stats.estimatedFloors} floors</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label htmlFor="import-mesh-slice-z">절단 높이 Z =</label>
        <input
          id="import-mesh-slice-z"
          data-testid="import-mesh-slice-z"
          type="number"
          step="any"
          value={sliceInput}
          disabled={useProjection}
          onChange={(event) => onSliceInput(event.target.value)}
          className={cn(
            "w-24 rounded border bg-background px-1 py-0.5 font-mono text-[11px]",
            !valid && "border-destructive",
            useProjection && "opacity-50",
          )}
        />
        <span>m</span>
        <label className="ml-2 flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="import-mesh-use-projection"
            checked={useProjection}
            onChange={(event) => onUseProjection(event.target.checked)}
          />
          바닥 투영 사용
        </label>
      </div>

      <p className="text-[10px] text-amber-700">
        {useProjection
          ? "바닥 투영: 모든 면을 지면에 눌러 외곽선만 얻습니다. 건물이 어디 서 있는지는 말해 주지만 내부는 말해 주지 않습니다."
          : `제안된 높이는 모델 최저점 + 1.2 m (${stats.suggestedSliceZ.toFixed(2)} m)입니다. 층수 ~${stats.estimatedFloors}은(는) 3.5 m 층고 가정에서 나온 추정치입니다.`}
      </p>
    </div>
  );
}

/** What the extraction did, beside the preview it produced. */
function MeshReadNotes({
  mesh,
  facts,
}: {
  mesh: MeshDrawing;
  facts: MeshExtractionFacts | null;
}) {
  const rows: Array<[string, string]> = [
    ["mesh faces", `${mesh.stats.faceCount}`],
    ["triangles", `${mesh.stats.triangleCount}`],
    ["degenerate faces", `${mesh.stats.degenerateFaceCount}`],
    ["3DFACE entities", `${mesh.extraction.threeDFaceCount}`],
    ["polyface meshes", `${mesh.extraction.polyfaceMeshCount}`],
    [
      "height range",
      `${mesh.stats.minZ.toFixed(2)} – ${mesh.stats.maxZ.toFixed(2)} m`,
    ],
    ["storeys (assumed 3.5 m)", `~${mesh.stats.estimatedFloors}`],
  ];
  if (facts) {
    rows.push([
      "method",
      facts.method === "slice"
        ? `horizontal cut at Z = ${(facts.sliceZ ?? 0).toFixed(2)} m`
        : "footprint projection (no cut closed an outline)",
    ]);
    rows.push(["boundary area", `${facts.boundaryAreaSqm.toFixed(1)} m²`]);
    rows.push(["coplanar faces skipped", `${facts.slice.coplanarTrianglesSkipped}`]);
  }

  return (
    <div className="overflow-x-auto rounded border" data-testid="import-mesh-notes">
      <table className="w-full text-left text-[11px]">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t first:border-t-0">
              <td className="px-2 py-1 text-muted-foreground">{label}</td>
              <td className="px-2 py-1 font-mono">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
