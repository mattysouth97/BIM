"use client";

import React from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useHydration } from "@/hooks/use-hydration";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { useEditorKeybinds } from "@/hooks/use-editor-keybinds";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { FloatingPanel } from "./floating-panel";
import { WorkflowStepper } from "./workflow-stepper";
import { PropertiesPanel } from "./properties-panel";
import { SceneOutliner } from "./scene-outliner";
import { StatusBar } from "./status-bar";
import { ReportStage } from "@/components/report/report-stage";
import { UploadStage } from "@/components/upload/upload-stage";
import { Button } from "@/components/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";

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

      {/* Full-bleed viewport with floating panels */}
      <div className="relative flex-1 min-h-0 overflow-hidden" data-tour="viewport">
        {/* Viewport content — upload stage, report stage, or 3D canvas */}
        {stage === "report" ? <ReportStage />
         : stage === "upload" ? <UploadStage />
         : children}

        {/* Toggle buttons and floating panels — only for the 3D twin viewport */}
        {stage === "twin" && (
          <>
            {/* Toggle buttons when panels are closed */}
            {!showLeftDock && !narrow && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-2 z-20 h-8 w-8 shadow-md"
                onClick={toggleLeftDock}
                title="Open Scene panel"
              >
                <PanelLeft className="size-4" />
              </Button>
            )}
            {!showRightDock && !narrow && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-2 z-20 h-8 w-8 shadow-md"
                onClick={toggleRightDock}
                title="Open Properties panel"
              >
                <PanelRight className="size-4" />
              </Button>
            )}

            {/* Floating Scene panel (left) — sit below the scenario rail */}
            <FloatingPanel
              title="Scene"
              visible={showLeftDock}
              onClose={toggleLeftDock}
              defaultX={12}
              defaultY={88}
              defaultWidth={340}
              defaultHeight={500}
              minWidth={280}
              minHeight={200}
              dataTour="left-dock"
            >
              <SceneOutliner buildingPk="" />
            </FloatingPanel>

            {/* Floating Properties panel (right) */}
            <FloatingPanel
              title="Properties"
              visible={showRightDock}
              onClose={toggleRightDock}
              defaultX={typeof window !== "undefined" ? window.innerWidth - 400 : 800}
              defaultY={88}
              defaultWidth={380}
              defaultHeight={600}
              minWidth={300}
              minHeight={200}
              dataTour="right-dock"
            >
              <PropertiesPanel />
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
