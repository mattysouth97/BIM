"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Reserved slots around the 3D subject. Expanded panels scroll within a 38 %
 * height cap, leaving room for the model even when instrument content grows.
 * Each panel can also collapse independently. Its contents stay mounted so
 * reopening restores local inputs, selections and open details.
 */
export function TwinInstrumentFrame({
  top,
  bottom,
  className,
}: {
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  className?: string;
}) {
  const { t } = useT();

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 gap-3",
        className,
      )}
      data-twin-instrument-frame
    >
      {top ? (
        <InstrumentPanel
          position="top"
          collapseLabel={t("투자·공사 패널 접기", "Collapse investment panel")}
          expandLabel={t("투자·공사 패널 펼치기", "Show investment panel")}
        >
          {top}
        </InstrumentPanel>
      ) : (
        <div />
      )}
      {bottom ? (
        <InstrumentPanel
          position="bottom"
          collapseLabel={t("에너지 패널 접기", "Collapse energy panel")}
          expandLabel={t("에너지 패널 펼치기", "Show energy panel")}
        >
          {bottom}
        </InstrumentPanel>
      ) : null}
    </div>
  );
}

function InstrumentPanel({
  position,
  collapseLabel,
  expandLabel,
  children,
}: {
  position: "top" | "bottom";
  collapseLabel: string;
  expandLabel: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const Chevron = (position === "top") === expanded ? ChevronUp : ChevronDown;

  const toggle = (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="pointer-events-auto self-end border-border bg-card/95 text-foreground backdrop-blur-md"
      aria-expanded={expanded}
      aria-controls={contentId}
      data-testid={`twin-panel-${position}-toggle`}
      onClick={() => setExpanded((value) => !value)}
    >
      {expanded ? collapseLabel : expandLabel}
      <Chevron aria-hidden="true" />
    </Button>
  );

  return (
    <div className="flex min-h-0 min-w-0 shrink-0 max-h-[38%] flex-col gap-1">
      {position === "top" ? toggle : null}
      <div
        id={contentId}
        hidden={!expanded}
        className="pointer-events-auto min-h-0 overflow-y-auto"
        data-testid={`twin-panel-${position}-content`}
      >
        {children}
      </div>
      {position === "bottom" ? toggle : null}
    </div>
  );
}
