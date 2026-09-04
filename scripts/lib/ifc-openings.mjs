// scripts/lib/ifc-openings.mjs
//
// Glazing and exterior-door aperture, per opening, attributed to the wall the
// opening was cut from.
//
// Why aperture rather than a ratio: a window-to-wall ratio is the thing an
// energy model actually consumes, and until now this project has carried it as
// ONE assumed ratio printed against a measured wall split — four per-orientation
// rows that look measured and are not. Aperture measured per opening and binned
// by its host wall's own sector makes each row true independently.
//
// `OverallWidth × OverallHeight` is the frame opening, which is what the wall
// loses. It is not the glazed pane area: a window's glass is smaller than its
// frame, and the two must not be confused when a U-value is applied later.

import { num, refId, str } from "./ifc-reader.mjs";

/**
 * Map every opening to the element it was cut from.
 *
 * `IfcRelVoidsElement` is the wall→opening half of the chain; `IfcRelFills-
 * Element` is the opening→window half. Neither alone attributes a window to a
 * wall, and an exporter can emit one without the other — a window whose chain
 * breaks is reported rather than dropped, because a missing aperture makes a
 * wall look more solid than it is.
 */
function openingHosts(file, webIfc) {
  const hosts = new Map();
  for (const rel of file.byType(webIfc.IFCRELVOIDSELEMENT)) {
    const host = refId(rel.RelatingBuildingElement);
    const opening = refId(rel.RelatedOpeningElement);
    if (host !== null && opening !== null) hosts.set(opening, host);
  }
  return hosts;
}

/**
 * Aperture rows for every window and door that fills an opening.
 *
 * @param sectorByHost  host expressID → compass sector, from `orientWalls`.
 * @param exteriorHosts Set of host expressIDs counted as exterior envelope.
 *                      An interior door is a real door and not an aperture in
 *                      the envelope, so the same traversal must not count it.
 */
export function openingApertures(file, webIfc, { exteriorHosts, sectorByHost = new Map() }) {
  const hosts = openingHosts(file, webIfc);
  const toMetres = file.units?.lengthToMetres ?? 1;
  const rows = [];
  const unresolved = [];

  for (const rel of file.byType(webIfc.IFCRELFILLSELEMENT)) {
    const openingId = refId(rel.RelatingOpeningElement);
    const filler = file.deref(rel.RelatedBuildingElement);
    if (!filler) continue;
    const kind = file.typeName(filler);
    if (kind !== "IfcWindow" && kind !== "IfcDoor") continue;

    const hostId = openingId === null ? null : hosts.get(openingId) ?? null;
    const width = num(filler.OverallWidth);
    const height = num(filler.OverallHeight);
    const name = str(filler.Name) ?? "";

    if (hostId === null || width === null || height === null) {
      unresolved.push({
        expressID: filler.expressID,
        typeName: kind,
        name,
        reason:
          hostId === null
            ? "opening is not voiding any element, so the aperture has no wall"
            : "OverallWidth or OverallHeight is absent",
      });
      continue;
    }
    if (!exteriorHosts.has(hostId)) continue;

    rows.push({
      expressID: filler.expressID,
      typeName: kind,
      name,
      hostExpressID: hostId,
      sector: sectorByHost.get(hostId) ?? null,
      widthM: width * toMetres,
      heightM: height * toMetres,
      apertureSqm: width * toMetres * height * toMetres,
    });
  }
  return { rows, unresolved };
}

/** Totals and the per-sector split, from aperture rows. */
export function summariseApertures(rows) {
  const glazing = rows.filter((r) => r.typeName === "IfcWindow");
  const doors = rows.filter((r) => r.typeName === "IfcDoor");
  const byOrientation = {};
  for (const r of glazing) {
    if (!r.sector) continue;
    byOrientation[r.sector] = (byOrientation[r.sector] ?? 0) + r.apertureSqm;
  }
  const sum = (xs) => xs.reduce((t, r) => t + r.apertureSqm, 0);
  return {
    glazingApertureSqm: sum(glazing),
    exteriorDoorSqm: sum(doors),
    byOrientation,
    glazingCount: glazing.length,
    doorCount: doors.length,
    // Glazing whose host has no sector cannot appear in the split, so the
    // split and the total would silently disagree. Counted, not hidden.
    unsectoredSqm: sum(glazing.filter((r) => !r.sector)),
  };
}
