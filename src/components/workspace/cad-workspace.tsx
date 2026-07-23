"use client";

// src/components/workspace/cad-workspace.tsx
// P2-24 — workspace shell for CAD-first standalone drafts (PK prefix "cad-").
//
// No ledger, no VWorld: this component never mounts useCompositeBuilding or
// useBuildingFootprint. The twin renders from a synthetic minimal title built
// out of (a) the user's three manual params and (b) values derived from the
// uploaded CAD footprint — everything else is an explicit unavailable marker
// (AFF-6; see cadDraftTitle).

import { lazy, Suspense, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useCadDraftStore } from "@/store/cad-draft-store";
import {
  cadDraftTitle,
  ringAreaSqm,
} from "@/lib/workflow/cad-draft";
import { getStageOrder } from "@/lib/workflow/stages";
import { useT } from "@/lib/i18n";
import { BuildingToolbar } from "@/components/building/building-toolbar";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

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

export function CadWorkspace({ pk }: { pk: string }) {
  const { t } = useT();
  const draft = useCadDraftStore((s) => s.drafts[pk]);
  const overrides = useRecipeStore((s) => s.overrides[pk]);

  // Publish the draft as the active building. sigunguCd rides along once the
  // params stage has captured it (re-mounts keep the regional climate).
  const setActiveBuilding = useActiveBuildingStore((s) => s.setActiveBuilding);
  useEffect(() => {
    setActiveBuilding(pk, draft?.sigunguCd);
  }, [pk, draft?.sigunguCd, setActiveBuilding]);

  // Deep links / stale persisted stages: "search" does not exist in cad-first
  // mode — normalize to the mode's first stage. Guard-failing later stages are
  // handled by WorkflowStageRecovery.
  const stage = useWorkflowStore((s) => s.stage);
  useEffect(() => {
    if (!getStageOrder("cad-first").includes(stage)) {
      useWorkflowStore.getState().setStage("upload");
    }
  }, [stage]);

  // Synthetic title: user facts + CAD-derived areas + explicit unavailable
  // markers. Only buildable once footprint AND params exist (twin stage is
  // guard-locked until then, so the placeholder below is never user-visible
  // in normal navigation).
  const footprintRings = overrides?.footprintPolygon;
  const title = useMemo(() => {
    if (!draft || !footprintRings?.[0]) return null;
    return cadDraftTitle(pk, draft, ringAreaSqm(footprintRings[0]));
  }, [pk, draft, footprintRings]);

  return (
    <div className="flex flex-col h-dvh">
      <BuildingToolbar
        title={title}
        exportData={[]}
        exportFilename="cad_draft"
        loading={false}
      />

      <WorkspaceShell>
        {title ? (
          <Suspense fallback={<ViewerSkeleton />}>
            <BuildingScene title={title} floors={[]} isCompositeLoading={false} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            {t(
              "도면 업로드와 정보 입력을 완료하면 트윈이 생성됩니다.",
              "Complete the upload and building-info stages to generate the twin.",
            )}
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
