"use client";

// src/components/twin/energy-instrument-hud.tsx
// The energy instrument itself: top answer bar (NPV over the chosen work, the
// measure chips, then financing) and bottom strip (grade / kWh / CO₂ / heat
// loss, the before→after delta, chosen measures, CAPEX grip).
//
// WORK FIRST (2026-09-06 15:37, user's instruction). The top section used to
// be NPV over six financing chips, and the knapsack decided what got built —
// so a person could not pick a measure, and the building changed as a side
// effect of a money choice. Now the primary row is `MeasureChipRow`, one chip
// per physical measure carrying what it does to this building; the knapsack's
// optimum is a 추천 mark on those chips; and the programme moved below them as
// 지원 재원, which re-prices the chosen work and never re-picks it. Every
// number on the frame is struck against `scenario.chosen`.
//
// Extracted from TwinStageOverlay on 2026-09-04 so a
// building that is not a 건축물대장 row — a reference model whose inputs are
// measured from its IFC — can carry the identical frame without faking a
// register title to get it. What the HUD needs is five numbers and a store
// key; where they come from is the caller's business.
//
// D₃: scenario state (budget, program track, derived building inputs)
// lives in `useScenarioStore` so the SceneOutliner left dock reads the
// exact same inputs and the two surfaces always agree.
//
// ONE BASELINE (2026-09-06). The bottom strip's kWh/m² and the top bar's NPV
// used to come from two different buildings: `EnergyCards` ran the degree-day
// engine, while `useRetrofitScenario`, handed no demand, priced every measure
// against `floorArea × 120`. On the Clinic that proxy is 1.35× the engine's
// heating demand and on the apartment 3.30×. The HUD now runs the engine
// itself — with the SAME `(buildingPk, sigunguCd)` pair `EnergyCards` uses, so
// the two calls memoise to one answer rather than to two that happen to
// agree — and hands the result to the scenario hook.

import { useEffect, useMemo } from "react";
import { usePvLayout } from "@/hooks/use-pv-layout";
import {
  useRetrofitScenario,
  engineEnvelopeAreasFrom,
} from "@/hooks/use-retrofit-scenario";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { useScenarioStore } from "@/store/scenario-store";
import { TwinInstrumentFrame } from "./twin-instrument-frame";
import { ScenarioRail } from "./scenario-rail";
import { ProgramTrackSelector } from "./program-track-selector";
import { SelectedMeasuresStrip } from "./selected-measures-strip";
import { MeasureChipRow } from "./measure-chip-row";
import { RetrofitDeltaStrip } from "./retrofit-delta-strip";
import { EnergyCards } from "@/components/viewer/energy-cards";

export interface EnergyInstrumentHudProps {
  /** Store key the material and recipe stores were seeded under. */
  buildingPk: string;
  /** Conditioned floor area, m² — the intensity denominator. */
  totalFloorArea: number;
  /** Footprint / roof area, m² — drives solar potential. */
  footprintArea: number;
  /**
   * Roof typology, which sets the PV utilisation factor AND appears in the
   * measure's own name ("Solar PV (flat roof, 373 kWp)"). The caller reads it
   * from the building; it is not a default this component may invent.
   */
  roofType: "flat" | "gable" | "hip" | "sawtooth";
  /** Two-digit 시도 prefix for the regional climate. */
  sidoPrefix: string;
  /**
   * Measured exterior door aperture, m², excluded from the wall-insulation
   * measure. The engine prices doors at the wall U and keeps them inside its
   * "Walls" element; nobody insulates a door. Omitted where the building
   * states no door area — the measure then covers the whole wall element.
   */
  exteriorDoorSqm?: number;
  /**
   * A band rendered INSIDE the top section, under the program chips.
   *
   * It is a slot rather than something a caller absolutely-positions over the
   * canvas: the apartment's awaiting-measurement badge sat at `right-3 top-3`
   * with z-30 and covered the top rail's 실효 투자비 cell, because that is
   * exactly where this frame's own top band already is. `TwinInstrumentFrame`
   * says it in its doc — widgets sit in the frame, they do not choose their
   * own corners — and this is the seam that lets them.
   */
  notice?: React.ReactNode;
  /**
   * One line under the grade/kWh/CO₂ strip saying what the grade IS.
   *
   * The badge renders a bare "1+++" and three things about it are not
   * inferable from the frame: that it is a Korean 건축물 에너지효율등급, that
   * it is struck on PRIMARY energy rather than the site figure printed two
   * centimetres to its right, and which threshold table it was read off.
   * `EnergyCards` owns the badge and belongs to another lane, so the sentence
   * sits beside it here rather than being wedged inside it.
   */
  gradeBasis?: string;
}

