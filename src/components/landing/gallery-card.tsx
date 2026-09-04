"use client";

import Link from "next/link";

import {
  datumRange,
  widestStoreyAreaSqm,
  type GalleryDatum,
  type GalleryItem,
} from "@/lib/landing/gallery";

/**
 * The plate is a *section datum diagram*, not a picture of the building.
 *
 * There is no render of this model and no extracted footprint, so anything
 * shaped like a building would be invented — and an invented outline on a
 * gallery card is read as the building's real shape. What the model does state
 * is where each storey sits and how much floor it carries, so the diagram uses
 * both axes for exactly that: height is the storey's real elevation, bar
 * length is its room floor area against the largest storey. The roof level
 * comes out as the sliver it is rather than as a third floor.
 *
 * Everything inside the SVG is Latin or numeric on purpose. The drawing faces
 * are `--font-mono-data` (JetBrains Mono) and `--font-geist-sans`, both
 * latin-subset; a Hangul glyph in here renders as a tofu box rather than
 * falling through to a Korean face. Korean labelling lives in HTML beneath.
 */
const PLATE = {
  w: 320,
  h: 226,
  /** Headroom above the top datum, so a roof-level bar has somewhere to sit. */
  roofBand: 26,
  top: 14,
  bottom: 22,
  left: 104,
  right: 34,
} as const;

