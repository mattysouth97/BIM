import { test, expect } from '@playwright/test';
import { seedSeenTours } from './helpers/app-state';
for (const route of ['/models/fzk-haus', '/building/demo']) {
  for (const mobile of [true, false]) {
    test(`${route}: ${mobile ? 'mobile bottom navigation sheet' : 'desktop side drawer'}`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      await seedSeenTours(page);
      await page.goto(route);
      const top = page.getByTestId('twin-panel-top-toggle');
      const bottom = page.getByTestId('twin-panel-bottom-toggle');
      const panel = page.getByTestId('twin-panel-top-content');
      const energy = page.getByTestId('twin-panel-bottom-content');
      await expect(top).toBeVisible({ timeout: 45000 });
      await expect(panel).toBeHidden();
      const offset = await panel.evaluate(x => {
        const m = new DOMMatrixReadOnly(getComputedStyle(x).transform);
        return { x: m.m41, y: m.m42 };
      });
      expect(mobile ? offset.y : offset.x).toBeGreaterThan(0);
      expect(mobile ? offset.x : offset.y).toBe(0);
      await top.click();
      await expect(panel).toBeVisible();
      await expect.poll(() => panel.evaluate(x => getComputedStyle(x).transform), { timeout: 15000 }).toBe('matrix(1, 0, 0, 1, 0, 0)');
      const geometry = await panel.evaluate(x => {
        const panel = x.getBoundingClientRect();
        const frame = x.closest('[data-twin-instrument-frame]')!.getBoundingClientRect();
        const bar = document.querySelector('.canvas-drawer-launchers')!.getBoundingClientRect();
        return { panel: panel.toJSON(), frame: frame.toJSON(), bar: bar.toJSON(), height: innerHeight, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
      });
      if (mobile) {
        expect(geometry.bar.bottom).toBe(geometry.height);
        expect(geometry.panel.bottom).toBe(geometry.bar.top);
        expect(geometry.panel.width).toBe(390);
      } else {
        expect(geometry.panel.right).toBe(geometry.frame.right);
        expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.frame.top);
        expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.frame.bottom);
      }
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      const budget = panel.locator('input[type="number"]').first();
      await budget.fill('1234');
      await budget.blur();
      await bottom.click();
      await expect(panel).toBeHidden();
      await expect(energy).toBeVisible();
      await expect(energy.getByText('kWh/m²·yr', { exact: false }).first()).toBeVisible();
      await top.click();
      await expect(top).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toBeVisible();
      await expect(budget).toHaveValue('1234');
      // Nonmodal navigation can own focus while the panel is open.
      await top.focus();
      await page.keyboard.press('Escape');
      await expect(top).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
      await expect(top).toBeFocused();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await panel.evaluate(x => getComputedStyle(x).transitionDuration)).toBe('0s');
      await top.click();
      await expect(panel).toBeVisible();
      await expect(top).toHaveAttribute('aria-expanded', 'true');
      await page.screenshot({ path: `qa-evidence/phase01-task3/drawer-${route.includes('models') ? 'reference' : 'twin'}-${mobile ? 'mobile' : 'desktop'}.png` });
      if (route.includes('building')) {
        await page.getByTestId('canvas-config-toggle').click();
        const config = page.getByTestId('canvas-config-panel');
        await expect(config).toBeVisible();
        await expect(panel).toBeHidden();
        await config.getByRole('tab', { name: /^(View|화면)$/ }).click();
        await expect(page.getByTestId('render-mode-overlay')).toBeVisible();
        await page.getByTestId('canvas-layer-toggle').click();
        await expect(config).toBeHidden();
        await expect(page.getByTestId('canvas-layer-panel')).toBeVisible();
        await bottom.click();
        await expect(page.getByTestId('canvas-layer-panel')).toBeHidden();
        await expect(energy).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile ? 390 : 1440);
      }
    });
  }
}
