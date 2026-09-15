import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { PvGenerationDisclosure } from '../pv-generation-disclosure';

afterEach(cleanup);
describe('PV generation disclosure', () => {
  for (const language of ['en', 'ko'] as const) {
    it(`reports generation and excluded surplus with their units (${language})`, () => {
      useAppStore.setState({ language });
      render(<PvGenerationDisclosure generation={{ kwh: 12345.67, capacityKWp: 10.5, status: 'modeled', provenance: { source: 'named_assumption', assumptionId: 'A-PV-YIELD', assumption: 'test' } }} clippedGenerationKWh={2345.67} />);
      const text = screen.getByTestId('pv-generation-disclosure').textContent!;
      const quantities = [...text.matchAll(/([\d,.]+) kWh\/yr/g)].map(match => Number(match[1].replaceAll(',', '')));
      expect(quantities).toEqual([12345.67, 2345.67]);
      expect(text).toContain('10.5 kWp');
      expect(text).toContain(language === 'ko' ? '실측이 아닙니다' : 'not metered');
    });
  }
  it('distinguishes refusal from an assumed zero and states the bias of zero', () => {
    useAppStore.setState({ language: 'en' });
    const base = { kwh: 0, capacityKWp: 0, provenance: { source: 'modeled' as const, basis: 'test' } };
    const { rerender } = render(<PvGenerationDisclosure generation={{ ...base, status: 'region_unresolved' }} clippedGenerationKWh={0} />);
    expect(screen.getByTestId('pv-generation-disclosure').textContent).toContain('withheld');
    rerender(<PvGenerationDisclosure generation={{ ...base, status: 'no_generation_assumed' }} clippedGenerationKWh={0} />);
    expect(screen.getByTestId('pv-generation-disclosure').textContent).toContain('look worse');
    expect(screen.getByTestId('pv-generation-disclosure').textContent).not.toContain('withheld');
  });
});
