// src/lib/interior/plates.ts
//
// Schematic-mounted envelope plates: floors, ceilings, roofs.
//
// The outline is already on the element (`outlineJson`, world XZ metres) —
// the same rings the compiler used for the plate. This file only decides
// WHICH elements are plates, HOW HIGH they sit, and the census of ones it
// could not place. It does not remesh or re-derive the schematic.

import type { BimElement, BimLevel, BimModelSnapshot } from "@/lib/bim/model/types";

import {
  MIN_GEOMETRY_M,
  indexLevels,
  isAuthored,
  levelOf,
  numberParam,
  outlineOf,
} from "./snapshot-read";
import { round6 } from "./transform";
import type {
  EnvelopePlate,
  EnvelopePlateRole,
  InteriorBuildOptions,
  SkippedElement,
} from "./types";

const DEFAULT_PLENUM_M = 0.75;
const DEFAULT_THICKNESS_M = 0.15;

export interface PlateBuildResult {
  plates: EnvelopePlate[];
  skipped: SkippedElement[];
  drawnElementIds: Set<string>;
}

export function isPlateLaneElement(
  element: BimElement,
  options: InteriorBuildOptions = {},
): boolean {
  if (isAuthored(element) || element.visible === false) return false;
  if (element.kind !== "slab" && element.kind !== "ceiling" && element.kind !== "roof") {
    return false;
  }
  return options.includeExterior === true;
}

function roleOf(element: BimElement): EnvelopePlateRole {
  if (element.kind === "ceiling") return "ceiling";
  if (element.kind === "roof") return "roof";
  return "floor";
}

function thicknessOf(element: BimElement): number {
  const mm = numberParam(element, "thicknessMm");
  if (mm !== null && mm > 0) return mm / 1000;
  return DEFAULT_THICKNESS_M;
}

/**
 * World Y of the extrusion base. Floors sit on the level, roofs on the
 * storey top, ceilings hang at `heightAboveFloorMm` (or storey − plenum).
 */
export function plateBaseY(element: BimElement, level: BimLevel): number {
  const thicknessM = thicknessOf(element);
  if (element.kind === "roof") return level.elevation + level.height;
  if (element.kind === "ceiling") {
    const aboveMm = numberParam(element, "heightAboveFloorMm");
    if (aboveMm !== null) return level.elevation + aboveMm / 1000 - thicknessM;
    const plenumM = (numberParam(element, "plenumMm") ?? DEFAULT_PLENUM_M * 1000) / 1000;
    return level.elevation + level.height - plenumM - thicknessM;
  }
  return level.elevation;
}

function skip(
  element: BimElement,
  reason: SkippedElement["reason"],
  detail: string,
): SkippedElement {
  return { elementId: element.id, kind: element.kind, category: element.category, reason, detail };
}

export function buildEnvelopePlates(
  snapshot: BimModelSnapshot,
  options: InteriorBuildOptions = {},
): PlateBuildResult {
  const levels = indexLevels(snapshot);
  const plates: EnvelopePlate[] = [];
  const skipped: SkippedElement[] = [];
  const drawnElementIds = new Set<string>();

  for (const element of snapshot.elements) {
    if (!isPlateLaneElement(element, options)) continue;

    const level = levelOf(levels, element);
    if (!level) {
      skipped.push(skip(element, "no-level", `levelId ${element.levelId ?? "null"}`));
      continue;
    }

    const polygon = outlineOf(element);
    if (!polygon) {
      skipped.push(skip(element, "zero-geometry", "missing outlineJson"));
      continue;
    }

    const thicknessM = thicknessOf(element);
    if (thicknessM < MIN_GEOMETRY_M) {
      skipped.push(skip(element, "zero-geometry", `${thicknessM} m thick`));
      continue;
    }

    plates.push({
      id: `${element.id}#p`,
      elementId: element.id,
      floorNo: level.floorNo,
      role: roleOf(element),
      polygon,
      y: round6(plateBaseY(element, level)),
      thicknessM: round6(thicknessM),
    });
    drawnElementIds.add(element.id);
  }

  plates.sort(
    (a, b) =>
      a.floorNo - b.floorNo ||
      (a.role < b.role ? -1 : a.role > b.role ? 1 : 0) ||
      (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0),
  );

  return { plates, skipped, drawnElementIds };
}
