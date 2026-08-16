"use client";

import React, { useEffect, lazy, Suspense } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useHydration } from "@/hooks/use-hydration";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { useEditorKeybinds } from "@/hooks/use-editor-keybinds";
import { useEditorModeStore } from "@/store/editor-mode-store";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { FloatingPanel } from "./floating-panel";
import { WorkflowStepper } from "./workflow-stepper";
import { PropertiesPanel } from "./properties-panel";
import { TwinLeftDock } from "./twin-left-dock";
import { RevitWorkRail } from "./revit-work-rail";
import { AuthoringPalette } from "./authoring-palette";
import { StatusBar } from "./status-bar";
import { BimSchedulePanel } from "./bim-schedule-panel";
import { useBimDocumentStore } from "@/store/bim-document-store";
import { cn } from "@/lib/utils";
import { TwinDock, TwinDockTab } from "./twin-dock";
import type { FootprintSource } from "@/lib/fidelity/input-provenance";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useInitializeBimViews } from "@/hooks/use-initialize-bim-views";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { SchedulePanel } from "@/components/schedules/schedule-panel";
import { SheetComposer } from "@/components/sheets/sheet-composer";
import { ViewSwitcher } from "@/components/viewer/view-switcher";

const ReportStage = lazy(() =>
  import("@/components/report/report-stage").then((module) => ({
    default: module.ReportStage,
  })),
);
const UploadStage = lazy(() =>
  import("@/components/upload/upload-stage").then((module) => ({
    default: module.UploadStage,
  })),
);
const ParamsStage = lazy(() =>
  import("@/components/params/params-stage").then((module) => ({
    default: module.ParamsStage,
  })),
);

function StageFallback() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-muted/10 text-sm text-muted-foreground"
      role="status"
      aria-label="Loading workspace stage"
    >
      Loading...
    </div>
  );
}

interface WorkspaceShellProps {
  children: React.ReactNode;
  /** P2-27: footprint source threaded from the page to PropertiesPanel. */
  footprintSource?: FootprintSource;
  /** P2-27: ledger heit (meters, 0 = unavailable per AFF-6) threaded from page. */
  ledgerHeit?: number;
  /** P2-27: VWorld measured building height (meters) threaded from page. */
  measuredHeightM?: number | null;
}

