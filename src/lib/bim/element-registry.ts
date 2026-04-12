/**
 * element-registry.ts
 *
 * In-memory registry for ElementRecords with secondary indexes by kind and
 * buildingPk. Backed by Map (not WeakMap) so that string-keyed ElementIds can
 * be stored and iterated — WeakMap requires object keys.
 *
 * The singleton `elementRegistry` is the single source of truth at runtime.
 * Phase 31+ (Annotation Lifecycle, Schedules) query this registry directly.
 */

import type { ElementId, ElementKind } from "./element-id";
import { parseElementKind } from "./element-id";
import type { ElementRecord, SerializedElementRecord } from "./element-record";

// ---------------------------------------------------------------------------
// ElementRegistry class
// ---------------------------------------------------------------------------

export class ElementRegistry {
  /** Primary store: elementId → record */
  private readonly _store = new Map<string, ElementRecord>();

  /** Secondary index: kind → Set of elementIds */
  private readonly _byKind = new Map<ElementKind, Set<string>>();

  /** Secondary index: buildingPk → Set of elementIds */
  private readonly _byBuilding = new Map<string, Set<string>>();

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Register a new element record.
   * If an element with the same id already exists it is replaced (upsert).
   */
  register(record: ElementRecord): void {
    const key = record.id as string;

    // Remove old secondary-index entries if replacing
    if (this._store.has(key)) {
      this._removeFromIndexes(this._store.get(key)!);
    }

    this._store.set(key, record);
    this._addToIndexes(record);
  }

  /**
   * Remove an element from the registry by id.
   * Returns true if the element existed and was removed, false otherwise.
   */
  unregister(id: ElementId | string): boolean {
    const key = id as string;
    const record = this._store.get(key);
    if (!record) return false;

    this._removeFromIndexes(record);
    this._store.delete(key);
    return true;
  }

  /**
   * Remove all elements from the registry and clear all indexes.
   */
  clear(): void {
    this._store.clear();
    this._byKind.clear();
    this._byBuilding.clear();
  }

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

  /**
   * Look up a single element by its ElementId.
   * Returns undefined if not found.
   */
  get(id: ElementId | string): ElementRecord | undefined {
    return this._store.get(id as string);
  }

  /**
   * Return all elements of a given kind.
   */
  getByKind(kind: ElementKind): ElementRecord[] {
    const ids = this._byKind.get(kind);
    if (!ids || ids.size === 0) return [];
    const results: ElementRecord[] = [];
    for (const id of ids) {
      const record = this._store.get(id);
      if (record) results.push(record);
    }
    return results;
  }

  /**
   * Return all elements belonging to a given building.
   */
  getByBuildingPk(pk: string): ElementRecord[] {
    const ids = this._byBuilding.get(pk);
    if (!ids || ids.size === 0) return [];
    const results: ElementRecord[] = [];
    for (const id of ids) {
      const record = this._store.get(id);
      if (record) results.push(record);
    }
    return results;
  }

  /**
   * Return the total number of registered elements.
   */
  get size(): number {
    return this._store.size;
  }

  /**
   * Iterate over all registered records.
   */
  values(): IterableIterator<ElementRecord> {
    return this._store.values();
  }

  // -------------------------------------------------------------------------
  // Serialisation / deserialisation (for Zustand persist round-trips)
  // -------------------------------------------------------------------------

  /**
   * Export the full registry to a plain-object array suitable for
   * JSON.stringify / localStorage persistence.
   */
  serialize(): SerializedElementRecord[] {
    return Array.from(this._store.values()).map((r) => ({
      id: r.id as string,
      kind: r.kind,
      buildingPk: r.buildingPk,
      userData: r.userData,
    }));
  }

  /**
   * Restore the registry from a serialised array (e.g. from Zustand rehydrate).
   * Existing entries are NOT cleared — call `clear()` first if a full reload is
   * needed.
   */
  deserialize(records: SerializedElementRecord[]): void {
    for (const raw of records) {
      // Validate the id has a recognised kind prefix before re-registering
      const kind = parseElementKind(raw.id);
      if (!kind) continue; // skip malformed records

      const record: ElementRecord = {
        id: raw.id as ElementId,
        kind: raw.kind ?? kind,
        buildingPk: raw.buildingPk,
        userData: raw.userData ?? {},
      };
      this.register(record);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _addToIndexes(record: ElementRecord): void {
    const key = record.id as string;

    // kind index
    let kindSet = this._byKind.get(record.kind);
    if (!kindSet) {
      kindSet = new Set();
      this._byKind.set(record.kind, kindSet);
    }
    kindSet.add(key);

    // building index
    let bldgSet = this._byBuilding.get(record.buildingPk);
    if (!bldgSet) {
      bldgSet = new Set();
      this._byBuilding.set(record.buildingPk, bldgSet);
    }
    bldgSet.add(key);
  }

  private _removeFromIndexes(record: ElementRecord): void {
    const key = record.id as string;
    this._byKind.get(record.kind)?.delete(key);
    this._byBuilding.get(record.buildingPk)?.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * Process-wide singleton registry.
 *
 * Import and use directly in generators and scene components:
 *
 *   import { elementRegistry } from "@/lib/bim/element-registry";
 *   elementRegistry.register({ id, kind: "wall", buildingPk, userData: {} });
 */
export const elementRegistry = new ElementRegistry();
