"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ReportSection, ReportSectionContent } from "@/lib/report/report-types";
import type { EnergyAuditInput } from "@/lib/report/templates/energy-audit";
import { buildEnergyAuditSections } from "@/lib/report/templates/energy-audit";

interface EnergyAuditPreviewProps {
  input: EnergyAuditInput;
  isKo?: boolean;
  onDownloadPdf?: () => void;
}

function fidelityBadgeVariant(level: 1 | 2 | 3): "outline" | "secondary" | "default" {
  if (level === 1) return "outline";
  if (level === 2) return "secondary";
  return "default";
}

// Exported so other report-preview surfaces (e.g. bim-fidelity-section.tsx)
// can render the same generic ReportSectionContent without duplicating markup.
export function SectionContent({ content }: { content: ReportSectionContent }) {
  if (content.type === "text") {
    return <p className="text-sm text-muted-foreground">{content.text}</p>;
  }

  if (content.type === "key-value") {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {content.items.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {item.label}
            </dt>
            <dd className="text-sm text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  if (content.type === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {content.headers.map((h) => (
                <th
                  key={h}
                  className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-0">
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className="py-2 pr-4 text-foreground">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (content.type === "metric") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{content.value}</span>
        <span className="text-sm text-muted-foreground">{content.unit}</span>
        {content.label && (
          <span className="text-xs text-muted-foreground">({content.label})</span>
        )}
      </div>
    );
  }

  return null;
}

function ReportSectionCard({
  section,
  index,
  isKo,
}: {
  section: ReportSection;
  index: number;
  isKo: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {isKo ? section.titleKo : section.title}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isKo ? section.title : section.titleKo}
            </p>
          </div>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {index + 1}
          </span>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">
        <SectionContent content={section.content} />
      </CardContent>
    </Card>
  );
}

export function EnergyAuditPreview({
  input,
  isKo = false,
  onDownloadPdf,
}: EnergyAuditPreviewProps) {
  const sections: ReportSection[] = buildEnergyAuditSections(input);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold leading-tight">
            {isKo ? "에너지 감사 보고서" : "Energy Audit Report"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {input.building.name} &mdash; {input.building.address}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={fidelityBadgeVariant(input.fidelityLevel)}>
              {isKo
                ? `충실도 ${input.fidelityLevel}단계`
                : `Fidelity Level ${input.fidelityLevel}`}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {isKo ? `${sections.length}개 섹션` : `${sections.length} sections`}
            </span>
          </div>
        </div>
        {onDownloadPdf && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadPdf}
            className="shrink-0"
          >
            <Download className="size-4" />
            {isKo ? "PDF 받기" : "Download PDF"}
          </Button>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        {sections.map((section, i) => (
          <ReportSectionCard
            key={section.title}
            section={section}
            index={i}
            isKo={isKo}
          />
        ))}
      </div>
    </div>
  );
}
