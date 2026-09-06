import { refId, str } from "./ifc-reader.mjs";

/** Occurrence assignments take priority over type assignments. Ambiguous or
 * unsupported material structures remain explicit instead of guessing a stack.
 */
export function materialAssignments(file, webIfc) {
  const assigned = new Map();
  const types = new Map();
  for (const rel of file.byType(webIfc.IFCRELASSOCIATESMATERIAL)) {
    for (const slot of rel.RelatedObjects ?? []) {
      const id = refId(slot);
      if (id === null) continue;
      const rows = assigned.get(id) ?? [];
      rows.push({ material: file.deref(rel.RelatingMaterial), relationRef: file.ref(rel) });
      assigned.set(id, rows);
    }
  }
  for (const rel of file.byType(webIfc.IFCRELDEFINESBYTYPE)) {
    for (const slot of rel.RelatedObjects ?? []) {
      const id = refId(slot);
      const typeId = refId(rel.RelatingType);
      if (id !== null && typeId !== null) {
        const ids = types.get(id) ?? new Set();
        ids.add(typeId);
        types.set(id, ids);
      }
    }
  }
  return (line) => {
    const direct = assigned.get(line.expressID);
    const typeIds = [...(types.get(line.expressID) ?? [])];
    if (!direct && typeIds.length > 1) return { status: "ambiguous", assemblyRef: null, materialNames: [], relationRef: null, basis: null };
    const rows = direct ?? assigned.get(typeIds[0]) ?? [];
    const distinct = [...new Map(rows.map((row) => [row.material?.expressID, row])).values()];
    if (distinct.length !== 1 || !distinct[0].material) return { status: distinct.length > 1 ? "ambiguous" : "unassigned", assemblyRef: null, materialNames: [], relationRef: null, basis: null };
    const { material, relationRef } = distinct[0];
    const kind = file.typeName(material);
    const set = kind === "IfcMaterialLayerSetUsage" ? file.deref(material.ForLayerSet) : kind === "IfcMaterialLayerSet" ? material : null;
    const materialNames = set ? (set.MaterialLayers ?? []).map((slot) => str(file.deref(file.deref(slot)?.Material)?.Name)).filter(Boolean)
      : kind === "IfcMaterial" ? [str(material.Name)].filter(Boolean) : [];
    return {
      status: set ? "layer_set" : kind === "IfcMaterial" ? "single_material" : "unsupported",
      assemblyRef: set ? file.ref(set) : null,
      materialRef: file.ref(material), materialNames, relationRef,
      basis: direct ? "occurrence" : "type",
    };
  };
}
