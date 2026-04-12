// src/lib/bim/sheets/sheet-types.ts
// Data model for sheet composition: page sizes, viewport blocks, title block config, and sheet definitions.

// ---------------------------------------------------------------------------
// Page sizes
// ---------------------------------------------------------------------------

export type PageSize = "A0" | "A1" | "A2" | "A3" | "A4";

/** ISO 216 paper dimensions in millimetres (width × height in portrait orientation). */
export const PAGE_SIZE_MM: Record<PageSize, { widthMm: number; heightMm: number }> = {
  A0: { widthMm: 841, heightMm: 1189 },
  A1: { widthMm: 594, heightMm: 841 },
  A2: { widthMm: 420, heightMm: 594 },
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
};

// ---------------------------------------------------------------------------
// Viewport block
// ---------------------------------------------------------------------------

/** A rectangular region on a sheet that hosts a view or schedule. */
export interface ViewportBlock {
  /** Unique identifier within the sheet. */
  id: string;
  /** Whether this viewport hosts a 3D/2D view or a schedule table. */
  kind: "view" | "schedule";
  /** ID of the ViewDefinition or ScheduleDefinition being displayed. */
  targetId: string;
  /** Left edge position in millimetres from the sheet origin (top-left). */
  x: number;
  /** Top edge position in millimetres from the sheet origin (top-left). */
  y: number;
  /** Width of the viewport in millimetres. */
  width: number;
  /** Height of the viewport in millimetres. */
  height: number;
  /** Drawing scale denominator (e.g. 100 for 1:100). Only applies to view kind. */
  scale?: number;
  /** Optional viewport caption rendered below the viewport frame. */
  title?: string;
}

// ---------------------------------------------------------------------------
// Title block config
// ---------------------------------------------------------------------------

/** Configuration for the Korean GX-format title block. */
export interface TitleBlockConfig {
  /** Project name (e.g. "한국 BIM 에너지 관리 시스템") */
  projectName: string;
  /** Building name or address identifier */
  buildingName: string;
  /** Lead architect / 설계자 */
  architectName: string;
  /** GX auditor / 감사자 */
  auditorName: string;
  /** Issue date in ISO 8601 format (YYYY-MM-DD) */
  date: string;
  /** Sheet number string, e.g. "A-001" or "1 / 5" */
  sheetNumber: string;
  /** Revision identifier, e.g. "P1", "C0", "Rev 2" */
  revision: string;
  /** Display locale: Korean or English labels */
  locale: "ko" | "en";
}

// ---------------------------------------------------------------------------
// Sheet definition
// ---------------------------------------------------------------------------

/** A single printable sheet composed of viewport blocks and a title block. */
export interface SheetDefinition {
  /** Unique sheet identifier (UUID recommended). */
  id: string;
  /** Human-readable sheet name shown in the sheet browser. */
  name: string;
  /** ISO paper size for this sheet. */
  pageSize: PageSize;
  /** Sheet orientation. Dimensions are swapped automatically when landscape. */
  orientation: "landscape" | "portrait";
  /** Ordered list of viewports placed on the sheet canvas. */
  viewports: ViewportBlock[];
  /** Title block metadata rendered in the stamp area. */
  titleBlock: TitleBlockConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the effective width and height in millimetres for a sheet,
 * respecting its orientation.
 */
export function getSheetDimensions(sheet: SheetDefinition): { widthMm: number; heightMm: number } {
  const base = PAGE_SIZE_MM[sheet.pageSize];
  return sheet.orientation === "landscape"
    ? { widthMm: base.heightMm, heightMm: base.widthMm }
    : { widthMm: base.widthMm, heightMm: base.heightMm };
}
