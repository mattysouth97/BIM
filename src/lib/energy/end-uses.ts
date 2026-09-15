// src/lib/energy/end-uses.ts
// Phase 01 (Honest Physics), D-05/D-06/D-07 — four named, fuel-declaring end
// uses, built once per building and consumed by `deliveredFromDemand`. Ends
// the share-of-total fuel split: `EndUseLoads`'s shape makes a double count
// impossible to write, because each end use already knows which fuel it
// burns (D-06), rather than being assigned a fuel afterward by a percentage.
// Pure functions — no React, no stores.

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { AnnualDemand } from "./annual-demand";
import type { ClimateRegion } from "./climate-region";
import { annualPvGenerationKWh, TILT_FACTOR, PERFORMANCE_RATIO } from "./pv-generation";
import { envelopeQuantities } from "./envelope-quantities";
import { modeledLightingLoad } from "./lighting-load";
import { resolveSystemRatios, type SystemRatioProvenance } from "./system-breakdown";

/** Every fuel `deliveredFromDemand` can route an end use's kWh into. */
export type DeliveredFuel =
  | "electric"
  | "gas"
  | "districtHeating"
  | "districtCooling";

/**
 * Why this end use's kWh figure is what it is.
 *
 *  - `modeled`: a real physics/engine computation, or a direct field
 *    declaration (e.g. `materials.hvac.heating.fuelType`) — not an
 *    assumption in the sense this repository reserves the word for.
 *  - `named_assumption`: the figure rests on a value this repository did not
 *    measure — an era/use-code default, or a documented proxy (e.g. oil
 *    priced as gas) — carrying the assumption interpolated with its own
 *    number, mirroring `SystemRatioProvenance`'s `generic_default` branch.
 */
export type EndUseProvenance =
  | { source: "modeled"; basis: string }
  | { source: "named_assumption" | "refused"; assumptionId: string; assumption: string };

export interface FueledLoad {
  kwh: number;
  fuel: DeliveredFuel;
  provenance: EndUseProvenance;
}

export interface OnSiteGeneration {
  kwh: number;
  status: 'modeled' | 'no_generation_assumed' | 'capacity_unavailable' | 'region_unresolved' | 'invalid_input' | 'partial_capacity';
  capacityKWp: number;
  provenance: EndUseProvenance;
}

export interface EndUseLoads {
  hvac: { heating: FueledLoad; cooling: FueledLoad };
  lighting: FueledLoad & { lpdProvenance?: MaterialProperties["lighting"]["lpdProvenance"] };
  dhw: FueledLoad;
  plug: FueledLoad;
  onSiteGeneration: OnSiteGeneration;
}

export interface BuildEndUseLoadsInput {
  demand: AnnualDemand;
  materials: MaterialProperties;
  recipe: BuildingRecipe;
  climateRegion: ClimateRegion | null;
}

/**
 * D-06 heating fuel routing. `district-heat` → districtHeating; `electric`
 * and `heat-pump` → electric; `gas` → gas; `oil` → gas, carrying the SAME
 * documented proxy `resolveHeatingFuel` (economic-model.ts) already states —
 * no oil primary factor exists (see 01-01-PLAN.md's Open construction
 * assumption — oil fuel).
 */
function heatingFuel(
  materials: MaterialProperties,
): { fuel: DeliveredFuel; provenance: EndUseProvenance } {
  const fuelType = materials.hvac.heating.fuelType;
  switch (fuelType) {
    case "district-heat":
      return {
        fuel: "districtHeating",
        provenance: {
          source: "modeled",
          basis: "materials.hvac.heating.fuelType is district-heat",
        },
      };
    case "electric":
    case "heat-pump":
      return {
        fuel: "electric",
        provenance: {
          source: "modeled",
          basis: `materials.hvac.heating.fuelType is ${fuelType}`,
        },
      };
    case "oil":
      return {
        fuel: "gas",
        provenance: {
          source: "named_assumption",
          assumptionId: "A-OIL-AS-GAS",
          assumption:
            "난방 연료가 유류(oil)이나, 1차에너지 환산계수표에 유류 항목이 없어 가스 계수로 가격을 매깁니다 — economic-model.ts의 resolveHeatingFuel과 동일한 근사이며 실측 유류 단가가 아닙니다.",
        },
      };
    case "gas":
    default:
      return {
        fuel: "gas",
        provenance: {
          source: "modeled",
          basis: `materials.hvac.heating.fuelType is ${fuelType}`,
        },
      };
  }
}

