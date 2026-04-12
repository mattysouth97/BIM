// src/lib/bim/schedules/schedule-types.ts
// Type definitions for the BIM schedule engine.
// Pure types — no React, no DOM, no side effects.

// ---------------------------------------------------------------------------
// Element categories
// ---------------------------------------------------------------------------

export type ScheduleCategory =
  | "wall"
  | "window"
  | "door"
  | "mep"
  | "room"
  | "slab"
  | "column";

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

/**
 * A single column in a schedule.
 * `accessor` is a pure function that extracts a display value from any
 * element record. Keeping it typed as `(element: unknown) => string | number`
 * means schedule-engine.ts can call it without knowing element internals.
 */
export interface ScheduleColumn {
  /** Stable machine identifier (used for sort/filter keys). */
  id: string;
  /** Human-readable header label (Korean or English). */
  label: string;
  /** Pure extractor — must not throw on missing fields; return "-" as fallback. */
  accessor: (element: unknown) => string | number;
}

// ---------------------------------------------------------------------------
// Filter definition
// ---------------------------------------------------------------------------

export type FilterOp = "eq" | "neq" | "gt" | "lt" | "contains";

export interface ScheduleFilter {
  /** Must match a `ScheduleColumn.id` in the parent definition. */
  column: string;
  op: FilterOp;
  value: string | number;
}

// ---------------------------------------------------------------------------
// Schedule definition
// ---------------------------------------------------------------------------

export interface ScheduleDefinition {
  /** Stable machine identifier (e.g., "wall-schedule-v1"). */
  id: string;
  /** Display name shown in UI tabs. */
  name: string;
  category: ScheduleCategory;
  columns: ScheduleColumn[];
  filters?: ScheduleFilter[];
  /** Column id to sort by. Prefix with "-" for descending (e.g., "-area"). */
  sortBy?: string;
  /** Column id to group by. Produces sentinel rows between groups. */
  groupBy?: string;
}

// ---------------------------------------------------------------------------
// Schedule result
// ---------------------------------------------------------------------------

/**
 * A row in a ScheduleResult.
 * - Regular rows: all column id keys present.
 * - Group header rows: `_isGroupHeader: true`, `_groupValue: string`.
 */
export type ScheduleRow = Record<string, unknown> & {
  _isGroupHeader?: boolean;
  _groupValue?: string;
};

export interface ScheduleResult {
  definition: ScheduleDefinition;
  /** Rows after filters, sort, and optional grouping are applied. */
  rows: ScheduleRow[];
  /** Total row count excluding group-header sentinel rows. */
  rowCount: number;
}
