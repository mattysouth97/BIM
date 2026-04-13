export type FidelityLevel = 1 | 2 | 3;

export interface DataSource {
  name: string;
  available: boolean;
  source: 'public' | 'uploaded' | 'ifc' | 'sensor';
  confidence: 'low' | 'medium' | 'high';
}

export interface FidelityReport {
  level: FidelityLevel;
  dataSources: DataSource[];
  availableCount: number;
  totalPossible: number;
  completeness: number; // 0-1
}

export interface UpgradeItem {
  description: string;       // e.g. "Upload monthly energy bills (gas + electric) from 2023-2025"
  targetLevel: FidelityLevel;
  category: 'energy' | 'geometry' | 'material' | 'equipment' | 'sensor';
  impact: 'high' | 'medium' | 'low'; // how much this improves the twin
}

export interface UpgradeChecklist {
  currentLevel: FidelityLevel;
  items: UpgradeItem[];
  nextLevel: FidelityLevel | null; // null if already at Level 3
}
