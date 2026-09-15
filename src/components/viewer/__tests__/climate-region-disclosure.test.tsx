import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ClimateRegionDisclosure } from '../climate-region-disclosure';
import { resolveClimateRegion } from '@/lib/energy/climate-region';

afterEach(cleanup);

it('renders the actual regional dry-bulb value and derived solar basis', () => {
  render(<ClimateRegionDisclosure region={resolveClimateRegion({ sigunguCd: '26' })} />);
  const text = screen.getByTestId('climate-region-basis').textContent!;
  expect(text).toContain('30.7');
  expect(text).toContain('380.0');
  expect(text).toContain('2017');
  expect(text).toMatch(/유도한 가정|derived/);
});

it('names a province fallback rather than inheriting a nearby city citation', () => {
  render(<ClimateRegionDisclosure region={resolveClimateRegion({ sigunguCd: '41' })} />);
  const text = screen.getByTestId('climate-region-basis').textContent!;
  expect(text).toContain('33.6');
  expect(text).toMatch(/대체 적용한 가정|fallback/);
  expect(text).not.toContain('2017');
});

it('states withheld PV for an unresolved region', () => {
  render(<ClimateRegionDisclosure region={null} />);
  expect(screen.getByTestId('climate-region-unresolved').textContent).toMatch(/태양광 산정을 제외|PV is withheld/);
});
