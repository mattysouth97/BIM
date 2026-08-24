import type { DrawingSourceInput, ExtractionSignal } from "./ingestion";

/**
 * Non-proprietary seven-document acceptance set for the representative flow.
 * This module intentionally has no fixture imports or eager fixture builders.
 */
export function representativeOfficeDrawingSetInputs(): readonly DrawingSourceInput[] {
  const planDxf = rectangularDxf(20, 20, "BIM_OUTLINE");
  return Object.freeze([
    {
      fileName: "A101-office-floor-plan-rev-A.dxf",
      mimeType: "application/dxf",
      content: planDxf,
      revision: "A",
      textSample:
        "OFFICE FLOOR PLAN LEVELS 01-03 REPEATED BIM_OUTLINE NORTH ARROW 0 DEG",
      extractionSignals: [
        signal(
          "geometry.repeatedStoreyCount",
          3,
          "count",
          "drawing_annotation",
          "LEVELS 01-03 TYPICAL",
          0.96,
        ),
        signal(
          "site.northOrientationDeg",
          0,
          "deg",
          "drawing_annotation",
          "NORTH ARROW 0 DEG",
          0.96,
        ),
      ],
    },
    {
      fileName: "A201-east-elevation-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("EAST ELEVATION W01 1500 x 1500 SILL 900"),
      revision: "A",
      extractionSignals: [
        signal(
          "opening.W01.widthM",
          1.5,
          "m",
          "drawing_annotation",
          "W01 width 1500",
          0.88,
        ),
        signal(
          "opening.W01.heightM",
          1.5,
          "m",
          "drawing_annotation",
          "W01 height 1500",
          0.88,
        ),
        signal(
          "opening.W01.sillHeightM",
          0.9,
          "m",
          "drawing_annotation",
          "W01 sill 900",
          0.88,
        ),
      ],
    },
    {
      fileName: "A301-building-section-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("BUILDING SECTION FLOOR TO FLOOR 3000"),
      revision: "A",
      extractionSignals: [
        signal(
          "geometry.floorToFloorHeightM",
          3,
          "m",
          "drawing_annotation",
          "FLOOR TO FLOOR 3000",
          0.96,
        ),
      ],
    },
    {
      fileName: "A601-window-schedule-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("WINDOW SCHEDULE W01 1800 x 1500 U=1.6 SHGC=0.35"),
      revision: "A",
      extractionSignals: [
        signal(
          "opening.W01.widthM",
          1.8,
          "m",
          "explicit_schedule_or_specification",
          "W01 WIDTH 1800",
          0.99,
          "schedule_table",
        ),
        signal(
          "construction.window.W01.uValue",
          1.6,
          "W/m2K",
          "explicit_schedule_or_specification",
          "W01 U-VALUE 1.60",
          0.99,
          "schedule_table",
        ),
        signal(
          "construction.window.W01.shgc",
          0.35,
          undefined,
          "explicit_schedule_or_specification",
          "W01 SHGC 0.35",
          0.99,
          "schedule_table",
        ),
      ],
    },
    {
      fileName: "A602-exterior-wall-detail-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("EXTERIOR WALL DETAIL EW01 U=0.32"),
      revision: "A",
      extractionSignals: [
        signal(
          "construction.wall.EW01.uValue",
          0.32,
          "W/m2K",
          "explicit_schedule_or_specification",
          "EW01 U-VALUE 0.32",
          0.98,
          "schedule_table",
        ),
      ],
    },
    {
      fileName: "M601-hvac-equipment-schedule-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg(
        "HVAC EQUIPMENT SCHEDULE HP01 CAPACITY 120kW COP 3.6 SERVES LEVELS 01-03",
      ),
      revision: "A",
      extractionSignals: [
        signal(
          "system.HP01.systemType",
          "air_source_heat_pump",
          undefined,
          "explicit_schedule_or_specification",
          "HP01 AIR SOURCE HEAT PUMP",
          0.99,
          "schedule_table",
        ),
        signal(
          "system.HP01.capacityKw",
          120,
          "kW",
          "explicit_schedule_or_specification",
          "HP01 CAPACITY 120 kW",
          0.99,
          "schedule_table",
        ),
        signal(
          "system.HP01.coolingCop",
          3.6,
          undefined,
          "explicit_schedule_or_specification",
          "HP01 COOLING COP 3.6",
          0.99,
          "schedule_table",
        ),
        signal(
          "system.HP01.servedStoreyCount",
          3,
          "count",
          "explicit_schedule_or_specification",
          "HP01 SERVES LEVELS 01-03",
          0.99,
          "schedule_table",
        ),
      ],
    },
    {
      fileName: "E201-lighting-plan-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("LIGHTING PLAN OFFICE LPD 8 W/M2"),
      revision: "A",
      extractionSignals: [
        signal(
          "usage.office.lightingPowerDensity",
          8,
          "W/m2",
          "drawing_annotation",
          "OFFICE LPD 8 W/M2",
          0.92,
        ),
      ],
    },
  ]);
}

function signal(
  key: string,
  value: unknown,
  unit: string | undefined,
  authority: ExtractionSignal["authority"],
  originalText: string,
  confidence: number,
  extractionMethod: ExtractionSignal["extractionMethod"] = "drawing_text",
): ExtractionSignal {
  return {
    key,
    value,
    ...(unit ? { unit } : {}),
    confidence,
    extractionMethod,
    authority,
    pageNumber: 1,
    sheetId: "SCHEDULE-1",
    boundingBox: { x: 10, y: 10, width: 120, height: 24 },
    originalText,
  };
}

function safeSvg(text: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><text x="10" y="30">${text}</text></svg>`;
}

function rectangularDxf(widthM: number, heightM: number, layer: string): string {
  const pairs: readonly (readonly [number, string | number])[] = [
    [0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, 6], [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"], [0, "LWPOLYLINE"], [8, layer], [90, 4], [70, 1],
    [10, 0], [20, 0], [10, widthM], [20, 0], [10, widthM], [20, heightM], [10, 0], [20, heightM],
    [0, "TEXT"], [8, "BIM_ANNOTATION"], [10, 1], [20, heightM + 1], [30, 0], [40, 0.5],
    [1, "LEVELS 01-03 TYPICAL"],
    [0, "TEXT"], [8, "BIM_NORTH"], [10, widthM + 2], [20, heightM - 2], [30, 0], [40, 0.5],
    [1, "NORTH ARROW 0 DEG"],
    [0, "LINE"], [8, "BIM_NORTH"], [10, widthM + 2], [20, heightM - 3], [30, 0],
    [11, widthM + 2], [21, heightM], [31, 0],
    [0, "LINE"], [8, "BIM_NORTH"], [10, widthM + 2], [20, heightM], [30, 0],
    [11, widthM + 1.7], [21, heightM - 0.5], [31, 0],
    [0, "LINE"], [8, "BIM_NORTH"], [10, widthM + 2], [20, heightM], [30, 0],
    [11, widthM + 2.3], [21, heightM - 0.5], [31, 0],
    [0, "ENDSEC"], [0, "EOF"],
  ];
  return `${pairs.map(([code, value]) => `${code}\n${value}`).join("\n")}\n`;
}
