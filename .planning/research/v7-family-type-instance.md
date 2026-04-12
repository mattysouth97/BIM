# v7.0 Phase 35 — Family / Type / Instance Architecture

**Researched:** 2026-04-12
**Domain:** BIM Semantic Data Model — Family/Type/Instance hierarchy
**Confidence:** HIGH (codebase verified) / MEDIUM (Revit/IFC analogies from training knowledge)

---

## 1. Data Model Design

### 1.1 Vocabulary

The three-tier hierarchy maps as follows:

| Tier | What it is | Analogy in current codebase |
|------|-----------|------------------------------|
| `FamilyDefinition` | A named category of element (e.g. "Chiller", "Exterior Wall") | The `ChillerParams` interface shape |
| `TypeDefinition` | A specific variant with a fixed set of typed parameters (e.g. "Carrier 30XA-400kW") | The `DEFAULT_MEP_EQUIPMENT_PARAMS.chiller` object |
| `InstanceDefinition` | A single placed occurrence pointing at a type, with optional per-instance overrides | The entry in `equipment-store.params[pk]` |

### 1.2 `FamilyDefinition` shape

```typescript
// src/lib/bim/families/family-definition.ts

import type { ElementKind } from "@/lib/bim/element-id";

export type FamilyCategory =
  // Architectural
  | "wall" | "window" | "door" | "slab" | "column" | "roof" | "ceiling" | "stair"
  // MEP
  | "chiller" | "ahu" | "boiler" | "dhw" | "pump" | "light-fixture" | "electrical-panel"
  // Structural
  | "beam" | "brace" | "footing"
  // Generic / future
  | "generic-model";

/**
 * A FamilyDefinition is the template class. It knows:
 * - what ElementKind it produces (for ElementRegistry integration)
 * - which parameter schema its types must satisfy
 * - which TypeId is used when no explicit type is specified
 */
export interface FamilyDefinition {
  /** Stable UUID — never recycled even if family is renamed */
  readonly familyId: FamilyId;
  /** Human display name, e.g. "Exterior Insulated Wall" */
  name: string;
  /** Broad BIM category used by schedules and IFC mapping */
  category: FamilyCategory;
  /** ElementKind emitted when an instance is registered */
  elementKind: ElementKind;
  /**
   * Parameter schema — keyed by paramId, values are ParamSchema descriptors.
   * All types belonging to this family MUST supply every required param.
   */
  paramSchema: Record<string, ParamSchema>;
  /**
   * The TypeId to use when placing an instance without specifying a type.
   * Must reference a TypeDefinition whose familyId matches this family.
   */
  defaultTypeId: TypeId;
  /** Source provenance: "builtin" = shipped with app, "user" = created in family editor */
  source: "builtin" | "user";
  /** Semantic version of this family definition — used for migration guards */
  schemaVersion: number;
}
```

**Parameter schema descriptor:**

```typescript
export type ParamType = "number" | "boolean" | "string" | "enum" | "length" | "area" | "uValue";

export interface ParamSchema {
  paramId: string;
  label: string;       // e.g. "Body Width"
  type: ParamType;
  unit?: string;       // SI unit string, e.g. "m", "m²", "W/m²K"
  required: boolean;
  defaultValue: unknown;
  /** Enum options when type === "enum" */
  options?: string[];
  /** Whether this param is a calculated/derived value (read-only in UI) */
  calculated?: boolean;
}
```

**Branded ID types:**

```typescript
declare const __familyBrand: unique symbol;
declare const __typeBrand: unique symbol;
declare const __instanceBrand: unique symbol;

export type FamilyId   = string & { readonly [__familyBrand]: "FamilyId" };
export type TypeId     = string & { readonly [__typeBrand]: "TypeId" };
export type InstanceId = string & { readonly [__instanceBrand]: "InstanceId" };
```

---

### 1.3 `TypeDefinition` shape

A type captures the **shared parameters** that are common to every instance of that type. The key design choice is structural sharing via Immer-style immutable update: TypeDefinition objects are never mutated in-place; a `setTypeParam()` action produces a new TypeDefinition, and all instances referencing the old TypeId automatically see the new values because they look up the type at read-time rather than copying params at placement time.

