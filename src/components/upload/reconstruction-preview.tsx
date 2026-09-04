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
import {
  pickOrthoZoom,
  tileBounds,
  tilesCovering,
} from "@/lib/cad-reconstruction/ortho-tiles";
import { createSceneProjection } from "@/lib/gis/gis-transform";

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
  /** Draw the aerial ortho under the plan, so the outline can be eyeballed. */
  showOrtho?: boolean;
}

/** One ortho tile placed in the model's millimetre frame. */
interface PlacedTile {
  key: string;
  href: string;
  xMm: number;
  /** North edge — the image's top, since SVG y grows downward. */
  yNorthMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Ortho tiles covering the plan, in the model's own frame.
 *
 * Each tile is placed by its own projected corners rather than by scaling a
 * mosaic, so a tile lands where its imagery actually is. Tiles are squares in
 * Web Mercator and very slightly not-squares in the site's Transverse Mercator;
 * over a building the difference is millimetres, and this overlay exists to be
 * looked at rather than measured from.
 *
 * Returns [] whenever the model is not georeferenced — an ungeoreferenced plan
 * has no defensible place to put imagery, and guessing would be worse than
 * showing none.
 */
function useOrthoTiles(model: ReconstructionModel, bounds: Bounds): PlacedTile[] {
  return useMemo(() => {
    const origin = model.frame.originLngLat;
    if (!origin) return [];

    try {
      const projection = createSceneProjection(origin[0], origin[1]);

      // Plan extent (mm) → metres → WGS84, to learn which tiles to ask for.
      const corners: Array<[number, number]> = [
        [bounds.minX, bounds.minY],
        [bounds.minX + bounds.width, bounds.minY + bounds.height],
      ].map(([x, y]) => projection.unproject(x / 1000, y / 1000));

      const lngs = corners.map((c) => c[0]);
      const lats = corners.map((c) => c[1]);
      const bbox = {
        west: Math.min(...lngs),
        east: Math.max(...lngs),
        south: Math.min(...lats),
        north: Math.max(...lats),
      };

      const spanM = Math.max(bounds.width, bounds.height) / 1000;
      const zoom = pickOrthoZoom(spanM, origin[1]);

      return tilesCovering(bbox, zoom).map((tile) => {
        const b = tileBounds(tile);
        const [westM, southM] = projection.project(b.west, b.south);
        const [eastM, northM] = projection.project(b.east, b.north);
        return {
          key: `${tile.z}/${tile.x}/${tile.y}`,
          href: `/api/imagery/ortho?z=${tile.z}&x=${tile.x}&y=${tile.y}`,
          xMm: westM * 1000,
          yNorthMm: northM * 1000,
          widthMm: (eastM - westM) * 1000,
          heightMm: (northM - southM) * 1000,
        };
      });
    } catch {
      // Outside the projection's supported bounds — no imagery rather than
      // imagery in the wrong place.
      return [];
    }
  }, [model.frame.originLngLat, bounds]);
}

export function ReconstructionPreview({
  model,
  levelId,
  size = 300,
  showOrtho = false,
}: Props) {
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

  const orthoTiles = useOrthoTiles(
    model,
    view?.b ?? { minX: 0, minY: 0, width: 1, height: 1 },
  );

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
      {showOrtho && orthoTiles.length > 0 && (
        <g opacity={0.85}>
          {orthoTiles.map((tile) => (
            <image
              key={tile.key}
              href={tile.href}
              x={tile.xMm}
              // Model +Y is north; SVG y grows downward. The plan group flips
              // once for everything else, so the imagery is placed in screen
              // coordinates here instead — an <image> inside that flip would
              // render mirrored.
              y={2 * view.b.minY + view.b.height - tile.yNorthMm}
              width={tile.widthMm}
              height={tile.heightMm}
              preserveAspectRatio="none"
            />
          ))}
        </g>
      )}

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
