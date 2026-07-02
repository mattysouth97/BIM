// src/lib/retrofit/__tests__/solar-potential.test.ts
// Unit tests for solar-potential.ts — Solar PV assessment for Korean buildings.

import { describe, it, expect } from 'vitest';
import { calculateSolarPotential, REGIONAL_IRRADIANCE } from '../solar-potential';

describe('calculateSolarPotential — 500m2 flat roof in Seoul', () => {
  const result = calculateSolarPotential(500, 'flat', 'seoul', 100, 120);

  it('system size is ~70 kWp', () => {
    // usableArea = 500 * 0.7 = 350 m2; systemSize = 350 / 5 = 70 kWp
    expect(result.systemSizeKWp).toBeCloseTo(70, 1);
  });

  it('annual generation is ~68,000 kWh/year', () => {
    // 70 * 3.5 * 365 * 0.75 = 67,068.75 kWh
    expect(result.annualGenerationKWh).toBeCloseTo(67068, -2);
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
    const flat = calculateSolarPotential(500, 'flat', 'seoul', 100);
    const gable = calculateSolarPotential(500, 'gable', 'seoul', 100);
    expect(gable.roofUtilization).toBeLessThan(flat.roofUtilization);
    expect(gable.systemSizeKWp).toBeLessThan(flat.systemSizeKWp);
    expect(gable.annualGenerationKWh).toBeLessThan(flat.annualGenerationKWh);
  });

  it('hip roof has lower utilization than gable', () => {
    const gable = calculateSolarPotential(500, 'gable', 'seoul', 100);
    const hip = calculateSolarPotential(500, 'hip', 'seoul', 100);
    expect(hip.roofUtilization).toBeLessThan(gable.roofUtilization);
  });

  it('sawtooth has lowest utilization', () => {
    const hip = calculateSolarPotential(500, 'hip', 'seoul', 100);
    const sawtooth = calculateSolarPotential(500, 'sawtooth', 'seoul', 100);
    expect(sawtooth.roofUtilization).toBeLessThan(hip.roofUtilization);
  });
});

describe('calculateSolarPotential — regional variation', () => {
  it('busan generates more than incheon (higher irradiance)', () => {
    const busan = calculateSolarPotential(500, 'flat', 'busan', 100);
    const incheon = calculateSolarPotential(500, 'flat', 'incheon', 100);
    expect(REGIONAL_IRRADIANCE['busan']).toBeGreaterThan(REGIONAL_IRRADIANCE['incheon']);
    expect(busan.annualGenerationKWh).toBeGreaterThan(incheon.annualGenerationKWh);
  });

  it('unknown region falls back to default and returns valid result', () => {
    const result = calculateSolarPotential(100, 'flat', 'unknown-region', 100);
    expect(result.annualGenerationKWh).toBeGreaterThan(0);
    expect(isFinite(result.paybackYears)).toBe(true);
  });

  it('region lookup is case-insensitive', () => {
    const lower = calculateSolarPotential(500, 'flat', 'seoul', 100);
    const upper = calculateSolarPotential(500, 'flat', 'Seoul', 100);
    expect(lower.annualGenerationKWh).toBe(upper.annualGenerationKWh);
  });
});

describe('calculateSolarPotential — feed-in tariff rate affects payback', () => {
  it('higher feed-in tariff rate reduces payback period', () => {
    const lowRate = calculateSolarPotential(500, 'flat', 'seoul', 50);
    const highRate = calculateSolarPotential(500, 'flat', 'seoul', 200);
    expect(highRate.paybackYears).toBeLessThan(lowRate.paybackYears);
  });

  it('annual cost saving increases with higher feed-in tariff rate', () => {
    const lowRate = calculateSolarPotential(500, 'flat', 'seoul', 50);
    const highRate = calculateSolarPotential(500, 'flat', 'seoul', 200);
    expect(highRate.annualCostSaving).toBeGreaterThan(lowRate.annualCostSaving);
  });
});

describe('calculateSolarPotential — zero roof area', () => {
  const result = calculateSolarPotential(0, 'flat', 'seoul', 100);

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
