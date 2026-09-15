import { describe, expect, it } from 'vitest';
import { annualPvGenerationKWh } from '../pv-generation';
import { calculateSolarPotential } from '@/lib/retrofit/solar-potential';

describe('shared PV generation', () => {
  it('keeps the inherited Seoul yield band and exact economic-path equality', () => {
    const result = annualPvGenerationKWh({ peakSunHours: 3.5, systemSizeKWp: 1 });
    expect(result.annualKWh).toBeGreaterThan(1100);
    expect(result.annualKWh).toBeLessThan(1300);
    expect(calculateSolarPotential(600, 'flat', 3.5, 130, undefined, 1).annualGenerationKWh).toBe(result.annualKWh);
  });
  it('gives declared capacity, including zero, precedence over roof sizing', () => {
    expect(annualPvGenerationKWh({ peakSunHours: 3.8, systemSizeKWp: 0, roofAreaSqm: 1000 }))
      .toMatchObject({ annualKWh: 0, systemSizeKWp: 0, sizingBasis: 'declared_capacity' });
    const result = annualPvGenerationKWh({ peakSunHours: 3.8, systemSizeKWp: 10, roofAreaSqm: 1000 });
    expect(result.systemSizeKWp).toBe(10);
    expect(result.annualKWh).toBeCloseTo(10 * 3.8 * 365 * 1.15 * 0.8, 8);
  });
  it('explains the actual area and ratio used by the roof fallback', () => {
    const result = annualPvGenerationKWh({ peakSunHours: 3.5, roofAreaSqm: 123.45, roofType: 'gable' });
    expect(result.sizingBasis).toBe('roof_utilization_assumption');
    if (result.sizingBasis !== 'roof_utilization_assumption') throw Error('wrong branch');
    const [, area, ratio, density] = result.assumption.match(/area ([\d.]+) m² × utilization ([\d.]+) ÷ ([\d.]+)/)!;
    expect(Number(area)).toBe(123.45);
    expect(Number(area) * Number(ratio) / Number(density)).toBe(result.systemSizeKWp);
    expect(calculateSolarPotential(123.45, 'gable', 3.5, 130).annualGenerationKWh).toBe(result.annualKWh);
  });
  it.each([NaN, Infinity, -1])('does not turn invalid capacity %s into negative or nonfinite generation', capacity => {
    const result = annualPvGenerationKWh({ peakSunHours: 3.5, systemSizeKWp: capacity, roofAreaSqm: 100 });
    expect(result.annualKWh).toBe(0);
    expect(result.invalidInput).toBe(true);
  });
  it.each([NaN, Infinity, -1, 0])('refuses invalid sun-hours %s', hours => {
    expect(annualPvGenerationKWh({ peakSunHours: hours, systemSizeKWp: 10 })).toMatchObject({ annualKWh: 0, invalidInput: true });
  });
});
