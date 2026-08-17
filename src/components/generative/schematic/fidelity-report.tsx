"use client";

// src/components/generative/schematic/fidelity-report.tsx
//
// The proof step, on screen: how much of the drawing the building actually kept.
//
// `measureBlueprintFidelity` compares geometry to geometry after generation and
// returns one number per dimension. This renders those numbers and NOTHING
// else — no aggregate score, because the metric deliberately does not compute
// one: a courtyard that got built over and a core that shifted 300 mm are not
// commensurable, and a blended number would read as precise while meaning
// nothing. A reader who wants a headline picks the dimension they care about.
//
// HONESTY RULES this file obeys
//   - `null` prints as "not measurable", never as 0. A 0.0% that means "we did
//     not compare anything" is a lie in the format a reader trusts most.
//   - `NotMeasured` entries and unmeasurable anchors are shown WITH their
//     reasons, styled as information rather than as failure: the engine having
//     no exterior door to compare an entrance against is a gap in the model,
//     not a defect in the user's drawing.
//   - The colour bands below are a READING AID, not a verdict. The metric
//     defines no pass/fail threshold, so the bands are stated here as a display
//     convention and the raw percentage is always printed beside the colour.

import { useEffect, useRef } from "react";

import type {
  AnchorFidelity,
  BlueprintFidelityReport,
  Hold,
  RelationshipFidelity,
} from "@/lib/generative/blueprint";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Formatting (pure — exported for tests)                              */
/* ------------------------------------------------------------------ */

/** What a missing measurement says. One string, so it cannot drift per panel. */
export const NOT_MEASURABLE = "not measurable";

/**
 * A ratio as a percentage. `null` — and any non-finite value, which could only
 * arrive from a division the metric guards against — becomes the words, never
 * a number.
 */
export function formatRatioPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return NOT_MEASURABLE;
  return `${(value * 100).toFixed(digits)}%`;
}

/** Metres, to the millimetre. 0 is a real measurement here and prints as one. */
export function formatMetres(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_MEASURABLE;
  return `${value.toFixed(3)} m`;
}

export function formatSqm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_MEASURABLE;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;
}

/**
 * The author's hold, with the tolerance a soft one carries — a 0.4 m move
 * against a 500 mm tolerance is obedience, and against a hard hold it is not.
 * Displaying the mode alone would flatten that distinction.
 */
export function formatHold(hold: Hold): string {
  return hold.mode === "soft"
    ? `soft ±${(hold.toleranceMm / 1000).toFixed(3)} m`
    : "hard";
}

export type FidelityBand = "good" | "fair" | "poor" | "unknown";

/** Deviation: lower is better (0 = the built shape matches the drawn one). */
export function bandForDeviation(value: number | null): FidelityBand {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (value < 0.02) return "good";
  if (value < 0.1) return "fair";
  return "poor";
}

/**
 * Void retention: higher is better. 0.98 is the flag the brief names — below
 * it, something was built over a hole the drawing declared empty.
 */
export function bandForRetention(value: number | null): FidelityBand {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (value >= 0.98) return "good";
  if (value >= 0.5) return "fair";
  return "poor";
}

/** Zone overlap: higher is better. */
export function bandForOverlap(value: number | null): FidelityBand {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (value >= 0.9) return "good";
  if (value >= 0.5) return "fair";
  return "poor";
}

export const BAND_TEXT: Record<FidelityBand, string> = {
  good: "text-emerald-700",
  fair: "text-amber-700",
  poor: "text-destructive",
  unknown: "text-muted-foreground",
};

/**
 * Not-measurable relationships grouped by kind. The reason is a property of the
 * KIND (the model carries no per-space orientation to test FACES against, and
 * that is true of every FACES edge), so listing forty identical sentences would
 * bury the two that differ. Insertion order is preserved — the report is
 * deterministic and this must not reorder it.
 */
export function groupNotMeasurable(
  relationships: RelationshipFidelity[],
): Array<{ kind: string; reason: string; count: number }> {
  const out: Array<{ kind: string; reason: string; count: number }> = [];
  const index = new Map<string, number>();
  for (const relationship of relationships) {
    if (relationship.outcome !== "not-measurable") continue;
    const reason = relationship.reason ?? "no reason recorded";
    // JSON, not concatenation: a reason is free text and could otherwise fake
    // a boundary and merge two genuinely different groups.
    const key = JSON.stringify([relationship.kind, reason]);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ kind: relationship.kind, reason, count: 1 });
      continue;
    }
    out[at].count += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

/** The DOM id the plan overlay's badge scrolls to. */
export const FIDELITY_SECTION_ID = "schematic-fidelity-report";

interface Props {
  report: BlueprintFidelityReport;
  /**
   * Monotonic counter bumped by the plan overlay's badge; 0 means "never
   * asked". Compared against a ref that starts at 0 rather than at the incoming
   * value, because the badge lives in a DIFFERENT viewport: clicking it
   * unmounts the plan and mounts this panel, so the request arrives as the
   * FIRST render here and a "changed since mount" test would swallow it.
   */
  focusToken?: number;
  className?: string;
}

