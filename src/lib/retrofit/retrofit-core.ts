// Shared retrofit generation and pricing. Pure functions: no React or stores.
// Adapters supply either a real recipe or an explicitly named screening input.
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "@/lib/energy/climate-data";
import type { ClimateRegion } from "@/lib/energy/climate-region";
import { normalizeEfficiency } from "@/lib/energy/annual-demand";
import { meanWindowToWallRatio } from "@/lib/energy/heat-loss";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { modeledLightingLoad } from "@/lib/energy/lighting-load";
import { buildEndUseLoads } from "@/lib/energy/end-uses";
import { deliveredFromDemand } from "@/lib/energy/delivered-from-demand";
import { annualPvGenerationKWh } from "@/lib/energy/pv-generation";
import { generateEnvelopeRetrofits, KOREAN_2020_TARGET_U_VALUES } from "./envelope-retrofits";
import { generateHvacRetrofits } from "./hvac-retrofits";
import { generateLightingRetrofits } from "./lighting-retrofits";
import { calculateSolarPotential } from "./solar-potential";
import { layoutRoofPlanes, type RoofPlaneSet } from "./pv-layout";
import { computeRetrofitDelta, runEnergyEngine, type RetrofitDelta, type RetrofitRun } from "./retrofit-delta";
import { computeFinancials, resolveHeatingFuel, evaluateMeasureSet, selectMeasuresForBudget, type BudgetSelection, type EconomicAssumptions, type MeasureFinancials } from "./economic-model";
import { DEFAULT_ECONOMIC_ASSUMPTIONS, KOREAN_GR_PRESETS, ENERGY_PRICES, CO2_FACTORS, type ProgramTrack } from "./cost-database";
import type { RetrofitMeasure } from "./retrofit-types";

export interface RetrofitCoreInput {
  materials: MaterialProperties;
  recipe: BuildingRecipe | null;
  climate: ClimateData;
  climateRegion: ClimateRegion | null;
  conditionedFloorAreaSqm: number;
  roofPlanes?: RoofPlaneSet | null;
  roofType?: "flat" | "gable" | "hip" | "sawtooth";
  capexBudgetKrw?: number | null;
  engineEnvelopeAreas?: { opaqueWallSqm: number; windowSqm: number; roofSqm: number; groundFloorSqm: number };
  pvGeometricKWp?: number;
  programTrack: ProgramTrack;
  measureIds: readonly string[] | null;
  unsavedEditCount: number;
  assumptions?: EconomicAssumptions;
  feedInTariffKrw?: number;
  /** Only used without a recipe; never represented as an engine evaluation. */
  screening?: {
    footprintArea: number;
    roofType: "flat" | "gable" | "hip" | "sawtooth";
    annualOperatingHours: number;
    annualHeatingDemand?: number;
    annualCoolingDemand?: number;
    engineDemand?: { heatingDemand: number; coolingDemand: number };
    engineEnvelopeAreas?: { opaqueWallSqm: number; windowSqm: number; roofSqm: number; groundFloorSqm: number };
  };
}
export interface RetrofitCoreMeasure extends RetrofitMeasure {
  financials: MeasureFinancials;
  pricedByEngine: boolean;
  sizingAssumption?: string;
}
export interface RetrofitCoreResult {
  measures: RetrofitCoreMeasure[];
  selection: BudgetSelection | null;
  chosen: BudgetSelection | null;
  bill: { beforeAnnualKrw: number; afterAnnualKrw: number; annualSavingKrw: number; beforePurchasedKwh: number; afterPurchasedKwh: number; tariffs: typeof tariffs; basis: string } | null;
  delta: RetrofitDelta | null;
  assumptions: EconomicAssumptions;
  baselineAnnualEnergyCostKrw: number;
  totalAnnualSavingKwh: number;
  unsavedEditCount: number;
  notes: { ko: string; en: string }[];
}

export function usefulDemandFromEngine(demand: { heatingDemand: number; coolingDemand: number }, materials: MaterialProperties) {
  const eta = Math.min(Math.max(normalizeEfficiency(materials.hvac.heating.efficiency), 0.3), 6);
  const rawCop = normalizeEfficiency(materials.hvac.cooling.efficiency);
  return { heating: demand.heatingDemand * eta, cooling: demand.coolingDemand * (rawCop > 0 ? Math.max(rawCop, 1) : 0) };
}

