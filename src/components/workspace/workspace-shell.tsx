"use client";

import React from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useHydration } from "@/hooks/use-hydration";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { useEditorKeybinds } from "@/hooks/use-editor-keybinds";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { WorkflowStepper } from "./workflow-stepper";
import { PropertiesPanel } from "./properties-panel";
import { SceneOutliner } from "./scene-outliner";
import { StatusBar } from "./status-bar";
import { TwinDock, TwinDockTab } from "./twin-dock";
import { ReportStage } from "@/components/report/report-stage";
import { UploadStage } from "@/components/upload/upload-stage";

interface WorkspaceShellProps {
  children: React.ReactNode;
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const hydrated = useHydration();
  useOnboardingTour();
  useEditorKeybinds();

  const stage = useWorkflowStore((s) => s.stage);

  const leftDockOpen = useWorkspaceStore((s) => s.leftDockOpen);
  const rightDockOpen = useWorkspaceStore((s) => s.rightDockOpen);
  const bottomShelfOpen = useWorkspaceStore((s) => s.bottomShelfOpen);
  const toggleLeftDock = useWorkspaceStore((s) => s.toggleLeftDock);
  const toggleRightDock = useWorkspaceStore((s) => s.toggleRightDock);
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

      {/* Viewport — twin uses reserved side columns so drawers cannot cover the answer */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden" data-tour="viewport">
        {stage === "twin" && showLeftDock && (
          <TwinDock
            side="left"
            title="Scene"
            onClose={toggleLeftDock}
            dataTour="left-dock"
          >
            <SceneOutliner buildingPk="" />
          </TwinDock>
        )}

        <div className="relative min-h-0 min-w-0 flex-1">
          {stage === "report" ? <ReportStage />
           : stage === "upload" ? <UploadStage />
           : children}

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
            title="Properties"
            onClose={toggleRightDock}
            dataTour="right-dock"
          >
            <PropertiesPanel />
          </TwinDock>
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
