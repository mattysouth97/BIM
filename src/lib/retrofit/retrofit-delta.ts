// src/lib/retrofit/retrofit-delta.ts
// What a 그린리모델링 selection actually changes — before/after, measured by
// running the SAME engine twice on the SAME recipe and climate, once on the
// as-is materials and once on `applyPhaseToMaterials(..., "retrofit", ids)`.
//
// Pure and synchronous: materials + recipe + climate + measure ids in, two
// engine runs and a list of what physically changed out. No React, no stores,
// no THREE.js. The twin's delta strip and the model pages' retrofit visuals
// both read this, so one selection produces one set of numbers everywhere.
//
// Three things this module refuses to do, all of them versions of the same
// mistake (AGENTS.md, "The label lies while the number is right"):
//
//  1. It does not derive its own envelope areas. Every area comes out of the
//     engine's own `calculateHeatLoss` rows, which come from
//     `envelopeQuantities(recipe)` — the measured envelope. A second area set
//     on the same frame is exactly the failure the split baseline already is.
//  2. It does not claim a measure moved the number unless it measured that it
//     did. `pricedByEngine` is established by re-running the engine with that
//     measure ALONE and comparing outputs — not by a hand-maintained list of
//     which fields the engine is believed to read.
//  3. It does not silently drop a measure the engine cannot price. An LED or
//     PV measure is real, is bought, and moves NPV; it simply does not move
//     this run's kWh/m2, because `deliveredFromDemand` fixes the lighting
//     share at 15 % of total and hard-codes `renewable: 0`. Those arrive as
//     changes with `pricedByEngine: false` and a reason, so the UI can render
//     a stated absence instead of an omission.
//
// Deliberately NOT changed by a window replacement: `windows.shgc`. Triple
// low-e glass really does cut solar gain, but the measure's economics
// (envelope-retrofits.ts) price only the HDD-derived HEATING saving. Moving
// SHGC here would show a cooling improvement on the strip that no NPV on the
// same frame paid for. The glazing-type change is still reported, marked as
// not priced, with that as its reason.

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "@/lib/energy/climate-data";
import type { HeatLossResult } from "@/lib/energy/heat-loss";
import type { AnnualDemand } from "@/lib/energy/annual-demand";
import type { CO2Result } from "@/lib/energy/co2-emissions";
import type { EfficiencyGrade } from "@/lib/compliance/efficiency-rating";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, VENTILATION_ELEMENT_NAME } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand, normalizeEfficiency } from "@/lib/energy/annual-demand";
import { calculateCO2 } from "@/lib/energy/co2-emissions";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import {
  deliveredFromDemand,
  buildingTypeFromMaterials,
} from "@/lib/energy/delivered-from-demand";
import { applyPhaseToMaterials, pvRoofTypeFromId } from "@/lib/bim/phases/apply-phase";

/** One engine evaluation. `before` and `after` are two of these. */
export interface RetrofitRun {
  /** The materials this run was evaluated on. */
  materials: MaterialProperties;
  heatLoss: HeatLossResult;
  demand: AnnualDemand;
  /** Site energy intensity from the degree-day run (kWh/m2·yr). */
  sitePerSqm: number;
  /** Primary-energy intensity backing the official grade (kWh/m2·yr). */
  primaryPerSqm: number;
  /** Official MOTIE/KEMCO primary-energy grade. */
  grade: EfficiencyGrade;
  co2: CO2Result;
  /** Sum of every element's heat-loss coefficient (W/K). */
  totalHCoefficient: number;
}

/** Per-element heat loss, before against after. */
export interface RetrofitElementDelta {
  /** Element name exactly as heat-loss.ts emits it. */
  element: string;
  labelKo: string;
  labelEn: string;
  /** m2, or m3 for the air-exchange row. Carried on both sides because no
   *  measure changes geometry or WWR — a future one that did would show here
   *  rather than hide inside a single "area" field. */
  beforeArea: number;
  afterArea: number;
  /** W/m2·K, or the effective air-change rate for the air-exchange row. */
  beforeU: number;
  afterU: number;
  /** Heat-loss coefficient h (W/K). */
  beforeHCoefficient: number;
  afterHCoefficient: number;
  /** after - before. Negative = less heat loss. */
  deltaHCoefficient: number;
}

