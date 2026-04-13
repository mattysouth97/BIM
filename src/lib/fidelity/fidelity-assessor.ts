import type { DataSource, FidelityLevel, FidelityReport } from './fidelity-types';

export interface AssessFidelityOptions {
  hasPublicData: boolean;
  hasFloorData: boolean;
  hasFootprint: boolean;
  hasEnergyBills: boolean;
  hasFloorPlans: boolean;
  hasEquipmentSchedule: boolean;
  hasIfcModel: boolean;
  hasSensorData: boolean;
}

export function assessFidelity(options: AssessFidelityOptions): FidelityReport {
  const {
    hasPublicData,
    hasFloorData,
    hasFootprint,
    hasEnergyBills,
    hasFloorPlans,
    hasEquipmentSchedule,
    hasIfcModel,
    hasSensorData,
  } = options;

  const dataSources: DataSource[] = [
    {
      name: 'Building ledger (건축물대장)',
      available: hasPublicData,
      source: 'public',
      confidence: hasPublicData ? 'high' : 'low',
    },
    {
      name: 'VWorld footprint',
      available: hasFootprint,
      source: 'public',
      confidence: hasFootprint ? 'high' : 'low',
    },
    {
      name: 'Weather / climate data',
      available: hasPublicData,
      source: 'public',
      confidence: hasPublicData ? 'medium' : 'low',
    },
    {
      name: 'Floor count & area data',
      available: hasFloorData,
      source: 'public',
      confidence: hasFloorData ? 'medium' : 'low',
    },
    {
      name: 'Monthly energy bills',
      available: hasEnergyBills,
      source: 'uploaded',
      confidence: hasEnergyBills ? 'high' : 'low',
    },
    {
      name: 'Floor plan PDF / room data',
      available: hasFloorPlans,
      source: 'uploaded',
      confidence: hasFloorPlans ? 'medium' : 'low',
    },
    {
      name: 'HVAC equipment schedule',
      available: hasEquipmentSchedule,
      source: 'uploaded',
      confidence: hasEquipmentSchedule ? 'medium' : 'low',
    },
    {
      name: 'IFC / BIM model',
      available: hasIfcModel,
      source: 'ifc',
      confidence: hasIfcModel ? 'high' : 'low',
    },
    {
      name: 'BMS / sensor data',
      available: hasSensorData,
      source: 'sensor',
      confidence: hasSensorData ? 'high' : 'low',
    },
  ];

  const availableCount = dataSources.filter((ds) => ds.available).length;
  const totalPossible = dataSources.length;
  const completeness = availableCount / totalPossible;

  const hasAnyClientUpload = hasEnergyBills || hasFloorPlans || hasEquipmentSchedule;
  const hasLevel3Source = hasIfcModel || hasSensorData;

  let level: FidelityLevel = 1;
  if (hasPublicData && hasAnyClientUpload && hasLevel3Source) {
    level = 3;
  } else if (hasPublicData && hasAnyClientUpload) {
    level = 2;
  }

  return {
    level,
    dataSources,
    availableCount,
    totalPossible,
    completeness,
  };
}
