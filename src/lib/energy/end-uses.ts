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
  | { source: "named_assumption"; assumptionId: string; assumption: string };

export interface FueledLoad {
  kwh: number;
  fuel: DeliveredFuel;
  provenance: EndUseProvenance;
}

export interface OnSiteGeneration {
  kwh: number;
  provenance: EndUseProvenance;
}

export interface EndUseLoads {
  hvac: { heating: FueledLoad; cooling: FueledLoad };
  lighting: FueledLoad;
  dhw: FueledLoad;
  plug: FueledLoad;
  onSiteGeneration: OnSiteGeneration;
}

export interface BuildEndUseLoadsInput {
  demand: AnnualDemand;
  materials: MaterialProperties;
  recipe: BuildingRecipe;
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
 * `onSiteGeneration` is 0 with a `named_assumption` placeholder provenance in
 * this plan; Plan 03 replaces it with declared PV capacity.
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
    lighting: { kwh: lightingLoad.kwh, fuel: "electric", provenance: lightingProvenance },
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
    onSiteGeneration: {
      kwh: 0,
      provenance: {
        source: "named_assumption",
        assumptionId: "A-NO-ONSITE-PV",
        assumption:
          "이 실행에는 자가발전(PV) 용량이 반영되지 않아 발전량을 0으로 둡니다 — 실측값이 아닌 자리표시자이며, 이후 계획에서 옥상 태양광 배치로 대체됩니다.",
      },
    },
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
    if (provenance.source === "named_assumption") {
      out.push({ endUse, assumptionId: provenance.assumptionId, assumption: provenance.assumption });
    }
  };
  push("heating", loads.hvac.heating.provenance);
  push("cooling", loads.hvac.cooling.provenance);
  push("lighting", loads.lighting.provenance);
  push("dhw", loads.dhw.provenance);
  push("plug", loads.plug.provenance);
  push("onSiteGeneration", loads.onSiteGeneration.provenance);
  return out;
}
