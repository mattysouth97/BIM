import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// Read with fs, not a JSON import — the Playwright transform does not honour
// tsconfig `resolveJsonModule` reliably. Keys (not the inner `id` fields) are
// the URL path segments: they match the public/reference-buildings/ dirs.
const referenceBuildingIds = Object.keys(
  JSON.parse(fs.readFileSync(path.join('src/lib/reference-buildings/registry.json'), 'utf8')),
);

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

// Enumerates every published GLB through the served manifests, so a new model
// or layer joins the contract automatically. Works against a restored local
// tree (public/ wins) and production (the BLOB_PUBLIC_BASE_URL rewrite fires).
test('every published reference-building GLB URL serves glTF bytes', async ({ page }) => {
  // 52 files, ~470 MB in total; the default 30s test timeout is sized for
  // page interactions, not for pulling the layer GLBs through a dev server
  // or the CDN.
  test.setTimeout(300_000);
  const glbUrls: string[] = [];
  for (const id of referenceBuildingIds) {
    const manifestResponse = await page.request.get(`/reference-buildings/${id}/manifest.json`);
    expect(manifestResponse.ok()).toBe(true);
    const manifest: unknown = await manifestResponse.json();
    const files = new Set<string>();
    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const v of Object.values(value)) {
        if (typeof v === 'string' && v.endsWith('.glb')) files.add(v);
        else if (typeof v === 'object') walk(v);
      }
    };
    walk(manifest);
    for (const file of files) {
      // A manifest carrying a path instead of a bare filename must fail here,
      // loudly — not fetch a wrong URL below.
      expect(file).toMatch(/^[^/]+\.glb$/);
      glbUrls.push(`/reference-buildings/${id}/${file}`);
    }
  }
  // Floor, not exact count: model twelve raises it.
  expect(glbUrls.length).toBeGreaterThanOrEqual(52);
  for (const url of glbUrls) {
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
  }
});
