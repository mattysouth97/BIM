"use client";

// src/components/report/bim-fidelity-section.tsx
// Additive "BIM Fidelity / IFC" card for the report stage — renders the
// per-element confidence summary from the Agentic BIM Engine's pure
// (counting-session) pass, plus the "Export IFC" action (reuses
// use-engine-result's exportIfc, which is the only path that touches the
// real WASM write session).

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { ReportSection } from "@/lib/report/report-types";
import { SectionContent } from "@/components/report/energy-audit-preview";

interface BimFidelitySectionProps {
  /** Pre-built sections from buildBimFidelitySections — one "unavailable"
   * text section when the engine has no real footprint, or a summary +
   * category-breakdown pair otherwise. */
  sections: ReportSection[];
  /** Triggers the REAL (WASM) engine pass and downloads the resulting .ifc file. */
  onExportIfc: () => void;
  /** True while the real WASM export is in flight. */
  exporting: boolean;
  /** True when a real footprint (cad/ifc/building) + recipe are present. */
  available: boolean;
}

export function BimFidelitySection({
  sections,
  onExportIfc,
  exporting,
  available,
}: BimFidelitySectionProps) {
  const { t } = useT();

  return (
    <Card data-testid="bim-fidelity-section">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">
          {t("BIM 충실도 / IFC", "BIM Fidelity / IFC")}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={!available || exporting}
          onClick={onExportIfc}
          title={
            available
              ? undefined
              : t(
                  "IFC 내보내기에는 CAD 또는 건물 외곽선 도면이 필요합니다.",
                  "IFC export needs a CAD or building-outline footprint.",
                )
          }
        >
          {exporting && <Loader2 className="size-3 animate-spin" />}
          {t("IFC 내보내기", "Export IFC")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {section.title}{" "}
              <span className="font-normal">· {section.titleKo}</span>
            </p>
            <SectionContent content={section.content} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