/** One field of MaterialProperties that a measure moved. */
export interface RetrofitPhysicalChange {
  measureId: string;
  /** Dotted path into MaterialProperties, e.g. "envelope.windows.uValue". */
  field: string;
  labelKo: string;
  labelEn: string;
  before: number | string;
  after: number | string;
  /** Display unit, omitted for unitless/enum fields. */
  unit?: string;
  /** e.g. "외벽 U 1.10 → 0.15 W/m²·K" — parseable back to before/after. */
  summaryKo: string;
  summaryEn: string;
  /** True when this measure alone moves at least one engine output. */
  pricedByEngine: boolean;
  /** Why the engine does not price it. Present only when pricedByEngine is false. */
  unpricedReasonKo?: string;
  unpricedReasonEn?: string;
}

/**
 * What one measure did to the engine when applied ALONE, as after - before.
 * Negative is an improvement; a POSITIVE number is a measure that makes this
 * model worse, which happens for real (see the HRV note in apply-phase.ts)
 * and must be shown, not clamped.
 *
 * These do NOT sum to the whole-selection delta — measures interact (the
 * boiler efficiency divides the envelope's saving, HVAC sees the
 * post-envelope residual). Use them to attribute, never to add up.
 */
export interface RetrofitSoloDelta {
  sitePerSqm: number;
  primaryPerSqm: number;
  co2PerSqm: number;
  totalHCoefficient: number;
}

/** Everything one measure id did, including doing nothing. */
export interface RetrofitMeasureEffect {
  measureId: string;
  /** Field changes this id made. Empty means it changed nothing at all. */
  changes: RetrofitPhysicalChange[];
  /** True when applying this id ALONE moves an engine output. */
  pricedByEngine: boolean;
  /** This measure alone, against the baseline. */
  soloDelta: RetrofitSoloDelta;
  /** True when apply-phase has no rule for this id — it is not a no-op, it is unknown. */
  unrecognized: boolean;
}

export interface RetrofitDelta {
  before: RetrofitRun;
  after: RetrofitRun;
  elements: RetrofitElementDelta[];
  /** Per measure id, in the order supplied. */
  measures: RetrofitMeasureEffect[];
  /** Every change from every measure, flattened, for a simple render. */
  changes: RetrofitPhysicalChange[];
  /** after - before. Negative = improvement, on all four. */
  deltaSitePerSqm: number;
  deltaPrimaryPerSqm: number;
  deltaCo2PerSqm: number;
  deltaTotalHCoefficient: number;
  /** True when no engine output moved: the run cannot price this selection. */
  isZeroDelta: boolean;
  /** The intensity denominator both runs used (m2). */
  totalFloorAreaSqm: number;
}

export interface RetrofitDeltaInput {
  materials: MaterialProperties;
  recipe: BuildingRecipe;
  climate: ClimateData;
  measureIds: Iterable<string>;
  /** Solar irradiance region key for PV sizing. Default "seoul". */
  region?: string;
}

/** ko/en label for each heat-loss element name. */
const ELEMENT_LABELS: Record<string, { ko: string; en: string }> = {
  Walls: { ko: "외벽", en: "Walls" },
  Windows: { ko: "창호", en: "Windows" },
  Roof: { ko: "지붕", en: "Roof" },
  "Ground Floor": { ko: "지면 접한 바닥", en: "Ground floor" },
  [VENTILATION_ELEMENT_NAME]: { ko: "침기·환기", en: "Infiltration/ventilation" },
};

/**
 * Why an engine that read the field still did not move. Consulted ONLY after
 * the isolated run has measured that nothing moved, so a stale entry here can
 * never invent a reason for a measure that did move.
 */
