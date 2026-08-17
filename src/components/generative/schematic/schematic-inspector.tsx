"use client";

// src/components/generative/schematic/schematic-inspector.tsx
//
// What the schematic currently says, and what generation will do with it.
//
// Three questions, answered before the button is pressed (brief §12, §42):
//   1. what did I draw?          — the feature counts
//   2. is it usable as authority? — the validation issues, in the same visual
//                                   language as the building issues panel
//   3. what will survive?         — the preservation plan, split PRESERVED /
//                                   FLEXIBLE by the fidelity rules
//
// And, once a building exists, the fourth question the first three cannot
// answer: what ACTUALLY survived — `<FidelityReport />`, measured from the
// generated geometry rather than promised from the rules.
//
// No raw JSON. A blueprint dump is not an explanation.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  blueprintPlacements,
  type BlueprintFidelityReport,
  type BlueprintSpec,
  type BlueprintValidationReport,
  type BlueprintViolation,
  type FidelityMode,
  type PreservationPlan,
} from "@/lib/generative/blueprint";
import type { BlueprintImportProvenance } from "@/store/blueprint-store";

import { FidelityReport } from "./fidelity-report";

const SEVERITY_STYLE: Record<BlueprintViolation["severity"], string> = {
  critical: "text-destructive",
  warning: "text-amber-600",
  advisory: "text-muted-foreground",
};

const FIDELITY_COPY: Record<FidelityMode, { label: string; line: string }> = {
  exact: {
    label: "Exact",
    line: "Follow the drawing to the millimetre. Nothing moves; the geometry is locked.",
  },
  guided: {
    label: "Guided",
    line: "Hard constraints hold. Soft ones may move within the tolerance you gave them.",
  },
  exploratory: {
    label: "Exploratory",
    line: "Treat the drawing as a suggestion the generator may reinterpret.",
  },
};

const SOURCE_LABEL: Record<BlueprintSpec["source"], string> = {
  "native-editor": "Drawn here",
  dxf: "Imported DXF",
  svg: "Imported SVG",
  image: "Read from an image",
  traced: "Traced",
};

interface Props {
  blueprint: BlueprintSpec;
  validation: BlueprintValidationReport;
  preservation: PreservationPlan;
  onFidelityChange: (mode: FidelityMode) => void;
  onSelect: (id: string) => void;
  /** Set when the working blueprint was read from a CAD file rather than drawn. */
  importProvenance?: BlueprintImportProvenance | null;
  /**
   * The measured report for the design currently on screen — null whenever the
   * design was not produced by this schematic (or by any schematic), because a
   * report shown beside a building it did not measure would be a fabrication.
   * The caller does that binding; see `fidelityForDesign`.
   */
  fidelity?: BlueprintFidelityReport | null;
  /** Bumped by the plan overlay's badge to scroll the report into view. */
  fidelityFocusToken?: number;
}

