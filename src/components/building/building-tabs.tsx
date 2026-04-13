"use client";

import { lazy, Suspense } from "react";
import type { BrTitleInfo, BrRecapTitleInfo, BrFloorInfo, BrAreaInfo } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FloorBreakdown } from "./floor-breakdown";
import { AreaDetail } from "./area-detail";
import { BimSummaryCard } from "@/components/bim/bim-summary-card";

const BuildingScene = lazy(() =>
  import("@/components/viewer/building-scene").then((m) => ({ default: m.BuildingScene }))
);

interface BuildingTabsProps {
  title: BrTitleInfo | null;
  recap: BrRecapTitleInfo | null;
  floors: BrFloorInfo[];
  areas: BrAreaInfo[];
  loading: boolean;
}

function ViewerSkeleton() {
  return (
    <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted/30">
      <Skeleton className="h-8 w-40" />
    </div>
  );
}

export function BuildingTabs({ title, recap, floors, areas, loading }: BuildingTabsProps) {
  return (
    <Tabs defaultValue="3d">
      <TabsList>
        <TabsTrigger value="3d">3D View</TabsTrigger>
        <TabsTrigger value="floors">층별개요 (Floors)</TabsTrigger>
        <TabsTrigger value="areas">면적상세 (Areas)</TabsTrigger>
        <TabsTrigger value="bim">BIM Summary</TabsTrigger>
      </TabsList>

      <TabsContent value="3d" className="mt-4">
        {title ? (
          <Suspense fallback={<ViewerSkeleton />}>
            <BuildingScene title={title} floors={floors} />
          </Suspense>
        ) : (
          <ViewerSkeleton />
        )}
      </TabsContent>

      <TabsContent value="floors" className="mt-4">
        <Card>
          <CardContent>
            <FloorBreakdown floors={floors} loading={loading} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="areas" className="mt-4">
        <Card>
          <CardContent>
            <AreaDetail areas={areas} loading={loading} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="bim" className="mt-4">
        <Card>
          <CardContent>
            <BimSummaryCard title={title} recap={recap} floors={floors} loading={loading} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
