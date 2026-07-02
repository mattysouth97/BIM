import { describe, it, expect } from 'vitest';
import { assessFidelity } from '../fidelity-assessor';
import { generateUpgradeChecklist } from '../upgrade-checklist';

const BASE_PUBLIC: Parameters<typeof assessFidelity>[0] = {
  hasPublicData: true,
  hasFloorData: true,
  hasFootprint: true,
  hasEnergyBills: false,
  hasFloorPlans: false,
  hasEquipmentSchedule: false,
  hasIfcModel: false,
  hasSensorData: false,
};

describe('assessFidelity', () => {
  it('public data only → Level 1', () => {
    const report = assessFidelity(BASE_PUBLIC);
    expect(report.level).toBe(1);
  });

  it('public data + energy bills → Level 2', () => {
    const report = assessFidelity({ ...BASE_PUBLIC, hasEnergyBills: true });
    expect(report.level).toBe(2);
  });

  it('public data + floor plans → Level 2', () => {
    const report = assessFidelity({ ...BASE_PUBLIC, hasFloorPlans: true });
    expect(report.level).toBe(2);
  });

  it('public data + energy bills + IFC → Level 3', () => {
    const report = assessFidelity({ ...BASE_PUBLIC, hasEnergyBills: true, hasIfcModel: true });
    expect(report.level).toBe(3);
  });

  it('all data available → Level 3, completeness = 1.0', () => {
    const report = assessFidelity({
      hasPublicData: true,
      hasFloorData: true,
      hasFootprint: true,
      hasEnergyBills: true,
      hasFloorPlans: true,
      hasEquipmentSchedule: true,
      hasIfcModel: true,
      hasSensorData: true,
    });
    expect(report.level).toBe(3);
    expect(report.completeness).toBe(1.0);
    expect(report.availableCount).toBe(report.totalPossible);
  });

  it('empty/minimal data → Level 1, low completeness', () => {
    const report = assessFidelity({
      hasPublicData: false,
      hasFloorData: false,
      hasFootprint: false,
      hasEnergyBills: false,
      hasFloorPlans: false,
      hasEquipmentSchedule: false,
      hasIfcModel: false,
      hasSensorData: false,
    });
    expect(report.level).toBe(1);
    expect(report.availableCount).toBe(0);
    expect(report.completeness).toBe(0);
  });

  it('completeness reflects partial availability', () => {
    const report = assessFidelity(BASE_PUBLIC);
    expect(report.completeness).toBeGreaterThan(0);
    expect(report.completeness).toBeLessThan(1);
    expect(report.availableCount).toBeLessThan(report.totalPossible);
  });

  it('dataSources lists all possible sources', () => {
    const report = assessFidelity(BASE_PUBLIC);
    expect(report.dataSources.length).toBe(report.totalPossible);
  });
});

describe('generateUpgradeChecklist', () => {
  it('Level 1 checklist targets Level 2, sorted high impact first', () => {
    const report = assessFidelity(BASE_PUBLIC);
    expect(report.level).toBe(1);
    const checklist = generateUpgradeChecklist(report);
    expect(checklist.currentLevel).toBe(1);
    expect(checklist.nextLevel).toBe(2);
    expect(checklist.items.length).toBeGreaterThan(0);
    expect(checklist.items[0].impact).toBe('high');
    checklist.items.forEach((item) => expect(item.targetLevel).toBe(2));
  });

  it('Level 2 checklist targets Level 3', () => {
    const report = assessFidelity({ ...BASE_PUBLIC, hasEnergyBills: true });
    expect(report.level).toBe(2);
    const checklist = generateUpgradeChecklist(report);
    expect(checklist.currentLevel).toBe(2);
    expect(checklist.nextLevel).toBe(3);
    checklist.items.forEach((item) => expect(item.targetLevel).toBe(3));
  });

  it('Level 3 checklist has no items and nextLevel is null', () => {
    const report = assessFidelity({
      hasPublicData: true,
      hasFloorData: true,
      hasFootprint: true,
      hasEnergyBills: true,
      hasFloorPlans: true,
      hasEquipmentSchedule: true,
      hasIfcModel: true,
      hasSensorData: true,
    });
    expect(report.level).toBe(3);
    const checklist = generateUpgradeChecklist(report);
    expect(checklist.currentLevel).toBe(3);
    expect(checklist.nextLevel).toBeNull();
    expect(checklist.items).toHaveLength(0);
  });
});
