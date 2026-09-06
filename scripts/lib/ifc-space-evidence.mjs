/** Exact web-ifc type queries do not include IFC4 space-boundary subtypes. */
export function allSpaceBoundaries(file, webIfc) {
  const rows = new Map();
  for (const name of ["IFCRELSPACEBOUNDARY", "IFCRELSPACEBOUNDARY1STLEVEL", "IFCRELSPACEBOUNDARY2NDLEVEL"]) {
    const type = webIfc[name];
    if (typeof type !== "number") continue;
    for (const row of file.byType(type)) rows.set(row.expressID, row);
  }
  return [...rows.values()];
}

/** Fill only absent quantities from measured plan geometry; never rename it a quantity. */
export function withMeasuredSpaceAreas(spaces, footprints) {
  return spaces.map((space) => {
    if (space.floorAreaSqm != null) return space;
    const footprint = footprints.get(space.expressID);
    if (!footprint || !Number.isFinite(footprint.areaSqm) || footprint.areaSqm <= 0 ||
        !["solid", "footprint"].includes(footprint.source)) return space;
    return Object.freeze({
      ...space,
      floorAreaSqm: Math.round(footprint.areaSqm * 1000) / 1000,
      floorAreaSource: footprint.source === "solid" ? "solid_plan_union" : "footprint_representation",
    });
  });
}
