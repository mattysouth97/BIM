import { useEffect, useMemo } from "react";

import type { CanonicalEnergyModel, EnergyFact, Polygon2D } from "@/lib/energy-diagnostics/types";
import type { DrawingSetIngestionResult } from "@/lib/energy-diagnostics/ingestion";
import type { DrawingSourceInput } from "@/lib/energy-diagnostics/ingestion";

import type { DiagnosisLocale } from "./types";

type PlotTransform = Readonly<{
  scale: number;
  offsetX: number;
  offsetY: number;
  minX: number;
  maxY: number;
}>;

function polygonTransform(polygons: readonly Polygon2D[]): PlotTransform {
  const points = polygons.flatMap((polygon) => polygon);
  if (points.length === 0) {
    return { scale: 1, offsetX: 80, offsetY: 70, minX: 0, maxY: 20 };
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(500 / Math.max(maxX - minX, 1), 340 / Math.max(maxY - minY, 1));
  return {
    scale,
    offsetX: 90,
    offsetY: 70,
    minX,
    maxY,
  };
}

function svgPoints(polygon: Polygon2D, transform: PlotTransform): string {
  return polygon
    .map(
      ([x, y]) =>
        `${transform.offsetX + (x - transform.minX) * transform.scale},${
          transform.offsetY + (transform.maxY - y) * transform.scale
        }`,
    )
    .join(" ");
}

function factLabel(fact: EnergyFact<unknown>): string {
  const raw = Array.isArray(fact.value)
    ? `${fact.value.length} pts`
    : typeof fact.value === "number"
      ? Number(fact.value.toFixed(3)).toString()
      : String(fact.value ?? "—");
  return `${fact.key.split(".").at(-1) ?? fact.key}: ${raw}${fact.unit ? ` ${fact.unit}` : ""}`;
}

export function SourceReviewCanvas({
  model,
  ingestion,
  source,
  documentId,
  selectedFactId,
  locale,
  onSelectFact,
  onSelectZone,
}: Readonly<{
  model: CanonicalEnergyModel;
  ingestion: DrawingSetIngestionResult | null;
  source?: DrawingSourceInput;
  documentId: string;
  selectedFactId: string | null;
  locale: DiagnosisLocale;
  onSelectFact: (fact: EnergyFact<unknown>) => void;
  onSelectZone: (zoneId: string) => void;
}>) {
  const document = model.drawingSet.documents.find((candidate) => candidate.id === documentId);
  const previewUrl = useMemo(() => {
    if (!document || !source) return null;
    if (document.format === "pdf" || document.format === "dxf" || document.format === "dwg") {
      return null;
    }
    if (document.format === "svg" && typeof source.content === "string") {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.content)}`;
    }
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      return null;
    }
    const sourceBytes =
      typeof source.content === "string"
        ? new TextEncoder().encode(source.content)
        : source.content instanceof ArrayBuffer
          ? new Uint8Array(source.content)
          : source.content;
    const copiedBytes = new Uint8Array(sourceBytes.byteLength);
    copiedBytes.set(sourceBytes);
    return URL.createObjectURL(
      new Blob([copiedBytes.buffer], {
        type: document.mimeType || source.mimeType || "application/octet-stream",
      }),
    );
  }, [document, source]);
  useEffect(
    () => () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  const documentFacts = useMemo(
    () => {
      const candidates = [
        ...(ingestion?.extractedFacts ?? []),
        ...model.facts,
      ].filter((fact) =>
        fact.sourceRefs.some((source) => source.documentId === documentId),
      );
      return [
        ...new Map(candidates.map((fact) => [fact.id, fact])).values(),
      ];
    },
    [documentId, ingestion, model.facts],
  );
  const boundaries = useMemo(
    () =>
      (ingestion?.extractedBoundaries ?? [])
        .filter((boundary) => boundary.documentId === documentId)
        .flatMap((boundary) => (boundary.polygon.value ? [boundary.polygon.value] : [])),
    [documentId, ingestion],
  );
  const isPlan = document?.classification.documentType === "floor_plan";
  const displayStorey = useMemo(() => {
    const plate = model.geometry.floorPlates.find((candidate) =>
      candidate.boundary.sourceRefs.some(
        (sourceReference) => sourceReference.documentId === documentId,
      ),
    );
    const space = model.geometry.spaces.find((candidate) =>
      candidate.boundary.sourceRefs.some(
        (sourceReference) => sourceReference.documentId === documentId,
      ),
    );
    const storeyId = plate?.storeyId ?? space?.storeyId;
    return (
      model.geometry.storeys.find((storey) => storey.id === storeyId) ??
      model.geometry.storeys[0] ??
      null
    );
  }, [documentId, model.geometry.floorPlates, model.geometry.spaces, model.geometry.storeys]);
  const displaySpaces = displayStorey
    ? model.geometry.spaces.filter((space) => space.storeyId === displayStorey.id)
    : [];
  const planPolygons = boundaries.length > 0
    ? boundaries
    : isPlan
      ? model.geometry.floorPlates
          .filter((plate) => plate.storeyId === displayStorey?.id)
          .flatMap((plate) => (plate.boundary.value ? [plate.boundary.value] : []))
      : [];
  const transform = polygonTransform(planPolygons);

  if (!document) {
    return (
      <div className="grid h-full min-h-96 place-items-center bg-slate-950 p-8 text-center text-slate-300">
        <p className="text-sm">{locale === "ko" ? "선택한 도면을 찾을 수 없습니다." : "The selected drawing is unavailable."}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[430px] overflow-hidden bg-[#071a29] text-slate-100" data-testid="source-review-canvas">
      <svg
        viewBox="0 0 720 500"
        className="h-full min-h-[430px] w-full"
        role="img"
        aria-label={`${document.fileName} ${locale === "ko" ? "도면 및 추출 오버레이" : "drawing and extraction overlay"}`}
      >
        <defs>
          <pattern id="diagnosis-grid-small" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#8eb1c7" strokeOpacity="0.08" strokeWidth="0.5" />
          </pattern>
          <pattern id="diagnosis-grid-large" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="url(#diagnosis-grid-small)" />
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#8eb1c7" strokeOpacity="0.14" strokeWidth="0.8" />
          </pattern>
          <filter id="evidence-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="missing-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="2" strokeOpacity="0.35" />
          </pattern>
        </defs>
        <rect width="720" height="500" fill="#071a29" />
        <rect width="720" height="500" fill="url(#diagnosis-grid-large)" />
        <text x="24" y="30" fill="#9fb7c6" fontSize="10" fontFamily="monospace" letterSpacing="1.4">
          {document.fileName.toUpperCase()} · REV {document.revision}
        </text>
        <text x="696" y="30" textAnchor="end" fill="#50b7e8" fontSize="9" fontFamily="monospace">
          {document.classification.documentType.replaceAll("_", " ").toUpperCase()}
        </text>

        {planPolygons.length > 0 ? (
          <g>
            {displaySpaces.map((space, index) => {
              const polygon = space.boundary.value;
              if (!polygon) return null;
              return (
                <g
                  key={space.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${space.name.value ?? space.id} ${locale === "ko" ? "열구역 선택" : "select thermal zone"}`}
                  onClick={() => space.thermalZoneId && onSelectZone(space.thermalZoneId)}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && space.thermalZoneId) {
                      event.preventDefault();
                      onSelectZone(space.thermalZoneId);
                    }
                  }}
                  className="cursor-pointer outline-none focus-visible:[&_polygon]:stroke-white"
                >
                  <polygon
                    points={svgPoints(polygon, transform)}
                    fill={space.conditioned.value ? (index % 2 ? "#1c6c86" : "#15576f") : "url(#missing-hatch)"}
                    fillOpacity={space.conditioned.value ? 0.24 : 0.7}
                    stroke="#5d879d"
                    strokeWidth="0.7"
                  />
                </g>
              );
            })}
            {planPolygons.map((polygon, index) => (
              <polyline
                key={`boundary-${index}`}
                points={svgPoints(polygon, transform)}
                fill="none"
                stroke="#62c8f4"
                strokeWidth="2.2"
                vectorEffect="non-scaling-stroke"
                filter="url(#evidence-glow)"
              />
            ))}
            {model.geometry.thermalZones
              .filter((zone) => zone.storeyIds.includes(displayStorey?.id ?? ""))
              .slice(0, 8)
              .map((zone, index) => {
              const sourceSpace = displaySpaces.find((space) => zone.sourceSpaceIds.includes(space.id));
              const boundary = sourceSpace?.boundary.value;
              if (!boundary) return null;
              const point = boundary[Math.floor(boundary.length / 2)] ?? boundary[0];
              const x = transform.offsetX + (point[0] - transform.minX) * transform.scale;
              const y = transform.offsetY + (transform.maxY - point[1]) * transform.scale;
              return (
                <text key={zone.id} x={x} y={y + index % 2 * 10} fill="#bcecff" fontSize="7.5" fontFamily="monospace">
                  {zone.name.value ?? zone.stableKey}
                </text>
              );
            })}
            {displayStorey && (
              <g transform="translate(538 455)">
                <rect width="92" height="18" rx="2" fill="#12384c" stroke="#54bce7" strokeOpacity="0.65" />
                <text x="46" y="12" textAnchor="middle" fill="#c8efff" fontSize="8" fontFamily="monospace">
                  {displayStorey.name.toUpperCase()}
                </text>
              </g>
            )}
            <line x1="630" y1="95" x2="630" y2="50" stroke="#f4f8fa" strokeWidth="1.5" />
            <path d="M630 45 l-5 11 h10z" fill="#f4f8fa" />
            <text x="630" y="39" textAnchor="middle" fill="#f4f8fa" fontSize="9" fontFamily="monospace">N</text>
          </g>
        ) : (
          <g>
            <rect x="54" y="70" width="612" height="350" rx="2" fill="#0b2334" stroke="#3f6378" />
            {previewUrl && (
              <image
                href={previewUrl}
                x="54"
                y="70"
                width="612"
                height="350"
                preserveAspectRatio="xMidYMid meet"
                opacity="0.92"
                data-testid="source-image-backdrop"
              />
            )}
            <line x1="76" y1="116" x2="642" y2="116" stroke="#41677c" strokeWidth="1" />
            <text x="78" y="97" fill="#d7e7ef" fontSize="14" fontFamily="monospace">
              {document.classification.documentType.replaceAll("_", " ").toUpperCase()}
            </text>
            {documentFacts.map((fact, index) => {
              const source = fact.sourceRefs[0];
              const box = source?.boundingBox ?? { x: 76, y: 138 + index * 48, width: 360, height: 30 };
              const x = Math.min(520, 76 + box.x * 0.35);
              const y = Math.min(370, 126 + box.y * 0.42 + index * 28);
              const selected = selectedFactId === fact.id;
              return (
                <g
                  key={fact.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={factLabel(fact)}
                  onClick={() => onSelectFact(fact)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectFact(fact);
                    }
                  }}
                  className="cursor-pointer outline-none"
                  data-testid={`source-fact-${fact.id}`}
                >
                  <rect
                    x={x}
                    y={y}
                    width={Math.min(500, Math.max(280, box.width * 2.2))}
                    height="28"
                    rx="2"
                    fill={selected ? "#e89b2f" : "#15384b"}
                    fillOpacity={selected ? 0.28 : 0.9}
                    stroke={selected ? "#ffc35a" : "#4d778c"}
                    strokeWidth={selected ? 2 : 0.8}
                    filter={selected ? "url(#evidence-glow)" : undefined}
                  />
                  <text x={x + 10} y={y + 18} fill={selected ? "#ffe4ad" : "#bcd3df"} fontSize="9" fontFamily="monospace">
                    {(source?.originalText ?? factLabel(fact)).slice(0, 72)}
                  </text>
                  {selected && <line x1={x + Math.min(500, Math.max(280, box.width * 2.2))} y1={y + 14} x2="720" y2={y + 14} stroke="#ffc35a" strokeDasharray="5 4" />}
                </g>
              );
            })}
          </g>
        )}

        <g transform="translate(24 454)">
          <rect width="672" height="28" fill="#0b2231" stroke="#315468" />
          <text x="10" y="18" fill="#9db7c6" fontSize="8.5" fontFamily="monospace">
            {locale === "ko" ? "벡터 우선 · 실제 치수만 사용 · 미보정 래스터 형상 제외" : "VECTOR FIRST · EXPLICIT DIMENSIONS ONLY · UNCALIBRATED RASTER EXCLUDED"}
          </text>
          <text x="660" y="18" textAnchor="end" fill="#63c7ee" fontSize="8.5" fontFamily="monospace">
            {document.units.value ?? "UNIT ?"} · {document.drawingScale.value ?? "SCALE ?"}
          </text>
        </g>
      </svg>
      <div className="pointer-events-none absolute right-0 top-1/2 h-px w-7 bg-amber-300/80" aria-hidden="true" />
      <div className="pointer-events-none absolute right-5 top-[calc(50%-3px)] size-1.5 rotate-45 bg-amber-300" aria-hidden="true" />
    </div>
  );
}
