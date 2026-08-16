"use client";

import React, { lazy, Suspense } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useHydration } from "@/hooks/use-hydration";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { FloatingPanel } from "./floating-panel";
import { WorkflowStepper } from "./workflow-stepper";
import { PropertiesPanel } from "./properties-panel";
import { TwinLeftDock } from "./twin-left-dock";
import { RevitWorkRail } from "./revit-work-rail";
import { AuthoringPalette } from "./authoring-palette";
import { StatusBar } from "./status-bar";
import { Button } from "@/components/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
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

      {/* Full-bleed viewport with floating panels */}
      <div className="relative flex-1 min-h-0" data-tour="viewport">
        {/* Viewport content — upload stage, params stage (P2-24, cad-first
            only — ledger mode never reaches this stage id), report stage, or
            3D canvas */}
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

        {/* Toggle buttons and floating panels — only for the 3D twin viewport */}
        {stage === "twin" && (
          <>
            {/* Toggle buttons when panels are closed */}
            {!leftDockOpen && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-20 z-20 h-8 w-8 shadow-md"
                onClick={toggleLeftDock}
                title="Open Scene panel"
              >
                <PanelLeft className="size-4" />
              </Button>
            )}
            {!rightDockOpen && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-20 z-20 h-8 w-8 shadow-md"
                onClick={toggleRightDock}
                title="Open Properties panel"
              >
                <PanelRight className="size-4" />
              </Button>
            )}

            <div className="pointer-events-none absolute top-[76px] left-1/2 z-20 -translate-x-1/2">
              <ViewSwitcher />
            </div>

            {/* Floating Scene panel (left) */}
            <FloatingPanel
              title="Scene"
              visible={leftDockOpen}
              onClose={toggleLeftDock}
              defaultX={12}
              defaultY={84}
              defaultWidth={340}
              defaultHeight={500}
              minWidth={280}
              minHeight={200}
              dataTour="left-dock"
            >
              <TwinLeftDock />
            </FloatingPanel>

            {/* Floating Properties panel (right) */}
            <FloatingPanel
              title="Properties"
              visible={rightDockOpen}
              onClose={toggleRightDock}
              defaultX={typeof window !== "undefined" ? window.innerWidth - 400 : 800}
              defaultY={84}
              defaultWidth={380}
              defaultHeight={600}
              minWidth={300}
              minHeight={200}
              dataTour="right-dock"
            >
              <PropertiesPanel
                footprintSource={footprintSource}
                ledgerHeit={ledgerHeit}
                measuredHeightM={measuredHeightM}
              />
            </FloatingPanel>

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

      {/* Bottom shelf */}
      {bottomShelfOpen && (
        <div className="h-10 shrink-0 border-t bg-muted/30">
          <StatusBar buildingPk="" />
        </div>
      )}
    </div>
  );
}