export function FidelityReport({ report, focusToken, className }: Props) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const seenToken = useRef(0);

  useEffect(() => {
    if (focusToken === undefined || focusToken <= seenToken.current) return;
    seenToken.current = focusToken;
    const heading = headingRef.current;
    if (!heading) return;
    // Optional-called: not every test environment implements scrollIntoView.
    heading.scrollIntoView?.({ block: "start" });
    heading.focus?.();
  }, [focusToken]);

  const { boundary, topology } = report;

  return (
    <section
      id={FIDELITY_SECTION_ID}
      className={cn("flex flex-col gap-3", className)}
      aria-label="Measured schematic fidelity"
    >
      <div className="flex flex-col gap-1">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground outline-none"
        >
          Measured fidelity
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Geometry compared to geometry after the last generation. Reported one
          dimension at a time — there is no combined score, because a filled-in
          courtyard and a shifted core are not the same kind of error.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {report.blueprintId} ·{" "}
          {report.measuredFloorNos.length > 0
            ? `levels measured ${report.measuredFloorNos.join(", ")}`
            : "no level was comparable"}
        </p>
      </div>

      {/* --- boundary --- */}
      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-[10px] uppercase text-muted-foreground">
          Boundary
        </h4>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
          <Stat
            label="worst outline diff"
            value={formatRatioPercent(boundary.worstSymmetricDifferenceRatio)}
            band={bandForDeviation(boundary.worstSymmetricDifferenceRatio)}
          />
          <Stat
            label="mean outline diff"
            value={formatRatioPercent(boundary.meanSymmetricDifferenceRatio)}
            band={bandForDeviation(boundary.meanSymmetricDifferenceRatio)}
          />
          <Stat
            label="worst area diff"
            value={formatRatioPercent(boundary.worstAreaDeviationRatio)}
            band={bandForDeviation(boundary.worstAreaDeviationRatio)}
          />
          <Stat
            label="mean area diff"
            value={formatRatioPercent(boundary.meanAreaDeviationRatio)}
            band={bandForDeviation(boundary.meanAreaDeviationRatio)}
          />
        </dl>
        <p className="text-[10px] text-muted-foreground">
          Outline diff is the symmetric difference — it catches a plate that kept
          its area while changing shape, which the area figure alone cannot.
        </p>

        {boundary.levels.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            No level was drawn and built in common, so nothing was compared.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[10px]">
            {boundary.levels.map((level) => (
              <li key={level.floorNo} className="flex items-baseline gap-2">
                <span className="w-10 shrink-0 text-muted-foreground">
                  L{level.floorNo}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {formatSqm(level.blueprintAreaSqm)} →{" "}
                  {formatSqm(level.generatedAreaSqm)}
                </span>
                <span
                  className={
                    BAND_TEXT[bandForDeviation(level.symmetricDifferenceRatio)]
                  }
                >
                  {formatRatioPercent(level.symmetricDifferenceRatio)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {boundary.blueprintOnlyFloorNos.length > 0 && (
          <p className="text-[10px] text-amber-700">
            Drawn but not built: level(s){" "}
            {boundary.blueprintOnlyFloorNos.join(", ")}.
          </p>
        )}
        {boundary.generatedOnlyFloorNos.length > 0 && (
          <p className="text-[10px] text-amber-700">
            Built but not drawn: level(s){" "}
            {boundary.generatedOnlyFloorNos.join(", ")}.
          </p>
        )}
      </div>

      {/* --- voids --- */}
      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-[10px] uppercase text-muted-foreground">
          Voids
        </h4>
        {report.voids.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            No void was drawn, so there is no hole to check.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[10px]">
            {report.voids.map((entry) => {
              const band = bandForRetention(entry.retainedRatio);
              return (
                <li
                  key={`${entry.voidId}-${entry.floorNo}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {entry.voidId}
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.kind} · L{entry.floorNo}
                    </span>
                  </span>
                  <span className={BAND_TEXT[band]}>
                    {formatRatioPercent(entry.retainedRatio)} kept
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {report.voids.some((entry) => entry.retainedRatio < 0.98) && (
          <p className="text-[10px] text-amber-700">
            A hole below 100% was partly built over: the plate covers area the
            drawing declared empty.
          </p>
        )}
      </div>

      {/* --- cores and anchors --- */}
      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-[10px] uppercase text-muted-foreground">
          Cores &amp; anchors
        </h4>
        {report.cores.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No core was drawn.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[10px]">
            {report.cores.map((core) => (
              <li key={core.coreId} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {core.coreId}
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatHold(core.hold)} hold
                    {core.compiled ? "" : " · not compiled"}
                  </span>
                </span>
                {/* An uncompiled core's distance is to a core it never fed, so
                    it is stated quietly and explained below rather than shown
                    as a deviation the generator is answerable for. */}
                <span className={core.compiled ? undefined : "text-muted-foreground"}>
                  {formatMetres(core.displacementM)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {report.cores.some((core) => !core.compiled) && (
          <p className="text-[10px] text-muted-foreground">
            Only the first drawn core reaches the engine — the building spec
            carries one. The others are measured against a core they never
            influenced, so their displacement describes the gap, not a move.
          </p>
        )}

        {report.anchors.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No anchor was drawn.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 pt-1 font-mono text-[10px]">
            {report.anchors.map((anchor) => (
              <AnchorRow key={anchor.anchorId} anchor={anchor} />
            ))}
          </ul>
        )}
      </div>

      {/* --- zones --- */}
      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-[10px] uppercase text-muted-foreground">
          Zones
        </h4>
        <p className="text-[10px] text-muted-foreground">
          Compilation keeps a zone&apos;s area, program and levels but discards
          the region you drew, so the space solver may place that program
          anywhere on the plate. A low overlap here is that engine gap, not a
          fault in the drawing.
        </p>
        {report.zones.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No zone was drawn.</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-[10px]">
            {report.zones.map((zone) => (
              <li key={zone.zoneId} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {zone.zoneId}
                    <span className="text-muted-foreground">
                      {" "}
                      · {zone.program} · {formatSqm(zone.zoneAreaSqm)}
                    </span>
                  </span>
                  <span className={BAND_TEXT[bandForOverlap(zone.overlapRatio)]}>
                    {formatRatioPercent(zone.overlapRatio)} overlap
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 pl-2 text-muted-foreground">
                  {zone.floors.length === 0 ? (
                    <span>no level carried this program</span>
                  ) : (
                    zone.floors.map((floor) => (
                      <span key={floor.floorNo}>
                        L{floor.floorNo}{" "}
                        <span
                          className={BAND_TEXT[bandForOverlap(floor.overlapRatio)]}
                        >
                          {formatRatioPercent(floor.overlapRatio)}
                        </span>{" "}
                        ({floor.placedSpaceCount})
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- topology --- */}
      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-[10px] uppercase text-muted-foreground">
          Relationships
        </h4>
        <p className="font-mono text-[10px]">
          <span className="text-emerald-700">
            {topology.counts.satisfied} satisfied
          </span>
          <span className="text-muted-foreground"> · </span>
          <span
            className={
              topology.counts.violated > 0
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {topology.counts.violated} violated
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {topology.counts.notMeasurable} not measurable
          </span>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          satisfied of measurable: {formatRatioPercent(topology.satisfiedRatio)}
        </p>

        {topology.relationships.some((r) => r.outcome === "violated") && (
          <ul className="flex flex-col gap-0.5 font-mono text-[10px]">
            {topology.relationships
              .filter((relationship) => relationship.outcome === "violated")
              .map((relationship) => (
                <li key={relationship.relationshipId} className="text-destructive">
                  {relationship.kind}: {relationship.fromId}
                  {relationship.toId ? ` → ${relationship.toId}` : ""}
                </li>
              ))}
          </ul>
        )}

        {groupNotMeasurable(topology.relationships).map((entry) => (
          <p
            key={`${entry.kind}-${entry.reason}`}
            className="font-mono text-[10px] text-muted-foreground"
          >
            {entry.kind} ×{entry.count} — {entry.reason}
          </p>
        ))}
      </div>

      {/* --- everything that could not be compared --- */}
      {report.notMeasured.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="font-mono text-[10px] uppercase text-muted-foreground">
            Not measured
          </h4>
          <p className="text-[10px] text-muted-foreground">
            Listed, not hidden. These carry no number because there was nothing
            comparable to measure against — which is information, not a failure.
          </p>
          <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground">
            {report.notMeasured.map((entry, index) => (
              <li key={`${entry.subject}-${entry.id}-${index}`}>
                {entry.subject} {entry.id} — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  band,
}: {
  label: string;
  value: string;
  band: FidelityBand;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={BAND_TEXT[band]}>{value}</dd>
    </div>
  );
}

function AnchorRow({ anchor }: { anchor: AnchorFidelity }) {
  if (!anchor.measured) {
    return (
      <li className="flex flex-col text-muted-foreground">
        <span>
          {anchor.anchorId} · {anchor.kind} · {formatHold(anchor.hold)} hold
        </span>
        <span className="pl-2">{NOT_MEASURABLE} — {anchor.reason}</span>
      </li>
    );
  }
  return (
    <li className="flex items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate">
        {anchor.anchorId}
        <span className="text-muted-foreground">
          {" "}
          · {anchor.kind} · vs {anchor.comparedWith}
        </span>
      </span>
      <span>{formatMetres(anchor.displacementM)}</span>
    </li>
  );
}
