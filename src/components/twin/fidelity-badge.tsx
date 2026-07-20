'use client';

// src/components/twin/fidelity-badge.tsx
// Small badge showing the current fidelity level (L1/L2/L3) with a tooltip
// listing available data sources for that level, plus per-input provenance
// (footprint / heights / facade) showing measured vs estimated.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FidelityLevel } from '@/lib/fidelity/fidelity-types';

/** Per-input provenance — which inputs are measured vs estimated */
export interface InputProvenance {
  /** Whether the building footprint comes from a measured cadastral source or is estimated */
  footprint: 'measured' | 'estimated';
  /** Whether floor heights come from calibration/ledger data or are era-recipe estimates */
  heights: 'measured' | 'estimated';
  /** Whether the facade (window ratio, material) is from measured data or era defaults */
  facade: 'measured' | 'estimated';
}

interface FidelityBadgeProps {
  level: FidelityLevel;
  completeness?: number; // 0-1
  className?: string;
  /** Optional per-input provenance breakdown. When provided, shown in the tooltip. */
  provenance?: InputProvenance;
}

const LEVEL_CONFIG: Record<
  FidelityLevel,
  { label: string; className: string; sources: string[] }
> = {
  1: {
    label: 'L1 · Public Data',
    className: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100',
    sources: [
      'Building Geometry (from registry)',
      'Structure Codes',
      'Permit Date',
      'Use Type',
    ],
  },
  2: {
    label: 'L2 · Enhanced',
    className:
      'bg-green-100 text-green-700 border-green-200 hover:bg-green-100',
    sources: [
      'All Level 1 sources',
      'Energy Consumption (uploaded bills)',
      'Floor Plans (uploaded drawings)',
      'Material Specifications',
    ],
  },
  3: {
    label: 'L3 · Full Model',
    className:
      'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100',
    sources: [
      'All Level 2 sources',
      'IFC Model (full BIM)',
      'Equipment Schedule',
      'Live Sensor Data',
    ],
  },
};

const PROVENANCE_LABELS: Record<keyof InputProvenance, string> = {
  footprint: 'Footprint',
  heights: 'Heights',
  facade: 'Facade',
};

export function FidelityBadge({
  level,
  completeness,
  className,
  provenance,
}: FidelityBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = LEVEL_CONFIG[level];

  return (
    <div className="relative inline-flex">
      <Badge
        className={cn(config.className, 'cursor-default select-none', className)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {config.label}
        {completeness !== undefined && (
          <span className="ml-1 opacity-70">
            {Math.round(completeness * 100)}%
          </span>
        )}
      </Badge>

      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 min-w-[220px] rounded-md border bg-popover px-3 py-2 shadow-md text-xs text-popover-foreground">
          <p className="font-semibold mb-1.5">Available data sources</p>
          <ul className="space-y-1">
            {config.sources.map((src) => (
              <li key={src} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-current opacity-60 shrink-0" />
                {src}
              </li>
            ))}
          </ul>

          {provenance && (
            <>
              <p className="mt-2 pt-2 border-t font-semibold mb-1">
                Input provenance
              </p>
              <ul className="space-y-1">
                {(Object.keys(PROVENANCE_LABELS) as (keyof InputProvenance)[]).map((key) => {
                  const status = provenance[key];
                  return (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {PROVENANCE_LABELS[key]}
                      </span>
                      <span
                        className={cn(
                          'font-medium',
                          status === 'measured'
                            ? 'text-green-600'
                            : 'text-amber-600',
                        )}
                      >
                        {status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {completeness !== undefined && (
            <p className="mt-2 pt-2 border-t text-muted-foreground">
              Completeness: {Math.round(completeness * 100)}%
            </p>
          )}
        </div>
      )}
    </div>
  );
}