/**
 * D-06 cooling fuel routing. `"district"` (added this phase) →
 * districtCooling; everything else (split/central-chiller/vrf/none) →
 * electric, matching how cooling has always been priced.
 */
function coolingFuel(
  materials: MaterialProperties,
): { fuel: DeliveredFuel; provenance: EndUseProvenance } {
  const systemType = materials.hvac.cooling.systemType;
  if (systemType === "district") {
    return {
      fuel: "districtCooling",
      provenance: {
        source: "modeled",
        basis: "materials.hvac.cooling.systemType is district",
      },
    };
  }
  return {
    fuel: "electric",
    provenance: {
      source: "modeled",
      basis: `materials.hvac.cooling.systemType is ${systemType}`,
    },
  };
}

/** DHW and plug are always electric in this repository's HVAC model today. */
const AUX_FUEL: DeliveredFuel = "electric";

/** Capacity declarations are inputs, while annual yield remains an assumption. */
function onSiteGeneration(materials: MaterialProperties, region: ClimateRegion | null): OnSiteGeneration {
  const pv = materials.renewable.solarPV;
  const refused = (status: OnSiteGeneration['status'], assumptionId: string, assumption: string): OnSiteGeneration => ({
    kwh: 0, capacityKWp: 0, status,
    provenance: { source: status === 'region_unresolved' || status === 'invalid_input' ? 'refused' : 'named_assumption', assumptionId, assumption },
  });
  if (!region) return refused('region_unresolved', 'R-PV-REGION-UNRESOLVED',
    '지역을 확인할 수 없어 태양광 발전량 산정을 보류합니다. 0은 무설비 판정이 아닌 계산 제외값입니다.');
  // Unknown existing capacity must not erase a separately declared addition.
  const partial = pv.capacity === 0 && !!pv.retrofitAddition?.existing.installed &&
    pv.retrofitAddition.existing.capacity === 0 && pv.retrofitAddition.proposed.capacity > 0;
  const capacity = partial ? pv.retrofitAddition!.proposed.capacity : pv.capacity;
  if (!Number.isFinite(capacity) || capacity < 0) return refused('invalid_input', 'R-PV-CAPACITY-INVALID',
    '태양광 용량이 유효하지 않아 발전량 산정을 보류합니다.');
  if (capacity === 0) return refused(pv.installed ? 'capacity_unavailable' : 'no_generation_assumed',
    'A-NO-ONSITE-PV', pv.capacityProvenance?.source === 'no_generation_assumption'
      ? pv.capacityProvenance.assumption
      : `태양광 용량 ${capacity} kWp로 발전량 0 kWh/yr를 가정합니다. 실제 발전이 있다면 발전량을 과소평가하고 순에너지와 등급을 더 나쁘게 평가합니다.${pv.installed ? ' 설치 표시는 있으나 용량은 미확인입니다.' : ''}`);
  const generation = annualPvGenerationKWh({ systemSizeKWp: capacity, peakSunHours: region.peakSunHours });
  if (generation.invalidInput) return refused('invalid_input', 'R-PV-YIELD-INVALID', '태양광 입력이 유효하지 않아 발전량 산정을 보류합니다.');
  return {
    kwh: generation.annualKWh, capacityKWp: capacity, status: partial ? 'partial_capacity' : 'modeled',
    provenance: { source: 'named_assumption', assumptionId: 'A-PV-YIELD',
      assumption: `${capacity} kWp × ${region.peakSunHours} 지역 피크 일조시간 × 365일 × 경사계수 ${TILT_FACTOR} × 성능비 ${PERFORMANCE_RATIO} = ${generation.annualKWh} kWh/yr. 실측 발전량이 아닌 대표 남향 배치 가정입니다.${partial ? ' 기존 설비 용량이 미확인이므로 신규 용량만 반영하며 총발전량을 과소평가합니다.' : ''}` },
  };
}

function ratioAssumption(
  label: string,
  assumptionId: string,
  ratio: number,
  ratioProvenance: SystemRatioProvenance,
): EndUseProvenance {
  if (ratioProvenance.source === "generic_default") {
    // The generic_default branch's own sentence already interpolates every
    // number it names (system-breakdown.ts resolveSystemRatios) — reuse it
    // rather than composing a second, possibly-drifting one.
    return { source: "named_assumption", assumptionId, assumption: ratioProvenance.assumption };
  }
  const pct = Math.round(ratio * 100);
  return {
    source: "named_assumption",
    assumptionId,
    assumption: `주용도코드 "${ratioProvenance.useCodePrefix}" 프로파일의 ${label} 비율(${pct}%)을 적용한 추정치이며, 실측값이 아닙니다.`,
  };
}

