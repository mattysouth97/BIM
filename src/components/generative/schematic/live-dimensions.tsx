// src/components/generative/schematic/live-dimensions.tsx
//
// Edge lengths and area, in metres, overlaid on a ring. Pure placement math
// lives in edit-geometry so tests do not need a DOM.

import type { PointMm } from "@/lib/generative/blueprint";
import {
  edgeLengthMm,
  edgeMidpoint,
  formatAreaM2,
  formatMetres,
  ringAreaMm2,
} from "@/lib/generative/blueprint";

import type { ScreenPoint } from "./view-transform";

const MIN_EDGE_PX = 28;

export function DimensionLabels({
  points,
  closed,
  project,
  showArea = true,
}: {
  points: readonly PointMm[];
  closed: boolean;
  project: (point: PointMm) => ScreenPoint;
  showArea?: boolean;
}) {
  if (points.length < 2) return null;
  const count = closed ? points.length : points.length - 1;
  const labels: Array<{ key: string; x: number; y: number; text: string }> = [];

  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = edgeLengthMm(a, b);
    if (length < 1) continue;
    const mid = project(edgeMidpoint(a, b));
    const sa = project(a);
    const sb = project(b);
    const screenLen = Math.hypot(sb.x - sa.x, sb.y - sa.y);
    if (screenLen < MIN_EDGE_PX) continue;
    const nx = screenLen === 0 ? 0 : -((sb.y - sa.y) / screenLen) * 10;
    const ny = screenLen === 0 ? 0 : ((sb.x - sa.x) / screenLen) * 10;
    labels.push({
      key: `e-${i}`,
      x: mid.x + nx,
      y: mid.y + ny,
      text: formatMetres(length),
    });
  }

  if (showArea && closed && points.length >= 3) {
    const area = ringAreaMm2(points);
    if (area >= 100_000) {
      const cx = points.reduce((s, p) => s + p.xMm, 0) / points.length;
      const cz = points.reduce((s, p) => s + p.zMm, 0) / points.length;
      const c = project({ xMm: cx, zMm: cz });
      labels.push({ key: "area", x: c.x, y: c.y, text: formatAreaM2(area) });
    }
  }

  return (
    <g data-testid="live-dimensions" className="pointer-events-none">
      {labels.map((label) => (
        <text
          key={label.key}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-blue-700"
          style={{ fontSize: label.key === "area" ? 11 : 10, fontFamily: "ui-monospace, monospace" }}
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}
