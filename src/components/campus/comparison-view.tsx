"use client";

// src/components/campus/comparison-view.tsx
// Side-by-side comparison of 2-4 buildings across energy and envelope metrics.
// Uses simple HTML/CSS bars and an SVG radar chart — no external chart libraries.

import type { ComparisonResult, ComparisonMetric } from "@/lib/campus/comparison-engine";

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Classify a normalized score into a color token */
function scoreColor(normalized: number, isBest: boolean, isWorst: boolean): string {
  if (isBest) return "#22c55e";   // green-500
  if (isWorst) return "#ef4444";  // red-500
  // Middle range: interpolate toward yellow
  if (normalized >= 0.5) return "#eab308"; // yellow-500
  return "#f97316"; // orange-500 (below median but not worst)
}

// ─── Bar chart row ────────────────────────────────────────────────────────────

interface BarRowProps {
  metric: ComparisonMetric;
}

function BarRow({ metric }: BarRowProps) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{metric.label}</span>
        <span className="text-[10px] text-gray-400">{metric.unit}</span>
      </div>
      <div className="flex flex-col gap-1">
        {metric.values.map((v) => {
          const isBest = v.buildingId === metric.best;
          const isWorst = v.buildingId === metric.worst;
          const color = scoreColor(v.normalized, isBest, isWorst);
          const barPct = Math.max(v.normalized * 100, 2); // min 2% for visibility
          return (
            <div key={v.buildingId} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-24 truncate shrink-0">
                {v.buildingName}
              </span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-gray-600 w-14 text-right shrink-0">
                {v.value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Radar / spider chart ─────────────────────────────────────────────────────

const RADAR_SIZE = 200;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 80;
const RADAR_LEVELS = 4;

/** Convert polar (angle, radius) to SVG cartesian coords */
function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: RADAR_CENTER + r * Math.cos(rad),
    y: RADAR_CENTER + r * Math.sin(rad),
  };
}

function pointsStr(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** BUILDING_COLORS — up to 4 distinct colors */
const BUILDING_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6", "#10b981"];

interface RadarChartProps {
  result: ComparisonResult;
}

function RadarChart({ result }: RadarChartProps) {
  const { metrics, buildings } = result;
  if (metrics.length === 0) return null;

  const n = metrics.length;
  const angleStep = 360 / n;

  // Grid rings
  const rings = Array.from({ length: RADAR_LEVELS }, (_, i) => {
    const r = (RADAR_RADIUS * (i + 1)) / RADAR_LEVELS;
    const pts = Array.from({ length: n }, (_, j) => polar(j * angleStep, r));
    return pointsStr(pts);
  });

  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => {
    const end = polar(i * angleStep, RADAR_RADIUS);
    return end;
  });

  // Axis labels
  const labelPts = Array.from({ length: n }, (_, i) => ({
    ...polar(i * angleStep, RADAR_RADIUS + 18),
    label: metrics[i].label,
  }));

  // One polygon per building
  const polygons = buildings.map((b, bi) => {
    const pts = metrics.map((m, mi) => {
      const entry = m.values.find((v) => v.buildingId === b.id);
      const norm = entry ? entry.normalized : 0;
      return polar(mi * angleStep, norm * RADAR_RADIUS);
    });
    return { id: b.id, name: b.name, pts, color: BUILDING_COLORS[bi % BUILDING_COLORS.length] };
  });

  return (
    <div className="flex flex-col items-center">
      <svg
        width={RADAR_SIZE}
        height={RADAR_SIZE}
        viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
        aria-label="Radar chart comparing building metrics"
      >
        {/* Grid rings */}
        {rings.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {axes.map((end, i) => (
          <line
            key={i}
            x1={RADAR_CENTER}
            y1={RADAR_CENTER}
            x2={end.x.toFixed(1)}
            y2={end.y.toFixed(1)}
            stroke="#d1d5db"
            strokeWidth="1"
          />
        ))}

        {/* Building polygons */}
        {polygons.map((poly) => (
          <polygon
            key={poly.id}
            points={pointsStr(poly.pts)}
            fill={poly.color}
            fillOpacity={0.18}
            stroke={poly.color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ))}

        {/* Axis labels */}
        {labelPts.map((lp, i) => {
          const anchor =
            lp.x < RADAR_CENTER - 4
              ? "end"
              : lp.x > RADAR_CENTER + 4
                ? "start"
                : "middle";
          return (
            <text
              key={i}
              x={lp.x.toFixed(1)}
              y={lp.y.toFixed(1)}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize="8"
              fill="#6b7280"
            >
              {lp.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-1">
        {polygons.map((poly) => (
          <div key={poly.id} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: poly.color }}
            />
            <span className="text-[10px] text-gray-600 truncate max-w-[80px]">{poly.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary table ────────────────────────────────────────────────────────────

interface SummaryTableProps {
  result: ComparisonResult;
}

function SummaryTable({ result }: SummaryTableProps) {
  const { metrics, buildings } = result;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            <th className="text-left py-1.5 pr-3 font-medium text-gray-500 border-b border-gray-200">
              Metric
            </th>
            {buildings.map((b, i) => (
              <th
                key={b.id}
                className="text-right py-1.5 px-2 font-medium border-b border-gray-200"
                style={{ color: BUILDING_COLORS[i % BUILDING_COLORS.length] }}
              >
                {b.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.label} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                {m.label}
                <span className="ml-1 text-gray-400">({m.unit})</span>
              </td>
              {m.values.map((v) => {
                const isBest = v.buildingId === m.best;
                const isWorst = v.buildingId === m.worst;
                const color = scoreColor(v.normalized, isBest, isWorst);
                return (
                  <td
                    key={v.buildingId}
                    className="py-1.5 px-2 text-right tabular-nums font-medium"
                    style={{ color }}
                  >
                    {v.value.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ComparisonViewProps {
  result: ComparisonResult;
  /** Optional CSS class for the outer wrapper */
  className?: string;
}

export function ComparisonView({ result, className = "" }: ComparisonViewProps) {
  const { buildings, metrics } = result;

  if (buildings.length === 0) {
    return (
      <div className={`rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground ${className}`}>
        No buildings to compare.
      </div>
    );
  }

  return (
    <div className={`rounded-lg border bg-card shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold text-gray-900">
          Building Comparison
        </h2>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {buildings.length} buildings · {metrics.length} metrics · green = best, red = worst
        </p>
      </div>

      <div className="p-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: bar charts */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Metric Bars (normalized)
          </p>
          {metrics.map((m) => (
            <BarRow key={m.label} metric={m} />
          ))}
        </div>

        {/* Right: radar + summary table */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Radar Overview
            </p>
            <RadarChart result={result} />
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Raw Values
            </p>
            <SummaryTable result={result} />
          </div>
        </div>
      </div>
    </div>
  );
}
