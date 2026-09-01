"use client";

// src/components/upload/reconstruction-preview.tsx
//
// Visual QA surface for a reconstruction. Colour encodes provenance, not
// prettiness: observed geometry reads solid, inferred geometry reads dashed
// and amber, contradictions read red. A reviewer should be able to tell what
// is evidence and what is reconstruction without opening a report.

import { useMemo } from "react";

import type {
  EvidenceGrade,
  ReconstructionModel,
} from "@/lib/cad-reconstruction";

const GRADE_STROKE: Record<EvidenceGrade, string> = {
  "A-VERIFIED": "#111827",
  "B-OBSERVED": "#111827",
  "C-CALCULATED": "#2563eb",
  "D-INFERRED": "#b45309",
  "X-UNRESOLVED": "#dc2626",
};

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function boundsOf(rings: Array<readonly (readonly [number, number])[]>): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 };
  return { minX, minY, width: maxX - minX || 1, height: maxY - minY || 1 };
}

interface Props {
  model: ReconstructionModel;
  levelId: string;
  size?: number;
}

export function ReconstructionPreview({ model, levelId, size = 300 }: Props) {
  const level = model.levels.find((l) => l.id === levelId) ?? model.levels[0];

  const view = useMemo(() => {
    if (!level) return null;
    const rings = [level.plate, ...(model.core ? [model.core.ring] : [])];
    const b = boundsOf(rings);
    const pad = Math.max(b.width, b.height) * 0.08;
    return {
      vb: `${b.minX - pad} ${b.minY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`,
      stroke: Math.max(b.width, b.height) / 220,
      b,
    };
  }, [level, model.core]);

  if (!level || !view) return null;

  const path = (ring: readonly (readonly [number, number])[]) =>
    ring.map(([x, y]) => `${x},${y}`).join(" ");

  const openings = model.openings.filter((o) => o.levelId === level.id);

  return (
    <svg
      width={size}
      height={size}
      viewBox={view.vb}
      // Plan north is +Y; SVG grows downward, so flip once around the group.
      className="rounded border bg-white"
      role="img"
      aria-label={`${level.name} 복원 평면 미리보기`}
    >
      <g transform={`translate(0, ${2 * view.b.minY + view.b.height}) scale(1, -1)`}>
        {model.grid.xLines.map((x) => (
          <line
            key={`gx-${x}`}
            x1={x}
            y1={view.b.minY}
            x2={x}
            y2={view.b.minY + view.b.height}
            stroke="#cbd5e1"
            strokeWidth={view.stroke * 0.5}
            strokeDasharray={`${view.stroke * 6} ${view.stroke * 4}`}
          />
        ))}
        {model.grid.yLines.map((y) => (
          <line
            key={`gy-${y}`}
            x1={view.b.minX}
            y1={y}
            x2={view.b.minX + view.b.width}
            y2={y}
            stroke="#cbd5e1"
            strokeWidth={view.stroke * 0.5}
            strokeDasharray={`${view.stroke * 6} ${view.stroke * 4}`}
          />
        ))}

        <polygon
          points={path(level.plate)}
          fill="rgba(148,163,184,0.12)"
          stroke={GRADE_STROKE[level.plateGrade]}
          strokeWidth={view.stroke * 2}
          strokeDasharray={
            level.plateGrade === "D-INFERRED" || level.plateGrade === "X-UNRESOLVED"
              ? `${view.stroke * 8} ${view.stroke * 5}`
              : undefined
          }
        />

        {model.core && (
          <polygon
            points={path(model.core.ring)}
            fill="rgba(180,83,9,0.10)"
            stroke={GRADE_STROKE[model.core.grade]}
            strokeWidth={view.stroke * 1.5}
            strokeDasharray={`${view.stroke * 8} ${view.stroke * 5}`}
          />
        )}

        {model.grid.columns.map((c, i) => (
          <rect
            key={`col-${i}`}
            x={c[0] - model.grid.columnSizeMm / 2}
            y={c[1] - model.grid.columnSizeMm / 2}
            width={model.grid.columnSizeMm}
            height={model.grid.columnSizeMm}
            fill="none"
            stroke={GRADE_STROKE["D-INFERRED"]}
            strokeWidth={view.stroke}
          />
        ))}

        {openings.map((op) => (
          <line
            key={op.id}
            x1={op.plan[0][0]}
            y1={op.plan[0][1]}
            x2={op.plan[1][0]}
            y2={op.plan[1][1]}
            stroke={op.type === "door" ? "#0f766e" : "#2563eb"}
            strokeWidth={view.stroke * 3.5}
            strokeLinecap="butt"
          />
        ))}
      </g>
    </svg>
  );
}

export function GradeDot({ grade }: { grade: EvidenceGrade }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: GRADE_STROKE[grade] }}
      aria-hidden
    />
  );
}
