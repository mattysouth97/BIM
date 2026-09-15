import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { TwinInstrumentFrame } from '../twin-instrument-frame';
beforeEach(() => useAppStore.setState({ language: 'en' }));
afterEach(cleanup);
function StatefulPanel() {
  const [chosen, setChosen] = useState(false);
  return <><input aria-label="Budget" defaultValue="100" /><button aria-pressed={chosen} onClick={() => setChosen(!chosen)}>Choose work</button></>;
}
describe('TwinInstrumentFrame drawers', () => {
  for (const language of ['en', 'ko'] as const) {
    it(`starts closed with localized controls and inaccessible contents (${language})`, () => {
      useAppStore.setState({ language });
      render(<TwinInstrumentFrame top={<StatefulPanel />} bottom="Energy content" />);
      expect(screen.getByRole('button', { name: language === 'ko' ? '투자·공사 패널 열기' : 'Open Investment & work panel' })).toBeDefined();
      for (const key of ['top', 'bottom']) {
        const toggle = screen.getByTestId(`twin-panel-${key}-toggle`);
        const panel = screen.getByTestId(`twin-panel-${key}-content`);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
        expect(panel.getAttribute('aria-hidden')).toBe('true');
        expect(panel.hasAttribute('inert')).toBe(true);
      }
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  }
  it('switches one drawer at a time while retaining input and React state', () => {
    const { rerender } = render(<TwinInstrumentFrame top={<StatefulPanel />} bottom="Energy content" />);
    const top = screen.getByTestId('twin-panel-top-toggle');
    const bottom = screen.getByTestId('twin-panel-bottom-toggle');
    fireEvent.click(top);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose work' }));
    fireEvent.click(bottom);
    expect(top.getAttribute('aria-expanded')).toBe('false');
    expect(bottom.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(top);
    rerender(<TwinInstrumentFrame top={<StatefulPanel />} bottom="Energy content" />);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input.value).toBe('1234');
    expect(screen.getByRole('button', { name: 'Choose work' }).getAttribute('aria-pressed')).toBe('true');
    expect(bottom.getAttribute('aria-expanded')).toBe('false');
  });
  it('moves focus into the drawer and restores its trigger on Escape', async () => {
    render(<TwinInstrumentFrame top={<StatefulPanel />} />);
    const toggle = screen.getByTestId('twin-panel-top-toggle');
    toggle.focus(); fireEvent.click(toggle);
    const panel = screen.getByTestId('twin-panel-top-content');
    await waitFor(() => expect(document.activeElement).toBe(panel));
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    act(() => useAppStore.setState({ language: 'ko' }));
    expect(screen.getByRole('button', { name: '투자·공사 패널 열기' })).toBe(toggle);
  });
  it('uses unique controls and only offers supplied panels', () => {
    render(<><TwinInstrumentFrame top="First" /><TwinInstrumentFrame bottom="Second" /></>);
    const ids = screen.getAllByRole('button').map(x => x.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.getElementById(id!)).not.toBeNull();
  });
});
