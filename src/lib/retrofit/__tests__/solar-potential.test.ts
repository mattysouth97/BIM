// src/lib/retrofit/__tests__/solar-potential.test.ts
// Unit tests for solar-potential.ts — Solar PV assessment for Korean buildings.

import { describe, it, expect } from 'vitest';
import { calculateSolarPotential, REGIONAL_IRRADIANCE } from '../solar-potential';

describe('calculateSolarPotential — 500m2 flat roof in Seoul', () => {
  const result = calculateSolarPotential(500, 'flat', 3.5, 100, 120);

  it('system size is ~70 kWp', () => {
    // usableArea = 500 * 0.7 = 350 m2; systemSize = 350 / 5 = 70 kWp
    expect(result.systemSizeKWp).toBeCloseTo(70, 1);
  });

  it('annual generation is ~82,271 kWh/year', () => {
    // Audit finding #6: previous yield (958 kWh/kWp) omitted the
    // plane-of-array tilt gain and used a pessimistic PR.
    // 70 kWp × 3.5 PSH × 365 × 1.15 (tilt) × 0.80 (PR) = 82,271 kWh
    expect(result.annualGenerationKWh).toBeCloseTo(82_271, -2);
  });

  it('specific yield lands in the plausible Korean range (1,100–1,300 kWh/kWp)', () => {
    // Seoul 3.5 PSH: 3.5 × 365 × 1.15 × 0.80 = 1,175.3 kWh/kWp
    const specificYield = result.annualGenerationKWh / result.systemSizeKWp;
    expect(specificYield).toBeGreaterThan(1_100);
    expect(specificYield).toBeLessThan(1_300);
    expect(specificYield).toBeCloseTo(1_175.3, 1);
  });

  it('roof utilization is 0.7 for flat', () => {
    expect(result.roofUtilization).toBe(0.7);
  });

  it('category is renewable', () => {
    expect(result.category).toBe('renewable');
  });

  it('estimated cost = 70 * 1,500,000 = 105,000,000 KRW', () => {
    expect(result.estimatedCost).toBeCloseTo(105_000_000, -3);
  });

  it('feedInTariffRate echoed back on result', () => {
    expect(result.feedInTariffRate).toBe(100);
  });
});

describe('calculateSolarPotential — roof type utilization', () => {
  it('gable roof has lower utilization than flat', () => {
    const flat = calculateSolarPotential(500, 'flat', 3.5, 100);
    const gable = calculateSolarPotential(500, 'gable', 3.5, 100);
    expect(gable.roofUtilization).toBeLessThan(flat.roofUtilization);
    expect(gable.systemSizeKWp).toBeLessThan(flat.systemSizeKWp);
    expect(gable.annualGenerationKWh).toBeLessThan(flat.annualGenerationKWh);
  });

  it('hip roof has lower utilization than gable', () => {
    const gable = calculateSolarPotential(500, 'gable', 3.5, 100);
    const hip = calculateSolarPotential(500, 'hip', 3.5, 100);
    expect(hip.roofUtilization).toBeLessThan(gable.roofUtilization);
  });

  it('sawtooth has lowest utilization', () => {
    const hip = calculateSolarPotential(500, 'hip', 3.5, 100);
    const sawtooth = calculateSolarPotential(500, 'sawtooth', 3.5, 100);
    expect(sawtooth.roofUtilization).toBeLessThan(hip.roofUtilization);
  });
});

describe('calculateSolarPotential — regional variation', () => {
  it('busan generates more than incheon (higher irradiance)', () => {
    const busan = calculateSolarPotential(500, 'flat', 3.8, 100);
    const incheon = calculateSolarPotential(500, 'flat', 3.4, 100);
    expect(REGIONAL_IRRADIANCE['busan']).toBeGreaterThan(REGIONAL_IRRADIANCE['incheon']);
    expect(busan.annualGenerationKWh).toBeGreaterThan(incheon.annualGenerationKWh);
  });

  it.each([NaN, Infinity, 0, -1])('refuses unresolved or invalid sun-hours %s', hours => {
    expect(() => calculateSolarPotential(100, 'flat', hours, 100)).toThrow(RangeError);
  });

  it('uses the supplied sun-hours without replacing them', () => {
    expect(calculateSolarPotential(100, 'flat', 4.1, 100).annualGenerationKWh).toBeCloseTo(14 * 4.1 * 365 * 1.15 * 0.8, 8);
  });
});

describe('calculateSolarPotential — feed-in tariff rate affects payback', () => {
  it('higher feed-in tariff rate reduces payback period', () => {
    const lowRate = calculateSolarPotential(500, 'flat', 3.5, 50);
    const highRate = calculateSolarPotential(500, 'flat', 3.5, 200);
    expect(highRate.paybackYears).toBeLessThan(lowRate.paybackYears);
  });

  it('annual cost saving increases with higher feed-in tariff rate', () => {
    const lowRate = calculateSolarPotential(500, 'flat', 3.5, 50);
    const highRate = calculateSolarPotential(500, 'flat', 3.5, 200);
    expect(highRate.annualCostSaving).toBeGreaterThan(lowRate.annualCostSaving);
  });
});

describe('calculateSolarPotential — zero roof area', () => {
  const result = calculateSolarPotential(0, 'flat', 3.5, 100);

  it('system size is zero', () => {
    expect(result.systemSizeKWp).toBe(0);
  });

  it('annual generation is zero', () => {
    expect(result.annualGenerationKWh).toBe(0);
  });

  it('estimated cost is zero', () => {
    expect(result.estimatedCost).toBe(0);
  });

  it('annual cost saving is zero', () => {
    expect(result.annualCostSaving).toBe(0);
  });

  it('payback is Infinity when no generation', () => {
    expect(result.paybackYears).toBe(Infinity);
  });

  it('co2 reduction is zero', () => {
    expect(result.co2Reduction).toBe(0);
  });
});
