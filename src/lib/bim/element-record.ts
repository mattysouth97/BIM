/**
 * element-record.ts
 *
 * Minimal structural record that every element in the registry carries.
 * Downstream phases (annotations, schedules, views) extend userData freely
 * without touching this core shape.
 */

import type { ElementId, ElementKind } from "./element-id";

export type { ElementKind } from "./element-id";

// ---------------------------------------------------------------------------
// ElementRecord
// ---------------------------------------------------------------------------

/**
 * The minimal record stored for each authored element.
 *
 * - `id`          — stable UUIDv7-backed branded string; survives serialisation
 * - `kind`        — discriminated union for type-safe registry queries
 * - `buildingPk`  — building identifier (matches equipment-store / recipe-store key)
 * - `userData`    — open bag for phase-specific data (geometry refs, params, etc.)
 *
 * Intentionally kept minimal so v7.0's Family/Type/Instance model can absorb
 * this without a breaking migration.
 */
export interface ElementRecord {
  readonly id: ElementId;
  readonly kind: ElementKind;
  /** Building primary key — same pattern used by equipment-store and recipe-store */
  readonly buildingPk: string;
  /** Open extension bag — downstream phases add fields here */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Serialised form (for Zustand persist / localStorage round-trip)
// ---------------------------------------------------------------------------

/**
 * Plain-object representation used during JSON serialisation.
 * Identical to ElementRecord but without the readonly modifiers so that
 * JSON.parse results can be assigned directly.
 */
export interface SerializedElementRecord {
  id: string;
  kind: ElementKind;
  buildingPk: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: Record<string, any>;
}
