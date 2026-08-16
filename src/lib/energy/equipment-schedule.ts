// Parse a short HVAC equipment schedule (CSV / TSV / pasted table).
// Writes into MaterialProperties.hvac — the energy engine's existing input.

export type SchedulePlantType = "heating" | "cooling" | "lighting" | "dhw";

export interface EquipmentScheduleRow {
  type: SchedulePlantType;
  capacityKw?: number;
  efficiency?: number;
  installYear?: number;
  fuel?: "gas" | "electric" | "oil" | "district-heat" | "heat-pump";
  raw: Record<string, string>;
}

export interface ParsedEquipmentSchedule {
  rows: EquipmentScheduleRow[];
  warnings: string[];
}

const TYPE_ALIASES: Record<string, SchedulePlantType> = {
  heating: "heating",
  heat: "heating",
  난방: "heating",
  boiler: "heating",
  보일러: "heating",
  cooling: "cooling",
  cool: "cooling",
  냉방: "cooling",
  chiller: "cooling",
  냉동기: "cooling",
  lighting: "lighting",
  light: "lighting",
  조명: "lighting",
  dhw: "dhw",
  급탕: "dhw",
  hotwater: "dhw",
};

const FUEL_ALIASES: Record<string, EquipmentScheduleRow["fuel"]> = {
  gas: "gas",
  가스: "gas",
  lng: "gas",
  electric: "electric",
  elec: "electric",
  전기: "electric",
  oil: "oil",
  유류: "oil",
  "district-heat": "district-heat",
  district: "district-heat",
  지역난방: "district-heat",
  "heat-pump": "heat-pump",
  heatpump: "heat-pump",
  히트펌프: "heat-pump",
};

const HEADER_ALIASES: Record<string, string> = {
  type: "type",
  종류: "type",
  kind: "type",
  category: "type",
  capacity: "capacity",
  용량: "capacity",
  kw: "capacity",
  year: "year",
  연도: "year",
  installyear: "year",
  설치연도: "year",
  fuel: "fuel",
  연료: "fuel",
  efficiency: "efficiency",
  효율: "efficiency",
  cop: "efficiency",
};

function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[\s_\-]/g, "");
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[h.trim()] ?? h.trim().toLowerCase();
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/,/g, "").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  // Simple CSV — no quoted-comma support (schedule rows are short).
  return line.split(",").map((c) => c.trim());
}

export function parseEquipmentSchedule(text: string): ParsedEquipmentSchedule {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) {
    return { rows: [], warnings: ["empty"] };
  }

  const headerCells = splitLine(lines[0]).map(normalizeHeader);
  const hasHeader = headerCells.some((h) =>
    ["type", "capacity", "year", "fuel", "efficiency"].includes(h),
  );
  const start = hasHeader ? 1 : 0;
  const headers = hasHeader
    ? headerCells
    : ["type", "capacity", "year", "fuel", "efficiency"];

  const rows: EquipmentScheduleRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined) raw[h] = cells[idx];
    });
    // Allow positional fallback when no header: type, capacity, year, fuel, efficiency
    if (!hasHeader) {
      if (cells[0]) raw.type = cells[0];
      if (cells[1]) raw.capacity = cells[1];
      if (cells[2]) raw.year = cells[2];
      if (cells[3]) raw.fuel = cells[3];
      if (cells[4]) raw.efficiency = cells[4];
    }

    const typeKey = (raw.type ?? "").trim().toLowerCase();
    const type = TYPE_ALIASES[typeKey] ?? TYPE_ALIASES[typeKey.replace(/\s/g, "")];
    if (!type) {
      warnings.push(`row ${i + 1}: unknown type "${raw.type ?? ""}"`);
      continue;
    }
    const fuelKey = (raw.fuel ?? "").trim().toLowerCase().replace(/\s/g, "");
    rows.push({
      type,
      capacityKw: parseNumber(raw.capacity),
      efficiency: parseNumber(raw.efficiency),
      installYear: parseNumber(raw.year),
      fuel: fuelKey ? FUEL_ALIASES[fuelKey] : undefined,
      raw,
    });
  }

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push("no schedule rows");
  }
  return { rows, warnings };
}

export interface AppliedSchedulePatch {
  /** Dot-paths into MaterialProperties */
  paths: Array<{ path: string; value: unknown }>;
}

/** Map parsed rows onto the existing HVAC / lighting material fields. */
export function scheduleToMaterialPatches(
  rows: EquipmentScheduleRow[],
): AppliedSchedulePatch {
  const paths: Array<{ path: string; value: unknown }> = [];
  for (const row of rows) {
    if (row.type === "heating") {
      if (row.capacityKw !== undefined) paths.push({ path: "hvac.heating.capacity", value: row.capacityKw });
      if (row.efficiency !== undefined) paths.push({ path: "hvac.heating.efficiency", value: row.efficiency });
      if (row.fuel) paths.push({ path: "hvac.heating.fuelType", value: row.fuel });
      if (row.fuel === "heat-pump") paths.push({ path: "hvac.heating.systemType", value: "central" });
    } else if (row.type === "cooling") {
      if (row.capacityKw !== undefined) paths.push({ path: "hvac.cooling.capacity", value: row.capacityKw });
      if (row.efficiency !== undefined) paths.push({ path: "hvac.cooling.efficiency", value: row.efficiency });
    } else if (row.type === "lighting") {
      if (row.capacityKw !== undefined) {
        paths.push({ path: "lighting.lightingPowerDensity", value: row.capacityKw });
      }
    }
  }
  return { paths };
}