export function WorkspaceShell({ children, footprintSource, ledgerHeit, measuredHeightM }: WorkspaceShellProps) {
  const hydrated = useHydration();
  useOnboardingTour();
  useEditorKeybinds();
  const currentMode = useEditorModeStore((s) => s.currentMode);
  const setRightDockOpen = useWorkspaceStore((s) => s.setRightDockOpen);
  useEffect(() => {
    if (currentMode === "floor-edit" || currentMode === "object-edit") {
      setRightDockOpen(true);
    }
  }, [currentMode, setRightDockOpen]);

  const stage = useWorkflowStore((s) => s.stage);
  const buildingPk = useActiveBuildingPk();
  useInitializeBimViews(buildingPk);
  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const schedulePanelOpen = useRevitWorkflowStore((s) => s.schedulePanelOpen);
  const sheetPanelOpen = useRevitWorkflowStore((s) => s.sheetPanelOpen);
  const setSchedulePanelOpen = useRevitWorkflowStore((s) => s.setSchedulePanelOpen);
  const setSheetPanelOpen = useRevitWorkflowStore((s) => s.setSheetPanelOpen);

  const leftDockOpen = useWorkspaceStore((s) => s.leftDockOpen);
  const rightDockOpen = useWorkspaceStore((s) => s.rightDockOpen);
  const bottomShelfOpen = useWorkspaceStore((s) => s.bottomShelfOpen);
  const toggleLeftDock = useWorkspaceStore((s) => s.toggleLeftDock);
  const toggleRightDock = useWorkspaceStore((s) => s.toggleRightDock);
  const scheduleOpen = useBimDocumentStore((s) => s.scheduleOpen);
  const narrow = useNarrowViewport();
  // Phone: docks bury the twin and the investment numbers. Do not persist
  // this as the desktop preference — only suppress at render time.
  const showLeftDock = leftDockOpen && !narrow;
  const showRightDock = rightDockOpen && !narrow;

  // Until hydrated, render a skeleton to avoid SSR/client mismatch
  if (!hydrated) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex-1 min-h-0 bg-muted/10" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Workflow stepper */}
      <div data-tour="stepper">
        <WorkflowStepper />
      </div>
      {(stage === "twin" || stage === "report") && <RevitWorkRail />}
      {stage === "twin" && workMode === "authoring" && <AuthoringPalette />}

      {/* Viewport — twin uses reserved side columns so drawers cannot cover the answer */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden" data-tour="viewport">
        {stage === "twin" && showLeftDock && (
          <TwinDock
            side="left"
            title="씬"
            onClose={toggleLeftDock}
            dataTour="left-dock"
          >
            <TwinLeftDock />
          </TwinDock>
        )}

        <div className="relative min-h-0 min-w-0 flex-1">
          {/* Viewport content — upload, params (P2-24, cad-first only),
              report, or 3D canvas */}
          {stage === "report" || stage === "upload" || stage === "params" ? (
            <Suspense fallback={<StageFallback />}>
              {stage === "report" ? (
                <ReportStage
                  footprintSource={footprintSource}
                  ledgerHeit={ledgerHeit}
                  measuredHeightM={measuredHeightM}
                />
              ) : stage === "upload" ? (
                <UploadStage />
              ) : (
                <ParamsStage />
              )}
            </Suspense>
          ) : (
            children
          )}

          {stage === "twin" && !showLeftDock && !narrow && (
            <TwinDockTab
              side="left"
              label="씬"
              onClick={toggleLeftDock}
              dataTour="left-dock"
            />
          )}
          {stage === "twin" && !showRightDock && !narrow && (
            <TwinDockTab
              side="right"
              label="속성"
              onClick={toggleRightDock}
              dataTour="right-dock"
            />
          )}
        </div>

        {stage === "twin" && showRightDock && (
          <TwinDock
            side="right"
            title="속성"
            onClose={toggleRightDock}
            dataTour="right-dock"
          >
            <PropertiesPanel
              footprintSource={footprintSource}
              ledgerHeit={ledgerHeit}
              measuredHeightM={measuredHeightM}
            />
          </TwinDock>
        )}

        {stage === "twin" && (
          <>
            <div className="pointer-events-none absolute top-[76px] left-1/2 z-20 -translate-x-1/2">
              <ViewSwitcher />
            </div>

            <FloatingPanel
              title="Schedules"
              visible={schedulePanelOpen}
              onClose={() => setSchedulePanelOpen(false)}
              defaultX={12}
              defaultY={typeof window !== "undefined" ? window.innerHeight - 360 : 420}
              defaultWidth={720}
              defaultHeight={280}
              minWidth={420}
              minHeight={200}
            >
              <SchedulePanel />
            </FloatingPanel>

            <FloatingPanel
              title="Sheets"
              visible={sheetPanelOpen}
              onClose={() => setSheetPanelOpen(false)}
              defaultX={typeof window !== "undefined" ? window.innerWidth - 760 : 200}
              defaultY={120}
              defaultWidth={720}
              defaultHeight={420}
              minWidth={480}
              minHeight={260}
            >
              <SheetComposer />
            </FloatingPanel>
          </>
        )}
      </div>

      {/* Bottom shelf — status always; 일람표 expands it */}
      {bottomShelfOpen && (
        <div
          className={cn(
            "shrink-0 overflow-hidden border-t bg-muted/30",
            stage === "twin" && scheduleOpen
              ? narrow
                ? "grid h-44 grid-rows-[minmax(0,1fr)_2.5rem]"
                : "grid h-56 grid-rows-[minmax(0,1fr)_2.5rem]"
              : "h-10",
          )}
        >
          {stage === "twin" && scheduleOpen && <BimSchedulePanel />}
          <div className="h-10 min-h-10">
            <StatusBar buildingPk="" />
          </div>
        </div>
      )}
    </div>
  );
}
