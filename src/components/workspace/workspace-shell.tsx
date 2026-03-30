"use client";

import React from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  useWorkspaceStore,
  LEFT_DOCK_MIN,
  LEFT_DOCK_MAX,
  LEFT_DOCK_DEFAULT,
  RIGHT_DOCK_MIN,
  RIGHT_DOCK_MAX,
  RIGHT_DOCK_DEFAULT,
} from "@/store/workspace-store";
import { useHydration } from "@/hooks/use-hydration";
import { useUndoShortcut } from "@/hooks/use-undo-shortcut";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { DockCollapseButton } from "./dock-collapse-button";
import { WorkflowStepper } from "./workflow-stepper";
import { PropertiesPanel } from "./properties-panel";
import { SceneOutliner } from "./scene-outliner";
import { ComponentCatalog } from "./component-catalog";
import { StatusBar } from "./status-bar";
import { Separator } from "@/components/ui/separator";
import type { Layout } from "react-resizable-panels";

// Stable panel IDs for layout persistence
const LEFT_DOCK_ID = "left-dock";
const CENTER_ID = "center-viewport";
const RIGHT_DOCK_ID = "right-dock";

interface WorkspaceShellProps {
  children: React.ReactNode;
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const hydrated = useHydration();
  useUndoShortcut();
  useOnboardingTour();

  const leftDockOpen = useWorkspaceStore((s) => s.leftDockOpen);
  const rightDockOpen = useWorkspaceStore((s) => s.rightDockOpen);
  const bottomShelfOpen = useWorkspaceStore((s) => s.bottomShelfOpen);
  const toggleLeftDock = useWorkspaceStore((s) => s.toggleLeftDock);
  const toggleRightDock = useWorkspaceStore((s) => s.toggleRightDock);
  const setLeftDockSize = useWorkspaceStore((s) => s.setLeftDockSize);
  const setRightDockSize = useWorkspaceStore((s) => s.setRightDockSize);

  // Use onLayoutChanged (fires once after drag completes, not every pixel)
  const handleLayoutChanged = React.useCallback(
    (layout: Layout) => {
      if (layout[LEFT_DOCK_ID] !== undefined) {
        setLeftDockSize(layout[LEFT_DOCK_ID]);
      }
      if (layout[RIGHT_DOCK_ID] !== undefined) {
        setRightDockSize(layout[RIGHT_DOCK_ID]);
      }
    },
    [setLeftDockSize, setRightDockSize]
  );

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
      {/* Workflow stepper — horizontal breadcrumb at the very top, above toolbar */}
      <div data-tour="stepper">
        <WorkflowStepper />
      </div>

      {/* Main resizable panel group */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0"
        onLayoutChanged={handleLayoutChanged}
      >
        {/* Left dock — always rendered, hidden via display:none when collapsed */}
        <ResizablePanel
          id={LEFT_DOCK_ID}
          defaultSize={LEFT_DOCK_DEFAULT}
          minSize={LEFT_DOCK_MIN}
          maxSize={LEFT_DOCK_MAX}
          className={leftDockOpen ? undefined : "hidden"}
        >
          <div data-tour="left-dock" className="flex h-full flex-col border-r bg-background pointer-events-auto">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Scene
              </span>
              <DockCollapseButton
                side="left"
                collapsed={false}
                onClick={toggleLeftDock}
              />
            </div>
            <div className="flex-1 overflow-auto">
              <SceneOutliner buildingPk="" />
              <Separator />
              <ComponentCatalog />
            </div>
          </div>
        </ResizablePanel>

        {/* Handle between left dock and center — hidden when left dock is collapsed */}
        <ResizableHandle
          withHandle
          className={leftDockOpen ? undefined : "hidden"}
        />

        {/* Center viewport — always visible, takes remaining space */}
        <ResizablePanel id={CENTER_ID} className="relative" data-tour="viewport">
          {/* Re-expand buttons for collapsed docks */}
          {!leftDockOpen && (
            <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2 pointer-events-auto">
              <DockCollapseButton
                side="left"
                collapsed={true}
                onClick={toggleLeftDock}
                className="rounded-l-none"
              />
            </div>
          )}
          {!rightDockOpen && (
            <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2 pointer-events-auto">
              <DockCollapseButton
                side="right"
                collapsed={true}
                onClick={toggleRightDock}
                className="rounded-r-none"
              />
            </div>
          )}
          {children}
        </ResizablePanel>

        {/* Handle between center and right dock — hidden when right dock is collapsed */}
        <ResizableHandle
          withHandle
          className={rightDockOpen ? undefined : "hidden"}
        />

        {/* Right dock — always rendered, hidden via display:none when collapsed */}
        <ResizablePanel
          id={RIGHT_DOCK_ID}
          defaultSize={RIGHT_DOCK_DEFAULT}
          minSize={RIGHT_DOCK_MIN}
          maxSize={RIGHT_DOCK_MAX}
          className={rightDockOpen ? undefined : "hidden"}
        >
          <div data-tour="right-dock" className="flex h-full flex-col border-l bg-background pointer-events-auto">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <DockCollapseButton
                side="right"
                collapsed={false}
                onClick={toggleRightDock}
              />
              <span className="text-xs font-medium text-muted-foreground">
                Properties
              </span>
            </div>
            <div className="flex-1 overflow-auto">
              <PropertiesPanel />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Bottom shelf — collapsible div below the panel group */}
      {bottomShelfOpen && (
        <div className="h-10 shrink-0 border-t bg-muted/30">
          <StatusBar buildingPk="" />
        </div>
      )}
    </div>
  );
}
