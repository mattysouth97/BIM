import { expect, test } from '@playwright/test';

for (const id of ['tum-fantasy-hotel-1', 'tum-fantasy-hotel-2']) {
  test(`${id} renders its source geometry without a fabricated energy baseline`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/models/${id}`);
    await expect(page.locator('h1')).toContainText('TUM');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('reference-model-viewer')).toHaveAttribute('data-model-loaded', 'true');
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-near', /[\d.]+/);
    const response = await page.request.get(`/reference-buildings/${id}/model.glb`);
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
    await expect(page.getByTestId('reference-measured-consumption-status')).toContainText('연결된 실측 에너지 자료 없음');
    await page.getByTestId('reference-info-tab-data').click();
    await expect(page.locator('[data-testid="reference-info-panel-data"]')).toContainText('MIT');
    await expect(page.locator('body')).toContainText('미확인');
    await page.screenshot({path: `qa-evidence/phase03/${id}-desktop.png`, fullPage: true});
    await page.setViewportSize({width:390,height:844});
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: `qa-evidence/phase03/${id}-mobile.png`, fullPage: true});
    expect(errors).toEqual([]);
  });
}