```typescript
// src/lib/bim/families/type-definition.ts

export interface TypeDefinition {
  readonly typeId: TypeId;
  /** Back-reference — every type belongs to exactly one family */
  readonly familyId: FamilyId;
  /** Display name, e.g. "Carrier 30XA-400kW" or "200mm RC Wall" */
  name: string;
  /**
   * Typed parameter values shared by all instances of this type.
   * Keys are paramIds declared in the parent FamilyDefinition.paramSchema.
   * Values are validated against the schema on write.
   */
  params: Record<string, unknown>;
  /** ISO 8601 string — last time any param on this type was modified */
  lastModified: string;
  /** Semantic version bump counter — incremented on every param change */
  revision: number;
}
```

**Propagation mechanism:** When a type parameter changes, all instances referencing `typeId` automatically reflect the change. No fan-out write is required. The `resolveParams(instance, types)` function (see §1.5) re-derives the effective parameter values at read-time by merging type params with instance overrides. This is analogous to `recipe-store.getEffectiveRecipe()` which merges `baseRecipes[pk]` with `overrides[pk]` without copying data.

---

### 1.4 `InstanceDefinition` shape

```typescript
// src/lib/bim/families/instance-definition.ts

import type { ElementId } from "@/lib/bim/element-id";

export interface Placement {
  /** Local position in building coordinate space (meters) */
  position: [number, number, number];
  /** Euler angles in radians [x, y, z] */
  rotation: [number, number, number];
  /** Level index this instance is hosted on */
  levelIndex: number;
  /** True if instance is hosted on a face (curtain panels, fixtures) */
  faceHosted?: boolean;
}

export interface InstanceDefinition {
  /** Stable ElementId — same as ElementRecord.id from Phase 30 */
  readonly instanceId: InstanceId;
  readonly elementId: ElementId;
  /** Back-reference to the type — changing this is a "type swap" */
  typeId: TypeId;
  /** Back-reference to the family (denormalised for fast lookups) */
  familyId: FamilyId;
  /** Building PK — matches equipment-store / recipe-store keying pattern */
  buildingPk: string;
  /**
   * Per-instance parameter overrides.
   * Only the params that DIFFER from the type-level value are stored here.
   * Empty record = instance is fully governed by its type.
   */
  overrides: Record<string, unknown>;
  placement: Placement;
  /** Phasing — populated in Phase 44 */
  phaseCreated?: string;
  phaseDemolished?: string;
  /** Flags for migration traceability */
  migratedFromV6?: boolean;
  autoGeneratedType?: boolean;
}
```

**Override precedence rule (instance wins):**

```typescript
// Effective param value resolution — pure function
export function resolveParam(
  instance: InstanceDefinition,
  type: TypeDefinition,
  paramId: string,
): unknown {
  // Instance override takes precedence
  if (Object.prototype.hasOwnProperty.call(instance.overrides, paramId)) {
    return instance.overrides[paramId];
  }
  // Fall back to type-level shared value
  return type.params[paramId];
}

export function resolveParams(
  instance: InstanceDefinition,
  type: TypeDefinition,
): Record<string, unknown> {
  return { ...type.params, ...instance.overrides };
}
```

This mirrors `recipe-store.getEffectiveRecipe()` exactly: `{ ...base, ...overrides }`.

---

### 1.5 Type-param change propagation

Because instances store only overrides (not a full param copy), propagation is implicit:

1. User edits a type parameter → `family-store` updates `types.get(typeId).params[paramId]`.
2. `instance-store` is NOT touched.
3. Any consumer that calls `resolveParams(instance, types.get(instance.typeId))` sees the new value immediately on next render cycle.
4. React subscribers to `family-store` trigger re-renders of all components reading from any instance of that type.

This is structurally identical to how `recipe-store` + `material-store` currently work: changing the base recipe propagates to every building that has no override for that field without touching the per-PK state.

**Performance note:** With 10k instances of the same type, only one `TypeDefinition` object changes. No O(n) fan-out write. The reactive subscription that rerenders the scene is O(instances rendered), which is already gated by frustum culling and InstancedMesh batching.

---

### 1.6 Per-instance override precedence

| Scenario | Result |
|----------|--------|
| Instance has no overrides | Effective = type params only |
| Instance overrides `bodyWidth` only | `bodyWidth` = instance value; all other params = type |
| Type param `bodyWidth` changes | Instance still uses its own `bodyWidth` (override is sticky) |
| Instance override is deleted (`delete instance.overrides[paramId]`) | Falls back to current type value immediately |

Design principle: overrides are keyed by `paramId` string, not by dot-path. This avoids the deep-clone/dot-walk pattern currently used in `equipment-store.overrideParam()` and eliminates the mutation risk documented in that store's comments.

---

## 2. Migration Strategy from v6

### 2.1 How `MepEquipmentParams` maps to the new hierarchy

