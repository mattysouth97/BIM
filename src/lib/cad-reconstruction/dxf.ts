// src/lib/cad-reconstruction/dxf.ts
//
// Canonical model → editable AutoCAD DXF.
//
// AC1015 (R2000) ASCII, millimetres, 1:1. R2000 is emitted rather than R2018
// deliberately: the later formats add object structures this writer does not
// produce, and claiming a version whose objects are absent is exactly the kind
// of unverifiable assertion this pipeline exists to avoid. R2000 is editable in
// every current CAD application.
//
// Real entities only — no raster substitutes. Inferred geometry is separated
// onto X-VERIFY, contradictions onto X-CONFLICT, so a reader can see at a
// glance which lines are evidence and which are reconstruction.

import { bbox, toCounterClockwise } from "./geometry";
import type {
  PointMm,
  ReconstructionModel,
  RingMm,
} from "./types";

/* ------------------------------------------------------------------ */
/* Layer standard                                                      */
/* ------------------------------------------------------------------ */

interface LayerDef {
  name: string;
  color: number;
  linetype: string;
  descriptionKo: string;
}

export const LAYERS: LayerDef[] = [
  { name: "BIM_OUTLINE", color: 7, linetype: "CONTINUOUS", descriptionKo: "지상 1층 외곽선 (앱 인제스트 기준선)" },
  { name: "A-WALL", color: 7, linetype: "CONTINUOUS", descriptionKo: "외벽" },
  { name: "A-COLS", color: 3, linetype: "CONTINUOUS", descriptionKo: "기둥 (증거 있는 경우)" },
  { name: "A-DOOR", color: 4, linetype: "CONTINUOUS", descriptionKo: "문" },
  { name: "A-WIND", color: 5, linetype: "CONTINUOUS", descriptionKo: "창" },
  { name: "A-STAIR", color: 6, linetype: "CONTINUOUS", descriptionKo: "계단" },
  { name: "A-ELEV", color: 6, linetype: "CONTINUOUS", descriptionKo: "승강기" },
  { name: "A-FURN", color: 8, linetype: "CONTINUOUS", descriptionKo: "가구 (미작성)" },
  { name: "A-TEXT", color: 7, linetype: "CONTINUOUS", descriptionKo: "문자" },
  { name: "A-DIMS", color: 2, linetype: "CONTINUOUS", descriptionKo: "치수" },
  { name: "A-GRID", color: 8, linetype: "CENTER", descriptionKo: "그리드 (추정)" },
  { name: "A-SITE", color: 3, linetype: "CONTINUOUS", descriptionKo: "대지 경계" },
  { name: "A-ROOF", color: 9, linetype: "CONTINUOUS", descriptionKo: "지붕" },
  { name: "A-ROOF-REF", color: 9, linetype: "DASHED", descriptionKo: "지붕 참조선" },
  { name: "S-GRID", color: 8, linetype: "CENTER", descriptionKo: "구조 그리드 (증거 없음 — 비움)" },
  { name: "S-COLS", color: 3, linetype: "CONTINUOUS", descriptionKo: "구조 기둥 (증거 없음 — 비움)" },
  { name: "S-WALL", color: 7, linetype: "CONTINUOUS", descriptionKo: "구조벽 (증거 없음 — 비움)" },
  { name: "E-LITE", color: 2, linetype: "CONTINUOUS", descriptionKo: "조명 (증거 없음 — 비움)" },
  { name: "E-POWR", color: 2, linetype: "CONTINUOUS", descriptionKo: "전력 (증거 없음 — 비움)" },
  { name: "M-HVAC", color: 4, linetype: "CONTINUOUS", descriptionKo: "공조 (증거 없음 — 비움)" },
  { name: "P-PIPE", color: 5, linetype: "CONTINUOUS", descriptionKo: "위생 (증거 없음 — 비움)" },
  { name: "F-FIRE", color: 1, linetype: "CONTINUOUS", descriptionKo: "소방 (증거 없음 — 비움)" },
  { name: "G-REF", color: 8, linetype: "CONTINUOUS", descriptionKo: "참조 기호 (방위·단면)" },
  { name: "X-VERIFY", color: 30, linetype: "DASHED", descriptionKo: "추정 기하 — 현장 확인 필요" },
  { name: "X-CONFLICT", color: 1, linetype: "DASHED", descriptionKo: "출처 간 불일치 기하" },
  { name: "SHEET", color: 8, linetype: "CONTINUOUS", descriptionKo: "시트 테두리·표제란" },
];

const LINETYPES: Array<{ name: string; description: string; pattern: number[] }> = [
  { name: "CONTINUOUS", description: "Solid line", pattern: [] },
  { name: "DASHED", description: "Dashed __ __ __", pattern: [500, -250] },
  { name: "CENTER", description: "Center ____ _ ____", pattern: [1000, -250, 250, -250] },
  { name: "HIDDEN", description: "Hidden _ _ _", pattern: [250, -125] },
];

/* ------------------------------------------------------------------ */
/* Writer                                                              */
/* ------------------------------------------------------------------ */

