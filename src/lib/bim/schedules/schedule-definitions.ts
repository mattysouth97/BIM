// src/lib/bim/schedules/schedule-definitions.ts
// Four seed schedule templates for the BIM schedule engine.
// Pure data — no React, no DOM.

import type { ScheduleDefinition } from "./schedule-types";

// ---------------------------------------------------------------------------
// Type helpers for element shapes expected by each accessor
// ---------------------------------------------------------------------------

interface WallElement {
  id?: string;
  thickness?: number;       // metres
  uValue?: number;          // W/m²K
  area?: number;            // m²
  material?: string;
  height?: number;          // metres
  length?: number;          // metres
  floorNo?: number;
}

interface OpeningElement {
  id?: string;
  type?: "window" | "door";
  width?: number;           // metres
  height?: number;          // metres
  uValue?: number;          // W/m²K
  material?: string;
  floorNo?: number;
  count?: number;
}

interface MepElement {
  id?: string;
  equipmentType?: string;   // "chiller" | "boiler" | "ahu" | "dhw" | "lightingFixture" | "electricalPanel"
  floorNo?: number;
  capacity?: number;        // kW or lux
  width?: number;
  height?: number;
  depth?: number;
  count?: number;
}

interface RoomElement {
  id?: string;
  name?: string;
  floorNo?: number;
  area?: number;            // m²
  perimeter?: number;       // m
  use?: string;
  height?: number;          // m
}

// ---------------------------------------------------------------------------
// Helper: safe numeric formatter (2 decimal places, or "-" for missing values)
// ---------------------------------------------------------------------------

function num2(value: unknown): string | number {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || isNaN(n)) return "-";
  return Math.round(n * 100) / 100;
}

