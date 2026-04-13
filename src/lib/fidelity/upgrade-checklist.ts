import type { FidelityReport, UpgradeChecklist, UpgradeItem, FidelityLevel } from './fidelity-types';

const IMPACT_ORDER: Record<UpgradeItem['impact'], number> = { high: 0, medium: 1, low: 2 };

const LEVEL_1_TO_2_ITEMS: UpgradeItem[] = [
  {
    description: 'Upload monthly energy bills (gas + electric) from 2023-2025',
    targetLevel: 2,
    category: 'energy',
    impact: 'high',
  },
  {
    description: 'Provide floor plan PDF or room count/area data',
    targetLevel: 2,
    category: 'geometry',
    impact: 'medium',
  },
  {
    description: 'Provide HVAC equipment schedule (type, age, capacity)',
    targetLevel: 2,
    category: 'equipment',
    impact: 'medium',
  },
];

const LEVEL_2_TO_3_ITEMS: UpgradeItem[] = [
  {
    description: 'Upload IFC/BIM model from Revit or ArchiCAD',
    targetLevel: 3,
    category: 'geometry',
    impact: 'high',
  },
  {
    description: 'Connect building management system (BMS) sensor data',
    targetLevel: 3,
    category: 'sensor',
    impact: 'high',
  },
];

export function generateUpgradeChecklist(report: FidelityReport): UpgradeChecklist {
  const currentLevel = report.level;

  if (currentLevel === 3) {
    return {
      currentLevel,
      items: [],
      nextLevel: null,
    };
  }

  const nextLevel: FidelityLevel = currentLevel === 1 ? 2 : 3;
  const rawItems = currentLevel === 1 ? LEVEL_1_TO_2_ITEMS : LEVEL_2_TO_3_ITEMS;

  const items = [...rawItems].sort(
    (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]
  );

  return {
    currentLevel,
    items,
    nextLevel,
  };
}