class DxfBuilder {
  private lines: string[] = [];
  private handleSeed = 0x100;

  nextHandle(): string {
    this.handleSeed += 1;
    return this.handleSeed.toString(16).toUpperCase();
  }

  peekSeed(): string {
    return (this.handleSeed + 1).toString(16).toUpperCase();
  }

  push(code: number, value: string | number): void {
    this.lines.push(String(code));
    this.lines.push(
      typeof value === "number"
        ? isIntegerCode(code)
          ? String(Math.round(value))
          : formatNumber(value)
        : value,
    );
  }

  raw(): string {
    return this.lines.join("\r\n") + "\r\n";
  }
}

/**
 * DXF group codes are typed by number range. An integer code written as
 * "4.0" is not merely ugly — readers that parse it strictly reject the file,
 * so the distinction is enforced here rather than at each call site.
 */
function isIntegerCode(code: number): boolean {
  return (
    (code >= 60 && code <= 79) ||
    (code >= 90 && code <= 99) ||
    (code >= 170 && code <= 179) ||
    (code >= 270 && code <= 289) ||
    (code >= 370 && code <= 389) ||
    (code >= 400 && code <= 409) ||
    (code >= 1060 && code <= 1070)
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0.0";
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}

export interface DxfSheetPlacement {
  id: string;
  titleKo: string;
  /** Model-space offset applied to this sheet's geometry. */
  offset: PointMm;
  /** Where the sheet's geometry actually lands — its lower-left corner. */
  origin: PointMm;
  widthMm: number;
  heightMm: number;
}

export interface DxfResult {
  text: string;
  sheets: DxfSheetPlacement[];
  /** Entity counts by type — the baseline for round-trip validation. */
  entityCounts: Record<string, number>;
  layersUsed: string[];
}

const TEXT_H = 300;
const TITLE_H = 900;
const SHEET_GAP = 15000;

/**
 * Write the canonical model as a DXF drawing set.
 *
 * Every sheet is generated from the same model, in one pass, so plans,
 * elevations and sections cannot drift apart.
 */
export function writeDxf(model: ReconstructionModel): DxfResult {
  const b = new DxfBuilder();
  const counts: Record<string, number> = {};
  const layersUsed = new Set<string>();

  const bump = (type: string) => {
    counts[type] = (counts[type] ?? 0) + 1;
  };

  /* ---- geometry pre-pass: sheet placement ------------------------- */

  const groundLevel = model.levels.find((l) => !l.below) ?? model.levels[0] ?? null;
  const planBox = bbox(model.footprint.ring);
  const planW = Math.max(planBox.widthMm, 1000);
  const planH = Math.max(planBox.heightMm, 1000);
  const siteBox = model.site.ring ? bbox(model.site.ring) : null;
  const rowH = Math.max(planH, siteBox?.heightMm ?? 0) + SHEET_GAP;

  let cursorX = 0;

  let siteSheet: DxfSheetPlacement | null = null;
  if (model.site.ring && siteBox) {
    siteSheet = {
      id: "A-100",
      titleKo: "A-100 배치도 / Site Plan",
      offset: [cursorX - siteBox.minX, -siteBox.minY],
      origin: [cursorX, 0],
      widthMm: siteBox.widthMm,
      heightMm: siteBox.heightMm,
    };
    cursorX += siteBox.widthMm + SHEET_GAP;
  }

  const levelSheets: DxfSheetPlacement[] = model.levels.map((level, i) => {
    const lb = bbox(level.plate);
    const sheet: DxfSheetPlacement = {
      id: `A-${101 + i}`,
      titleKo: `A-${101 + i} ${level.name} 평면도 / Floor Plan`,
      offset: [cursorX - lb.minX, -lb.minY],
      origin: [cursorX, 0],
      widthMm: lb.widthMm,
      heightMm: lb.heightMm,
    };
    cursorX += lb.widthMm + SHEET_GAP;
    return sheet;
  });

  // Roof plan reuses the topmost plate.
  const topLevel = model.levels.filter((l) => !l.below).slice(-1)[0] ?? null;
  let roofSheet: DxfSheetPlacement | null = null;
  if (topLevel) {
    const lb = bbox(topLevel.plate);
    roofSheet = {
      id: "A-150",
      titleKo: "A-150 지붕 평면도 / Roof Plan",
      offset: [cursorX - lb.minX, -lb.minY],
      origin: [cursorX, 0],
      widthMm: lb.widthMm,
      heightMm: lb.heightMm,
    };
    cursorX += lb.widthMm + SHEET_GAP;
  }

  const elevRowY = -rowH;
  let elevCursorX = 0;
  const elevSheets: DxfSheetPlacement[] = model.elevations.map((elev, i) => {
    const eb = bbox(elev.outline);
    const s: DxfSheetPlacement = {
      id: `A-${201 + i}`,
      titleKo: `A-${201 + i} ${facingKo(elev.facing)} 입면도 / Elevation`,
      offset: [elevCursorX - eb.minX, elevRowY - eb.minY],
      origin: [elevCursorX, elevRowY],
      widthMm: eb.widthMm,
      heightMm: eb.heightMm,
    };
    elevCursorX += eb.widthMm + SHEET_GAP;
    return s;
  });

  const elevRowH =
    (model.elevations.length > 0
      ? Math.max(...model.elevations.map((e) => bbox(e.outline).heightMm))
      : 0) + SHEET_GAP;
  const secRowY = elevRowY - elevRowH;
  let secCursorX = 0;
  const secSheets: DxfSheetPlacement[] = model.sections.map((sec, i) => {
    const sb = bbox(sec.outline);
    const s: DxfSheetPlacement = {
      id: `A-${301 + i}`,
      titleKo: `A-${301 + i} ${sec.label} / Section`,
      offset: [secCursorX - sb.minX, secRowY - sb.minY],
      origin: [secCursorX, secRowY],
      widthMm: sb.widthMm,
      heightMm: sb.heightMm,
    };
    secCursorX += sb.widthMm + SHEET_GAP;
    return s;
  });

  const sheets: DxfSheetPlacement[] = [
    ...(siteSheet ? [siteSheet] : []),
    ...levelSheets,
    ...(roofSheet ? [roofSheet] : []),
    ...elevSheets,
    ...secSheets,
  ];

  /* ---- collected entity emitters --------------------------------- */

  const entities: Array<() => void> = [];
  const dimBlocks: Array<{ name: string; draw: () => void }> = [];

  const lwpolyline = (
    layer: string,
    ring: RingMm,
    closed: boolean,
    offset: PointMm = [0, 0],
  ) => {
    if (ring.length < 2) return;
    layersUsed.add(layer);
    entities.push(() => {
      b.push(0, "LWPOLYLINE");
      b.push(5, b.nextHandle());
      b.push(100, "AcDbEntity");
      b.push(8, layer);
      b.push(100, "AcDbPolyline");
      b.push(90, ring.length);
      b.push(70, closed ? 1 : 0);
      for (const [x, y] of ring) {
        b.push(10, x + offset[0]);
        b.push(20, y + offset[1]);
      }
    });
    bump("LWPOLYLINE");
  };

  const line = (
    layer: string,
    a: PointMm,
    c: PointMm,
    offset: PointMm = [0, 0],
  ) => {
    layersUsed.add(layer);
    entities.push(() => {
      b.push(0, "LINE");
      b.push(5, b.nextHandle());
      b.push(100, "AcDbEntity");
      b.push(8, layer);
      b.push(100, "AcDbLine");
      b.push(10, a[0] + offset[0]);
      b.push(20, a[1] + offset[1]);
      b.push(30, 0);
      b.push(11, c[0] + offset[0]);
      b.push(21, c[1] + offset[1]);
      b.push(31, 0);
    });
    bump("LINE");
  };

  const text = (
    layer: string,
    at: PointMm,
    height: number,
    value: string,
    offset: PointMm = [0, 0],
    rotation = 0,
  ) => {
    layersUsed.add(layer);
    entities.push(() => {
      b.push(0, "TEXT");
      b.push(5, b.nextHandle());
      b.push(100, "AcDbEntity");
      b.push(8, layer);
      b.push(100, "AcDbText");
      b.push(10, at[0] + offset[0]);
      b.push(20, at[1] + offset[1]);
      b.push(30, 0);
      b.push(40, height);
      b.push(1, sanitiseText(value));
      if (rotation !== 0) b.push(50, rotation);
      b.push(7, "STANDARD");
    });
    bump("TEXT");
  };

  const insert = (
    layer: string,
    blockName: string,
    at: PointMm,
    scale: number,
    rotationDeg: number,
    offset: PointMm = [0, 0],
  ) => {
    layersUsed.add(layer);
    entities.push(() => {
      b.push(0, "INSERT");
      b.push(5, b.nextHandle());
      b.push(100, "AcDbEntity");
      b.push(8, layer);
      b.push(100, "AcDbBlockReference");
      b.push(2, blockName);
      b.push(10, at[0] + offset[0]);
      b.push(20, at[1] + offset[1]);
      b.push(30, 0);
      b.push(41, scale);
      b.push(42, scale);
      b.push(43, 1);
      b.push(50, rotationDeg);
    });
    bump("INSERT");
  };

  /**
   * A dimension drawn as a real DIMENSION entity backed by an anonymous block
   * holding its picture — the form AutoCAD itself writes. `verified` controls
   * the annotation: an estimated dimension is never presented like a measured
   * one.
   */
  const dimension = (
    a: PointMm,
    c: PointMm,
    offsetMm: number,
    verified: boolean,
    offset: PointMm = [0, 0],
    label?: string,
  ) => {
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const rotation = horizontal ? 0 : 90;
    const nx = horizontal ? 0 : 1;
    const ny = horizontal ? 1 : 0;
    const p1: PointMm = [a[0] + offset[0], a[1] + offset[1]];
    const p2: PointMm = [c[0] + offset[0], c[1] + offset[1]];
    const d1: PointMm = [p1[0] + nx * offsetMm, p1[1] + ny * offsetMm];
    const d2: PointMm = [p2[0] + nx * offsetMm, p2[1] + ny * offsetMm];
    const mid: PointMm = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];
    const value = label ?? `${Math.round(len)}`;
    const shown = verified ? value : `≈${value} (추정)`;
    const blockName = `*D${dimBlocks.length + 1}`;

    dimBlocks.push({
      name: blockName,
      draw: () => {
        // Dimension line
        b.push(0, "LINE");
        b.push(5, b.nextHandle());
        b.push(100, "AcDbEntity");
        b.push(8, "A-DIMS");
        b.push(100, "AcDbLine");
        b.push(10, d1[0]);
        b.push(20, d1[1]);
        b.push(30, 0);
        b.push(11, d2[0]);
        b.push(21, d2[1]);
        b.push(31, 0);
        // Extension lines
        for (const [from, to] of [
          [p1, d1],
          [p2, d2],
        ] as Array<[PointMm, PointMm]>) {
          b.push(0, "LINE");
          b.push(5, b.nextHandle());
          b.push(100, "AcDbEntity");
          b.push(8, "A-DIMS");
          b.push(100, "AcDbLine");
          b.push(10, from[0]);
          b.push(20, from[1]);
          b.push(30, 0);
          b.push(11, to[0] + nx * 200);
          b.push(21, to[1] + ny * 200);
          b.push(31, 0);
        }
        // Value
        b.push(0, "TEXT");
        b.push(5, b.nextHandle());
        b.push(100, "AcDbEntity");
        b.push(8, "A-DIMS");
        b.push(100, "AcDbText");
        b.push(10, mid[0] + (horizontal ? -len / 4 : 250));
        b.push(20, mid[1] + (horizontal ? 200 : -len / 4));
        b.push(30, 0);
        b.push(40, TEXT_H);
        b.push(1, sanitiseText(shown));
        if (!horizontal) b.push(50, 90);
        b.push(7, "STANDARD");
      },
    });

    layersUsed.add("A-DIMS");
    entities.push(() => {
      b.push(0, "DIMENSION");
      b.push(5, b.nextHandle());
      b.push(100, "AcDbEntity");
      b.push(8, "A-DIMS");
      b.push(100, "AcDbDimension");
      b.push(2, blockName);
      b.push(10, d2[0]);
      b.push(20, d2[1]);
      b.push(30, 0);
      b.push(11, mid[0]);
      b.push(21, mid[1]);
      b.push(31, 0);
      b.push(70, 32); // rotated dimension, block-owned
      b.push(1, sanitiseText(shown));
      b.push(3, "STANDARD");
      b.push(100, "AcDbAlignedDimension");
      b.push(13, p1[0]);
      b.push(23, p1[1]);
      b.push(33, 0);
      b.push(14, p2[0]);
      b.push(24, p2[1]);
      b.push(34, 0);
      b.push(50, rotation);
      b.push(100, "AcDbRotatedDimension");
    });
    bump("DIMENSION");
  };

  /* ---- sheet frames ---------------------------------------------- */

  const drawSheetFrame = (sheet: DxfSheetPlacement) => {
    const pad = 2500;
    const x0 = sheet.origin[0] - pad;
    const y0 = sheet.origin[1] - pad;
    const x1 = x0 + sheet.widthMm + pad * 2;
    const y1 = y0 + sheet.heightMm + pad * 2;
    lwpolyline(
      "SHEET",
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      true,
    );
    text("A-TEXT", [x0, y1 + 900], TITLE_H, sheet.titleKo);
    text(
      "A-TEXT",
      [x0, y0 - 1200],
      TEXT_H,
      `${model.titleKo} · ${model.revision} · 축척 1:100 (mm) · 실측 도서 아님`,
    );
  };

  /* ---- plans ------------------------------------------------------ */

  if (siteSheet && model.site.ring && siteBox) {
    const sheet = siteSheet;
    drawSheetFrame(sheet);
    lwpolyline("A-SITE", model.site.ring, true, sheet.offset);
    lwpolyline("BIM_OUTLINE", model.footprint.ring, true, sheet.offset);
    text(
      "A-TEXT",
      [siteBox.minX, siteBox.minY - 2000],
      TEXT_H,
      `대지 ${model.site.areaSqm?.toFixed(1) ?? "-"} m² (${model.site.grade}) · ${model.site.note}`,
      sheet.offset,
    );
    insert("G-REF", "NORTH-ARROW", [siteBox.maxX + 1500, siteBox.maxY], 1, 0, sheet.offset);
  }

  model.levels.forEach((level, levelIndex) => {
    const sheet = levelSheets[levelIndex];
    drawSheetFrame(sheet);
    const off = sheet.offset;
    const plateCcw = toCounterClockwise(level.plate);

    // Grade level doubles as the app's ingestion outline.
    if (level === groundLevel) {
      lwpolyline("BIM_OUTLINE", plateCcw, true, off);
    }

    // Wall faces: outer ring is the plate, inner ring is the plate offset in.
    lwpolyline("A-WALL", plateCcw, true, off);
    const levelWalls = model.walls.filter((w) => w.levelId === level.id);
    const innerRing: RingMm = [];
    for (const w of levelWalls) {
      innerRing.push(w.centreline[0]);
    }
    if (innerRing.length >= 3) {
      lwpolyline("A-WALL", innerRing, true, off);
    }
    for (const w of levelWalls) {
      line("A-WALL", w.centreline[0], w.centreline[1], off);
    }

    // Openings, as blocks hosted on their wall.
    for (const op of model.openings.filter((o) => o.levelId === level.id)) {
      const [p0, p1] = op.plan;
      const mid: PointMm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const angle = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
      const scale = op.widthMm / 1000;
      insert(
        op.type === "door" ? "A-DOOR" : "A-WIND",
        op.type === "door" ? "A-DOOR-SINGLE" : "A-WIND-CASEMENT",
        mid,
        scale,
        angle,
        off,
      );
    }

    // Core, columns and grid are inference: X-VERIFY, not the discipline layer.
    if (model.core) {
      lwpolyline("X-VERIFY", model.core.ring, true, off);
      const cb = bbox(model.core.ring);
      text(
        "A-TEXT",
        [cb.minX + 200, cb.minY + 200],
        TEXT_H,
        `코어 ${model.core.areaSqm.toFixed(1)}m² (D-INFERRED)`,
        off,
      );
      drawStair(model.core.ring, lwpolyline, line, off);
      if (model.core.hasElevator) {
        const ex = cb.minX + cb.widthMm * 0.55;
        lwpolyline(
          "A-ELEV",
          [
            [ex, cb.minY + 300],
            [ex + 2000, cb.minY + 300],
            [ex + 2000, cb.minY + 2200],
            [ex, cb.minY + 2200],
          ],
          true,
          off,
        );
      }
    }

    for (const x of model.grid.xLines) {
      line("A-GRID", [x, planBox.minY - 2000], [x, planBox.maxY + 2000], off);
    }
    for (const y of model.grid.yLines) {
      line("A-GRID", [planBox.minX - 2000, y], [planBox.maxX + 2000, y], off);
    }
    for (const c of model.grid.columns) {
      const s = model.grid.columnSizeMm / 2;
      lwpolyline(
        "X-VERIFY",
        [
          [c[0] - s, c[1] - s],
          [c[0] + s, c[1] - s],
          [c[0] + s, c[1] + s],
          [c[0] - s, c[1] + s],
        ],
        true,
        off,
      );
    }

    const lb = bbox(plateCcw);
    text(
      "A-TEXT",
      [lb.minX, lb.minY - 2000],
      TEXT_H,
      `${level.name} · 등록 ${level.registeredAreaSqm?.toFixed(1) ?? "-"} m² · 모델 ${level.modelAreaSqm.toFixed(1)} m² · ${level.plateGrade}`,
      off,
    );
    if (level.registeredUse) {
      text("A-TEXT", [lb.minX, lb.minY - 2600], TEXT_H, `용도: ${level.registeredUse}`, off);
    }

    // Overall dimensions. Only a measured control earns an unmarked dimension.
    const verified =
      model.footprint.grade === "A-VERIFIED" || model.footprint.grade === "B-OBSERVED";
    dimension([lb.minX, lb.minY], [lb.maxX, lb.minY], -3500, verified, off);
    dimension([lb.maxX, lb.minY], [lb.maxX, lb.maxY], 3500, verified, off);
  });

  if (roofSheet && topLevel) {
    const sheet = roofSheet;
    drawSheetFrame(sheet);
    lwpolyline("A-ROOF", toCounterClockwise(topLevel.plate), true, sheet.offset);
    const rb = bbox(topLevel.plate);
    lwpolyline(
      "A-ROOF-REF",
      [
        [rb.minX, rb.minY],
        [rb.maxX, rb.maxY],
      ],
      false,
      sheet.offset,
    );
    text(
      "A-TEXT",
      [rb.minX, rb.minY - 2000],
      TEXT_H,
      `지붕 형식: ${String(model.controls.find((c) => c.id === "C13")?.value ?? "flat")} (${model.controls.find((c) => c.id === "C13")?.grade ?? "D-INFERRED"})`,
      sheet.offset,
    );
  }

  /* ---- elevations ------------------------------------------------- */

  model.elevations.forEach((elev, i) => {
    const sheet = elevSheets[i];
    if (!sheet) return;
    drawSheetFrame(sheet);
    const off = sheet.offset;
    lwpolyline("A-WALL", elev.outline, true, off);
    const eb = bbox(elev.outline);
    line("A-SITE", [eb.minX - 1500, 0], [eb.maxX + 1500, 0], off);
    for (const fl of elev.floorLines) {
      line("A-GRID", [eb.minX, fl.yMm], [eb.maxX, fl.yMm], off);
      text("A-TEXT", [eb.maxX + 400, fl.yMm + 100], TEXT_H, fl.label, off);
    }
    for (const op of elev.openings) {
      lwpolyline(op.grade === "X-UNRESOLVED" ? "X-CONFLICT" : "A-WIND", op.rect, true, off);
    }
    text(
      "A-TEXT",
      [eb.minX, eb.minY - 2000],
      TEXT_H,
      `${facingKo(elev.facing)} 입면 — 평면에서 생성됨 (독립 작도 아님) · ${elev.grade}`,
      off,
    );
  });

  /* ---- sections --------------------------------------------------- */

  model.sections.forEach((sec, i) => {
    const sheet = secSheets[i];
    if (!sheet) return;
    drawSheetFrame(sheet);
    const off = sheet.offset;
    lwpolyline("A-WALL", sec.outline, true, off);
    for (const slab of sec.slabs) {
      lwpolyline("A-WALL", slab, true, off);
    }
    if (sec.coreProfile) {
      lwpolyline("X-VERIFY", sec.coreProfile, true, off);
    }
    const sb = bbox(sec.outline);
    for (const fl of sec.floorLines) {
      text("A-TEXT", [sb.maxX + 400, fl.yMm + 100], TEXT_H, fl.label, off);
      dimension(
        [sb.minX, fl.yMm],
        [sb.minX, fl.yMm + (model.levels[0]?.floorToFloorMm ?? 3000)],
        -2500,
        model.levels[0]?.floorToFloorGrade === "C-CALCULATED",
        off,
      );
    }
    text(
      "A-TEXT",
      [sb.minX, sb.minY - 2000],
      TEXT_H,
      `${sec.label} — 평면·층고에서 생성됨 · ${sec.grade}`,
      off,
    );
    insert("G-REF", "SEC-MARK", [sb.minX - 1500, sb.minY], 1, 0, off);
  });

  /* ---- conflicts and legend --------------------------------------- */

  const legendX = 0;
  const legendY = secRowY - 25000;
  text("A-TEXT", [legendX, legendY], TITLE_H, "증거 등급 범례 / Confidence legend");
  const legendRows = [
    "A-VERIFIED  권위 있는 자료로 확인된 값 (대장 기재 면적 등)",
    "B-OBSERVED  관측되었으나 치수 검증되지 않음 (GIS 외곽 등)",
    "C-CALCULATED  검증된 값에서 계산됨 (높이÷층수 등)",
    "D-INFERRED  공간 정합을 위해 생성됨 — X-VERIFY 레이어",
    "X-UNRESOLVED  출처 간 불일치 — X-CONFLICT 레이어",
    "치수 앞의 ≈ 와 (추정) 표기는 실측되지 않은 치수를 뜻합니다",
    "S-*, E-*, M-*, P-*, F-* 레이어는 증거가 없어 의도적으로 비어 있습니다",
  ];
  legendRows.forEach((r, i) => {
    text("A-TEXT", [legendX, legendY - 1500 - i * 900], TEXT_H * 1.5, r);
  });

  model.conflicts.forEach((conflict, i) => {
    if (conflict.geometry && conflict.geometry.length >= 3) {
      lwpolyline("X-CONFLICT", conflict.geometry, true, [0, 0]);
    }
    text(
      "A-TEXT",
      [legendX, legendY - 12000 - i * 900],
      TEXT_H * 1.5,
      `${conflict.id} ${conflict.subject}: ${conflict.valueA} vs ${conflict.valueB} (${conflict.magnitude})`,
    );
  });

  /* ---- assemble the file ------------------------------------------ */

  const pad = 6000;
  const extents = sheets.reduce(
    (acc, s) => ({
      minX: Math.min(acc.minX, s.origin[0] - pad),
      minY: Math.min(acc.minY, s.origin[1] - pad),
      maxX: Math.max(acc.maxX, s.origin[0] + s.widthMm + pad),
      maxY: Math.max(acc.maxY, s.origin[1] + s.heightMm + pad),
    }),
    { minX: 0, minY: legendY - 25000, maxX: planW, maxY: planH },
  );

  writeHeader(b, extents);
  writeTables(b, dimBlocks.length);
  writeBlocks(b, dimBlocks);

  b.push(0, "SECTION");
  b.push(2, "ENTITIES");
  for (const emit of entities) emit();
  b.push(0, "ENDSEC");

  writeObjects(b);
  b.push(0, "EOF");

  return {
    text: b.raw(),
    sheets,
    entityCounts: counts,
    layersUsed: [...layersUsed].sort(),
  };
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function writeHeader(
  b: DxfBuilder,
  extents: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  b.push(0, "SECTION");
  b.push(2, "HEADER");
  b.push(9, "$ACADVER");
  b.push(1, "AC1015");
  b.push(9, "$INSUNITS");
  b.push(70, 4); // millimetres
  b.push(9, "$MEASUREMENT");
  b.push(70, 1); // metric
  b.push(9, "$LUNITS");
  b.push(70, 2);
  b.push(9, "$LUPREC");
  b.push(70, 0);
  b.push(9, "$DIMSCALE");
  b.push(40, 100);
  b.push(9, "$LTSCALE");
  b.push(40, 100);
  b.push(9, "$EXTMIN");
  b.push(10, extents.minX);
  b.push(20, extents.minY);
  b.push(30, 0);
  b.push(9, "$EXTMAX");
  b.push(10, extents.maxX);
  b.push(20, extents.maxY);
  b.push(30, 0);
  b.push(9, "$HANDSEED");
  b.push(5, "FFFF");
  b.push(0, "ENDSEC");
}

function writeTables(b: DxfBuilder, dimBlockCount: number): void {
  b.push(0, "SECTION");
  b.push(2, "TABLES");

  // VPORT
  b.push(0, "TABLE");
  b.push(2, "VPORT");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, 1);
  b.push(0, "VPORT");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTableRecord");
  b.push(100, "AcDbViewportTableRecord");
  b.push(2, "*ACTIVE");
  b.push(70, 0);
  b.push(10, 0);
  b.push(20, 0);
  b.push(11, 1);
  b.push(21, 1);
  b.push(12, 0);
  b.push(22, 0);
  b.push(40, 100000);
  b.push(41, 1.5);
  b.push(0, "ENDTAB");

  // LTYPE
  b.push(0, "TABLE");
  b.push(2, "LTYPE");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, LINETYPES.length + 2);
  for (const name of ["BYBLOCK", "BYLAYER"]) {
    b.push(0, "LTYPE");
    b.push(5, b.nextHandle());
    b.push(100, "AcDbSymbolTableRecord");
    b.push(100, "AcDbLinetypeTableRecord");
    b.push(2, name);
    b.push(70, 0);
    b.push(3, "");
    b.push(72, 65);
    b.push(73, 0);
    b.push(40, 0);
  }
  for (const lt of LINETYPES) {
    b.push(0, "LTYPE");
    b.push(5, b.nextHandle());
    b.push(100, "AcDbSymbolTableRecord");
    b.push(100, "AcDbLinetypeTableRecord");
    b.push(2, lt.name);
    b.push(70, 0);
    b.push(3, lt.description);
    b.push(72, 65);
    b.push(73, lt.pattern.length);
    b.push(40, lt.pattern.reduce((s, p) => s + Math.abs(p), 0));
    for (const p of lt.pattern) b.push(49, p);
  }
  b.push(0, "ENDTAB");

  // LAYER
  b.push(0, "TABLE");
  b.push(2, "LAYER");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, LAYERS.length + 1);
  b.push(0, "LAYER");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTableRecord");
  b.push(100, "AcDbLayerTableRecord");
  b.push(2, "0");
  b.push(70, 0);
  b.push(62, 7);
  b.push(6, "CONTINUOUS");
  for (const layer of LAYERS) {
    b.push(0, "LAYER");
    b.push(5, b.nextHandle());
    b.push(100, "AcDbSymbolTableRecord");
    b.push(100, "AcDbLayerTableRecord");
    b.push(2, layer.name);
    b.push(70, 0);
    b.push(62, layer.color);
    b.push(6, layer.linetype);
  }
  b.push(0, "ENDTAB");

  // STYLE
  b.push(0, "TABLE");
  b.push(2, "STYLE");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, 1);
  b.push(0, "STYLE");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTableRecord");
  b.push(100, "AcDbTextStyleTableRecord");
  b.push(2, "STANDARD");
  b.push(70, 0);
  b.push(40, 0);
  b.push(41, 1);
  b.push(50, 0);
  b.push(71, 0);
  b.push(42, 300);
  // A CJK-capable font: the drawing carries Korean labels throughout.
  b.push(3, "malgun.ttf");
  b.push(4, "");
  b.push(0, "ENDTAB");

  // APPID
  b.push(0, "TABLE");
  b.push(2, "APPID");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, 1);
  b.push(0, "APPID");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTableRecord");
  b.push(100, "AcDbRegAppTableRecord");
  b.push(2, "ACAD");
  b.push(70, 0);
  b.push(0, "ENDTAB");

  // DIMSTYLE
  b.push(0, "TABLE");
  b.push(2, "DIMSTYLE");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, 1);
  b.push(0, "DIMSTYLE");
  b.push(105, b.nextHandle());
  b.push(100, "AcDbSymbolTableRecord");
  b.push(100, "AcDbDimStyleTableRecord");
  b.push(2, "STANDARD");
  b.push(70, 0);
  b.push(40, 1);
  b.push(140, 300);
  b.push(0, "ENDTAB");

  // BLOCK_RECORD
  const blockNames = [
    "*Model_Space",
    "*Paper_Space",
    "A-DOOR-SINGLE",
    "A-WIND-CASEMENT",
    "NORTH-ARROW",
    "SEC-MARK",
    ...Array.from({ length: dimBlockCount }, (_, i) => `*D${i + 1}`),
  ];
  b.push(0, "TABLE");
  b.push(2, "BLOCK_RECORD");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbSymbolTable");
  b.push(70, blockNames.length);
  for (const name of blockNames) {
    b.push(0, "BLOCK_RECORD");
    b.push(5, b.nextHandle());
    b.push(100, "AcDbSymbolTableRecord");
    b.push(100, "AcDbBlockTableRecord");
    b.push(2, name);
    b.push(70, 0);
  }
  b.push(0, "ENDTAB");

  b.push(0, "ENDSEC");
}