The current pattern stores a flat `Record<buildingPk, MepEquipmentParams>` in `equipment-store`. Each entry is a monolithic object covering all six equipment categories. Under the new model, each equipment category becomes a separate family, and each building's equipment configuration becomes a set of instances.

**Mapping table:**

| v6 (MepEquipmentParams field) | v7 Family | Auto-generated TypeId | Instance count |
|-------------------------------|-----------|----------------------|----------------|
| `chiller: ChillerParams` | `family:chiller` | `type:chiller-auto-{pk}` | 1 per building (mechanical room) |
| `boiler: BoilerParams` | `family:boiler` | `type:boiler-auto-{pk}` | 1 per building |
| `ahu: AhuParams` | `family:ahu` | `type:ahu-auto-{pk}` | `unitsPerFloor × floors` instances |
| `dhw: DhwParams` | `family:dhw` | `type:dhw-auto-{pk}` | 1 per building |
| `lightingFixture: LightingFixtureParams` | `family:light-fixture` | `type:light-auto-{pk}` | 1 per floor per building |
| `electricalPanel: ElectricalPanelParams` | `family:electrical-panel` | `type:elec-auto-{pk}` | 1 per building |

**Migration function signature:**

```typescript
// src/lib/bim/families/migrate-v6.ts

export interface MigrationResult {
  familiesCreated: FamilyId[];
  typesCreated: TypeId[];
  instancesCreated: InstanceId[];
  warnings: string[];
}

/**
 * Non-destructive migration for a single building.
 * 
 * For each equipment category in equipment-store.getParams(pk):
 * 1. Look up or create the canonical FamilyDefinition (idempotent — "chiller" family is shared)
 * 2. Create a per-building TypeDefinition carrying the params as type-level params
 *    (flagged autoGeneratedType: true for later cleanup by family editor)
 * 3. Create one or more InstanceDefinitions with empty overrides and a synthetic placement
 * 4. Register each instance in ElementRegistry
 *
 * Original equipment-store entry is NOT deleted — it remains as fallback until
 * a SCHEMA_VERSION flag is bumped past the migration threshold.
 */
export function migrateV6Elements(
  pk: string,
  equipmentStore: EquipmentStoreSnapshot,
  familyStore: FamilyStoreWriter,
  instanceStore: InstanceStoreWriter,
): MigrationResult;
```

**Non-destructive guarantee:** The migration adds to `family-store` and `instance-store` without deleting from `equipment-store`. A `SCHEMA_VERSION: 7` flag written to `localStorage` (same key as Zustand persist) gates which read path is used. Existing serialized data is preserved and can be re-read if migration is rolled back.

### 2.2 How `recipe-store` walls become Wall family + Wall instances

The current `recipe-store` holds a `BuildingRecipe` per `pk` which includes wall thickness, facade config, etc. Wall instances are implicit: every floor segment of a given orientation is logically the same wall type. Under v7:

1. **Wall Family** (builtin, one per project): `family:wall` with paramSchema covering `thickness`, `wallLayerStack`, `uValue`, `isExternal`, `fireRating`.

2. **Wall Type** auto-generated from `recipe.wallThickness` + inferred `uValue` from `material-store.getProperties(pk).wall`. One type per building is created initially (auto-generated, no name beyond "Wall Type — {pk}").

3. **Wall Instances**: One `InstanceDefinition` per `(floor, orientation)` combination — matching how `layer-1-walls.ts` generates geometry. Placement is derived from `FloorSpec.y` + face normal direction. All instances point at the same auto-generated type. Instance overrides are empty unless user has per-orientation material overrides in `material-store`.

4. **material-store overrides** → instance overrides: If `material-store.properties[pk].wall` has `source: "user-input"` for a specific orientation, that value migrates to `instance.overrides.uValue` for that instance only.

### 2.3 Non-destructive approach with version flag

```typescript
// Pattern: dual-read with version gating
const SCHEMA_VERSION_KEY = "bim-schema-version";
const V7_SCHEMA_VERSION = 7;

function getSchemaVersion(): number {
  const raw = localStorage.getItem(SCHEMA_VERSION_KEY);
  return raw ? parseInt(raw, 10) : 6;
}

// In energy calculators and schedule engine:
function getWallUValue(instanceId: InstanceId): number {
  if (getSchemaVersion() >= V7_SCHEMA_VERSION) {
    // V7 path: read from instance-store → resolveParam
    const instance = instanceStore.get(instanceId);
    const type = familyStore.getType(instance.typeId);
    return resolveParam(instance, type, "uValue") as number;
  } else {
    // V6 fallback: read from material-store
    return materialStore.getProperties(buildingPk)?.wall?.uValue ?? 0;
  }
}
```