export function SchematicInspector({
  blueprint,
  validation,
  preservation,
  onFidelityChange,
  onSelect,
  importProvenance = null,
  fidelity = null,
  fidelityFocusToken,
}: Props) {
  const counts = [
    { label: "Boundaries", value: blueprint.boundaries.length },
    { label: "Voids", value: blueprint.voids.length },
    { label: "Cores", value: blueprint.cores.length },
    { label: "Zones", value: blueprint.zones.length },
    { label: "Anchors", value: blueprint.anchors.length },
    { label: "Circulation nodes", value: blueprint.circulation.nodes.length },
    { label: "Circulation links", value: blueprint.circulation.edges.length },
    { label: "Columns", value: blueprintPlacements(blueprint).filter((p) => p.tool === "column").length },
    { label: "Lights", value: blueprintPlacements(blueprint).filter((p) => p.tool === "lighting").length },
    { label: "Furniture", value: blueprintPlacements(blueprint).filter((p) => p.tool === "furniture").length },
    { label: "Grids", value: blueprint.gridSystems.length },
  ];

  const levels = [
    ...new Set(blueprint.boundaries.flatMap((boundary) => boundary.floorNos)),
  ].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4 p-3">
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Schematic
        </h3>
        <p className="text-sm">{blueprint.name}</p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {SOURCE_LABEL[blueprint.source]} · {blueprint.coordinateSystem.units} ·{" "}
          {blueprint.coordinateSystem.calibrated ? "calibrated" : "uncalibrated"}
          {levels.length > 0
            ? ` · levels ${levels[0]}–${levels[levels.length - 1]}`
            : " · no levels yet"}
        </p>
      </section>

      {importProvenance && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Imported from
          </h3>
          <p className="font-mono text-[11px]">
            {importProvenance.fileName}{" "}
            <span className="text-muted-foreground">
              ({importProvenance.format.toUpperCase()})
            </span>
          </p>
          <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground">
            {importProvenance.report.mapping
              .filter((row) => row.role !== "ignore")
              .map((row) => (
                <li key={row.layer}>
                  {row.layer} → {row.role}
                  {row.program ? ` (${row.program})` : ""} · {row.entityCount} entities
                </li>
              ))}
          </ul>
          {!importProvenance.report.units.declared && (
            <p className="text-[10px] text-amber-700">
              {importProvenance.report.units.assumption}
            </p>
          )}
          {importProvenance.report.skipped.length > 0 && (
            <p className="font-mono text-[10px] text-muted-foreground">
              skipped:{" "}
              {importProvenance.report.skipped
                .map((entry) => `${entry.count} ${entry.subject} (${entry.reason})`)
                .join(", ")}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fidelity
        </h3>
        <div className="flex gap-1">
          {(["exact", "guided", "exploratory"] as FidelityMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={blueprint.fidelityMode === mode}
              onClick={() => onFidelityChange(mode)}
              className={cn(
                "flex-1 rounded border px-2 py-1 text-[11px] transition-colors",
                blueprint.fidelityMode === mode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {FIDELITY_COPY[mode].label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {FIDELITY_COPY[blueprint.fidelityMode].line}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Authored
        </h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
          {counts.map((entry) => (
            <div key={entry.label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{entry.label}</dt>
              <dd className={entry.value === 0 ? "text-muted-foreground" : undefined}>
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Issues
          </h3>
          <div className="ml-auto flex items-center gap-1 font-mono text-[10px]">
            <Badge
              variant={validation.counts.critical > 0 ? "destructive" : "outline"}
              className="text-[9px]"
            >
              {validation.counts.critical} critical
            </Badge>
            <Badge variant="outline" className="text-[9px]">
              {validation.counts.warning} warning
            </Badge>
            <Badge variant="outline" className="text-[9px]">
              {validation.counts.advisory} advisory
            </Badge>
          </div>
        </div>

        {validation.violations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Loops close, ids are unique, references resolve and every object sits on a
            level that has a plate. That is a well-formed schematic, not a good design.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {validation.violations.map((violation, index) => (
              <li key={`${violation.code}-${index}`} className="border-l-2 pl-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase",
                      SEVERITY_STYLE[violation.severity],
                    )}
                  >
                    {violation.priority}
                  </span>
                  <span className="min-w-0 flex-1 text-xs">{violation.message}</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {violation.code}
                  {violation.floorNo !== undefined ? ` · level ${violation.floorNo}` : ""}
                </div>
                {violation.elementIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {violation.elementIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelect(id)}
                        aria-label={`Select ${id}`}
                        className="font-mono text-[10px] underline underline-offset-2"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
                {violation.suggestion && (
                  <div className="text-[10px] text-muted-foreground">
                    {violation.suggestion}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What generation will keep
        </h3>
        {preservation.preserved.length === 0 && preservation.flexible.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing drawn yet, so nothing is being preserved.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase text-emerald-700">
                preserved · {preservation.preserved.length}
              </p>
              <ul className="flex flex-col gap-0.5 pt-1">
                {preservation.preserved.map((line) => (
                  <li key={line} className="font-mono text-[10px] text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase text-amber-700">
                flexible · {preservation.flexible.length}
              </p>
              <ul className="flex flex-col gap-0.5 pt-1">
                {preservation.flexible.length === 0 ? (
                  <li className="text-[10px] text-muted-foreground">
                    Nothing is left to the generator&apos;s discretion.
                  </li>
                ) : (
                  preservation.flexible.map((line) => (
                    <li
                      key={line}
                      className="font-mono text-[10px] text-muted-foreground"
                    >
                      {line}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </section>

      {fidelity && (
        <FidelityReport report={fidelity} focusToken={fidelityFocusToken} />
      )}
    </div>
  );
}
