"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Config, DriveStep, Driver } from "driver.js";
import { useHydration } from "@/hooks/use-hydration";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { pick } from "@/lib/i18n";
import {
  GUIDE_REQUEST_EVENT,
  guideControlLabels,
  loadGuideDriver,
  type GuideDriverLoader,
} from "@/lib/guide-events";

type WorkspaceTourKind = "basic" | "twin" | "combined";

interface UseOnboardingTourOptions {
  loadDriver?: GuideDriverLoader;
}

function basicSteps(language: "ko" | "en"): DriveStep[] {
  return [
    {
      element: '[data-tour="stepper"]',
      popover: {
        title: pick(language, "작업 흐름", "Workflow Pipeline"),
        description: pick(
          language,
          "상단 단계에서 현재 위치를 확인하고 완료한 단계로 돌아갈 수 있습니다.",
          "Use the steps above to see your current position and return to completed stages.",
        ),
      },
    },
    {
      element: '[data-tour="viewport"]',
      popover: {
        title: pick(language, "현재 작업 영역", "Current Workspace"),
        description: pick(
          language,
          "업로드, 정보 입력, 3D 트윈 또는 보고서가 현재 단계에 맞게 이 영역에 표시됩니다.",
          "Upload, input, twin, or report tools appear here for the current stage.",
        ),
      },
    },
  ];
}

function twinSteps(language: "ko" | "en"): DriveStep[] {
  return [
    {
      element: '[data-tour="left-dock"]',
      popover: {
        title: pick(language, "장면 구성", "Scene Outliner"),
        description: pick(
          language,
          "건물의 층, 외피 및 설비 요소를 탐색하고 선택합니다.",
          "Browse and select floors, envelope components, and systems.",
        ),
      },
    },
    {
      element: '[data-tour="right-dock"]',
      popover: {
        title: pick(language, "속성", "Properties"),
        description: pick(
          language,
          "선택한 요소의 상세 정보와 모델 입력값을 확인하고 편집합니다.",
          "Inspect and edit details and model inputs for the selected element.",
        ),
      },
    },
  ];
}

export function useOnboardingTour({
  loadDriver = loadGuideDriver,
}: UseOnboardingTourOptions = {}) {
  const hydrated = useHydration();
  const hasSeenTour = useAppStore((state) => state.hasSeenTour);
  const hasSeenTwinTour = useAppStore((state) => state.hasSeenTwinTour);
  const stage = useWorkflowStore((state) => state.stage);
  const leftDockOpen = useWorkspaceStore((state) => state.leftDockOpen);
  const rightDockOpen = useWorkspaceStore((state) => state.rightDockOpen);

  const activeDriverRef = useRef<Driver | null>(null);
  const ignoredDestroyRef = useRef(new WeakSet<Driver>());
  const mountedRef = useRef(false);
  const startingRef = useRef<WorkspaceTourKind | null>(null);

  const destroyActive = useCallback(() => {
    const active = activeDriverRef.current;
    if (!active) return;
    ignoredDestroyRef.current.add(active);
    activeDriverRef.current = null;
    active.destroy();
  }, []);

  const startTour = useCallback(
    async (kind: WorkspaceTourKind) => {
      if (startingRef.current) return;
      startingRef.current = kind;

      if (kind === "twin" || kind === "combined") {
        const workspace = useWorkspaceStore.getState();
        workspace.setLeftDockOpen(true);
        workspace.setRightDockOpen(true);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }

      try {
        if (
          (kind === "twin" || kind === "combined") &&
          (!document.querySelector('[data-tour="left-dock"]') ||
            !document.querySelector('[data-tour="right-dock"]'))
        ) {
          return;
        }

        const createDriver = await loadDriver();
        if (!mountedRef.current) return;
        if (
          (kind === "twin" || kind === "combined") &&
          (useWorkflowStore.getState().stage !== "twin" ||
            !document.querySelector('[data-tour="left-dock"]') ||
            !document.querySelector('[data-tour="right-dock"]'))
        ) {
          return;
        }

        destroyActive();
        const language = useAppStore.getState().language;
        const steps =
          kind === "basic"
            ? basicSteps(language)
            : kind === "twin"
              ? twinSteps(language)
              : [...basicSteps(language), ...twinSteps(language)];
        const config: Config = {
          showProgress: true,
          animate: true,
          smoothScroll: true,
          disableActiveInteraction: true,
          popoverClass: "greenretrofit-guide",
          ...guideControlLabels(language),
          steps,
          onDestroyed: () => {
            if (!ignoredDestroyRef.current.has(tour)) {
              if (kind === "basic" || kind === "combined") {
                useAppStore.getState().setHasSeenTour(true);
              }
              if (kind === "twin" || kind === "combined") {
                useAppStore.getState().setHasSeenTwinTour(true);
              }
            }
            if (activeDriverRef.current === tour) {
              activeDriverRef.current = null;
            }
          },
        };
        const tour: Driver = createDriver(config);
        activeDriverRef.current = tour;
        tour.drive();
      } finally {
        startingRef.current = null;
      }
    },
    [destroyActive, loadDriver],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      destroyActive();
    };
  }, [destroyActive]);

  useEffect(() => {
    if (hydrated && !hasSeenTour) {
      void startTour("basic");
    }
  }, [hasSeenTour, hydrated, startTour]);

  useEffect(() => {
    if (hydrated && stage === "twin" && !hasSeenTwinTour) {
      useWorkspaceStore.getState().setLeftDockOpen(true);
      useWorkspaceStore.getState().setRightDockOpen(true);
    }
  }, [hasSeenTwinTour, hydrated, stage]);

  useEffect(() => {
    if (
      hydrated &&
      hasSeenTour &&
      stage === "twin" &&
      !hasSeenTwinTour &&
      leftDockOpen &&
      rightDockOpen
    ) {
      void startTour("twin");
    }
  }, [
    hasSeenTour,
    hasSeenTwinTour,
    hydrated,
    leftDockOpen,
    rightDockOpen,
    stage,
    startTour,
  ]);

  useEffect(() => {
    const replay = () => {
      void startTour(stage === "twin" ? "combined" : "basic");
    };
    window.addEventListener(GUIDE_REQUEST_EVENT, replay);
    return () => window.removeEventListener(GUIDE_REQUEST_EVENT, replay);
  }, [stage, startTour]);
}