export function EnergyInstrumentHud({
  buildingPk,
  totalFloorArea,
  footprintArea,
  roofType,
  sidoPrefix,
  exteriorDoorSqm,
  notice,
  gradeBasis,
}: EnergyInstrumentHudProps) {
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);
  const setCapexBudget = useScenarioStore((s) => s.setCapexBudget);
  const setProgramTrack = useScenarioStore((s) => s.setProgramTrack);
  const setBuildingInputs = useScenarioStore((s) => s.setBuildingInputs);
  const appliedMeasureIds = useScenarioStore((s) => s.appliedMeasureIds);
  const setAppliedMeasureIds = useScenarioStore((s) => s.setAppliedMeasureIds);

  // Publish the derived inputs so other surfaces (SceneOutliner) feed the
  // engine from the same record instead of re-deriving their own.
  useEffect(() => {
    setBuildingInputs({
      buildingPk,
      totalFloorArea,
      footprintArea,
      roofType,
      sidoPrefix,
    });
  }, [buildingPk, totalFloorArea, footprintArea, roofType, sidoPrefix, setBuildingInputs]);

  // The same call `EnergyCards` makes, so the demand behind NPV and the kWh
  // on the strip below it are one number and not two. `sigunguCd` is the
  // active-building store's, exactly as `EnergyCards` reads it, with the
  // caller's 시도 prefix only as the fallback — `getClimateData` reads the
  // first two digits of either.
  const sigunguCd = useActiveSigunguCd();
  const metrics = useEnergyMetrics(buildingPk, sigunguCd ?? sidoPrefix);

  // The measures are sized on the areas the engine ITSELF priced, read back
  // off the heat-loss elements rather than re-derived. `footprintArea` used
  // to stand in for both the roof and the ground slab, which on the apartment
  // is a 36 % understatement of the roof — it has a pitched tiled roof of
  // 542.96 m² over a 345.81 m² footprint. The derivation is shared with the
  // side panel's retrofit list so the two cannot drift.
  const engineEnvelopeAreas = useMemo(
    () =>
      metrics
        ? engineEnvelopeAreasFrom(metrics.heatLoss.elements, exteriorDoorSqm ?? 0)
        : undefined,
    [metrics, exteriorDoorSqm],
  );

  const pvLayout = usePvLayout();
  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea,
    footprintArea,
    roofType,
    sidoPrefix,
    programTrack,
    // Undefined until the stores are seeded; the hook then falls back to its
    // coarse proxy, which is the honest state for a frame with no engine
    // answer yet rather than a number pretending to be one.
    engineDemand: metrics?.demand,
    engineEnvelopeAreas,
    // The kWp the measured-roof layout actually fits; the same object the 3D
    // draws and the legend counts.
    pvGeometricKWp: pvLayout?.totalKWp,
    // The work the user picked. Everything on this frame is priced against
    // it, not against the knapsack's optimum.
    chosenMeasureIds: appliedMeasureIds,
  });

  // Publish the knapsack RECOMMENDATION. Since 2026-09-06 it marks chips 추천
  // and nothing else — it no longer decides what the model shows.
  const setSelectedMeasureIds = useScenarioStore((s) => s.setSelectedMeasureIds);
  useEffect(() => {
    if (!scenario.selection) return;
    const ids = scenario.selection.selected.map((m) => m.id).sort();
    setSelectedMeasureIds(ids);
  }, [scenario.selection, setSelectedMeasureIds]);

  // Seed the user's set ONCE per building, from the first recommendation, so
  // the page arrives showing work rather than a bare building. After that the
  // field is the user's alone — note the guard is `=== null`, not "differs
  // from the recommendation": re-seeding on divergence would overwrite every
  // deselection, and changing a financing chip would move the building again,
  // which is exactly the behaviour this lane exists to remove.
  useEffect(() => {
    if (appliedMeasureIds !== null) return;
    if (!scenario.selection) return;
    setAppliedMeasureIds(scenario.selection.selected.map((m) => m.id));
  }, [appliedMeasureIds, scenario.selection, setAppliedMeasureIds]);

  const recommendedIds = useMemo(
    () => scenario.selection?.selected.map((m) => m.id) ?? [],
    [scenario.selection],
  );

  return (
    <TwinInstrumentFrame
      top={
        <section className="overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-md">
          {/* The rail answers for the CHOSEN work, not the optimum — the
              numbers above the chips have to describe the set the chips show
              as selected, or the frame reports two different projects. */}
          <ScenarioRail
            capexBudgetKrw={capexBudgetKrw}
            onBudgetChange={setCapexBudget}
            selection={scenario.chosen}
            assumptions={scenario.assumptions}
            totalCandidateMeasures={scenario.allMeasures.length}
          />
          {/* PRIMARY control: the work. Above financing, because the work is
              what the user is choosing and the money is a consequence. */}
          <div className="border-t border-border">
            <MeasureChipRow
              measures={scenario.allMeasures}
              recommendedIds={recommendedIds}
              areas={engineEnvelopeAreas}
              totalFloorAreaSqm={totalFloorArea}
              assumptions={scenario.assumptions}
            />
          </div>
          {/* SECONDARY: how it is paid for. Re-prices the chosen work; never
              re-picks it. */}
          <div className="border-t border-border">
            <ProgramTrackSelector
              value={programTrack}
              onChange={setProgramTrack}
              suggestedTrack={scenario.suggestedPrivateTrack}
            />
          </div>
          {notice ? <div className="border-t border-border">{notice}</div> : null}
        </section>
      }
      bottom={
        <section className="overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-md">
          <EnergyCards buildingPk={buildingPk} variant="strip" />
          {/* Directly under the badge it explains, and ABOVE the delta strip:
              the sentence says what the "before" number is, so it has to be
              read before the before→after row that builds on it. */}
          {gradeBasis ? (
            <p
              className="border-b border-border px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground"
              data-testid="energy-grade-basis"
            >
              {gradeBasis}
            </p>
          ) : null}
          <RetrofitDeltaStrip />
          <SelectedMeasuresStrip
            measures={scenario.chosen?.selected ?? []}
          />
          {/* The budget band left the frame 2026-09-06 (Lane 3D): the budget is an optional field in the rail, and the cost of the chosen work is 실효 투자비 above. */}
        </section>
      }
    />
  );
}
