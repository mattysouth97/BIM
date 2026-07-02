// src/lib/campus/__tests__/load-diversity.test.ts
// Unit tests for campus load diversity factor calculation.

import { describe, it, expect } from 'vitest';
import { calculateLoadDiversity } from '../load-diversity';

describe('calculateLoadDiversity — single building', () => {
  it('returns diversity factor of 1.0 (no diversity)', () => {
    const result = calculateLoadDiversity([
      { name: 'Office A', peakHeating: 100, peakCooling: 80, useType: 'office' },
    ]);
    expect(result.diversityFactor).toBe(1);
  });

  it('campus peak equals individual peak sum', () => {
    const result = calculateLoadDiversity([
      { name: 'Office A', peakHeating: 100, peakCooling: 80, useType: 'office' },
    ]);
    expect(result.campusPeakDemand).toBeCloseTo(result.individualPeakSum, 5);
  });

  it('peak reduction is zero', () => {
    const result = calculateLoadDiversity([
      { name: 'Office A', peakHeating: 100, peakCooling: 80, useType: 'office' },
    ]);
    expect(result.peakReduction).toBe(0);
  });

  it('insight mentions single building', () => {
    const result = calculateLoadDiversity([
      { name: 'Office A', peakHeating: 100, peakCooling: 80, useType: 'office' },
    ]);
    expect(result.insight).toMatch(/single building/i);
  });
});

describe('calculateLoadDiversity — office + residential (different peak times)', () => {
  const result = calculateLoadDiversity([
    { name: 'Office Tower', peakHeating: 200, peakCooling: 150, useType: 'office' },
    { name: 'Apartment Block', peakHeating: 180, peakCooling: 120, useType: 'residential' },
  ]);

  it('diversity factor is less than 1.0', () => {
    expect(result.diversityFactor).toBeLessThan(1.0);
  });

  it('campus peak is less than sum of individual peaks', () => {
    expect(result.campusPeakDemand).toBeLessThan(result.individualPeakSum);
  });

  it('individual peak sum equals sum of all building peaks', () => {
    expect(result.individualPeakSum).toBeCloseTo(200 + 150 + 180 + 120, 5);
  });

  it('peak reduction is positive', () => {
    expect(result.peakReduction).toBeGreaterThan(0);
  });

  it('diversity factor is between 0.7 and 1.0 (realistic range)', () => {
    expect(result.diversityFactor).toBeGreaterThan(0.7);
    expect(result.diversityFactor).toBeLessThanOrEqual(1.0);
  });

  it('insight string mentions percentage reduction', () => {
    expect(result.insight).toMatch(/\d+%/);
  });
});

describe('calculateLoadDiversity — all same use type (same schedule)', () => {
  const result = calculateLoadDiversity([
    { name: 'Office A', peakHeating: 100, peakCooling: 80, useType: 'office' },
    { name: 'Office B', peakHeating: 120, peakCooling: 90, useType: 'office' },
    { name: 'Office C', peakHeating: 90,  peakCooling: 70, useType: 'office' },
  ]);

  it('diversity factor is near 1.0 (same schedule = same peaks)', () => {
    // All offices peak at the same hour so campus peak = individual peak sum
    expect(result.diversityFactor).toBeCloseTo(1.0, 5);
  });

  it('peak reduction is zero', () => {
    expect(result.peakReduction).toBeCloseTo(0, 5);
  });
});

describe('calculateLoadDiversity — factory + office (some diversity)', () => {
  const result = calculateLoadDiversity([
    { name: 'Office Tower', peakHeating: 300, peakCooling: 200, useType: 'office' },
    { name: 'Factory',       peakHeating: 400, peakCooling: 100, useType: 'factory' },
  ]);

  it('diversity factor is between 0 and 1', () => {
    expect(result.diversityFactor).toBeGreaterThan(0);
    expect(result.diversityFactor).toBeLessThanOrEqual(1.0);
  });

  it('campus peak does not exceed individual sum', () => {
    expect(result.campusPeakDemand).toBeLessThanOrEqual(result.individualPeakSum);
  });

  it('individual peak sum is correct', () => {
    expect(result.individualPeakSum).toBeCloseTo(300 + 200 + 400 + 100, 5);
  });
});

describe('calculateLoadDiversity — insight string', () => {
  it('contains kW figure when reduction exists', () => {
    const result = calculateLoadDiversity([
      { name: 'Office A',    peakHeating: 200, peakCooling: 100, useType: 'office' },
      { name: 'Residential', peakHeating: 150, peakCooling: 80,  useType: 'residential' },
    ]);
    // Should mention kW somewhere
    expect(result.insight).toMatch(/kW/);
  });

  it('returns meaningful string for empty buildings', () => {
    const result = calculateLoadDiversity([]);
    expect(typeof result.insight).toBe('string');
    expect(result.insight.length).toBeGreaterThan(0);
  });

  it('returns diversity factor 1 for empty list', () => {
    const result = calculateLoadDiversity([]);
    expect(result.diversityFactor).toBe(1);
  });
});

describe('calculateLoadDiversity — school use type', () => {
  it('school + residential produces diversity (different peak hours)', () => {
    const result = calculateLoadDiversity([
      { name: 'School',      peakHeating: 200, peakCooling: 100, useType: 'school' },
      { name: 'Apartments',  peakHeating: 180, peakCooling: 120, useType: 'residential' },
    ]);
    // School peaks ~8-16, residential peaks morning+evening — some overlap but not full
    expect(result.diversityFactor).toBeLessThanOrEqual(1.0);
    expect(result.individualPeakSum).toBeCloseTo(200 + 100 + 180 + 120, 5);
  });
});

describe('calculateLoadDiversity — retail use type', () => {
  it('retail + office produces some diversity (retail later peak than office)', () => {
    const result = calculateLoadDiversity([
      { name: 'Mall',        peakHeating: 250, peakCooling: 200, useType: 'retail' },
      { name: 'Office Park', peakHeating: 300, peakCooling: 180, useType: 'office' },
    ]);
    expect(result.diversityFactor).toBeGreaterThan(0);
    expect(result.diversityFactor).toBeLessThanOrEqual(1.0);
  });
});
