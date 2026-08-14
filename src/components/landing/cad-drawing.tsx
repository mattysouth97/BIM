"use client";

type Mode = "drawing" | "void";

export function CadDrawing({
  mode,
  hoveredFloor,
  onFloorHover,
  onRaise,
  label,
  voidLabel,
}: {
  mode: Mode;
  hoveredFloor: number | null;
  onFloorHover: (floor: number | null) => void;
  onRaise: () => void;
  label: string;
  voidLabel: string;
}) {
  return (
    <svg
      viewBox="0 0 1100 620"
      role="img"
      aria-label={label}
      className="cad-svg"
    >
      {/* sheet grid */}
      {Array.from({ length: 22 }, (_, i) => (
        <line
          key={`vg${i}`}
          x1={40 + i * 48}
          y1="16"
          x2={40 + i * 48}
          y2="604"
          className="cad-grid"
        />
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <line
          key={`hg${i}`}
          x1="24"
          y1={16 + i * 48}
          x2="1076"
          y2={16 + i * 48}
          className="cad-grid"
        />
      ))}

      {/* crop marks */}
      <path d="M24 16 H56 M24 16 V48" className="cad-ink" />
      <path d="M1076 16 H1044 M1076 16 V48" className="cad-ink" />
      <path d="M24 604 H56 M24 604 V572" className="cad-ink" />
      <path d="M1076 604 H1044 M1076 604 V572" className="cad-ink" />

      {/* ELEVATION */}
      <g transform="translate(80 48)">
        <text x="0" y="0" className="cad-anno">
          EL. SOUTH
        </text>
        <line x1="0" y1="372" x2="620" y2="372" className="cad-ink" />
        {Array.from({ length: 20 }, (_, i) => (
          <line
            key={`hatch${i}`}
            x1={10 + i * 30}
            y1="372"
            x2={2 + i * 30}
            y2="386"
            className="cad-ink-soft"
          />
        ))}

        {mode === "void" ? (
          <g>
            <rect
              x="80"
              y="80"
              width="440"
              height="292"
              className="cad-dash"
            />
            <text x="300" y="230" textAnchor="middle" className="cad-void">
              {voidLabel}
            </text>
          </g>
        ) : (
          <g
            className="cad-mass"
            role="button"
            tabIndex={0}
            onClick={onRaise}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRaise();
              }
            }}
          >
            <rect x="80" y="80" width="440" height="292" className="cad-mass-fill" />
            {Array.from({ length: 11 }, (_, i) => (
              <line
                key={`slab${i}`}
                x1="80"
                y1={80 + i * 26.5}
                x2="520"
                y2={80 + i * 26.5}
                className={hoveredFloor === i ? "cad-ink-hot" : "cad-ink-soft"}
                onPointerEnter={() => i < 10 && onFloorHover(i)}
                onPointerLeave={() => onFloorHover(null)}
              />
            ))}
            <rect x="268" y="106" width="64" height="266" className="cad-core" />
            <line x1="268" y1="106" x2="268" y2="372" className="cad-ink" />
            <line x1="332" y1="106" x2="332" y2="372" className="cad-ink" />
            {Array.from({ length: 10 }, (_, floor) =>
              Array.from({ length: 5 }, (_, bay) => (
                <rect
                  key={`wL${floor}-${bay}`}
                  x={92 + bay * 34}
                  y={88 + floor * 26.5}
                  width="22"
                  height="14"
                  className="cad-win"
                />
              )),
            )}
            {Array.from({ length: 10 }, (_, floor) =>
              Array.from({ length: 5 }, (_, bay) => (
                <rect
                  key={`wR${floor}-${bay}`}
                  x={348 + bay * 34}
                  y={88 + floor * 26.5}
                  width="22"
                  height="14"
                  className="cad-win"
                />
              )),
            )}
            <rect x="78" y="74" width="444" height="8" className="cad-mass-fill" />
          </g>
        )}

        <g transform="translate(80 404)">
          <line x1="0" y1="0" x2="88" y2="0" className="cad-ink" />
          <line x1="0" y1="-4" x2="0" y2="4" className="cad-ink" />
          <line x1="88" y1="-4" x2="88" y2="4" className="cad-ink" />
          <text x="0" y="16" textAnchor="middle" className="cad-dim">
            0
          </text>
          <text x="88" y="16" textAnchor="middle" className="cad-dim">
            10.0
          </text>
        </g>
      </g>

      {/* PLAN */}
      <g transform="translate(740 80)">
        <text x="0" y="0" className="cad-anno">
          PL. L01
        </text>
        {mode === "void" ? (
          <rect x="8" y="24" width="220" height="156" className="cad-dash" />
        ) : (
          <g>
            <rect x="8" y="24" width="220" height="156" className="cad-mass-fill" />
            <rect x="88" y="72" width="56" height="56" className="cad-core" />
            <line x1="8" y1="102" x2="228" y2="102" className="cad-ink-soft" />
            <line x1="118" y1="24" x2="118" y2="180" className="cad-ink-soft" />
            {Array.from({ length: 5 }, (_, i) => (
              <rect
                key={`pw${i}`}
                x={20 + i * 42}
                y="24"
                width="18"
                height="6"
                className="cad-win"
              />
            ))}
          </g>
        )}
        <text x="8" y="200" className="cad-dim">
          34.0
        </text>
        <text x="236" y="110" className="cad-dim">
          24.0
        </text>
        {/* north */}
        <g transform="translate(248 40)">
          <line x1="0" y1="28" x2="0" y2="0" className="cad-ink" />
          <polygon points="0,-4 -4,6 4,6" className="cad-fill" />
          <text x="0" y="42" textAnchor="middle" className="cad-anno">
            N
          </text>
        </g>
      </g>
    </svg>
  );
}