const UNPRICED_REASONS: Record<string, { ko: string; en: string }> = {
  "lighting.lightingPowerDensity": {
    ko: "냉난방 도일 계산에는 조명 항이 없고, 등급 경로(delivered-from-demand)는 조명을 총량의 15 %로 고정합니다. 조명 교체는 NPV에는 반영되지만 이 실행의 kWh/m²에는 반영되지 않습니다.",
    en: "The degree-day run has no lighting term, and the grade path (delivered-from-demand) fixes lighting at 15 % of total. An LED measure moves NPV but not this run's kWh/m2.",
  },
  "lighting.lampType": {
    ko: "램프 종류는 엔진 입력이 아닙니다 — 소비전력밀도(LPD)만 계산에 쓰이며, 그 LPD도 이 실행에는 들어가지 않습니다.",
    en: "Lamp type is not an engine input; only LPD is, and this run does not read LPD either.",
  },
  "lighting.controlType": {
    ko: "조명 제어 방식은 엔진 입력이 아닙니다.",
    en: "Lighting control type is not an engine input.",
  },
  "renewable.solarPV.capacity": {
    ko: "delivered-from-demand.ts가 재생에너지를 0으로 고정하므로, 발전량은 1차에너지·등급에 반영되지 않습니다. PV는 NPV와 3D 형상에는 나타나지만 이 실행의 kWh/m²는 움직이지 않습니다.",
    en: "delivered-from-demand.ts hard-codes renewable: 0, so generation reaches neither primary energy nor the grade. PV shows in NPV and in the 3D model, but does not move this run's kWh/m2.",
  },
  "envelope.windows.glassType": {
    ko: "유리 사양은 U값을 통해서만 반영됩니다. SHGC는 의도적으로 그대로 두었습니다 — 이 측정치의 경제성(난방 절감)은 냉방 일사취득 변화를 계상하지 않기 때문입니다.",
    en: "Glazing spec reaches the engine only through the U-value. SHGC is deliberately left alone: this measure's economics price the heating saving only, not a cooling-gain change.",
  },
  "hvac.ventilation.type": {
    ko: "이 건물의 환기 급기량이 0이라 회수할 열이 모델 안에 없습니다. 엔진의 공기교환 항은 ach50/20 침기뿐이고, 열회수 환기는 침기를 줄이지 않습니다.",
    en: "This building's ventilation airflow is zero, so the model has no heat to recover: the engine's only air-exchange term is ach50/20 infiltration, which an HRV does not reduce.",
  },
  "hvac.ventilation.heatRecoveryEfficiency": {
    ko: "이 건물의 환기 급기량이 0이라 회수 효율이 곱해질 유량이 없습니다.",
    en: "This building's ventilation airflow is zero, so there is no flow for the recovery efficiency to act on.",
  },
};

const GENERIC_UNPRICED = {
  ko: "이 값은 현재 도일 기반 실행의 입력이 아닙니다.",
  en: "This field is not an input to the current degree-day run.",
};

function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/** Mean wall assembly U — the same arithmetic mean heat-loss.ts takes. */
function meanWallU(materials: MaterialProperties): number {
  const walls = materials.envelope.walls;
  if (walls.length === 0) return 0;
  return walls.reduce((sum, w) => sum + w.uValue, 0) / walls.length;
}

/**
 * Run the engine once. Mirrors `useEnergyMetrics` exactly for the four
 * outputs this module compares — heat loss, demand, the official primary
 * grade, and per-fuel CO2 — and computes nothing of its own.
 */
export function runEnergyEngine(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData,
): RetrofitRun {
  const totalFloorArea = envelopeQuantities(recipe).intensityFloorAreaSqm;
  const heatLoss = calculateHeatLoss(materials, recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, materials, recipe, climate);
  const rating = calculateEfficiencyRating(
    deliveredFromDemand(demand),
    totalFloorArea,
    buildingTypeFromMaterials(materials),
  );
  const co2 = calculateCO2(demand, totalFloorArea, materials.hvac.heating.fuelType);

  return {
    materials,
    heatLoss,
    demand,
    sitePerSqm: demand.demandPerSqm,
    primaryPerSqm: rating.primaryEnergyPerArea,
    grade: rating.grade,
    co2,
    totalHCoefficient: heatLoss.elements.reduce((s, e) => s + e.hCoefficient, 0),
  };
}

/** True when two runs are indistinguishable on every output this module shows. */
function runsAgree(a: RetrofitRun, b: RetrofitRun): boolean {
  return (
    a.totalHCoefficient === b.totalHCoefficient &&
    a.demand.totalDemand === b.demand.totalDemand &&
    a.primaryPerSqm === b.primaryPerSqm &&
    a.co2.totalCO2 === b.co2.totalCO2 &&
    a.grade === b.grade
  );
}

/** A change record, with the unpriced reason resolved from the field path. */
function change(
  measureId: string,
  field: string,
  labelKo: string,
  labelEn: string,
  before: number | string,
  after: number | string,
  unit: string | undefined,
  pricedByEngine: boolean,
): RetrofitPhysicalChange {
  const tail = unit ? ` ${unit}` : "";
  const reason = pricedByEngine ? undefined : (UNPRICED_REASONS[field] ?? GENERIC_UNPRICED);
  return {
    measureId,
    field,
    labelKo,
    labelEn,
    before,
    after,
    unit,
    summaryKo: `${labelKo} ${before} → ${after}${tail}`,
    summaryEn: `${labelEn} ${before} → ${after}${tail}`,
    pricedByEngine,
    unpricedReasonKo: reason?.ko,
    unpricedReasonEn: reason?.en,
  };
}

