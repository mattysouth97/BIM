import { num, refId, str } from "./ifc-reader.mjs";

/** Source properties keyed by occurrence, with type inheritance explicit.
 * Instance values override the SAME set/property on a type. Differently named
 * assertions remain separate so a caller can disclose conflicting statements.
 */
export function statedPropertyIndex(file, webIfc) {
  const result = new Map();
  const addSet = (id, definition, scope, typeId = null) => {
    if (!definition) return;
    let properties = result.get(id);
    if (!properties) result.set(id, (properties = new Map()));
    for (const entry of definition.HasProperties ?? definition.Quantities ?? []) {
      const property = file.deref(entry);
      if (!property) continue;
      const raw = property.NominalValue ?? property.AreaValue ?? property.LengthValue ?? property.VolumeValue;
      if (raw == null) continue;
      const unwrapped = typeof raw?.value === "boolean" ? raw.value : str(raw);
      const preserveLiteral = typeof unwrapped === "boolean" || ["IFCTEXT", "IFCLABEL", "IFCIDENTIFIER"].includes(raw.name);
      const value = preserveLiteral ? unwrapped : num(raw) ?? unwrapped;
      if (value == null) continue;
      const setName = str(definition.Name);
      const name = str(property.Name);
      if (!setName || !name) continue;
      properties.set(`${setName}.${name}`, {
        setName, name, value,
        valueType: raw.name ?? file.typeName(property),
        scope,
        elementRef: file.ref(id),
        propertyRef: file.ref(property),
        propertySetRef: file.ref(definition),
        unitRef: refId(property.Unit) == null ? null : file.ref(refId(property.Unit)),
        ...(typeId == null ? {} : { typeRef: file.ref(typeId) }),
      });
    }
  };
  for (const rel of file.byType(webIfc.IFCRELDEFINESBYTYPE)) {
    const type = file.deref(rel.RelatingType);
    if (!type) continue;
    for (const occurrence of rel.RelatedObjects ?? []) {
      const id = refId(occurrence);
      if (id == null) continue;
      for (const pset of type.HasPropertySets ?? []) addSet(id, file.deref(pset), "type", type.expressID);
    }
  }
  for (const rel of file.byType(webIfc.IFCRELDEFINESBYPROPERTIES)) {
    const definition = file.deref(rel.RelatingPropertyDefinition);
    for (const occurrence of rel.RelatedObjects ?? []) {
      const id = refId(occurrence);
      if (id != null) addSet(id, definition, "occurrence");
    }
  }
  return result;
}

/** Numeric source reading only. A documented zero is not a thermal value. */
export function positiveProperty(properties, key) {
  const property = properties?.get(key);
  return property && typeof property.value === "number" && Number.isFinite(property.value) && property.value > 0
    ? property
    : null;
}
