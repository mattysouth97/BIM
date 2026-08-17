"use client";

// src/components/generative/energy-panel.tsx
//
// What the generated design costs to run, and what could be done about it.
//
// Every number here comes from the SAME engine the ledger workspace uses. The
// session store publishes each adopted design into the material/recipe stores
// under its generationId (see generative-session-store.ts), so `useEnergyMetrics`
// and `useRetrofitScenario` read a generated building exactly as they read a
// 건축물대장 one — no parallel physics, no studio-only estimator.
//
// The honesty boundary is stated on screen, not buried here: a generated design
// has no ledger entry, so there is no metered consumption to calibrate against
// and no official grade on file. What is shown is a design-stage MODEL —
// code-table envelope and systems, solved geometry, Seoul climate unless the
// brief names a site. It is labelled 추정 / estimated wherever it is shown.

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { ProgramTrackSelector } from "@/components/twin/program-track-selector";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import {
  DEFAULT_GENERATED_SIGUNGU_CD,
  scenarioInputsFromSeed,
  seedBuildingFromGeneratedDesign,
  type GeneratedBuildingSeed,
} from "@/lib/generative/energy/seed-from-design";
import { useScenarioStore } from "@/store/scenario-store";
import type { DesignState } from "@/store/generative-session-store";

import { designEnergyDelta, formatSignedDelta } from "./energy-delta";

