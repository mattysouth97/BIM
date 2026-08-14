/** Code-built section elevation of the demo office. No type baked in the drawing. */
export function ElevationDrawing({ label }: { label: string }) {
  return (
    <figure className="lj-elevation">
      <svg
        viewBox="0 0 920 240"
        role="img"
        aria-label={label}
        className="lj-elevation-svg"
      >
        {/* ground */}
        <line x1="24" y1="196" x2="896" y2="196" className="lj-ink" />
        <line x1="24" y1="198.5" x2="896" y2="198.5" className="lj-ink-soft" />

        {/* grade hatch */}
        {Array.from({ length: 28 }, (_, i) => {
          const x = 40 + i * 30;
          return (
            <line
              key={x}
              x1={x}
              y1="198.5"
              x2={x - 8}
              y2="210"
              className="lj-ink-faint"
            />
          );
        })}

        {/* building mass — 10 floors, 34m × ~36m, scaled */}
        <g transform="translate(170 16)">
          <rect x="0" y="0" width="520" height="180" className="lj-mass" />
          {/* slabs */}
          {Array.from({ length: 11 }, (_, i) => (
            <line
              key={i}
              x1="0"
              y1={i * 18}
              x2="520"
              y2={i * 18}
              className="lj-ink-soft"
            />
          ))}
          {/* core */}
          <rect x="228" y="18" width="64" height="162" className="lj-core" />
          <line x1="228" y1="18" x2="228" y2="180" className="lj-ink" />
          <line x1="292" y1="18" x2="292" y2="180" className="lj-ink" />
          {/* stair ticks in core */}
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`s${i}`}
              x1="236"
              y1={28 + i * 16}
              x2="284"
              y2={36 + i * 16}
              className="lj-ink-faint"
            />
          ))}
          {/* punched windows — left + right bays */}
          {Array.from({ length: 10 }, (_, floor) =>
            Array.from({ length: 6 }, (_, bay) => {
              const x = 14 + bay * 34;
              const y = 5 + floor * 18;
              return (
                <rect
                  key={`l${floor}-${bay}`}
                  x={x}
                  y={y}
                  width="22"
                  height="11"
                  className="lj-glass"
                />
              );
            }),
          )}
          {Array.from({ length: 10 }, (_, floor) =>
            Array.from({ length: 6 }, (_, bay) => {
              const x = 306 + bay * 34;
              const y = 5 + floor * 18;
              return (
                <rect
                  key={`r${floor}-${bay}`}
                  x={x}
                  y={y}
                  width="22"
                  height="11"
                  className="lj-glass"
                />
              );
            }),
          )}
          {/* parapet */}
          <rect x="-2" y="-4" width="524" height="6" className="lj-mass-stroke" />
        </g>

        {/* scale bar */}
        <g transform="translate(170 214)">
          <line x1="0" y1="0" x2="80" y2="0" className="lj-ink" />
          <line x1="0" y1="-4" x2="0" y2="4" className="lj-ink" />
          <line x1="40" y1="-3" x2="40" y2="3" className="lj-ink" />
          <line x1="80" y1="-4" x2="80" y2="4" className="lj-ink" />
          <text x="0" y="16" className="lj-scale-text" textAnchor="middle">
            0
          </text>
          <text x="80" y="16" className="lj-scale-text" textAnchor="middle">
            10m
          </text>
        </g>
      </svg>
    </figure>
  );
}
