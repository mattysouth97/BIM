'use client';

// src/components/twin/fidelity-detail-panel.tsx
// Expandable panel showing per-category fidelity status and an upgrade CTA.

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FidelityBadge } from '@/components/twin/fidelity-badge';
import { cn } from '@/lib/utils';
import type {
  FidelityReport,
  UpgradeChecklist,
} from '@/lib/fidelity/fidelity-types';

interface FidelityDetailPanelProps {
  report: FidelityReport;
  checklist: UpgradeChecklist;
  onUpgradeClick?: () => void;
}

// Fixed ordered list of categories to display
const CATEGORIES = [
  'Building Geometry',
  'Structure Codes',
  'Permit Date',
  'Energy Consumption',
  'Floor Plans',
  'Equipment Schedule',
  'IFC Model',
  'Sensor Data',
] as const;

type CategoryStatus = 'available' | 'estimated' | 'missing';

// Map a DataSource confidence + availability to a display status
function resolveStatus(
  report: FidelityReport,
  category: string
): CategoryStatus {
  const source = report.dataSources.find(
    (ds) => ds.name.toLowerCase() === category.toLowerCase()
  );
  if (!source || !source.available) return 'missing';
  if (source.confidence === 'low') return 'estimated';
  return 'available';
}

interface StatusIconProps {
  status: CategoryStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  if (status === 'available') {
    return (
      <span className="inline-flex items-center justify-center size-4 rounded-full bg-green-100 text-green-600 shrink-0 text-[10px] font-bold">
        ✓
      </span>
    );
  }
  if (status === 'estimated') {
    return (
      <span className="inline-flex items-center justify-center size-4 rounded-full bg-yellow-100 text-yellow-600 shrink-0 text-[11px] font-bold leading-none">
        ~
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center size-4 rounded-full bg-muted text-muted-foreground shrink-0 text-[11px] font-bold leading-none">
      –
    </span>
  );
}

function StatusLabel({ status }: StatusIconProps) {
  const map: Record<CategoryStatus, { text: string; className: string }> = {
    available: { text: 'Available', className: 'text-green-600' },
    estimated: { text: 'Estimated', className: 'text-yellow-600' },
    missing: { text: 'Missing', className: 'text-muted-foreground' },
  };
  const { text, className } = map[status];
  return <span className={cn('text-xs', className)}>{text}</span>;
}

export function FidelityDetailPanel({
  report,
  checklist,
  onUpgradeClick,
}: FidelityDetailPanelProps) {
  const nextLevel = checklist.nextLevel;
  const completenessPercent = Math.round(report.completeness * 100);

  return (
    <Card className="w-72 gap-0 py-0">
      <Accordion type="single" collapsible>
        <AccordionItem value="fidelity" className="border-b-0">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <FidelityBadge
                level={report.level}
                completeness={report.completeness}
              />
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-0 pb-0">
            <CardHeader className="px-4 pt-0 pb-2 gap-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Data Categories
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                {report.availableCount} of {report.totalPossible} sources
                available · {completenessPercent}% complete
              </p>
            </CardHeader>

            <CardContent className="px-4 pb-3">
              <ul className="space-y-2">
                {CATEGORIES.map((category) => {
                  const status = resolveStatus(report, category);
                  return (
                    <li
                      key={category}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusIcon status={status} />
                        <span className="text-xs truncate">{category}</span>
                      </div>
                      <StatusLabel status={status} />
                    </li>
                  );
                })}
              </ul>

              {nextLevel !== null && (
                <div className="mt-4 pt-3 border-t">
                  {checklist.items.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mb-2">
                      {checklist.items.length} action
                      {checklist.items.length !== 1 ? 's' : ''} needed to reach
                      Level {nextLevel}
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={onUpgradeClick}
                  >
                    Upgrade to Level {nextLevel}
                  </Button>
                </div>
              )}

              {nextLevel === null && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-[10px] text-center text-muted-foreground">
                    Maximum fidelity reached
                  </p>
                </div>
              )}
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
