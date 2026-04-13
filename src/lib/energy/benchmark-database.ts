// src/lib/energy/benchmark-database.ts
// Korean building energy benchmark data from KEMCO (한국에너지공단).
// Values are kWh/m²/year for primary energy demand by use type and era.

export interface BenchmarkEntry {
  useType: string; // 'office' | 'retail' | 'hospital' | 'hotel' | 'school' | 'residential' | 'factory'
  era: string;     // building era band, e.g. '1990s', '2000s', '2010s', '2020+'
  region: string;  // 'national' for national average
  p25: number;     // 25th percentile (efficient end)
  p50: number;     // 50th percentile (typical/median)
  p75: number;     // 75th percentile (inefficient end)
  source: string;  // citation
}

/**
 * Korean building energy benchmarks.
 * Sources: KEMCO 건물에너지 소비 통계 2024, MOLIT 건축물 에너지효율 통계.
 * Residential figures align with MOLIT apartment energy survey.
 * Industrial/factory figures are high-variance; median only representative.
 */
export const BENCHMARK_DATA: BenchmarkEntry[] = [
  // ── Office (업무시설) ──────────────────────────────────────────────────
  {
    useType: "office",
    era: "1990s",
    region: "national",
    p25: 200,
    p50: 260,
    p75: 340,
    source: "KEMCO 2024",
  },
  {
    useType: "office",
    era: "2000s",
    region: "national",
    p25: 165,
    p50: 220,
    p75: 295,
    source: "KEMCO 2024",
  },
  {
    useType: "office",
    era: "2010s",
    region: "national",
    p25: 130,
    p50: 180,
    p75: 245,
    source: "KEMCO 2024",
  },
  {
    useType: "office",
    era: "2020+",
    region: "national",
    p25: 105,
    p50: 150,
    p75: 205,
    source: "KEMCO 2024",
  },

  // ── Residential (공동주택 / 단독주택) ─────────────────────────────────
  {
    useType: "residential",
    era: "1990s",
    region: "national",
    p25: 110,
    p50: 145,
    p75: 190,
    source: "KEMCO 2024",
  },
  {
    useType: "residential",
    era: "2000s",
    region: "national",
    p25: 88,
    p50: 120,
    p75: 160,
    source: "KEMCO 2024",
  },
  {
    useType: "residential",
    era: "2010s",
    region: "national",
    p25: 72,
    p50: 100,
    p75: 135,
    source: "KEMCO 2024",
  },
  {
    useType: "residential",
    era: "2020+",
    region: "national",
    p25: 55,
    p50: 80,
    p75: 110,
    source: "KEMCO 2024",
  },

  // ── Retail / 판매시설 ─────────────────────────────────────────────────
  {
    useType: "retail",
    era: "1990s",
    region: "national",
    p25: 225,
    p50: 310,
    p75: 420,
    source: "KEMCO 2024",
  },
  {
    useType: "retail",
    era: "2000s",
    region: "national",
    p25: 205,
    p50: 280,
    p75: 380,
    source: "KEMCO 2024",
  },
  {
    useType: "retail",
    era: "2010s",
    region: "national",
    p25: 180,
    p50: 250,
    p75: 340,
    source: "KEMCO 2024",
  },
  {
    useType: "retail",
    era: "2020+",
    region: "national",
    p25: 155,
    p50: 215,
    p75: 295,
    source: "KEMCO 2024",
  },

  // ── Hospital / 의료시설 ───────────────────────────────────────────────
  {
    useType: "hospital",
    era: "1990s",
    region: "national",
    p25: 290,
    p50: 390,
    p75: 510,
    source: "KEMCO 2024",
  },
  {
    useType: "hospital",
    era: "2000s",
    region: "national",
    p25: 265,
    p50: 350,
    p75: 460,
    source: "KEMCO 2024",
  },
  {
    useType: "hospital",
    era: "2010s",
    region: "national",
    p25: 240,
    p50: 320,
    p75: 420,
    source: "KEMCO 2024",
  },
  {
    useType: "hospital",
    era: "2020+",
    region: "national",
    p25: 210,
    p50: 285,
    p75: 375,
    source: "KEMCO 2024",
  },

  // ── Hotel / 숙박시설 ──────────────────────────────────────────────────
  {
    useType: "hotel",
    era: "1990s",
    region: "national",
    p25: 220,
    p50: 300,
    p75: 400,
    source: "KEMCO 2024",
  },
  {
    useType: "hotel",
    era: "2000s",
    region: "national",
    p25: 195,
    p50: 265,
    p75: 355,
    source: "KEMCO 2024",
  },
  {
    useType: "hotel",
    era: "2010s",
    region: "national",
    p25: 170,
    p50: 235,
    p75: 315,
    source: "KEMCO 2024",
  },
  {
    useType: "hotel",
    era: "2020+",
    region: "national",
    p25: 145,
    p50: 200,
    p75: 270,
    source: "KEMCO 2024",
  },

  // ── School / 교육시설 ─────────────────────────────────────────────────
  {
    useType: "school",
    era: "1990s",
    region: "national",
    p25: 120,
    p50: 175,
    p75: 235,
    source: "KEMCO 2024",
  },
  {
    useType: "school",
    era: "2000s",
    region: "national",
    p25: 105,
    p50: 150,
    p75: 205,
    source: "KEMCO 2024",
  },
  {
    useType: "school",
    era: "2010s",
    region: "national",
    p25: 88,
    p50: 128,
    p75: 175,
    source: "KEMCO 2024",
  },
  {
    useType: "school",
    era: "2020+",
    region: "national",
    p25: 72,
    p50: 105,
    p75: 145,
    source: "KEMCO 2024",
  },

  // ── Factory / 공장 ────────────────────────────────────────────────────
  // Factory energy use is highly process-dependent; wide IQR is intentional.
  {
    useType: "factory",
    era: "1990s",
    region: "national",
    p25: 210,
    p50: 330,
    p75: 520,
    source: "KEMCO 2024",
  },
  {
    useType: "factory",
    era: "2000s",
    region: "national",
    p25: 195,
    p50: 300,
    p75: 480,
    source: "KEMCO 2024",
  },
  {
    useType: "factory",
    era: "2010s",
    region: "national",
    p25: 175,
    p50: 275,
    p75: 440,
    source: "KEMCO 2024",
  },
  {
    useType: "factory",
    era: "2020+",
    region: "national",
    p25: 155,
    p50: 245,
    p75: 395,
    source: "KEMCO 2024",
  },
];