/**
 * The fields one measure id moved, read off the before/after materials rather
 * than declared. A measure whose target is already met produces none — which
 * is what makes "a measure that changes nothing yields a zero delta" true by
 * construction rather than by a special case.
 */
function changesForMeasure(
  measureId: string,
  before: MaterialProperties,
  after: MaterialProperties,
  priced: boolean,
): RetrofitPhysicalChange[] {
  const out: RetrofitPhysicalChange[] = [];
  const add = (
    field: string,
    ko: string,
    en: string,
    b: number | string,
    a: number | string,
    unit?: string,
  ) => {
    if (b === a) return;
    out.push(change(measureId, field, ko, en, b, a, unit, priced));
  };

  switch (measureId) {
    case "envelope-wall-insulation":
      add(
        "envelope.walls[].uValue",
        "외벽 U",
        "Wall U",
        fmt(meanWallU(before), 2),
        fmt(meanWallU(after), 2),
        "W/m²·K",
      );
      break;

    case "envelope-window-replacement":
      add(
        "envelope.windows.uValue",
        "창호 U",
        "Window U",
        fmt(before.envelope.windows.uValue, 2),
        fmt(after.envelope.windows.uValue, 2),
        "W/m²·K",
      );
      add(
        "envelope.windows.glassType",
        "유리 사양",
        "Glazing",
        `${before.envelope.windows.glassType}/${before.envelope.windows.coating}`,
        `${after.envelope.windows.glassType}/${after.envelope.windows.coating}`,
      );
      break;

    case "envelope-roof-insulation":
      add(
        "envelope.roof.uValue",
        "지붕 U",
        "Roof U",
        fmt(before.envelope.roof.uValue, 2),
        fmt(after.envelope.roof.uValue, 2),
        "W/m²·K",
      );
      break;

    case "envelope-floor-insulation":
      add(
        "envelope.groundFloor.uValue",
        "바닥 U",
        "Floor U",
        fmt(before.envelope.groundFloor.uValue, 2),
        fmt(after.envelope.groundFloor.uValue, 2),
        "W/m²·K",
      );
      break;

    case "hvac-boiler-upgrade":
      add(
        "hvac.heating.efficiency",
        "난방 효율",
        "Heating efficiency",
        fmt(normalizeEfficiency(before.hvac.heating.efficiency) * 100, 0),
        fmt(normalizeEfficiency(after.hvac.heating.efficiency) * 100, 0),
        "%",
      );
      break;

    case "hvac-heat-pump":
      add(
        "hvac.heating.efficiency",
        "난방 COP",
        "Heating COP",
        fmt(normalizeEfficiency(before.hvac.heating.efficiency), 2),
        fmt(normalizeEfficiency(after.hvac.heating.efficiency), 2),
      );
      add(
        "hvac.heating.fuelType",
        "난방 연료",
        "Heating fuel",
        before.hvac.heating.fuelType,
        after.hvac.heating.fuelType,
      );
      break;

    case "hvac-hrv":
      add(
        "hvac.ventilation.type",
        "환기 방식",
        "Ventilation",
        before.hvac.ventilation.type,
        after.hvac.ventilation.type,
      );
      add(
        "hvac.ventilation.heatRecoveryEfficiency",
        "열회수 효율",
        "Heat recovery",
        fmt(normalizeEfficiency(before.hvac.ventilation.heatRecoveryEfficiency) * 100, 0),
        fmt(normalizeEfficiency(after.hvac.ventilation.heatRecoveryEfficiency) * 100, 0),
        "%",
      );
      break;

    case "lighting-led":
    case "lighting-led-smart":
      add(
        "lighting.lightingPowerDensity",
        "조명 밀도",
        "Lighting power density",
        fmt(before.lighting.lightingPowerDensity, 1),
        fmt(after.lighting.lightingPowerDensity, 1),
        "W/m²",
      );
      add(
        "lighting.lampType",
        "램프",
        "Lamp type",
        before.lighting.lampType,
        after.lighting.lampType,
      );
      if (measureId === "lighting-led-smart") {
        add(
          "lighting.controlType",
          "조명 제어",
          "Lighting control",
          before.lighting.controlType,
          after.lighting.controlType,
        );
      }
      break;

    default:
      if (pvRoofTypeFromId(measureId)) {
        add(
          "renewable.solarPV.capacity",
          "태양광 용량",
          "PV capacity",
          fmt(before.renewable.solarPV.capacity, 1),
          fmt(after.renewable.solarPV.capacity, 1),
          "kWp",
        );
        // Area is only meaningful once an array exists; report it alongside.
        if (after.renewable.solarPV.installed && !before.renewable.solarPV.installed) {
          add(
            "renewable.solarPV.area",
            "패널 설치 면적",
            "Array area",
            fmt(before.renewable.solarPV.area, 0),
            fmt(after.renewable.solarPV.area, 0),
            "m²",
          );
        }
      }
      break;
  }

  return out;
}

