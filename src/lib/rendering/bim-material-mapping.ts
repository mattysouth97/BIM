// src/lib/rendering/bim-material-mapping.ts
// Resolves 건축물대장 structure / use / era (+ optional roof type) into a
// visual material. Never invents engineering properties.

import { STRUCTURE_TO_WALL_KEY } from "@/lib/korean-building-codes";
import type { BuildingEra } from "@/lib/material-types";
import type { SurfaceRole, VisualMaterialId, VisualMaterialSpec } from "./types";
import { getVisualMaterial } from "./material-library";

export interface BimMaterialQuery {
  strctCd?: string;
  mainPurpsCd?: string;
  era?: BuildingEra | string;
  role: SurfaceRole;
  roofType?: string;
}

function isOld(era?: string): boolean {
  return era === "pre-1970" || era === "1970-1989" || era === "1990-1999";
}

function wallFamily(strctCd?: string): string {
  return STRUCTURE_TO_WALL_KEY[strctCd ?? ""] || "rc";
}

function wallId(query: BimMaterialQuery): VisualMaterialId {
  const family = wallFamily(query.strctCd);
  const old = isOld(query.era);
  if (family === "masonry") {
    return old ? "brick-weathered" : "brick-red-clay";
  }
  if (family === "timber") {
    return old ? "wood-exterior-weathered" : "wood-engineered";
  }
  if (family === "steel") {
    return query.mainPurpsCd === "17000" || query.mainPurpsCd === "18000"
      ? "metal-painted-steel"
      : "metal-aluminum";
  }
  if (query.strctCd === "14") return "concrete-precast";
  if (query.mainPurpsCd === "02000" && !old) return "paint-stucco";
  if (old) return "concrete-board-formed";
  if (query.era === "2020+" || query.era === "2010-2019") return "concrete-architectural";
  return "concrete-cast";
}

function glassId(query: BimMaterialQuery): VisualMaterialId {
  const era = query.era;
  if (era === "pre-1970") return "glass-clear";
  if (era === "1970-1989" || era === "1990-1999") return "glass-clear";
  if (era === "2000-2009") return "glass-tinted";
  if (era === "2010-2019") return "glass-low-e";
  if (era === "2020+") return "glass-low-e";
  if (query.mainPurpsCd === "14000") return "glass-tinted";
  return "glass-clear";
}

function mullionId(query: BimMaterialQuery): VisualMaterialId {
  const era = query.era;
  if (era === "2020+") return "metal-aluminum";
  if (era === "2010-2019" || era === "2000-2009") return "metal-aluminum";
  return "metal-painted-steel";
}

function roofId(query: BimMaterialQuery): VisualMaterialId {
  const type = query.roofType;
  if (type === "gable" || type === "hip") {
    return isOld(query.era) ? "roof-clay-tile" : "roof-concrete-tile";
  }
  if (type === "sawtooth") return "roof-standing-seam";
  if (wallFamily(query.strctCd) === "steel") return "roof-standing-seam";
  return "roof-membrane";
}

function slabId(query: BimMaterialQuery): VisualMaterialId {
  if (wallFamily(query.strctCd) === "timber") return "wood-engineered";
  return isOld(query.era) ? "concrete-cast" : "concrete-polished";
}

function columnId(query: BimMaterialQuery): VisualMaterialId {
  if (wallFamily(query.strctCd) === "steel") return "metal-painted-steel";
  if (wallFamily(query.strctCd) === "timber") return "wood-oak";
  return isOld(query.era) ? "concrete-cast" : "concrete-precast";
}

/**
 * Deterministic BIM → visual material. Unknown codes fall back to cast
 * concrete rather than inventing a second material system.
 */
export function resolveVisualMaterialId(query: BimMaterialQuery): VisualMaterialId {
  switch (query.role) {
    case "wall":
      return wallId(query);
    case "glass":
      return glassId(query);
    case "mullion":
    case "parapet":
      return query.role === "parapet" ? roofId(query) : mullionId(query);
    case "slab":
      return slabId(query);
    case "column":
    case "beam":
      return columnId(query);
    case "roof":
      return roofId(query);
    case "ground":
      return "ground-grass";
    case "pavement":
      return "ground-asphalt";
    case "sidewalk":
      return "ground-concrete-pavement";
    case "foundation":
      return "concrete-cast";
    case "interior":
      return "interior-cavity";
    case "vegetation":
      return "ground-grass";
    case "neighbor":
      return "concrete-cast";
    default:
      return "concrete-cast";
  }
}

export function resolveVisualMaterial(query: BimMaterialQuery): VisualMaterialSpec {
  return getVisualMaterial(resolveVisualMaterialId(query));
}
