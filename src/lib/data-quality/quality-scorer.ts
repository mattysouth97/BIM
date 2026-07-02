import type { BrTitleInfo, BrFloorInfo } from '@/lib/types';
import type { QualityDimension, QualityScore, QualityTier } from './quality-types';

/** A GeoJSON-like footprint polygon from VWorld */
export interface FootprintPolygon {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][];
}

/** One year of actual energy consumption data */
export interface EnergyYearRecord {
  year: number;
  consumptionKwh: number;
}

function tierFromScore(score: number): QualityTier {
  if (score >= 75) return 'excellent';
  if (score >= 50) return 'good';
  if (score >= 25) return 'partial';
  return 'minimal';
}

function scoreGeometry(
  building: BrTitleInfo,
  footprint?: FootprintPolygon
): QualityDimension {
  const available: string[] = [];
  const missing: string[] = [];
  let score = 0;

  if (building.platArea > 0) {
    score += 25;
    available.push('platArea');
  } else {
    missing.push('platArea');
  }

  if (building.totArea > 0) {
    score += 25;
    available.push('totArea');
  } else {
    missing.push('totArea');
  }

  if (building.grndFlrCnt > 0) {
    score += 20;
    available.push('grndFlrCnt');
  } else {
    missing.push('grndFlrCnt');
  }

  if (building.heit > 0) {
    score += 15;
    available.push('heit');
  } else {
    missing.push('heit');
  }

  if (footprint) {
    score += 15;
    available.push('footprint');
  } else {
    missing.push('footprint');
  }

  return { name: 'geometry', score, available, missing };
}

function scoreCodes(building: BrTitleInfo): QualityDimension {
  const available: string[] = [];
  const missing: string[] = [];
  let score = 0;

  if (building.strctCd && building.strctCd.trim() !== '') {
    score += 35;
    available.push('strctCd');
  } else {
    missing.push('strctCd');
  }

  if (building.mainPurpsCd && building.mainPurpsCd.trim() !== '') {
    score += 35;
    available.push('mainPurpsCd');
  } else {
    missing.push('mainPurpsCd');
  }

  if (building.pmsDay && building.pmsDay.trim() !== '') {
    score += 30;
    available.push('pmsDay');
  } else {
    missing.push('pmsDay');
  }

  return { name: 'codes', score, available, missing };
}

function scoreEnergy(energyData?: EnergyYearRecord[]): QualityDimension {
  const available: string[] = [];
  const missing: string[] = [];
  let score = 0;

  const count = energyData ? energyData.length : 0;

  if (count >= 1) {
    score += 50;
    available.push('consumptionData');
  } else {
    missing.push('consumptionData');
  }

  if (count >= 2) {
    score += 30;
    available.push('multiYearData');
  } else {
    missing.push('multiYearData');
  }

  if (count >= 3) {
    score += 20;
    available.push('threeYearData');
  } else {
    missing.push('threeYearData');
  }

  return { name: 'energy', score, available, missing };
}

function scoreMaterial(building: BrTitleInfo): QualityDimension {
  const available: string[] = [];
  const missing: string[] = [];

  const pmsDayStr = building.pmsDay ? building.pmsDay.trim() : '';
  const year = pmsDayStr.length >= 4 ? parseInt(pmsDayStr.slice(0, 4), 10) : 0;

  let base = 0;
  if (year > 0) {
    available.push('pmsDay');
    if (year < 1970) {
      base = 30;
    } else if (year < 1990) {
      base = 50;
    } else if (year < 2000) {
      base = 65;
    } else if (year < 2010) {
      base = 75;
    } else if (year < 2020) {
      base = 85;
    } else {
      base = 95;
    }
  } else {
    missing.push('pmsDay');
    base = 30;
  }

  if (building.strctCd && building.strctCd.trim() !== '') {
    base += 5;
    available.push('strctCd');
  } else {
    missing.push('strctCd');
  }

  if (building.mainPurpsCd && building.mainPurpsCd.trim() !== '') {
    base += 5;
    available.push('mainPurpsCd');
  } else {
    missing.push('mainPurpsCd');
  }

  const score = Math.min(base, 100);

  return { name: 'material', score, available, missing };
}

/**
 * Score the data quality of a building record.
 *
 * @param building   - BrTitleInfo from the API
 * @param floors     - Optional floor outline records
 * @param footprint  - Optional VWorld GeoJSON footprint polygon
 * @param energyData - Optional array of annual consumption records
 */
export function scoreDataQuality(
  building: BrTitleInfo,
  floors?: BrFloorInfo[],
  footprint?: FootprintPolygon,
  energyData?: EnergyYearRecord[]
): QualityScore {
  // floors param reserved for future dimension expansion
  void floors;

  const geometry = scoreGeometry(building, footprint);
  const codes = scoreCodes(building);
  const energy = scoreEnergy(energyData);
  const material = scoreMaterial(building);

  const overall =
    geometry.score * 0.30 +
    codes.score * 0.25 +
    energy.score * 0.25 +
    material.score * 0.20;

  return {
    overall: Math.round(overall * 10) / 10,
    tier: tierFromScore(overall),
    dimensions: { geometry, codes, energy, material },
  };
}
