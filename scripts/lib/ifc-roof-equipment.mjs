import polygonClipping from "polygon-clipping";
import { planShadow, measureMultiPolygon } from "./ifc-plan-shadow.mjs";
import { elementTriangles } from "./ifc-face-area.mjs";
import { str } from "./ifc-reader.mjs";

/** Associate source equipment with the published Y-up roof frame. The 2 m
 * mounting-height tolerance is a selection rule, not a measured mounting gap.
 * Each disconnected shadow stays separate. Its convex hull conservatively
 * fills holes and concavities; this is a proposal clearance envelope, not a
 * replacement for the exact source equipment mesh or its measured shadow area.
 */
export function conservativeShadowHull(ring) {
  const points = [...new Map(ring.map((p) => [`${p[0]},${p[1]}`, p])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length < 3) return [];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (sequence) => {
    const result = [];
    for (const p of sequence) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  const hull = [...half(points), ...half([...points].reverse())];
  return hull.length < 3 ? [] : [...hull, hull[0]];
}

export function attachEquipmentShadows(planes, elements) {
  const rows = [];
  for (const element of elements) {
    const shadow = planShadow(element.triangles);
    const ys = element.triangles.flatMap((t) => t.map((p) => p[1]));
    const bottomM = ys.length ? Math.min(...ys) : null;
    const topM = ys.length ? Math.max(...ys) : null;
    const planeIds = [];
    for (const plane of planes) {
      if (bottomM == null || bottomM > plane.maxElevationM + 2 || topM < plane.minElevationM - 0.1) continue;
      const roof = [];
      for (const ring of plane.outline) {
        if (ring.kind === "outer") roof.push([ring.points]);
        else if (roof.length) roof[roof.length - 1].push(ring.points);
      }
      let attached = false;
      for (const polygon of shadow.multiPolygon) {
        const hull = conservativeShadowHull(polygon[0]);
        if (hull.length < 4) continue;
        const conservativeShadow = [[hull]];
        if (measureMultiPolygon(polygonClipping.intersection(roof, conservativeShadow)).areaSqm < 0.001) continue;
        plane.obstructions.push({
          kind: element.kind ?? "plant", elementRef: element.ref, elementName: element.name,
          elementType: element.type, sourceRole: "architectural",
          plan: hull, areaSqm: measureMultiPolygon(conservativeShadow).areaSqm,
          footprintBasis: "Conservative convex hull of one connected source mesh plan shadow; holes and concavities are filled and may reduce candidate capacity. Source geometry is unchanged." + (element.type === "IfcSolarDevice" ? " One IfcSolarDevice can represent a multi-module array." : ""),
        });
        attached = true;
      }
      if (attached) planeIds.push(plane.id);
    }
    rows.push({ ref: element.ref, type: element.type, name: element.name, bottomM, topM,
      projectedSqm: shadow.projectedSqm, shadowPieces: shadow.multiPolygon.length, snapM: shadow.snapM,
      planeIds, status: planeIds.length ? "associated_with_roof" : "not_associated_with_published_roof" });
  }
  return rows;
}

export function attachSourceRoofEquipment({ api, webIfc, file, planes, types, nameMatch = null, kind = "plant" }) {
  const elements = [];
  for (const type of types) {
    const code = webIfc[type.toUpperCase()];
    if (!code) throw new Error(`Unknown equipment class ${type}`);
    for (const line of file.byType(code)) {
      const name = str(line.Name);
      if (nameMatch && !nameMatch.some((match) => (name ?? "").toLowerCase().includes(match.toLowerCase()))) continue;
      const mesh = api.GetFlatMesh(file.modelId, line.expressID);
      elements.push({ ref: file.ref(line), name, type, kind,
        triangles: elementTriangles(api, file.modelId, mesh) });
    }
  }
  return attachEquipmentShadows(planes, elements);
}
