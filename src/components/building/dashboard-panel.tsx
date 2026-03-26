"use client";

import type { BrTitleInfo, BrRecapTitleInfo, BrFloorInfo, BrAreaInfo } from "@/lib/types";
import { formatArea, formatDate, formatPercent } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { useHydration } from "@/hooks/use-hydration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FloorBreakdown } from "./floor-breakdown";
import { AreaDetail } from "./area-detail";
import { BimSummaryCard } from "@/components/bim/bim-summary-card";
import { X } from "lucide-react";

interface DashboardPanelProps {
  title: BrTitleInfo | null;
  recap: BrRecapTitleInfo | null;
  floors: BrFloorInfo[];
  areas: BrAreaInfo[];
  loading: boolean;
}

interface StatItem {
  label: string;
  labelEn: string;
  value: string;
}

function buildStats(title: BrTitleInfo): StatItem[] {
  return [
    {
      label: "층수",
      labelEn: "Floors",
      value: `지상 ${title.grndFlrCnt}층 / 지하 ${title.ugrndFlrCnt}층`,
    },
    {
      label: "연면적",
      labelEn: "Total Area",
      value: formatArea(title.totArea),
    },
    {
      label: "건축면적",
      labelEn: "Building Area",
      value: formatArea(title.archArea),
    },
    {
      label: "대지면적",
      labelEn: "Site Area",
      value: formatArea(title.platArea),
    },
    {
      label: "건폐율",
      labelEn: "Coverage",
      value: formatPercent(title.bcRat),
    },
    {
      label: "용적률",
      labelEn: "FAR",
      value: formatPercent(title.vlRat),
    },
    {
      label: "높이",
      labelEn: "Height",
      value: Number(title.heit) > 0 ? `${title.heit} m` : "-",
    },
    {
      label: "사용승인일",
      labelEn: "Approved",
      value: formatDate(title.useAprDay),
    },
    {
      label: "허가일",
      labelEn: "Permit",
      value: formatDate(title.pmsDay),
    },
  ];
}

function OverviewStats({ title, loading }: { title: BrTitleInfo | null; loading: boolean }) {
  if (loading && !title) {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!title) return null;

  const stats = buildStats(title);

  return (
    <Card className="mx-3 mt-1">
      <CardContent className="p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {stats.map((stat) => (
            <div key={stat.labelEn}>
              <dt className="text-muted-foreground">
                {stat.label}{" "}
                <span className="text-[10px]">({stat.labelEn})</span>
              </dt>
              <dd className="font-semibold text-sm truncate">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function PanelTabs({
  title,
  recap,
  floors,
  areas,
  loading,
}: DashboardPanelProps) {
  return (
    <Tabs defaultValue="floors" className="flex-1 flex flex-col min-h-0 px-3 pb-3 mt-3">
      <TabsList className="w-full">
        <TabsTrigger value="floors" className="flex-1">Floors</TabsTrigger>
        <TabsTrigger value="areas" className="flex-1">Areas</TabsTrigger>
        <TabsTrigger value="bim" className="flex-1">BIM</TabsTrigger>
      </TabsList>
      <TabsContent value="floors" className="mt-2 overflow-y-auto">
        <FloorBreakdown floors={floors} loading={loading} />
      </TabsContent>
      <TabsContent value="areas" className="mt-2 overflow-y-auto">
        <AreaDetail areas={areas} loading={loading} />
      </TabsContent>
      <TabsContent value="bim" className="mt-2 overflow-y-auto">
        <BimSummaryCard title={title} recap={recap} floors={floors} loading={loading} />
      </TabsContent>
    </Tabs>
  );
}

function InlinePanel({
  title,
  recap,
  floors,
  areas,
  loading,
  onClose,
}: DashboardPanelProps & { onClose: () => void }) {
  return (
    <div className="w-[400px] shrink-0 border-l bg-background overflow-y-auto h-full flex flex-col">
      <div className="flex items-center justify-between p-3 pb-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Building Info
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <OverviewStats title={title} loading={loading} />
      <PanelTabs
        title={title}
        recap={recap}
        floors={floors}
        areas={areas}
        loading={loading}
      />
    </div>
  );
}

function MobilePanel({
  title,
  recap,
  floors,
  areas,
  loading,
  open,
  onOpenChange,
}: DashboardPanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[85vw] sm:max-w-[400px] p-0 flex flex-col">
        <SheetHeader className="p-3 pb-0">
          <SheetTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Building Info
          </SheetTitle>
          <SheetDescription className="sr-only">
            Building metadata, floor breakdown, and area details
          </SheetDescription>
        </SheetHeader>
        <OverviewStats title={title} loading={loading} />
        <PanelTabs
          title={title}
          recap={recap}
          floors={floors}
          areas={areas}
          loading={loading}
        />
      </SheetContent>
    </Sheet>
  );
}

export function DashboardPanel({
  title,
  recap,
  floors,
  areas,
  loading,
}: DashboardPanelProps) {
  const hydrated = useHydration();
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const setSidePanelOpen = useAppStore((s) => s.setSidePanelOpen);

  if (!hydrated) return null;
  if (!sidePanelOpen) return null;

  return (
    <>
      {/* Desktop: inline sidebar */}
      <div className="hidden lg:block h-full">
        <InlinePanel
          title={title}
          recap={recap}
          floors={floors}
          areas={areas}
          loading={loading}
          onClose={() => setSidePanelOpen(false)}
        />
      </div>

      {/* Mobile: Sheet overlay */}
      <div className="lg:hidden">
        <MobilePanel
          title={title}
          recap={recap}
          floors={floors}
          areas={areas}
          loading={loading}
          open={sidePanelOpen}
          onOpenChange={setSidePanelOpen}
        />
      </div>
    </>
  );
}