/** Every measure id apply-phase has a rule for, so an unknown id says so. */
const KNOWN_MEASURE_IDS = new Set([
  "envelope-wall-insulation",
  "envelope-window-replacement",
  "envelope-roof-insulation",
  "envelope-floor-insulation",
  "hvac-boiler-upgrade",
  "hvac-heat-pump",
  "hvac-hrv",
  "lighting-led",
  "lighting-led-smart",
]);

function isKnownMeasureId(id: string): boolean {
  return KNOWN_MEASURE_IDS.has(id) || pvRoofTypeFromId(id) !== null;
}

/**
 * Before/after for a 그린리모델링 selection.
 *
 * Returns `null` when the recipe has no positive floor area — with no
 * intensity denominator there is no kWh/m2 and no grade, and inventing one
 * is the failure this whole module exists to avoid (same rule as
 * `useEnergyMetrics`).
 */
export function computeRetrofitDelta(input: RetrofitDeltaInput): RetrofitDelta | null {
  const { materials, recipe, climate, region } = input;
  const ids = [...input.measureIds];

  const quantities = envelopeQuantities(recipe);
  const totalFloorAreaSqm = quantities.intensityFloorAreaSqm;
  if (totalFloorAreaSqm <= 0) return null;

  // PV sizing rides the MEASURED roof surface, the same quantity heat-loss.ts
  // charges the roof U against — not the footprint.
  const context = { roofAreaSqm: quantities.roofAreaSqm, region };

  const before = runEnergyEngine(materials, recipe, climate);
  const afterMaterials = applyPhaseToMaterials(materials, "retrofit", ids, context);
  const after = runEnergyEngine(afterMaterials, recipe, climate);

  // Per-element rows, joined by the engine's own element names.
  const afterByName = new Map(after.heatLoss.elements.map((e) => [e.element, e]));
  const elements: RetrofitElementDelta[] = before.heatLoss.elements.map((b) => {
    const a = afterByName.get(b.element) ?? b;
    const labels = ELEMENT_LABELS[b.element] ?? { ko: b.element, en: b.element };
    return {
      element: b.element,
      labelKo: labels.ko,
      labelEn: labels.en,
      beforeArea: b.area,
      afterArea: a.area,
      beforeU: b.uValue,
      afterU: a.uValue,
      beforeHCoefficient: b.hCoefficient,
      afterHCoefficient: a.hCoefficient,
      deltaHCoefficient: a.hCoefficient - b.hCoefficient,
    };
  });

  // Per measure: is it priced? Measured, by applying that id ALONE to the
  // baseline and asking whether any engine output moved. A hand-kept list of
  // "fields the engine reads" would drift the moment the engine changes;
  // this cannot, because it is the engine answering.
  const measures: RetrofitMeasureEffect[] = ids.map((id) => {
    const unrecognized = !isKnownMeasureId(id);
    const soloMaterials = applyPhaseToMaterials(materials, "retrofit", [id], context);
    const solo = runEnergyEngine(soloMaterials, recipe, climate);
    const priced = !runsAgree(before, solo);
    return {
      measureId: id,
      changes: changesForMeasure(id, materials, soloMaterials, priced),
      pricedByEngine: priced,
      soloDelta: {
        sitePerSqm: solo.sitePerSqm - before.sitePerSqm,
        primaryPerSqm: solo.primaryPerSqm - before.primaryPerSqm,
        co2PerSqm: solo.co2.co2PerSqm - before.co2.co2PerSqm,
        totalHCoefficient: solo.totalHCoefficient - before.totalHCoefficient,
      },
      unrecognized,
    };
  });

  return {
    before,
    after,
    elements,
    measures,
    changes: measures.flatMap((m) => m.changes),
    deltaSitePerSqm: after.sitePerSqm - before.sitePerSqm,
    deltaPrimaryPerSqm: after.primaryPerSqm - before.primaryPerSqm,
    deltaCo2PerSqm: after.co2.co2PerSqm - before.co2.co2PerSqm,
    deltaTotalHCoefficient: after.totalHCoefficient - before.totalHCoefficient,
    isZeroDelta: runsAgree(before, after),
    totalFloorAreaSqm,
  };
}
