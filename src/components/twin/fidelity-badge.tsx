'use client';

// src/components/twin/fidelity-badge.tsx
// Small badge showing the current fidelity level (L1/L2/L3) with a tooltip
// listing available data sources for that level.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FidelityLevel } from '@/lib/fidelity/fidelity-types';

interface FidelityBadgeProps {
  level: FidelityLevel;
  completeness?: number; // 0-1
  className?: string;
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

export function FidelityBadge({
  level,
  completeness,
  className,
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
        <div className="absolute bottom-full left-0 mb-1.5 z-50 min-w-[200px] rounded-md border bg-popover px-3 py-2 shadow-md text-xs text-popover-foreground">
          <p className="font-semibold mb-1.5">Available data sources</p>
          <ul className="space-y-1">
            {config.sources.map((src) => (
              <li key={src} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-current opacity-60 shrink-0" />
                {src}
              </li>
            ))}
          </ul>
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
