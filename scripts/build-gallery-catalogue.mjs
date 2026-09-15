#!/usr/bin/env node
/** Project committed, source-derived manifests into a small client-safe catalogue.
 * --check compares bytes and never writes; CI uses it to refuse stale cards.
 * --refresh-evidence derives missing floor classifications from spaces.json,
 * whose hashes bind this summary to the existing IFC extraction artifacts.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function projectGalleryManifest(manifest) {
  const evidence = manifest.galleryEvidence;
  if (!evidence) throw new Error(`${manifest.id}: missing gallery evidence`);
  const excluded = manifest.counts.spacesTotal - manifest.counts.spacesFloor;
  const exclusionText = evidence.exclusions.map(row => `${row.count} ${row.reason}`).join(' · ');
  const read = `IfcSpace ${manifest.counts.spacesTotal} − ${excluded} excluded (${exclusionText || 'none'}) = ${manifest.counts.spacesFloor}`;
  const figures = [
    { id: 'floor-area', ko: '모델 바닥 면적', en: 'Model floor area', value: `${manifest.areas.totalFloorAreaSqm.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1})} m²`, read: `${manifest.counts.spacesFloor} floor-counting IfcSpace · ${evidence.areaSources.join(' / ')}${exclusionText ? ` · excluded: ${exclusionText}` : ''}`, manifestField: 'areas.totalFloorAreaSqm' },
    { id: 'rooms', ko: '바닥을 갖는 공간', en: 'Floor-counting spaces', value: manifest.counts.spacesFloor.toLocaleString('en-US'), read, manifestField: 'counts.spacesFloor' },
  ];
  for (const [field, id, ko, en, source] of [
    ['exteriorWalls', 'walls', '선별 외벽', 'Selected exterior walls', 'IfcWall / IfcWallStandardCase in the extracted exterior-wall set'],
    ['windows', 'windows', '산정에 포함된 창', 'Counted windows', 'IfcWindow in the extracted aperture set; unresolved openings excluded'],
    ['exteriorDoors', 'doors', '산정에 포함된 외부 문', 'Counted exterior doors', 'IfcDoor in the extracted exterior aperture set; unresolved openings excluded'],
  ]) {
    const value = manifest.counts[field];
    if (value !== undefined) figures.push({id, ko, en, value: value.toLocaleString('en-US'), read: `${value} ${source}`, manifestField: `counts.${field}`});
  }
  return {
    licence: manifest.licence, attribution: manifest.attribution,
    sourceUrl: manifest.sourceUrl,
    datums: evidence.datums,
    figures,
  };
}

export function deriveGalleryEvidence(manifest, spacesBytes) {
  const document = JSON.parse(spacesBytes);
  if (document.id !== manifest.id) throw new Error('Space artifact belongs to another model');
  const spaces = document.spaces;
  const floor = spaces.filter(row => row.countsAsFloorArea);
  if (spaces.length !== manifest.counts.spacesTotal || floor.length !== manifest.counts.spacesFloor) throw new Error(`${manifest.id}: space counts disagree`);
  const exclusions = new Map();
  for (const row of spaces.filter(row => !row.countsAsFloorArea)) {
    const explanation = row.excludedFromFloorAreaReason;
    if (!explanation) throw new Error(`${manifest.id}/${row.id}: exclusion has no reason`);
    const reason = explanation.match(/^"([^"]+)"/)?.[1] ?? (explanation.includes('analytical') ? 'analytical duplicate' : explanation);
    exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1);
  }
  return {
    generator: 'build-gallery-catalogue.mjs:1',
    spacesSha256: createHash('sha256').update(spacesBytes).digest('hex'),
    areaSources: [...new Set(floor.map(row => row.areaQuantityName || row.floorAreaSource || 'space-plan geometry'))].sort(),
    exclusions: [...exclusions].map(([reason, count]) => ({reason, count})),
    datums: manifest.storeys.map(storey => {
      const rows = spaces.filter(row => row.storeyId === storey.id);
      const floorRows = rows.filter(row => row.countsAsFloorArea);
      return {name: storey.name, elevationM: storey.elevationM, rooms: floorRows.length,
        roomAreaSqm: Math.round(floorRows.reduce((sum, row) => sum + (row.floorAreaSqm ?? 0), 0) * 1000) / 1000,
        excludedSpaces: rows.length - floorRows.length};
    }).sort((a, b) => b.elevationM - a.elevationM),
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = JSON.parse(await readFile(path.join(root, 'src/lib/reference-buildings/registry.json'), 'utf8'));
  const output = {};
  for (const id of Object.keys(registry)) {
    const directory = path.join(root, 'public/reference-buildings', id);
    const manifestPath = path.join(directory, 'manifest.json');
    const manifestBytes = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestBytes);
    if (manifest.id !== id) throw new Error(`${id}: mismatched manifest`);
    const spaces = await readFile(path.join(directory, manifest.spacesFile ?? 'spaces.json'), 'utf8');
    const evidence = deriveGalleryEvidence(manifest, spaces);
    if (process.argv.includes('--refresh-evidence')) {
      manifest.galleryEvidence = evidence;
      const newline = manifestBytes.includes('\r\n') ? '\r\n' : '\n';
      await writeFile(manifestPath, (JSON.stringify(manifest, null, 2) + '\n').replaceAll('\n', newline));
    } else if (JSON.stringify(manifest.galleryEvidence) !== JSON.stringify(evidence)) {
      throw new Error(`${id}: stale manifest gallery evidence; run --refresh-evidence`);
    }
    output[id] = projectGalleryManifest(manifest);
  }
  const target = path.join(root, 'src/lib/landing/gallery-data.json');
  const bytes = JSON.stringify(output, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== bytes) throw new Error('Stale gallery projection; regenerate catalogue');
  } else await writeFile(target, bytes);
  console.log(`Gallery catalogue: ${Object.keys(output).length} manifests verified`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