function pricedLoads(run: RetrofitRun, recipe: BuildingRecipe, climateRegion: ClimateRegion | null) {
  const delivered = deliveredFromDemand(buildEndUseLoads({ demand: run.demand, materials: run.materials, recipe, climateRegion }));
  return {
    electricity: Math.max(0, delivered.electric - delivered.renewable),
    gas: delivered.gas,
    districtHeating: delivered.districtHeating,
    // No district-cooling tariff exists in this cost table: explicitly priced
    // with the existing district heat tariff, not disguised as grid electricity.
    districtCooling: delivered.districtCooling,
  };
}
const tariffs = { electricity: ENERGY_PRICES.electricity, gas: ENERGY_PRICES.gas, districtHeating: ENERGY_PRICES.districtHeating, districtCooling: ENERGY_PRICES.districtHeating };
const emissions = { electricity: CO2_FACTORS.electricity, gas: CO2_FACTORS.gas, districtHeating: CO2_FACTORS.districtHeating, districtCooling: CO2_FACTORS.districtHeating };

export function generateRetrofitMeasures(input: RetrofitCoreInput): RetrofitCoreResult {
  const { materials, climate, climateRegion } = input;
  const assumptions = input.assumptions ?? KOREAN_GR_PRESETS[input.programTrack] ?? DEFAULT_ECONOMIC_ASSUMPTIONS;
  const totalFloorArea = input.conditionedFloorAreaSqm;
  // A frozen payload's conditioned area wins over a representative recipe's
  // geometric storey area. Both engine runs receive the same explicit boundary.
  const recipe = input.recipe ? { ...input.recipe, officialFloorAreaSqm: totalFloorArea } : null;
  const screening = input.screening;
  const q = recipe ? envelopeQuantities(recipe) : null;
  const baseline = recipe ? runEnergyEngine(materials, recipe, climate, climateRegion) : null;
  const wallArea = materials.envelope.walls.reduce((sum, wall) => sum + wall.surfaceArea, 0);
  const wallU = wallArea > 0 ? materials.envelope.walls.reduce((sum, wall) => sum + wall.uValue * wall.surfaceArea, 0) / wallArea : 0;
  const wwr = meanWindowToWallRatio(materials);
  const area = (name: string) => baseline?.heatLoss.elements.find(element => element.element === name)?.area;
  const roofArea = input.engineEnvelopeAreas?.roofSqm ?? area("Roof") ?? screening?.engineEnvelopeAreas?.roofSqm ?? q?.roofAreaSqm ?? screening?.footprintArea ?? 0;
  const rawRoofType = input.roofType ?? recipe?.roof.type ?? screening?.roofType ?? "flat";
  const roofType = rawRoofType === "other" ? "flat" : rawRoofType;
  const pvGeometricKWp = input.roofPlanes ? layoutRoofPlanes(input.roofPlanes).totalKWp : input.pvGeometricKWp;
  const heatingFuel = resolveHeatingFuel(materials.hvac.heating);
  const envelope = totalFloorArea > 0 ? generateEnvelopeRetrofits(
    { wall: wallU, roof: materials.envelope.roof.uValue, window: materials.envelope.windows.uValue, floor: materials.envelope.groundFloor.uValue },
    KOREAN_2020_TARGET_U_VALUES,
    { wall: Math.max(0, input.engineEnvelopeAreas?.opaqueWallSqm ?? area("Walls") ?? screening?.engineEnvelopeAreas?.opaqueWallSqm ?? wallArea * (1 - wwr)), window: input.engineEnvelopeAreas?.windowSqm ?? area("Windows") ?? screening?.engineEnvelopeAreas?.windowSqm ?? wallArea * wwr, roof: roofArea, floor: input.engineEnvelopeAreas?.groundFloorSqm ?? area("Ground Floor") ?? screening?.engineEnvelopeAreas?.groundFloorSqm ?? q?.planAreaSqm ?? screening?.footprintArea ?? 0 },
    climate.hdd, materials.hvac.heating.efficiency, heatingFuel,
  ) : [];
  const useful = baseline ? usefulDemandFromEngine(baseline.demand, materials) : screening?.engineDemand ? usefulDemandFromEngine(screening.engineDemand, materials) : null;
  const heating = useful?.heating ?? screening?.annualHeatingDemand ?? totalFloorArea * 120;
  const cooling = useful?.cooling ?? screening?.annualCoolingDemand ?? totalFloorArea * 30;
  const hrvPresent = (materials.hvac.ventilation.heatRecoveryEfficiency ?? 0) > 0;
  const hvac = totalFloorArea > 0 ? generateHvacRetrofits({ heatingType: materials.hvac.heating.systemType, heatingEfficiency: materials.hvac.heating.efficiency, coolingType: materials.hvac.cooling.systemType, coolingEfficiency: materials.hvac.cooling.efficiency }, totalFloorArea,
    // Screening compatibility only. A real recipe is priced by the isolated
    // engine rerun below; no post-hoc efficiency multiplier prices that path.
    baseline ? heating : Math.max(0, heating - envelope.reduce((sum, m) => sum + m.annualEnergySaving, 0)), cooling, heatingFuel,
  ).filter(m => m.id === "hvac-hrv" ? !hrvPresent : heatingFuel !== "electricity" && normalizeEfficiency(materials.hvac.heating.efficiency) <= 1.5) : [];
  const lightingHours = recipe ? modeledLightingLoad({ materials, conditionedFloorAreaSqm: totalFloorArea, mainPurpsCd: recipe.mainPurpsCd }).hoursPerYear : screening?.annualOperatingHours ?? 2500;
  const lighting = totalFloorArea > 0 ? generateLightingRetrofits(materials.lighting.lightingPowerDensity, totalFloorArea, lightingHours) : [];
  let solar = climateRegion && totalFloorArea > 0 ? calculateSolarPotential(roofArea, roofType, climateRegion.peakSunHours, input.feedInTariffKrw ?? 130, undefined, pvGeometricKWp) : null;
  if (solar && baseline && recipe) {
    const delivered = deliveredFromDemand(buildEndUseLoads({ demand: baseline.demand, materials, recipe, climateRegion }));
    const selfConsumedKwh = Math.min(solar.annualGenerationKWh * 0.7, Math.max(0, delivered.electric - delivered.renewable));
    const annualSelfConsumptionRevenue = selfConsumedKwh * ENERGY_PRICES.electricity;
    const annualFeedInRevenue = (solar.annualGenerationKWh - selfConsumedKwh) * (input.feedInTariffKrw ?? 130);
    const annualCostSaving = annualSelfConsumptionRevenue + annualFeedInRevenue;
    solar = { ...solar, annualSelfConsumptionRevenue, annualFeedInRevenue, annualCostSaving,
      paybackYears: annualCostSaving > 0 ? solar.estimatedCost / annualCostSaving : Infinity,
      escalationComponents: [{ amount: annualSelfConsumptionRevenue, fuel: "electricity", degradationRate: 0.005 }, { amount: annualFeedInRevenue, escalation: 0, degradationRate: 0.005 }],
    };
  }
  const solarSizing = climateRegion ? annualPvGenerationKWh({ peakSunHours: climateRegion.peakSunHours, systemSizeKWp: pvGeometricKWp, roofAreaSqm: roofArea, roofType }) : null;
  const candidates: RetrofitMeasure[] = [...envelope, ...hvac, ...lighting, ...(solar && solar.annualGenerationKWh > 0 ? [solar] : [])];
  const deltaInput = recipe ? { materials, recipe, climate, climateRegion, pvGeometricKWp } : null;
  const allDelta = deltaInput ? computeRetrofitDelta({ ...deltaInput, measureIds: candidates.map(m => m.id) }) : null;
  const beforeLoads = baseline && recipe ? pricedLoads(baseline, recipe, climateRegion) : null;
  const measures: RetrofitCoreMeasure[] = candidates.map(candidate => {
    const effect = allDelta?.measures.find(m => m.measureId === candidate.id);
    let measure = candidate;
    if (deltaInput && beforeLoads && candidate.category !== "renewable") {
      const solo = computeRetrofitDelta({ ...deltaInput, measureIds: [candidate.id] })!;
      const afterLoads = pricedLoads(solo.after, recipe!, climateRegion);
      const fuels = Object.keys(beforeLoads) as (keyof typeof beforeLoads)[];
      // Physical site demand and purchased-energy savings are distinct when
      // existing PV already covers electricity. Never price gross kWh twice.
      const annualEnergySaving = -solo.deltaSitePerSqm * totalFloorArea;
      const streams = fuels.map(fuel => ({ amount: (beforeLoads[fuel] - afterLoads[fuel]) * tariffs[fuel], fuel: fuel === "districtCooling" ? "districtHeating" as const : fuel })).filter(stream => stream.amount !== 0);
      const annualCostSaving = streams.reduce((sum, stream) => sum + stream.amount, 0);
      const co2Reduction = fuels.reduce((sum, fuel) => sum + (beforeLoads[fuel] - afterLoads[fuel]) * emissions[fuel] / 1000, 0);
      measure = { ...candidate, annualEnergySaving, annualCostSaving, co2Reduction, escalationComponents: streams, paybackYears: annualCostSaving > 0 ? candidate.estimatedCost / annualCostSaving : Infinity,
        description: `${candidate.name}: isolated engine rerun changes annual site consumption by ${-annualEnergySaving} kWh; annual bill saving ${annualCostSaving} KRW. Other measures are not applied in this comparison.` };
    }
    const sizingAssumption = candidate.category === "renewable" && solarSizing?.sizingBasis === "roof_utilization_assumption" ? solarSizing.assumption : undefined;
    return { ...measure, ...(sizingAssumption ? { sizingAssumption, description: `${measure.description} ${sizingAssumption}` } : {}), pricedByEngine: effect?.pricedByEngine ?? false, financials: computeFinancials(measure, assumptions) };
  });
  const selection = !measures.length ? null : input.capexBudgetKrw == null
    ? evaluateMeasureSet(measures.filter(m => m.financials.npv > 0), assumptions)
    : selectMeasuresForBudget(measures, input.capexBudgetKrw, assumptions);
  const chosen = !measures.length ? null : input.measureIds === null ? selection
    : evaluateMeasureSet(measures.filter(m => input.measureIds!.includes(m.id)), assumptions);
  const delta = deltaInput ? computeRetrofitDelta({ ...deltaInput, measureIds: chosen?.selected.map(m => m.id) ?? [] }) : null;
  const billFor = (run: RetrofitRun) => {
    const delivered = deliveredFromDemand(buildEndUseLoads({ demand: run.demand, materials: run.materials, recipe: recipe!, climateRegion }));
    const electricity = Math.max(0, delivered.electric - delivered.renewable);
    return { annualKrw: electricity * tariffs.electricity + delivered.gas * tariffs.gas + (delivered.districtHeating + delivered.districtCooling) * tariffs.districtHeating,
      purchasedKwh: electricity + delivered.gas + delivered.districtHeating + delivered.districtCooling };
  };
  const beforeBill = delta ? billFor(delta.before) : null;
  const afterBill = delta ? billFor(delta.after) : null;
  const bill = beforeBill && afterBill ? { beforeAnnualKrw: beforeBill.annualKrw, afterAnnualKrw: afterBill.annualKrw, annualSavingKrw: beforeBill.annualKrw - afterBill.annualKrw, beforePurchasedKwh: beforeBill.purchasedKwh, afterPurchasedKwh: afterBill.purchasedKwh, tariffs,
    basis: `Annual net-energy screening: PV offsets electricity up to annual demand; no export revenue or hourly matching in this bill. Fixed assumed tariffs: electricity ${tariffs.electricity}, gas ${tariffs.gas}, district heat ${tariffs.districtHeating} KRW/kWh; district cooling uses heat as a proxy.`
  } : null;
  const baselineAnnualEnergyCostKrw = beforeLoads ? (Object.keys(beforeLoads) as (keyof typeof beforeLoads)[]).reduce((sum, fuel) => sum + beforeLoads[fuel] * tariffs[fuel], 0) : 0;
  return { measures, selection, chosen, bill, delta, assumptions, baselineAnnualEnergyCostKrw: bill?.beforeAnnualKrw ?? baselineAnnualEnergyCostKrw,
    totalAnnualSavingKwh: delta ? -delta.deltaSitePerSqm * totalFloorArea : measures.reduce((sum, m) => sum + m.annualEnergySaving, 0),
    unsavedEditCount: input.unsavedEditCount,
    notes: [
      { ko: recipe ? "각 조치 절감량은 같은 입력의 단독 엔진 재실행 결과입니다. 조치 간 상호작용 때문에 개별 절감량을 합산하면 전체 절감량과 다를 수 있습니다." : "도면 레시피가 없어 면적·수요의 명시적 근사값으로 산정합니다. 단독 엔진 재실행 결과가 아닙니다.", en: recipe ? "Each measure uses an isolated engine rerun on the same inputs. Individual savings are not additive because measures interact." : "No recipe is available: area and demand screening assumptions are used, not isolated engine reruns." },
      { ko: `조명 운영시간 ${lightingHours}시간/년을 적용합니다.`, en: `Lighting uses ${lightingHours} operating hours/year.` },
      { ko: `원본에 저장되지 않은 로컬 수정 ${input.unsavedEditCount}개가 포함됩니다.`, en: `${input.unsavedEditCount} local edits not saved to the source model are included.` },
      { ko: "태양광 경제성은 발전량의 최대 70% 자가소비를 가정하되 남은 전력 수요로 제한하며, 나머지는 판매수익 가정입니다. 1차에너지는 전력 수요까지만 발전량을 차감합니다.", en: "PV economics assumes up to 70% self-consumption, capped at remaining electricity demand, with the rest exported. Primary energy deducts generation only up to electricity demand." },
      { ko: "지역냉방 요금·배출계수는 이 비용표의 지역난방 값을 대체 적용합니다.", en: "District cooling uses this cost table's district-heating tariff and emissions factor as an explicit proxy." },
    ] };
}
