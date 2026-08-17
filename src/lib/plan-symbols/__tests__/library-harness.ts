// src/lib/plan-symbols/__tests__/library-harness.ts
//
// The check every section-authoring pass runs against its own library file.
// Not itself a *.test.ts — import validateSection() from your section's own
// test and assert `.errors` is empty, e.g.:
//
//   import { validateSection } from "../__tests__/library-harness";
//   import { architectureSymbols } from "../library/architecture";
//   const result = validateSection("architecture", architectureSymbols);
//   expect(result.errors).toEqual([]);
//
// Every failure message leads with `${sectionId}/${familyId}:` so a red run
// names exactly which family needs another look.

import { catalogFootprintMm } from "../catalog-dims";
import { evaluateSymbol, type SymbolGeometry } from "../evaluate";
import type { SymbolGraph } from "../graph-types";
import { familiesForSection, type SectionId } from "../sections";

/** Bounds may be at most this many times larger/smaller than the family's real footprint, per axis. */
const BOUNDS_TOLERANCE_FACTOR = 3;

export interface ValidationResult {
  sectionId: SectionId;
  familyCount: number;
  errors: string[];
}

function paramsFromCatalog(graph: SymbolGraph, familyId: string): Record<string, number> {
  const dims = catalogFootprintMm(familyId);
  const params: Record<string, number> = { ...graph.params };
  if (!dims) return params;
  if (params.widthMm !== undefined) params.widthMm = dims.widthMm;
  if (params.depthMm !== undefined) params.depthMm = dims.depthMm;
  return params;
}

function boundsSpan(geometry: SymbolGeometry): { spanX: number; spanZ: number } | null {
  if (!geometry.boundsMm) return null;
  return {
    spanX: geometry.boundsMm.maxX - geometry.boundsMm.minX,
    spanZ: geometry.boundsMm.maxZ - geometry.boundsMm.minZ,
  };
}

function ratioWithin(a: number, b: number, factor: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo <= 0) return hi <= 0;
  return hi / lo <= factor;
}

/**
 * Validate one section's authored library against sections.ts's family
 * roster: every family the section owns must have an entry, every entry
 * must evaluate to sane, deterministic, roughly-real-sized geometry, and no
 * entry may belong to a family that isn't this section's to author.
 */
export function validateSection(sectionId: SectionId, entries: Record<string, SymbolGraph>): ValidationResult {
  const errors: string[] = [];
  const owned = new Set(familiesForSection(sectionId).map((f) => f.id));

  for (const familyId of owned) {
    if (!(familyId in entries)) {
      errors.push(`${sectionId}/${familyId}: missing — every family in this section needs a SymbolGraph entry`);
    }
  }

  for (const [familyId, graph] of Object.entries(entries)) {
    const tag = `${sectionId}/${familyId}`;
    if (!owned.has(familyId)) {
      errors.push(`${tag}: not a member of section "${sectionId}" — belongs in a different library file`);
      continue;
    }

    const params = paramsFromCatalog(graph, familyId);

    let first: SymbolGeometry;
    let second: SymbolGeometry;
    try {
      first = evaluateSymbol(graph, params);
      second = evaluateSymbol(graph, params);
    } catch (err) {
      errors.push(`${tag}: evaluateSymbol threw: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (first.strokes.length < 1) {
      errors.push(`${tag}: evaluates to zero strokes`);
    }

    const span = boundsSpan(first);
    if (!span) {
      errors.push(`${tag}: bounds are null — symbol draws nothing`);
    } else if (span.spanX + span.spanZ <= 0) {
      errors.push(`${tag}: bounds are degenerate (a single point)`);
    } else {
      for (const stroke of first.strokes) {
        if (!isFiniteStroke(stroke)) {
          errors.push(`${tag}: a stroke contains a non-finite coordinate`);
          break;
        }
      }

      const dims = catalogFootprintMm(familyId);
      if (dims) {
        if (!ratioWithin(span.spanX, dims.widthMm, BOUNDS_TOLERANCE_FACTOR)) {
          errors.push(
            `${tag}: evaluated X span ${span.spanX.toFixed(1)}mm is more than ${BOUNDS_TOLERANCE_FACTOR}x off the real footprint ${dims.widthMm.toFixed(1)}mm`,
          );
        }
        if (!ratioWithin(span.spanZ, dims.depthMm, BOUNDS_TOLERANCE_FACTOR)) {
          errors.push(
            `${tag}: evaluated Z span ${span.spanZ.toFixed(1)}mm is more than ${BOUNDS_TOLERANCE_FACTOR}x off the real footprint ${dims.depthMm.toFixed(1)}mm`,
          );
        }
      }
    }

    if (JSON.stringify(first) !== JSON.stringify(second)) {
      errors.push(`${tag}: evaluateSymbol is not deterministic for identical params`);
    }
  }

  return { sectionId, familyCount: owned.size, errors };
}

function isFiniteStroke(stroke: SymbolGeometry["strokes"][number]): boolean {
  if (stroke.kind === "path") {
    return stroke.points.every((p) => Number.isFinite(p.xMm) && Number.isFinite(p.zMm));
  }
  return (
    Number.isFinite(stroke.centerMm.xMm) &&
    Number.isFinite(stroke.centerMm.zMm) &&
    Number.isFinite(stroke.radiusMm)
  );
}