/**
 * D-05/D-06/D-07 — build the four named end uses `deliveredFromDemand`
 * consumes. Heating and cooling kWh come from `AnnualDemand` (the degree-day
 * engine); lighting kWh comes from `modeledLightingLoad` (D-01); dhw and plug
 * kWh come from the researched `SYSTEM_RATIOS` profile resolved by
 * `resolveSystemRatios` — the SAME resolution `calculateSystemBreakdown`
 * uses for its own dhw/plugLoads figures, so the two never drift apart.
 * Declared PV capacity uses the resolved regional yield; unknown region refuses.
 */
export function buildEndUseLoads(input: BuildEndUseLoadsInput): EndUseLoads {
  const { demand, materials, recipe } = input;

  const heating = heatingFuel(materials);
  const cooling = coolingFuel(materials);

  const totalFloorAreaSqm = envelopeQuantities(recipe).intensityFloorAreaSqm;
  const lightingLoad = modeledLightingLoad({
    materials,
    conditionedFloorAreaSqm: totalFloorAreaSqm,
    mainPurpsCd: recipe.mainPurpsCd,
  });
  const lightingProvenance: EndUseProvenance =
    lightingLoad.provenance.source === "default_hours"
      ? {
          source: "named_assumption",
          assumptionId: "A-LIGHTING-HOURS-DEFAULT",
          assumption: lightingLoad.provenance.assumption,
        }
      : {
          source: "modeled",
          basis: `LPD ${lightingLoad.lpdWPerSqm} W/m² × ${totalFloorAreaSqm.toFixed(1)} m² × ${lightingLoad.hoursPerYear} h/yr`,
        };

  const { ratios, provenance: ratioProvenance } = resolveSystemRatios(recipe.mainPurpsCd);
  const totalFromHvac = ratios.hvac > 0 ? demand.totalDemand / ratios.hvac : 0;
  const dhwKwh = totalFromHvac * ratios.dhw;
  const plugKwh = totalFromHvac * ratios.plug;

  return {
    hvac: {
      heating: { kwh: demand.heatingDemand, fuel: heating.fuel, provenance: heating.provenance },
      cooling: { kwh: demand.coolingDemand, fuel: cooling.fuel, provenance: cooling.provenance },
    },
    lighting: {
      kwh: lightingLoad.kwh,
      fuel: "electric",
      provenance: lightingProvenance,
      lpdProvenance: lightingLoad.provenance.lpdProvenance,
    },
    dhw: {
      kwh: dhwKwh,
      fuel: AUX_FUEL,
      provenance: ratioAssumption("급탕(DHW)", "A-DHW-RATIO", ratios.dhw, ratioProvenance),
    },
    plug: {
      kwh: plugKwh,
      fuel: AUX_FUEL,
      provenance: ratioAssumption("콘센트(plug)", "A-PLUG-RATIO", ratios.plug, ratioProvenance),
    },
    onSiteGeneration: onSiteGeneration(materials, input.climateRegion),
  };
}

/**
 * Every named assumption behind an `EndUseLoads`, flattened for a renderer
 * that needs to disclose them all in one pass (e.g. the breakdown chart's
 * assumption list). A `modeled` end use contributes nothing here — it is not
 * an assumption to disclose.
 */
export function endUseAssumptions(
  loads: EndUseLoads,
): readonly { endUse: string; assumptionId: string; assumption: string }[] {
  const out: { endUse: string; assumptionId: string; assumption: string }[] = [];
  const push = (endUse: string, provenance: EndUseProvenance) => {
    if (provenance.source !== "modeled") {
      out.push({ endUse, assumptionId: provenance.assumptionId, assumption: provenance.assumption });
    }
  };
  push("heating", loads.hvac.heating.provenance);
  push("cooling", loads.hvac.cooling.provenance);
  push("lighting", loads.lighting.provenance);
  if (loads.lighting.lpdProvenance && loads.lighting.lpdProvenance.source !== "user_input") {
    out.push({
      endUse: "lighting",
      assumptionId: loads.lighting.lpdProvenance.source === "use_code_default"
        ? "A-LIGHTING-LPD-DEFAULT" : "A-LIGHTING-LPD-RETROFIT",
      assumption: loads.lighting.lpdProvenance.assumption,
    });
  }
  push("dhw", loads.dhw.provenance);
  push("plug", loads.plug.provenance);
  push("onSiteGeneration", loads.onSiteGeneration.provenance);
  return out;
}
