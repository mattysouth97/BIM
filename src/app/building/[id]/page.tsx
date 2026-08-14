"use client";

import { use, lazy, Suspense } from "react";
import { decodeBuildingId } from "@/lib/constants";
import { useCompositeBuilding } from "@/hooks/use-composite-building";
import { useBuildingFootprint } from "@/hooks/use-building-footprint";
import { useEnsureBuildingModel } from "@/hooks/use-ensure-building-model";
import { BuildingToolbar } from "@/components/building/building-toolbar";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const BuildingScene = lazy(() =>
  import("@/components/viewer/building-scene").then((m) => ({
    default: m.BuildingScene,
  }))
);

function ViewerSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/30">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const buildingId = decodeBuildingId(id);

  const { title, recap, floors, areas, isLoading, isError, errors } =
    useCompositeBuilding({
      sigunguCd: buildingId.sigunguCd,
      bjdongCd: buildingId.bjdongCd,
      platGbCd: buildingId.platGbCd,
      bun: buildingId.bun,
      ji: buildingId.ji,
    });

  const titleData = title?.items?.[0] ?? null;
  const floorsData = floors?.items ?? [];
  useEnsureBuildingModel(titleData, floorsData);

  // Derive address from title once it resolves and fire footprint fetch at page level.
  // This hoists the footprint fetch out of BuildingScene so its result can be passed
  // as a prop — enabling footprint data to be available before BuildingScene mounts.
  const address = titleData?.platPlcNm || titleData?.newPlatPlc || undefined;
  const footprintResult = useBuildingFootprint(address);

  // Composite loading: ledger OR footprint still pending
  const compositeLoading = isLoading || footprintResult.isLoading;

  // Prepare export data from floors
  const exportData = floorsData.map((f) => ({
    floorNo: f.flrNo,
    floorName: f.flrNoNm,
    floorType: f.flrGbCdNm,
    use: f.mainPurpsCdNm || f.etcPurps,
    area: f.area,
    structure: f.strctCdNm || "-",
  }));

  const exportFilename = titleData
    ? `${titleData.bldNm || titleData.platPlcNm || "building"}_floors`
    : "building_floors";

  return (
    <div className="flex flex-col h-dvh">
      {/* Condensed toolbar */}
      <BuildingToolbar
        title={titleData}
        exportData={exportData}
        exportFilename={exportFilename}
        loading={compositeLoading}
      />

      {/* Workspace shell — viewport-dominant resizable layout */}
      <WorkspaceShell>
        {/* Error overlay */}
        {isError && (
          <div className="absolute top-0 inset-x-0 z-10 m-3">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 backdrop-blur p-3 text-sm text-destructive">
              데이터를 불러오는 중 오류가 발생했습니다. (Error loading data.)
              {errors
                .filter(Boolean)
                .map((e, i) => (
                  <p key={i} className="mt-1 text-xs opacity-75">
                    {e?.message}
                  </p>
                ))}
            </div>
          </div>
        )}

        {/* 3D Viewer */}
        {titleData ? (
          <Suspense fallback={<ViewerSkeleton />}>
            <BuildingScene
              title={titleData}
              floors={floorsData}
              footprintData={footprintResult.data}
              isCompositeLoading={compositeLoading}
            />
          </Suspense>
        ) : isLoading ? (
          <ViewerSkeleton />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            건물 데이터를 불러올 수 없습니다. (No building data available.)
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