This pattern ensures v5.0+v6.0 serialized buildings load unchanged (schema version remains 6), and the migration is triggered explicitly per-building by user action or by a one-time upgrade routine on app startup.

---

## 3. Storage Pattern

### 3.1 `family-store` — library of definitions

```typescript
// src/store/family-store.ts

interface FamilyStoreState {
  /**
   * Shared library: all FamilyDefinitions and TypeDefinitions.
   * These are project-wide, not per-building.
   * Persisted under key "bim-family-library-v7".
   */
  families: Map<FamilyId, FamilyDefinition>;
  types: Map<TypeId, TypeDefinition>;

  // --- Selectors ---
  getFamily: (id: FamilyId) => FamilyDefinition | undefined;
  getType: (id: TypeId) => TypeDefinition | undefined;
  getTypesForFamily: (familyId: FamilyId) => TypeDefinition[];

  // --- Mutations ---
  registerFamily: (def: FamilyDefinition) => void;
  registerType: (def: TypeDefinition) => void;
  setTypeParam: (typeId: TypeId, paramId: string, value: unknown) => TypeDefinition;
  swapInstanceType: (instanceId: InstanceId, newTypeId: TypeId) => void;
}
```

**Persist strategy:** `family-store` is persisted as a library. On app startup the builtin families (Wall, Window, Door, Slab, Column, Roof, Chiller, AHU, Boiler, Pump, LightFixture) are seeded if not present. User-created types accumulate here. Because types are referenced by ID, the library grows monotonically — removing a type is blocked if any instance references it (UI warns user).

**Serialization:** `Map<K,V>` does not serialize to JSON natively. Use `Array.from(map.entries())` in the Zustand `partialize` / storage adapter, consistent with how the `ElementRegistry` already handles this (`serialize()` → array of records).

### 3.2 `instance-store` — per-building instance data

```typescript
// src/store/instance-store.ts

interface InstanceStoreState {
  /**
   * All instances across all buildings.
   * In-memory: Map<InstanceId, InstanceDefinition>
   * Secondary indexes: familyId → Set<InstanceId>, buildingPk → Set<InstanceId>
   */
  instances: Map<InstanceId, InstanceDefinition>;

  // --- Selectors ---
  getInstance: (id: InstanceId) => InstanceDefinition | undefined;
  getByBuilding: (pk: string) => InstanceDefinition[];
  getByFamily: (familyId: FamilyId) => InstanceDefinition[];
  getByType: (typeId: TypeId) => InstanceDefinition[];

  // --- Mutations ---
  placeInstance: (def: InstanceDefinition) => void;
  removeInstance: (id: InstanceId) => void;
  setInstanceOverride: (id: InstanceId, paramId: string, value: unknown) => void;
  clearInstanceOverride: (id: InstanceId, paramId: string) => void;
  swapType: (id: InstanceId, newTypeId: TypeId) => void;
}
```

**Persist strategy:** `instance-store` is persisted per-building. On load, only instances for the currently-viewed building are hydrated into memory. For multi-building projects this prevents memory bloat. The persist key should be namespaced: `"bim-instances-v7-{pk}"`.

**Relationship to `ElementRegistry`:** Each `InstanceDefinition` is mirrored in `ElementRegistry` as an `ElementRecord`. The `ElementRecord.userData` carries a `{ instanceId }` pointer so Phase 31 (Annotation) and Phase 33 (Schedules) can look up the full instance without importing `instance-store`. The registry remains the lightweight index; `instance-store` is the authoritative parameter store.

### 3.3 Secondary indexes for performance

Both stores must maintain secondary indexes to answer the following queries efficiently (required by schedule-engine):

| Query | Index | Time complexity |
|-------|-------|-----------------|
| All instances of a family in building X | `byBuilding + byFamily` | O(instances in building) |
| All instances of a type | `byType` | O(instances of type) |
| Resolved param P for instance I | No index needed — `resolveParams` is O(1) lookup | O(1) |
| All instances where param P = value V | Full scan (no index) — acceptable at 10k instances | O(n) |

---

## 4. Parameter System

### 4.1 Type parameters via structural sharing

The core invariant: **a `TypeDefinition.params` object is never mutated in place.** Every param change produces a new `TypeDefinition` object. This is identical to how Immer works, and means:

