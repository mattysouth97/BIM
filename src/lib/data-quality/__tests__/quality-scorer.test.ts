import { describe, it, expect } from 'vitest';
import { scoreDataQuality } from '../quality-scorer';
import type { EnergyYearRecord, FootprintPolygon } from '../quality-scorer';
import type { BrTitleInfo } from '@/lib/types';

function makeBuilding(overrides?: Partial<BrTitleInfo>): BrTitleInfo {
  return {
    mgmBldrgstPk: '',
    bldNm: '',
    platPlcNm: '',
    newPlatPlc: '',
    sigunguCd: '',
    bjdongCd: '',
    platGbCd: '0',
    bun: '',
    ji: '',
    mainPurpsCd: '',
    mainPurpsCdNm: '',
    etcPurps: '',
    strctCd: '',
    strctCdNm: '',
    etcStrct: '',
    grndFlrCnt: 0,
    ugrndFlrCnt: 0,
    totArea: 0,
    archArea: 0,
    platArea: 0,
    bcRat: 0,
    vlRat: 0,
    useAprDay: '',
    pmsDay: '',
    stcnsDay: '',
    roofCd: '',
    roofCdNm: '',
    heit: 0,
    regstrGbCd: '',
    regstrGbCdNm: '',
    regstrKindCd: '',
    regstrKindCdNm: '',
    ...overrides,
  };
}

const FOOTPRINT: FootprintPolygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
};

const THREE_YEARS: EnergyYearRecord[] = [
  { year: 2021, consumptionKwh: 120000 },
  { year: 2022, consumptionKwh: 115000 },
  { year: 2023, consumptionKwh: 118000 },
];

describe('scoreDataQuality', () => {
  it('fixture 1: minimal — only platArea and grndFlrCnt yields tier minimal', () => {
    const building = makeBuilding({ platArea: 500, grndFlrCnt: 5 });
    const result = scoreDataQuality(building);

    // geometry: platArea(+25) + grndFlrCnt(+20) = 45
    // codes: 0, energy: 0, material: no pmsDay → base 30
    // overall = 45×0.30 + 0×0.25 + 0×0.25 + 30×0.20 = 13.5 + 6 = 19.5
    expect(result.tier).toBe('minimal');
    expect(result.overall).toBeLessThan(25);
    expect(result.dimensions.geometry.available).toContain('platArea');
    expect(result.dimensions.geometry.available).toContain('grndFlrCnt');
    expect(result.dimensions.geometry.missing).toContain('totArea');
    expect(result.dimensions.geometry.missing).toContain('heit');
    expect(result.dimensions.geometry.missing).toContain('footprint');
  });

  it('fixture 2: partial — platArea+totArea+grndFlrCnt and strctCd+mainPurpsCd but no pmsDay and no energy', () => {
    const building = makeBuilding({
      platArea: 500,
      totArea: 3000,
      grndFlrCnt: 10,
      strctCd: '11',
      mainPurpsCd: '02000',
      // pmsDay intentionally empty → no era info
    });
    const result = scoreDataQuality(building);

    // geometry: platArea(25)+totArea(25)+grndFlrCnt(20) = 70
    // codes: strctCd(35)+mainPurpsCd(35) = 70 (no pmsDay)
    // energy: 0
    // material: no pmsDay → base 30, +strctCd(5)+mainPurpsCd(5) = 40
    // overall = 70×0.30 + 70×0.25 + 0×0.25 + 40×0.20 = 21+17.5+0+8 = 46.5
    expect(result.tier).toBe('partial');
    expect(result.overall).toBeGreaterThanOrEqual(25);
    expect(result.overall).toBeLessThan(50);
  });

  it('fixture 3: good — geometry + strctCd + pmsDay(2005) + 1 year energy, no mainPurpsCd, no heit, no footprint', () => {
    const building = makeBuilding({
      platArea: 600,
      totArea: 4000,
      grndFlrCnt: 12,
      strctCd: '11',
      pmsDay: '20050601',
      // mainPurpsCd intentionally empty
    });
    const oneYear: EnergyYearRecord[] = [{ year: 2022, consumptionKwh: 95000 }];
    const result = scoreDataQuality(building, undefined, undefined, oneYear);

    // geometry: platArea(25)+totArea(25)+grndFlrCnt(20) = 70 (no heit, no footprint)
    // codes: strctCd(35)+pmsDay(30) = 65 (no mainPurpsCd)
    // energy: 1yr → 50
    // material: 2005 era → base 75, +strctCd(5) = 80 (no mainPurpsCd)
    // overall = 70×0.30 + 65×0.25 + 50×0.25 + 80×0.20 = 21+16.25+12.5+16 = 65.75
    expect(result.tier).toBe('good');
    expect(result.overall).toBeGreaterThanOrEqual(50);
    expect(result.overall).toBeLessThan(75);
  });

  it('fixture 4: excellent — full geometry + all codes + 3 years energy + VWorld footprint, 2020 era', () => {
    const building = makeBuilding({
      platArea: 800,
      totArea: 6000,
      grndFlrCnt: 15,
      heit: 45,
      strctCd: '11',
      mainPurpsCd: '02000',
      pmsDay: '20200301',
    });
    const result = scoreDataQuality(building, undefined, FOOTPRINT, THREE_YEARS);

    // geometry: all 5 fields present = 100
    // codes: all 3 present = 100
    // energy: 3 years → 50+30+20 = 100
    // material: 2020+ → base 95, +strctCd(5)+mainPurpsCd(5) = 105 → capped 100
    // overall = 100×0.30 + 100×0.25 + 100×0.25 + 100×0.20 = 100
    expect(result.tier).toBe('excellent');
    expect(result.overall).toBeGreaterThanOrEqual(75);
    expect(result.dimensions.geometry.score).toBe(100);
    expect(result.dimensions.codes.score).toBe(100);
    expect(result.dimensions.energy.score).toBe(100);
    expect(result.dimensions.material.score).toBe(100);
  });

  it('fixture 5: completely empty building → tier minimal, score near 0', () => {
    const building = makeBuilding();
    const result = scoreDataQuality(building);

    // geometry: 0, codes: 0, energy: 0
    // material: no pmsDay → base 30, no strctCd, no mainPurpsCd → 30
    // overall = 0 + 0 + 0 + 30×0.20 = 6
    expect(result.tier).toBe('minimal');
    expect(result.overall).toBeLessThan(10);
    expect(result.dimensions.geometry.score).toBe(0);
    expect(result.dimensions.codes.score).toBe(0);
    expect(result.dimensions.energy.score).toBe(0);
  });
});