function blockHeader(b: DxfBuilder, name: string, anonymous: boolean): void {
  b.push(0, "BLOCK");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbEntity");
  b.push(8, "0");
  b.push(100, "AcDbBlockBegin");
  b.push(2, name);
  b.push(70, anonymous ? 1 : 0);
  b.push(10, 0);
  b.push(20, 0);
  b.push(30, 0);
  b.push(3, name);
  b.push(1, "");
}

function blockFooter(b: DxfBuilder): void {
  b.push(0, "ENDBLK");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbEntity");
  b.push(8, "0");
  b.push(100, "AcDbBlockEnd");
}

function blockLine(
  b: DxfBuilder,
  layer: string,
  a: PointMm,
  c: PointMm,
): void {
  b.push(0, "LINE");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbEntity");
  b.push(8, layer);
  b.push(100, "AcDbLine");
  b.push(10, a[0]);
  b.push(20, a[1]);
  b.push(30, 0);
  b.push(11, c[0]);
  b.push(21, c[1]);
  b.push(31, 0);
}

function writeBlocks(
  b: DxfBuilder,
  dimBlocks: Array<{ name: string; draw: () => void }>,
): void {
  b.push(0, "SECTION");
  b.push(2, "BLOCKS");

  blockHeader(b, "*Model_Space", false);
  blockFooter(b);
  blockHeader(b, "*Paper_Space", false);
  blockFooter(b);

  // Unit door: 1000 mm leaf on the X axis, swing arc approximated by chords.
  blockHeader(b, "A-DOOR-SINGLE", false);
  blockLine(b, "A-DOOR", [-500, 0], [500, 0]);
  blockLine(b, "A-DOOR", [-500, 0], [-500, 900]);
  b.push(0, "ARC");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbEntity");
  b.push(8, "A-DOOR");
  b.push(100, "AcDbCircle");
  b.push(10, -500);
  b.push(20, 0);
  b.push(30, 0);
  b.push(40, 900);
  b.push(100, "AcDbArc");
  b.push(50, 0);
  b.push(51, 90);
  blockFooter(b);

  // Unit window: 1000 mm opening, twin frame lines.
  blockHeader(b, "A-WIND-CASEMENT", false);
  blockLine(b, "A-WIND", [-500, -60], [500, -60]);
  blockLine(b, "A-WIND", [-500, 60], [500, 60]);
  blockLine(b, "A-WIND", [-500, -60], [-500, 60]);
  blockLine(b, "A-WIND", [500, -60], [500, 60]);
  blockFooter(b);

  blockHeader(b, "NORTH-ARROW", false);
  blockLine(b, "G-REF", [0, 0], [0, 3000]);
  blockLine(b, "G-REF", [0, 3000], [-500, 2000]);
  blockLine(b, "G-REF", [0, 3000], [500, 2000]);
  b.push(0, "TEXT");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbEntity");
  b.push(8, "G-REF");
  b.push(100, "AcDbText");
  b.push(10, -200);
  b.push(20, 3300);
  b.push(30, 0);
  b.push(40, 600);
  b.push(1, "N");
  b.push(7, "STANDARD");
  blockFooter(b);

  blockHeader(b, "SEC-MARK", false);
  blockLine(b, "G-REF", [0, 0], [1200, 0]);
  blockLine(b, "G-REF", [0, 0], [0, 1200]);
  blockFooter(b);

  for (const db of dimBlocks) {
    blockHeader(b, db.name, true);
    db.draw();
    blockFooter(b);
  }

  b.push(0, "ENDSEC");
}

