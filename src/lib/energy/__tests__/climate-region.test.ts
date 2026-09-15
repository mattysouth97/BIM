import { describe, expect, it } from 'vitest';
import { resolveClimateRegion, SIDO_TOKENS } from '../climate-region';
import { climateFromRegion, getClimateData, SEOUL_CLIMATE } from '../climate-data';
import { REGIONAL_IRRADIANCE } from '@/lib/retrofit/solar-potential';

describe('one resolved climate and irradiance region', () => {
  it('refuses unknown or missing regions; records address fallback without overriding a valid code', () => {
    expect(resolveClimateRegion({})).toBeNull();
    expect(resolveClimateRegion({ sigunguCd: '99999' })).toBeNull();
    expect(resolveClimateRegion({ sigunguCd: '99999', newPlatPlc: '부산광역시 해운대구' }))
      .toMatchObject({ sidoCode: '26', via: 'address', peakSunHours: 3.8 });
    expect(resolveClimateRegion({ sigunguCd: '11000', newPlatPlc: '부산' }))
      .toMatchObject({ sidoCode: '11', via: 'sigunguCd' });
  });

  it.each(Object.entries(SIDO_TOKENS))('resolves %s with a real irradiance-table entry', (code, label) => {
    const region = resolveClimateRegion({ sigunguCd: `${code}000` })!;
    expect(region).not.toBeNull();
    expect(Object.isFrozen(region)).toBe(true);
    expect(region.peakSunHours).toBe(REGIONAL_IRRADIANCE[label.token.toLowerCase()]);
    expect(Number.isFinite(region.peakSunHours)).toBe(true);
    expect(region.coolingSeasonSolar).toBeCloseTo(350 * region.peakSunHours / 3.5, 10);
    if (region.summerDesignTempSource === 'national_fallback') {
      expect(region.summerDesignTemp).toBe(SEOUL_CLIMATE.summerDesignTemp);
      expect(region.summerDesignTempCitation).toBeNull();
    } else {
      expect(region.summerDesignTempCitation).toContain('page170.html');
      expect(region.summerDesignTemp).not.toBe(SEOUL_CLIMATE.summerDesignTemp);
    }
  });

  it('uses independently transcribed city dry-bulb temperatures and no city-to-province guess', () => {
    for (const [code, temperature] of [['11',31.2], ['26',30.7], ['27',33.3], ['28',30.1], ['29',31.8], ['30',32.3], ['31',32.2]] as const) {
      expect(resolveClimateRegion({ sigunguCd: code })).toMatchObject({ summerDesignTemp: temperature, summerDesignTempSource: 'regional' });
    }
    expect(resolveClimateRegion({ sigunguCd: '41' })?.summerDesignTempSource).toBe('national_fallback');
  });

  it('varies cooling solar and design temperatures while preserving occupancy setpoints', () => {
    const seoul = climateFromRegion(resolveClimateRegion({ sigunguCd: '11' })!);
    const busan = climateFromRegion(resolveClimateRegion({ sigunguCd: '26' })!);
    expect(seoul.coolingSeasonSolar).toBe(350);
    expect(busan.coolingSeasonSolar).toBeCloseTo(380, 10);
    expect(seoul.summerDesignTemp).not.toBe(busan.summerDesignTemp);
    expect([seoul.indoorTemp, seoul.indoorCoolTemp]).toEqual([20,26]);
    expect([busan.indoorTemp, busan.indoorCoolTemp]).toEqual([20,26]);
    expect(busan.assumptions?.join(' ')).toContain('derived assumption');
  });

  it('names the legacy fallback without granting a PV region', () => {
    expect(getClimateData('99999').assumptions?.join(' ')).toContain('Region unresolved');
    expect(resolveClimateRegion({ sigunguCd: '99999' })).toBeNull();
  });

  it('rejects nonfinite values at the typed-to-runtime boundary', () => {
    const seoul = resolveClimateRegion({ sigunguCd: '11' })!;
    for (const key of ['hdd', 'cdd', 'winterDesignTemp', 'summerDesignTemp', 'coolingSeasonSolar', 'peakSunHours']) {
      expect(() => climateFromRegion({ ...seoul, [key]: NaN })).toThrow(RangeError);
    }
  });
});