- React `useSyncExternalStore` subscribers can detect type changes via reference equality.
- Undo/redo (Phase 29's command bus) can cheaply snapshot the previous `TypeDefinition` reference without deep-cloning param values.
- Concurrent reads during a type update see a consistent snapshot (no torn reads).

Implementation:

```typescript
// In family-store setTypeParam:
setTypeParam: (typeId, paramId, value) => {
  const existing = get().types.get(typeId);
  if (!existing) throw new Error(`TypeId ${typeId} not found`);

  const updated: TypeDefinition = {
    ...existing,
    params: { ...existing.params, [paramId]: value },
    lastModified: new Date().toISOString(),
    revision: existing.revision + 1,
  };

  set((state) => {
    const types = new Map(state.types);
    types.set(typeId, updated);
    return { types };
  });

  return updated;
}
```

This is the same spread-merge pattern as `recipe-store.getEffectiveRecipe()` and `material-store.overrideProperty()` but applied immutably at the store level.

### 4.2 Instance parameters as flat override records

Instance overrides are stored as `Record<paramId, value>` — **flat, not nested by dot-path**. This avoids the fragile dot-path walking logic currently in `equipment-store.overrideParam()` and `material-store.overrideProperty()`, which require `JSON.parse(JSON.stringify(...))` deep-clone to avoid mutating shared state.

The paramId namespace is owned by the `FamilyDefinition.paramSchema`, which means:
- No path collisions possible (schema is validated at family registration time).
- Override application is `{ ...type.params, ...instance.overrides }` — one line, no deep traversal.
- Undo captures `previousValue = instance.overrides[paramId]` (simple value, not path navigation).

### 4.3 Calculated parameters registered as pure functions

Phase 36 will formalize this, but Phase 35 should establish the slot:

```typescript
// src/lib/bim/parameters/parameter-registry.ts (stub for Phase 35)

export interface CalculatedParamDef {
  paramId: string;
  label: string;
  unit: string;
  /** Pure function — given resolved instance params, returns derived value */
  compute: (params: Record<string, unknown>) => unknown;
  /** param IDs this calc depends on — used to invalidate memoized cache */
  dependsOn: string[];
}

// Example: U-value derived from wall layer stack
const uValueCalc: CalculatedParamDef = {
  paramId: "uValue",
  label: "Thermal Transmittance",
  unit: "W/m²K",
  compute: (params) => computeUValueFromLayers(params.wallLayerStack as WallLayer[]),
  dependsOn: ["wallLayerStack"],
};
```

For Phase 35, calculated params are stubs that return the existing hardcoded value. Phase 36 wires them to real computations. Phase 40 removes the hardcoded paths in `heat-loss.ts`.

---

## 5. Comparison to Revit

### 5.1 Where v7 aligns with Revit

| Revit concept | v7 equivalent | Notes |
|---------------|---------------|-------|
| `RvtFamily` (the `.rfa` file) | `FamilyDefinition` | v7 families are pure data, no geometry yet |
| `FamilyType` (Carrier 30XA-400kW) | `TypeDefinition` | Shared params, structural sharing |
| `FamilyInstance` (placed occurrence) | `InstanceDefinition` + `ElementRecord` | Placement + overrides |
| Type parameter | `TypeDefinition.params[paramId]` | Shared by all instances of the type |
| Instance parameter | `InstanceDefinition.overrides[paramId]` | Per-instance, overrides type value |
| Type swap | `instanceStore.swapType(id, newTypeId)` | Change `typeId` reference only |
| Parameter inheritance | `resolveParams(instance, type)` merge | Instance wins over type |
| Pset / shared parameters | `revit-property-map.ts` extension | Phase 36 formalizes this |

**Type swap** is architecturally significant. In Revit, swapping a door from one type to another (e.g. "Single Wood" → "Double Glass") instantly updates all instances. In v7, `swapType` changes only the `typeId` field on the instance — the next render cycle reads the new type's params via `resolveParams`. No geometry regeneration is triggered except by the React subscriber that watches the instance's resolved params.

### 5.2 Where v7 deliberately differs from Revit

| Revit feature | v7 decision | Rationale |
|---------------|-------------|-----------|
| Nested families (window frame containing glass pane) | Not in v7 — deferred to v8 family editor | Adds complexity without visible benefit before family editor ships |
| Family Editor (`.rfa` geometry authoring) | Not in v7 — deferred to v8 Phase 42 | v7 families are parametric geometry driven; editor UI is v8 scope |
| Category-level visibility (Object Styles) | Partial — covered by existing `layer-manager` | Full category visibility graph is v7 Phase 37/38 scope |
| Shared parameters file | Replaced by `parameter-registry.ts` (Phase 36) | Web-native: registry is code, not a separate `.txt` file |
| Formula parameters (strings like `Width * 2`) | Not in v7 | WASM constraint solver is v8 Phase 41 |
| Design Options | Not in v7 — Phase 45 (v8) | Copy-on-write instance overrides; needs instance-store first |
| Revisions / worksharing | Not in v7 | Yjs collaboration is v8 Phase 46 |
| RFA binary format | Never on client — server-side IFC only | Per roadmap risk #5 |

**The most important v7 divergence from Revit** is that families in v7 have no geometry templates. A `FamilyDefinition` defines a parameter schema and maps to an existing procedural geometry generator (e.g. `chiller-generator.ts`, `facade-generator.ts`). The family editor that author geometry from scratch is v8 scope. This keeps v7 strictly additive to the existing generators rather than replacing them.

### 5.3 Trade-offs

**Pro: simpler migration.** Because v7 families back the existing procedural generators (not custom geometry), the 40-building regression corpus can pass before any generator code changes. The "zero energy drift" criterion becomes achievable: generators read from `resolveParams()` instead of from `equipment-store.getParams()`, but the values are identical (auto-generated types carry the same defaults).

**Con: no cross-family parameter sharing yet.** Revit's shared parameters allow a `uValue` parameter to appear on both Wall and Roof families and be aggregated in one schedule column. In v7, `uValue` is defined independently on each family's `paramSchema`. The Phase 36 parameter registry unifies this, but Phase 35 must design the `paramId` namespace to avoid later collision (e.g., prefix by family category: `wall.uValue`, `roof.uValue` vs. shared `thermal.uValue`).

**Recommendation:** Use unprefixed IDs for semantically universal params (`uValue`, `area`, `volume`, `fireRating`) and family-scoped IDs for geometry-specific params (`chiller.bodyWidth`). This allows the parameter registry in Phase 36 to treat unprefixed IDs as shared parameters without renaming.

---

## 6. Open Questions

### 6.1 IFC2x3 vs IFC4 mapping

**What we know:**
- The existing `revit-property-map.ts` maps `Pset_WallCommon.ThermalTransmittance` → `uValue` for IFC read.
- Phase 43 (v8) ships IFC4 write. Phase 35 must not make IFC4-breaking assumptions.
- IFC2x3 (`IfcRelDefinesByType`) and IFC4 (`IfcTypeObject` hierarchy) both support the type/instance model natively.

**What is unclear:**
- IFC2x3 uses `IfcBuildingElementProxy` for non-standard families; IFC4 adds `IfcCommunicationsAppliance`, `IfcMedicalDevice`, etc. The `FamilyCategory` enum in §1.2 needs to map to IFC entity names. This mapping does not need to be final in Phase 35 but the `FamilyDefinition` should carry an `ifcClass?: string` optional field as a stub.
- IFC property set names differ between IFC2x3 and IFC4 for some equipment (notably AHU: `Pset_AirTerminalBoxTypeCommon` in IFC4 vs generic proxies in IFC2x3).

**Recommendation for Phase 35:**
Add `ifcClass?: string` and `ifcPsetName?: string` optional fields to `FamilyDefinition`. Leave them unpopulated for auto-generated families. Phase 43 fills them in. This costs zero implementation effort now and prevents a breaking schema change later.

### 6.2 Performance: 10k instances with shared types

**Memory analysis:**

| Data | Per-instance size | 10k instances |
|------|-------------------|---------------|
| `InstanceDefinition` (placement + typeId + empty overrides) | ~200 bytes | ~2 MB |
| `TypeDefinition` (shared params, all instances share 1 object) | ~1–2 KB | ~2 KB (amortized) |
| `FamilyDefinition` (schema, ~10 params) | ~3 KB per family | ~150 KB for 50 families |
| `ElementRecord` in registry | ~100 bytes | ~1 MB |
| **Total** | | **~3.2 MB** |

3.2 MB for 10k instances is well within budget (IndexedDB can hold gigabytes; localStorage limit of 5–10 MB is only a concern if the entire store is serialized to it).

**Render performance:**
The current `ProceduralBuilding` uses InstancedMesh (7 draw calls total). The v7 instance-store does not change the rendering path — `FamilyDefinition.elementKind` maps to the same generator functions that produce InstancedMesh data. The parameter read path changes from `equipment-store.getParams(pk).chiller.bodyWidth` to `resolveParams(instance, type).bodyWidth`, which is a single Map lookup + spread — negligible overhead.

**10k-instance schedule query:**
The schedule engine in Phase 33 queries `elementRegistry.getByKind("mep-instance")` and calls accessors. With the secondary index, this is O(n) where n = instances of that kind in the building. At 10k instances, an accessor that does `resolveParams(instance, type)` is ~10k Map lookups — approximately 1–5ms in modern V8, well under the 50ms schedule-query budget from the roadmap.

**Recommendation:** No sharding or lazy loading needed for Phase 35. Revisit at 100k instances (v9 scope, MEP connected networks).

### 6.3 Versioning: evolving family definitions without breaking instances

**The problem:** If `schemaVersion` 1 of `family:chiller` has a `bodyWidth` param, and v2 renames it `caseWidth`, existing instances have `overrides.bodyWidth` which is now orphaned.

**Proposed contract for Phase 35:**

1. **Additive changes only in v7.** New params may be added to a family's `paramSchema`. Params may not be renamed or removed during v7.
2. **`schemaVersion` bumped on any schema change.** Stored as `FamilyDefinition.schemaVersion: number`.
3. **Migration adapter pattern.** A `FamilyMigrationAdapter` array is registered alongside each family. When the stored `schemaVersion` < current, the adapter runs on load to rename/transform instance overrides.

```typescript
export interface FamilyMigrationAdapter {
  fromVersion: number;
  toVersion: number;
  migrateInstance: (overrides: Record<string, unknown>) => Record<string, unknown>;
  migrateTypeParams: (params: Record<string, unknown>) => Record<string, unknown>;
}
```

4. **Builtin families are versioned in source code.** When `family:chiller` `schemaVersion` increments from 1 to 2, the corresponding migration adapter is added to the builtin family registry. Startup migration runs automatically.

5. **User-created families (v8+)** carry their own schema and migration adapters. Breaking changes require explicit user confirmation in the family editor.

**For Phase 35 specifically:** No migration adapters need to be implemented yet (all families are newly created). But `schemaVersion` and the `FamilyMigrationAdapter` interface should be defined as stubs so Phase 42 (Family Editor) has a contract to target.

---

## 7. Seed Families for Phase 35

These 11 families must ship with Phase 35 as builtin definitions:

| Family | Category | Key type params | Maps from v6 |
|--------|----------|----------------|--------------|
| `family:wall` | `wall` | `thickness`, `uValue`, `isExternal`, `fireRating` | `recipe.wallThickness` + `material-store.wall` |
| `family:window` | `window` | `width`, `height`, `uValue`, `glazingType` | `recipe.facade.windowWidth/Height` |
| `family:door` | `door` | `width`, `height`, `material` | (no v6 equivalent — new) |
| `family:slab` | `slab` | `thickness`, `overhang`, `uValue` | `recipe.slab` |
| `family:column` | `column` | `spacing`, `size`, `inset` | `recipe.column` |
| `family:roof` | `slab` | `type`, `flatThickness`, `gableHeight` | `recipe.roof` |
| `family:chiller` | `chiller` | `bodyWidth`, `bodyDepth`, `bodyHeight`, `showCoolingTower`, `pipeStubRadius` | `ChillerParams` |
| `family:ahu` | `ahu` | `width`, `height`, `depth`, `showDuctStubs`, `unitsPerFloor` | `AhuParams` |
| `family:boiler` | `boiler` | `radius`, `height`, `flueRadius`, `vrfHeads`, `vrfLocation` | `BoilerParams` |
| `family:dhw` | `dhw` | `tankRadius`, `tankHeight`, `showPump` | `DhwParams` |
| `family:light-fixture` | `light-fixture` | `width`, `depth`, `height`, `showDiffuserFace` | `LightingFixtureParams` |

The `family:electrical-panel` maps from `ElectricalPanelParams` but does not appear on the "seed families" list in the roadmap — it should still be migrated but can be a secondary-priority builtin.

---

## 8. File and Directory Layout

```
src/lib/bim/families/
  family-definition.ts      — FamilyDefinition, TypeDefinition, ParamSchema types
  instance-definition.ts    — InstanceDefinition, Placement, resolveParam()
  family-ids.ts             — FamilyId, TypeId, InstanceId branded types + factories
  builtin-families.ts       — Seed definitions for the 11 builtin families
  migrate-v6.ts             — migrateV6Elements() non-destructive migration
  family-migration.ts       — FamilyMigrationAdapter interface (stub for v8)

src/store/
  family-store.ts           — Zustand store for families + types (project-wide library)
  instance-store.ts         — Zustand store for instances (per-building)
```

**Constraints from CLAUDE.md:**
- All files under `src/lib/bim/` as per roadmap's `New top-level directories` directive.
- Zustand stores follow the existing `create<State>()((set, get) => ...)` pattern from `equipment-store.ts`, `recipe-store.ts`, `material-store.ts`.
- No Electron, no server-side DB — client-only with Zustand persist to IndexedDB.
- `Map<K,V>` stores require custom serialization adapters (consistent with `ElementRegistry.serialize()`).
- The `"use client"` directive is required on all Zustand store files.

---

## 9. Key Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Flat override records (not dot-path) | Eliminates brittle deep-clone/dot-walk pattern from v6 stores |
| Instance stores only overrides (not full params) | Type change propagates to all instances without fan-out write |
| `resolveParams` is a pure function | Testable in isolation; memoizable by [instanceId, type.revision] |
| Auto-generated types per building for migration | Prevents energy drift; types carry exact v6 param values |
| `schemaVersion` on FamilyDefinition from day 1 | Makes v8 family evolution non-breaking |
| `ifcClass` optional stub on FamilyDefinition | No IFC work in v7, but avoids Phase 43 breaking schema change |
| family-store is project-wide; instance-store is per-building | Families are a library; instances are building-specific data |
| Dual-read with schema version flag | v5/v6 data loads unchanged until explicit migration is triggered |

---

## 10. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 10k instances will fit in 3.2 MB memory comfortably within browser limits | 6.2 | If instance overrides are large (many per-instance params), memory estimate is too low. Validate with real building corpus before Phase 35 ships. |
| A2 | IFC2x3 `IfcRelDefinesByType` and IFC4 `IfcTypeObject` both map cleanly onto FamilyDefinition/TypeDefinition | 6.1 | IFC4 entity names for non-standard MEP categories may not align with our FamilyCategory enum. Phase 43 will surface this. |
| A3 | All v6 `MepEquipmentParams` can be migrated to 1 auto-generated type per building without energy drift | 2.1 | If energy calculators aggregate across buildings in unexpected ways, the per-PK type isolation may produce different results. Validate against the 40-building corpus before marking migration complete. |
| A4 | The existing InstancedMesh batching in procedural generators is compatible with the v7 instance-store (generators can read from resolveParams() without re-architecture) | 5.3 | Generators currently read from `equipment-store.getParams(pk)` which returns a monolithic object. If a generator internally maps over all floors to compute positions, it may need to query `instanceStore.getByBuilding(pk)` instead — a more significant change than a simple param-read swap. |

---

## Sources

### Primary (HIGH confidence — codebase verified)
- `src/lib/layers/mep-equipment-params.ts` — v6 MepEquipmentParams shape, all six equipment interfaces
- `src/store/equipment-store.ts` — per-PK param storage, dot-path override pattern, default-on-missing behavior
- `src/store/recipe-store.ts` — base+overrides merge pattern via spread (`{ ...base, ...overrides }`)
- `src/store/material-store.ts` — per-PK property storage, `source: "user-input"` flag, dot-path override
- `src/lib/bim/element-id.ts` — UUIDv7 branded ElementId system, ElementKind union
- `src/lib/bim/element-record.ts` — ElementRecord minimal shape, `userData` extension bag
- `src/lib/bim/element-registry.ts` — Map-backed registry, secondary indexes, serialize/deserialize pattern
- `src/lib/procedural/types.ts` — BuildingRecipe, FacadeConfig, SlabConfig, ColumnConfig, RoofConfig shapes
- `src/lib/bim/schedules/schedule-types.ts` — ScheduleCategory, ScheduleColumn accessor pattern
- `src/lib/ifc/revit-property-map.ts` — Pset_WallCommon / ThermalTransmittance mapping
- `.planning/v6-to-v9-ROADMAP-BENCHMARK.md` — Phase 35 spec, success criteria, risk register

### Secondary (MEDIUM confidence — training knowledge, Revit-documented patterns)
- Revit Family/Type/Instance model — `[ASSUMED]` analogies in §5; verified against codebase structural alignment
- IFC2x3 `IfcRelDefinesByType` / IFC4 `IfcTypeObject` hierarchy — `[ASSUMED]` from IFC schema training knowledge; Phase 43 verification required

### Tertiary (LOW confidence)
- Memory sizing estimates in §6.2 — `[ASSUMED]` based on typical JS object overhead; validate empirically in Phase 35 implementation
