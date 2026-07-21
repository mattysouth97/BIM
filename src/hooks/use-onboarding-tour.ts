"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { pick } from "@/lib/i18n";
import { useHydration } from "@/hooks/use-hydration";

/**
 * Triggers a 4-step driver.js onboarding tour on first workspace visit.
 * The tour highlights: stepper, viewport, left dock, right dock.
 * Completion is persisted via hasSeenTour in app-store.
 */
export function useOnboardingTour() {
  const hydrated = useHydration();
  const hasSeenTour = useAppStore((s) => s.hasSeenTour);

  useEffect(() => {
    if (!hydrated || hasSeenTour) return;

    let destroyed = false;

    async function startTour() {
      const { driver } = await import("driver.js");
      await import("driver.js/dist/driver.css");

      if (destroyed) return;

      const language = useAppStore.getState().language;

      const driverObj = driver({
        showProgress: true,
        animate: true,
        steps: [
          {
            element: '[data-tour="stepper"]',
            popover: {
              title: pick(language, "작업 흐름", "Workflow Pipeline"),
              description: pick(
                language,
                "5단계를 통해 진행하세요: 건물 선택, 조립, 구성, 분석, 내보내기",
                "Navigate through 5 stages: Select Building, Assemble, Configure, Analyze, Export",
              ),
            },
          },
          {
            element: '[data-tour="viewport"]',
            popover: {
              title: pick(language, "3D 뷰포트", "3D Viewport"),
              description: pick(
                language,
                "건물 시각화 공간입니다. 여기서 모델을 회전, 확대/축소 및 조작할 수 있습니다.",
                "Your building visualization. Rotate, zoom, and interact with the model here.",
              ),
            },
          },
          {
            element: '[data-tour="left-dock"]',
            popover: {
              title: pick(language, "씬 & 구성요소", "Scene & Components"),
              description: pick(
                language,
                "씬 트리를 탐색하고 카탈로그에서 구성요소를 드래그하세요.",
                "Browse the scene tree and drag components from the catalog.",
              ),
            },
          },
          {
            element: '[data-tour="right-dock"]',
            popover: {
              title: pick(language, "속성", "Properties"),
              description: pick(
                language,
                "선택한 요소의 속성을 편집하세요. 변경 사항이 3D 뷰에 실시간으로 반영됩니다.",
                "Edit selected element properties. Changes update the 3D view in real time.",
              ),
            },
          },
        ],
        onDestroyStarted: () => {
          useAppStore.getState().setHasSeenTour(true);
          driverObj.destroy();
        },
      });

      if (!destroyed) {
        driverObj.drive();
      }
    }

    startTour();

    return () => {
      destroyed = true;
    };
  }, [hydrated, hasSeenTour]);
}
