/* @vitest-environment node */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GALLERY_ITEMS } from '../gallery';
import { REFERENCE_BUILDING_IDS } from '@/lib/reference-buildings/manifest';
describe('all gallery cards agree with their source manifests', () => {
  it('refuses stale evidence and stale projections', () => {
    expect(execFileSync(process.execPath, ['scripts/build-gallery-catalogue.mjs', '--check'], {encoding: 'utf8'})).toContain(`${REFERENCE_BUILDING_IDS.length} manifests verified`);
  });
  for (const id of REFERENCE_BUILDING_IDS) {
    it(id, () => {
      const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'public/reference-buildings', id, 'manifest.json'), 'utf8'));
      const card = GALLERY_ITEMS.find(row => row.href === `/models/${id}`)!;
      expect(card).toBeDefined();
      expect(card.licence).toBe(manifest.licence);
      expect(card.attribution).toBe(manifest.attribution);
      expect(card.datums).toEqual(manifest.galleryEvidence.datums);
      expect(card.datums.reduce((sum, row) => sum + row.rooms, 0)).toBe(manifest.counts.spacesFloor);
      expect(card.datums.reduce((sum, row) => sum + row.excludedSpaces + row.rooms, 0)).toBe(manifest.counts.spacesTotal);
      for (const figure of card.figures) {
        const [section, field] = figure.manifestField!.split('.');
        const number = Number(figure.value.replace(/[^\d.]/g, ''));
        const expected = manifest[section][field];
        expect(number).toBe(figure.id === 'floor-area' ? Number(expected.toFixed(1)) : expected);
      }
      const rooms = card.figures.find(row => row.id === 'rooms')!;
      const match = rooms.read.match(/IfcSpace (\d+) − (\d+) excluded .* = (\d+)/)!;
      expect(Number(match[1]) - Number(match[2])).toBe(Number(match[3]));
      expect(Number(match[3])).toBe(manifest.counts.spacesFloor);
      expect(card.measuredConsumption.status).toBe('none');
      expect(card.measuredConsumption.en).toContain('No linked measured energy');
    });
  }
});