function str(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

// ---------------------------------------------------------------------------
// 1. Wall Schedule
// Columns: ID, Floor, Thickness (mm), Height (m), Length (m), Area (m²), U-Value (W/m²K), Material
// ---------------------------------------------------------------------------

export const wallSchedule: ScheduleDefinition = {
  id: "wall-schedule-v1",
  name: "Wall Schedule",
  category: "wall",
  columns: [
    {
      id: "id",
      label: "Element ID",
      accessor: (el) => str((el as WallElement).id),
    },
    {
      id: "floorNo",
      label: "Floor",
      accessor: (el) => {
        const f = (el as WallElement).floorNo;
        if (f === undefined || f === null) return "-";
        return f < 0 ? `B${Math.abs(f)}F` : `${f}F`;
      },
    },
    {
      id: "thickness",
      label: "Thickness (mm)",
      accessor: (el) => {
        const t = (el as WallElement).thickness;
        if (t === undefined || t === null) return "-";
        // Store in metres, display in mm
        return Math.round(Number(t) * 1000);
      },
    },
    {
      id: "height",
      label: "Height (m)",
      accessor: (el) => num2((el as WallElement).height),
    },
    {
      id: "length",
      label: "Length (m)",
      accessor: (el) => num2((el as WallElement).length),
    },
    {
      id: "area",
      label: "Area (m²)",
      accessor: (el) => num2((el as WallElement).area),
    },
    {
      id: "uValue",
      label: "U-Value (W/m²K)",
      accessor: (el) => num2((el as WallElement).uValue),
    },
    {
      id: "material",
      label: "Material",
      accessor: (el) => str((el as WallElement).material),
    },
  ],
  sortBy: "floorNo",
};

// ---------------------------------------------------------------------------
// 2. Window/Door Schedule
// Columns: ID, Type, Floor, Width (m), Height (m), Area (m²), U-Value (W/m²K), Material, Count
// ---------------------------------------------------------------------------

export const windowDoorSchedule: ScheduleDefinition = {
  id: "window-door-schedule-v1",
  name: "Window / Door Schedule",
  category: "window",
  columns: [
    {
      id: "id",
      label: "Element ID",
      accessor: (el) => str((el as OpeningElement).id),
    },
    {
      id: "type",
      label: "Type",
      accessor: (el) => str((el as OpeningElement).type),
    },
    {
      id: "floorNo",
      label: "Floor",
      accessor: (el) => {
        const f = (el as OpeningElement).floorNo;
        if (f === undefined || f === null) return "-";
        return f < 0 ? `B${Math.abs(f)}F` : `${f}F`;
      },
    },
    {
      id: "width",
      label: "Width (m)",
      accessor: (el) => num2((el as OpeningElement).width),
    },
    {
      id: "height",
      label: "Height (m)",
      accessor: (el) => num2((el as OpeningElement).height),
    },
    {
      id: "area",
      label: "Area (m²)",
      accessor: (el) => {
        const w = Number((el as OpeningElement).width ?? 0);
        const h = Number((el as OpeningElement).height ?? 0);
        if (!w || !h) return "-";
        return Math.round(w * h * 100) / 100;
      },
    },
    {
      id: "uValue",
      label: "U-Value (W/m²K)",
      accessor: (el) => num2((el as OpeningElement).uValue),
    },
    {
      id: "material",
      label: "Material",
      accessor: (el) => str((el as OpeningElement).material),
    },
    {
      id: "count",
      label: "Count",
      accessor: (el) => {
        const c = (el as OpeningElement).count;
        return c !== undefined ? Number(c) : 1;
      },
    },
  ],
  sortBy: "floorNo",
  groupBy: "type",
};

// ---------------------------------------------------------------------------
// 3. MEP Equipment Schedule
// Columns: ID, Equipment Type, Floor, Width (m), Height (m), Depth (m), Capacity, Count
// ---------------------------------------------------------------------------

const MEP_TYPE_LABELS: Record<string, string> = {
  chiller: "Chiller",
  boiler: "Boiler / VRF",
  ahu: "AHU",
  dhw: "DHW Tank",
  lightingFixture: "Lighting Fixture",
  electricalPanel: "Electrical Panel",
};

export const mepEquipmentSchedule: ScheduleDefinition = {
  id: "mep-equipment-schedule-v1",
  name: "MEP Equipment Schedule",
  category: "mep",
  columns: [
    {
      id: "id",
      label: "Element ID",
      accessor: (el) => str((el as MepElement).id),
    },
    {
      id: "equipmentType",
      label: "Equipment Type",
      accessor: (el) => {
        const t = (el as MepElement).equipmentType ?? "";
        return MEP_TYPE_LABELS[t] ?? str(t);
      },
    },
    {
      id: "floorNo",
      label: "Floor",
      accessor: (el) => {
        const f = (el as MepElement).floorNo;
        if (f === undefined || f === null) return "-";
        return f < 0 ? `B${Math.abs(f)}F` : `${f}F`;
      },
    },
    {
      id: "width",
      label: "Width (m)",
      accessor: (el) => num2((el as MepElement).width),
    },
    {
      id: "height",
      label: "Height (m)",
      accessor: (el) => num2((el as MepElement).height),
    },
    {
      id: "depth",
      label: "Depth (m)",
      accessor: (el) => num2((el as MepElement).depth),
    },
    {
      id: "capacity",
      label: "Capacity (kW)",
      accessor: (el) => num2((el as MepElement).capacity),
    },
    {
      id: "count",
      label: "Count",
      accessor: (el) => {
        const c = (el as MepElement).count;
        return c !== undefined ? Number(c) : 1;
      },
    },
  ],
  sortBy: "equipmentType",
  groupBy: "equipmentType",
};

// ---------------------------------------------------------------------------
// 4. Room Schedule
// Columns: ID, Name, Floor, Use, Area (m²), Perimeter (m), Height (m)
// ---------------------------------------------------------------------------

export const roomSchedule: ScheduleDefinition = {
  id: "room-schedule-v1",
  name: "Room Schedule",
  category: "room",
  columns: [
    {
      id: "id",
      label: "Element ID",
      accessor: (el) => str((el as RoomElement).id),
    },
    {
      id: "name",
      label: "Room Name",
      accessor: (el) => str((el as RoomElement).name),
    },
    {
      id: "floorNo",
      label: "Floor",
      accessor: (el) => {
        const f = (el as RoomElement).floorNo;
        if (f === undefined || f === null) return "-";
        return f < 0 ? `B${Math.abs(f)}F` : `${f}F`;
      },
    },
    {
      id: "use",
      label: "Use Type",
      accessor: (el) => str((el as RoomElement).use),
    },
    {
      id: "area",
      label: "Area (m²)",
      accessor: (el) => num2((el as RoomElement).area),
    },
    {
      id: "perimeter",
      label: "Perimeter (m)",
      accessor: (el) => num2((el as RoomElement).perimeter),
    },
    {
      id: "height",
      label: "Ceiling Height (m)",
      accessor: (el) => num2((el as RoomElement).height),
    },
  ],
  sortBy: "floorNo",
  groupBy: "use",
};

// ---------------------------------------------------------------------------
// All seed schedules as a registry map for easy lookup by id
// ---------------------------------------------------------------------------

export const SEED_SCHEDULES: Record<string, ScheduleDefinition> = {
  [wallSchedule.id]: wallSchedule,
  [windowDoorSchedule.id]: windowDoorSchedule,
  [mepEquipmentSchedule.id]: mepEquipmentSchedule,
  [roomSchedule.id]: roomSchedule,
};