function writeObjects(b: DxfBuilder): void {
  b.push(0, "SECTION");
  b.push(2, "OBJECTS");
  b.push(0, "DICTIONARY");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbDictionary");
  b.push(3, "ACAD_GROUP");
  b.push(350, b.peekSeed());
  b.push(0, "DICTIONARY");
  b.push(5, b.nextHandle());
  b.push(100, "AcDbDictionary");
  b.push(0, "ENDSEC");
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function drawStair(
  coreRing: RingMm,
  lwpolyline: (l: string, r: RingMm, c: boolean, o?: PointMm) => void,
  line: (l: string, a: PointMm, c: PointMm, o?: PointMm) => void,
  offset: PointMm,
): void {
  const cb = bbox(coreRing);
  const w = Math.min(2600, cb.widthMm * 0.4);
  const h = Math.min(4200, cb.heightMm * 0.8);
  const x0 = cb.minX + 300;
  const y0 = cb.minY + 300;
  lwpolyline(
    "A-STAIR",
    [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + h],
      [x0, y0 + h],
    ],
    true,
    offset,
  );
  const treads = Math.max(2, Math.floor(h / 280));
  for (let i = 1; i < treads; i++) {
    const y = y0 + (h * i) / treads;
    line("A-STAIR", [x0, y], [x0 + w, y], offset);
  }
}

function facingKo(f: string): string {
  return f === "north" ? "북측" : f === "east" ? "동측" : f === "south" ? "남측" : "서측";
}

/** DXF group values are line-delimited: a newline in a label would corrupt the file. */
function sanitiseText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 240);
}
