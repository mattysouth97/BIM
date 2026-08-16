// Korean / English labels for seed schedules. Engine stays English;
// the instrument chrome localizes at render time.

export const SCHEDULE_NAME_I18N: Record<string, { ko: string; en: string }> = {
  "wall-schedule-v1": { ko: "벽체 일람표", en: "Wall schedule" },
  "window-door-schedule-v1": { ko: "창호 일람표", en: "Window / door schedule" },
  "mep-equipment-schedule-v1": { ko: "설비 일람표", en: "Equipment schedule" },
  "room-schedule-v1": { ko: "층·실 일람표", en: "Room schedule" },
};

export const SCHEDULE_COLUMN_I18N: Record<string, { ko: string; en: string }> = {
  id: { ko: "부재번호", en: "Element ID" },
  floorNo: { ko: "층", en: "Floor" },
  thickness: { ko: "두께 (mm)", en: "Thickness (mm)" },
  height: { ko: "높이 (m)", en: "Height (m)" },
  length: { ko: "길이 (m)", en: "Length (m)" },
  area: { ko: "면적 (m²)", en: "Area (m²)" },
  uValue: { ko: "열관류율 (W/m²K)", en: "U-Value (W/m²K)" },
  material: { ko: "재료", en: "Material" },
  type: { ko: "종류", en: "Type" },
  width: { ko: "폭 (m)", en: "Width (m)" },
  count: { ko: "수량", en: "Count" },
  equipmentType: { ko: "설비", en: "Equipment type" },
  depth: { ko: "깊이 (m)", en: "Depth (m)" },
  capacity: { ko: "용량", en: "Capacity" },
  name: { ko: "실명", en: "Room name" },
  use: { ko: "용도", en: "Use type" },
  perimeter: { ko: "둘레 (m)", en: "Perimeter (m)" },
};

export function scheduleName(id: string, isKo: boolean): string {
  const row = SCHEDULE_NAME_I18N[id];
  if (!row) return id;
  return isKo ? row.ko : row.en;
}

export function scheduleColumnLabel(columnId: string, fallback: string, isKo: boolean): string {
  const row = SCHEDULE_COLUMN_I18N[columnId];
  if (!row) return fallback;
  return isKo ? row.ko : row.en;
}