interface Props {
  /** The design the viewport is showing. */
  design: DesignState;
  /**
   * The design this one was edited from (history parent), or null at a root.
   * Drives the delta strip — the only baseline a generated building honestly
   * has.
   */
  previous: DesignState | null;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const MWH = 1_000;

function mwh(kwh: number): string {
  return `${(kwh / MWH).toLocaleString("en-US", { maximumFractionDigits: 1 })} MWh`;
}

/** ₩ in 억/만 units — the denominations Korean CAPEX is actually quoted in. */
function krw(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}₩${(abs / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${sign}₩${Math.round(abs / 10_000).toLocaleString()}만`;
  return `${sign}₩${Math.round(abs).toLocaleString()}`;
}

function seedOf(design: DesignState): GeneratedBuildingSeed {
  return seedBuildingFromGeneratedDesign({
    spec: design.spec,
    recipe: design.recipe,
    metrics: design.metrics,
    generationId: design.generationId,
  });
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1">
      <dt className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[10px] opacity-70">{hint}</span>}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function EnergyPanel({ design, previous }: Props) {
  // The seed is a pure function of the design, and the session store published
  // the identical one — so `seed.pk` is exactly the key the hooks below read.
  const seed = useMemo(() => seedOf(design), [design]);
  const previousSeed = useMemo(() => (previous ? seedOf(previous) : null), [previous]);

  const metrics = useEnergyMetrics(seed.pk, seed.sigunguCd);

  const scenarioInputs = useMemo(
    () => scenarioInputsFromSeed(seed, design.metrics),
    [seed, design.metrics],
  );

  // Budget and program track are the user's scenario, not the design's, so they
  // live in the shared scenario store — the same two controls the twin uses.
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);
  const setCapexBudget = useScenarioStore((s) => s.setCapexBudget);
  const setProgramTrack = useScenarioStore((s) => s.setProgramTrack);

  const scenario = useRetrofitScenario({
    buildingPk: seed.pk,
    capexBudgetKrw,
    totalFloorArea: scenarioInputs.totalFloorArea,
    footprintArea: scenarioInputs.footprintArea,
    roofType: scenarioInputs.roofType,
    sidoPrefix: scenarioInputs.sidoPrefix,
    programTrack,
    // The engine's own demand, not the hook's coarse fallback — the energy
    // model and the retrofit model must not disagree about this building.
    annualHeatingDemand: metrics?.demand.heatingDemand,
    annualCoolingDemand: metrics?.demand.coolingDemand,
  });

  const delta = useMemo(
    () => designEnergyDelta(previousSeed, seed, seed.sigunguCd),
    [previousSeed, seed],
  );

  const climateIsDefault = seed.sigunguCd === DEFAULT_GENERATED_SIGUNGU_CD;

  if (!metrics) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No energy model for this design yet — the solved geometry has no floor
        area to divide by, so no intensity or grade can be stated.
      </div>
    );
  }

  const { grade, gradeColor, demand, co2, heatLoss, primaryEnergyPerArea, siteTotal } =
    metrics;
  const selection = scenario.selection;
  const totalHeatLoss = heatLoss.totalHeatLoss;

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">
      {/* --- (c) delta vs the design this one came from --------------- */}
      {delta && previous && (
        <section className="rounded border border-dashed px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>vs previous design</SectionTitle>
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {previous.generationId}
            </span>
          </div>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[11px]">
            <Row
              label="EUI"
              value={`${formatSignedDelta(delta.euiKwhPerSqm)} kWh/m²·yr`}
            />
            <Row
              label="Demand"
              value={`${formatSignedDelta(delta.totalDemandKwh / MWH)} MWh`}
            />
            <Row
              label="Heating"
              value={`${formatSignedDelta(delta.heatingDemandKwh / MWH)} MWh`}
            />
            <Row
              label="Floor area"
              value={`${formatSignedDelta(delta.floorAreaSqm, 0)} m²`}
            />
          </dl>
          {delta.euiFraction !== null && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Intensity {delta.euiFraction <= 0 ? "down" : "up"}{" "}
              {Math.abs(delta.euiFraction * 100).toFixed(1)}% — both designs run
              through the same model, so this is the edit&apos;s effect, not a
              modelling difference.
            </p>
          )}
        </section>
      )}

      {/* --- (a) design-stage energy --------------------------------- */}
      <section>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold text-white"
            style={{ backgroundColor: gradeColor }}
          >
            {grade}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium">에너지효율등급 (estimated)</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {primaryEnergyPerArea.toFixed(1)} kWh/m²·yr primary
            </div>
          </div>
          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
            추정 · design stage
          </Badge>
        </div>

        <dl className="mt-2 font-mono text-xs">
          <Row
            label="Energy use intensity"
            value={`${demand.demandPerSqm.toFixed(1)} kWh/m²·yr`}
            hint="HVAC"
          />
          <Row label="Heating demand" value={mwh(demand.heatingDemand)} />
          <Row label="Cooling demand" value={mwh(demand.coolingDemand)} />
          <Row
            label="Whole building"
            value={mwh(siteTotal)}
            hint="+ lighting/DHW/plug"
          />
          <Row
            label="CO₂"
            value={`${co2.co2PerSqm.toFixed(1)} kgCO₂/m²·yr`}
            hint={`${co2.totalCO2.toFixed(1)} t/yr`}
          />
          <Row
            label="Design heat loss"
            value={`${Math.round(totalHeatLoss).toLocaleString()} W`}
            hint={`${heatLoss.totalHeatLossPerSqm.toFixed(1)} W/m²`}
          />
        </dl>
      </section>

      {/* --- envelope loss breakdown ---------------------------------
          Drawn from `metrics.heatLoss` rather than mounting
          EnergyBreakdownChart: that component takes only a buildingPk and
          therefore reads the Seoul default climate, which would silently
          disagree with the card above whenever a brief names a site. One
          climate per panel or none. */}
      <section>
        <SectionTitle>Where the heat goes</SectionTitle>
        <ul className="mt-2 flex flex-col gap-1">
          {heatLoss.elements.map((element) => {
            const share = totalHeatLoss > 0 ? element.heatLoss / totalHeatLoss : 0;
            return (
              <li key={element.element} className="font-mono text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">
                    {element.element}
                  </span>
                  <span className="tabular-nums">
                    {Math.round(element.heatLoss).toLocaleString()} W ·{" "}
                    {(share * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-foreground/60"
                    style={{ width: `${Math.min(share * 100, 100).toFixed(1)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- disclosure ---------------------------------------------- */}
      <p className="border-l-2 pl-2 text-[10px] leading-relaxed text-muted-foreground">
        Design-stage estimate (추정). U-values, HVAC efficiencies and schedules are
        current-code table values for this use and structure — no product has been
        selected. Geometry (areas, facade, window-to-wall) is measured from the
        solved model.{" "}
        {climateIsDefault
          ? "Climate: Seoul default — the brief names no site."
          : `Climate: 시군구 ${seed.sigunguCd}.`}{" "}
        A generated design has no 건축물대장 entry, so there is no metered
        consumption and no certified grade to compare against.
      </p>

      {/* --- (b) retrofit / investment scenario ----------------------- */}
      <section className="flex flex-col gap-2">
        <SectionTitle>Investment scenario</SectionTitle>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">
            CAPEX budget — {krw(capexBudgetKrw)}
          </span>
          <input
            type="range"
            min={10_000_000}
            max={2_000_000_000}
            step={10_000_000}
            value={capexBudgetKrw}
            aria-label="CAPEX budget"
            onChange={(event) => setCapexBudget(Number(event.target.value))}
            className="w-full"
          />
        </label>

        <ProgramTrackSelector
          value={programTrack}
          onChange={setProgramTrack}
          suggestedTrack={scenario.suggestedPrivateTrack}
        />

        {selection && selection.selected.length > 0 ? (
          <>
            <dl className="font-mono text-xs">
              <Row
                label="Measures"
                value={`${selection.selected.length} of ${scenario.allMeasures.length}`}
              />
              <Row label="Portfolio NPV" value={krw(selection.npv)} />
              <Row label="Effective CAPEX" value={krw(selection.effectiveCapex)} />
              <Row
                label="Discounted payback"
                value={
                  Number.isFinite(selection.discountedPayback) &&
                  selection.discountedPayback > 0
                    ? `${selection.discountedPayback.toFixed(1)} yr`
                    : "beyond horizon"
                }
              />
              <Row
                label="Energy improvement"
                value={`${(scenario.energyImprovementFraction * 100).toFixed(1)}%`}
                hint="excl. PV export"
              />
            </dl>

            <ul className="flex flex-col gap-1">
              {selection.selected.map((measure) => (
                <li key={measure.id} className="border-l-2 pl-2 text-[11px]">
                  <div className="font-medium">{measure.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {krw(measure.estimatedCost)} · {mwh(measure.annualEnergySaving)}/yr
                    {measure.financials && ` · NPV ${krw(measure.financials.npv)}`}
                  </div>
                </li>
              ))}
            </ul>

            {selection.loanCapExceeded && (
              <p className="text-[10px] text-amber-600">
                This budget exceeds the program&apos;s per-applicant loan cap — the
                financing shown is not available in full under this track.
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No measure clears this budget with a positive NPV. Raise the budget or
            pick a 그린리모델링 track to see a package.
          </p>
        )}

        <p className="border-l-2 pl-2 text-[10px] leading-relaxed text-muted-foreground">
          Costs are Korean unit-cost-database estimates over a{" "}
          {scenario.assumptions.analysisHorizonYears}-year horizon at a{" "}
          {(scenario.assumptions.discountRate * 100).toFixed(1)}% discount rate.
          Retrofitting a design that is not built yet is a comparison exercise: it
          prices the gap between this envelope and a better one.
        </p>
      </section>

      <p className="font-mono text-[10px] text-muted-foreground">
        energy pk {seed.pk}
      </p>
    </div>
  );
}