function SectionPlate({
  datums,
  isKo,
}: {
  datums: readonly GalleryDatum[];
  isKo: boolean;
}) {
  const { minM, maxM } = datumRange(datums);
  const span = maxM - minM || 1;
  const topY = PLATE.top + PLATE.roofBand;
  const bottomY = PLATE.h - PLATE.bottom;
  const y = (m: number) => bottomY - (bottomY - topY) * ((m - minM) / span);

  // High to low, so each storey can find the datum above it — which is what
  // gives its bar a height.
  const ordered = [...datums].sort((a, b) => b.elevationM - a.elevationM);
  const widest = widestStoreyAreaSqm(datums) || 1;
  const fullWidth = PLATE.w - PLATE.left - PLATE.right;

  const spoken = ordered
    .map((d) =>
      isKo
        ? `${d.name} ${d.elevationM.toFixed(3)}미터, 실 ${d.rooms}개, ${d.roomAreaSqm}제곱미터`
        : `${d.name} at ${d.elevationM.toFixed(3)} metres, ${d.rooms} rooms, ${d.roomAreaSqm} square metres`,
    )
    .join(". ");

  return (
    <svg
      viewBox={`0 0 ${PLATE.w} ${PLATE.h}`}
      className="gallery-plate-svg"
      role="img"
      aria-label={
        isKo ? `층별 단면도. ${spoken}` : `Storey section diagram. ${spoken}`
      }
    >
      {ordered.map((datum, index) => {
        if (datum.rooms === 0) return null;
        // The topmost storey has no datum above it, so its bar sits in the
        // headroom reserved for exactly that.
        const above = ordered[index - 1];
        const barTop = above ? y(above.elevationM) : PLATE.top;
        const barBottom = y(datum.elevationM);
        const width = Math.max(2, fullWidth * (datum.roomAreaSqm / widest));
        return (
          <g key={`bar-${datum.name}`}>
            <rect
              x={PLATE.left}
              y={barTop}
              width={width}
              height={barBottom - barTop}
              className="gallery-plate-band"
            />
            <text
              x={PLATE.left + width + 5}
              y={(barTop + barBottom) / 2 + 3}
              className="gallery-plate-count"
            >
              {datum.rooms}
            </text>
          </g>
        );
      })}

      {ordered.map((datum) => {
        const ly = y(datum.elevationM);
        const occupied = datum.rooms > 0;
        return (
          <g key={`datum-${datum.name}`}>
            <line
              x1={PLATE.left - 8}
              x2={PLATE.w - PLATE.right}
              y1={ly}
              y2={ly}
              className={occupied ? "gallery-datum-line" : "gallery-datum-line-thin"}
            />
            {/* Name and elevation on ONE line. Two lines need ~17px, and the
                ground floor sits 1 m above the footing — 17px at this scale —
                so stacked labels collided on every render. */}
            <text
              x={PLATE.left - 12}
              y={ly + 3}
              textAnchor="end"
              className="gallery-datum-name"
            >
              {datum.name}
              <tspan className="gallery-datum-elev" dx="6">
                {datum.elevationM >= 0 ? "+" : "−"}
                {Math.abs(datum.elevationM).toFixed(3)}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function GalleryCard({ item, isKo }: { item: GalleryItem; isKo: boolean }) {
  const title = isKo ? item.koTitle : item.enTitle;
  const statusLabel =
    item.status === "modelling"
      ? isKo
        ? "모델링 중"
        : "In modelling"
      : isKo
        ? "공개"
        : "Published";

  return (
    <article
      className={`gallery-card group relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card${
        item.href ? " transition-colors hover:border-foreground/30" : ""
      }`}
      data-testid={`gallery-item-${item.id}`}
      aria-labelledby={`gallery-item-${item.id}-title`}
    >
      {/* The whole card is the target when there is something to open, but the
          link wraps only the title: a card is a block of stated figures, and
          nesting them inside an anchor would read the lot out as one link name
          to a screen reader. The overlay gives the pointer the full area
          without costing that. `z-0` on the plate keeps the SVG below it. */}
      {item.href ? (
        <Link
          href={item.href}
          className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          data-testid={`gallery-item-${item.id}-link`}
        >
          <span className="sr-only">
            {isKo ? `${title} 모델 열기` : `Open the ${title} model`}
          </span>
        </Link>
      ) : null}

      <div className="gallery-plate relative z-0 border-b border-border">
        <SectionPlate datums={item.datums} isKo={isKo} />
      </div>

      {/* The plate's caption. It sits in HTML rather than in the drawing so it
          can be Korean without hitting the latin-subset drawing faces. */}
      <p className="border-b border-border px-4 py-2 text-[10px] leading-4 text-muted-foreground">
        {isKo
          ? "층별 단면 — 높이는 실제 레벨, 막대 길이는 그 층의 실 면적, 숫자는 실 수"
          : "Storey section — height is the real level, bar length that level's floor area, the number its room count"}
      </p>

      {/* The title block, laid out the way a drawing sheet lays one out: the
          name, what it is, and the state it is in. */}
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2
            id={`gallery-item-${item.id}-title`}
            className="gallery-title truncate text-foreground"
          >
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {isKo ? item.koUse : item.enUse}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          data-testid={`gallery-item-${item.id}-status`}
        >
          {statusLabel}
        </span>
      </header>

      {/* Stated values only. `read` names what each one was counted from AND
          what was excluded, so a reader can check any line against the file
          rather than trust it. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3.5">
        {item.figures.map((figure) => (
          <div key={figure.id} className="min-w-0">
            <dt className="truncate text-[10px] text-muted-foreground">
              {isKo ? figure.ko : figure.en}
            </dt>
            <dd className="gallery-figure mt-0.5 truncate text-foreground">
              {figure.value}
            </dd>
            <dd
              className="truncate text-[9px] text-muted-foreground/80"
              title={figure.read}
            >
              {figure.read}
            </dd>
          </div>
        ))}
      </dl>

      <footer className="mt-auto border-t border-border px-4 py-2.5">
        <p className="landing-stamp text-[9px] text-muted-foreground">
          {item.modelFile}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          {item.ifcSchema} {item.viewDefinition} · {item.authoringTool} ·{" "}
          {item.modelDate}
        </p>
        {/* CC BY requires the credit to travel with the work, so this renders
            verbatim and in full rather than being trimmed to fit the card. */}
        <p
          className="mt-1.5 text-[10px] leading-4 text-muted-foreground"
          data-testid={`gallery-item-${item.id}-attribution`}
        >
          {item.attribution} — {item.licence}
        </p>
        <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
          {isKo
            ? "모델이 말하는 값만 적었습니다. 열관류율·기밀·설비·기후는 이 모델에 없습니다."
            : "Only what the model states. It carries no U-value, airtightness, HVAC or climate."}
        </p>
      </footer>
    </article>
  );
}
