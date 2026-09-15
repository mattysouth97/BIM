import { describe, expect, it } from 'vitest';
import { referenceBuildingEnergyInputs } from '@/lib/reference-buildings/energy-inputs';
import { inferMaterialProperties } from '@/lib/material-inference';
import type { BrTitleInfo } from '@/lib/types';
import { calculateEfficiencyRating } from '@/lib/compliance/efficiency-rating';
import { resolveClimateRegion } from '../climate-region';
import { climateFromRegion } from '../climate-data';
import { calculateHeatLoss } from '../heat-loss';
import { calculateAnnualDemand } from '../annual-demand';
import { buildEndUseLoads, endUseAssumptions } from '../end-uses';
import { deliveredFromDemand, buildingTypeForGrade } from '../delivered-from-demand';
import { envelopeQuantities } from '../envelope-quantities';

const region = resolveClimateRegion({ sigunguCd: '11' })!;
function run(capacity: number, resolved = region as typeof region | null) {
  const { materials: original, recipe } = referenceBuildingEnergyInputs('fzk-haus')!;
  const materials = structuredClone(original);
  materials.hvac.heating.fuelType = 'electric';
  materials.renewable.solarPV.capacity = capacity;
  materials.renewable.solarPV.installed = capacity > 0;
  const climate = climateFromRegion(region);
  const demand = calculateAnnualDemand(calculateHeatLoss(materials, recipe, climate), materials, recipe, climate);
  const loads = buildEndUseLoads({ materials, recipe, demand, climateRegion: resolved });
  const rating = calculateEfficiencyRating(deliveredFromDemand(loads), envelopeQuantities(recipe).intensityFloorAreaSqm, buildingTypeForGrade(materials, recipe.mainPurpsCd));
  return { loads, rating };
}
describe('PV reaches primary energy', () => {
  it('larger capacity lowers primary energy and sufficient generation improves the grade', () => {
    const baseline = run(0), pv = run(20), large = run(1000);
    expect(pv.rating.primaryEnergyPerArea).toBeLessThan(baseline.rating.primaryEnergyPerArea);
    expect(large.rating.grade).not.toBe(baseline.rating.grade);
    expect(pv.loads.onSiteGeneration.kwh).toBe(20 * 3.5 * 365 * 1.15 * 0.8);
  });
  it('reports generation beyond the annual electric leg without negative primary electricity', () => {
    const { rating, loads } = run(1000);
    const p = rating.breakdown.primaryEnergy;
    expect(p.electric).toBe(0);
    expect(p.clippedGenerationKWh).toBeGreaterThan(0);
    expect(p.clippedGenerationKWh).toBe(loads.onSiteGeneration.kwh - rating.breakdown.deliveredEnergy.electric);
  });
  it('zero capacity is an assumption stating the direction of bias', () => {
    const materials = inferMaterialProperties({ mainPurpsCd: '14000', pmsDay: '20000101' } as BrTitleInfo, []);
    const p = materials.renewable.solarPV.capacityProvenance!;
    expect(p.source).toBe('no_generation_assumption');
    if (p.source !== 'no_generation_assumption') throw Error('missing assumption');
    expect(p.assumption).toContain('과소평가');
    expect(p.assumption).toContain('더 나쁘게');
    expect(Number(p.assumption.match(/용량 ([\d.]+) kWp/)![1])).toBe(materials.renewable.solarPV.capacity);
    expect(p.assumption).not.toBe(materials.lighting.lpdProvenance!.source === 'use_code_default' ? materials.lighting.lpdProvenance!.assumption : '');
    expect(endUseAssumptions(run(0).loads).some(x => x.assumptionId === 'A-NO-ONSITE-PV')).toBe(true);
  });
  it('refuses unresolved region distinctly from a no-generation assumption', () => {
    const refused = run(20, null).loads.onSiteGeneration;
    expect(refused).toMatchObject({ kwh: 0, status: 'region_unresolved', provenance: { source: 'refused', assumptionId: 'R-PV-REGION-UNRESOLVED' } });
    expect(run(0).loads.onSiteGeneration.status).toBe('no_generation_assumed');
  });
  it.each([-1, NaN, Infinity])('refuses invalid capacity %s', capacity => {
    expect(run(capacity).loads.onSiteGeneration).toMatchObject({ kwh: 0, status: 'invalid_input', provenance: { source: 'refused' } });
  });
});
