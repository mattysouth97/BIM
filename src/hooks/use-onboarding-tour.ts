"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useHydration } from "@/hooks/use-hydration";
import { twinTourSteps } from "@/lib/workflow/tour-steps";

/**
 * First-visit tour on the Twin only — docks and overlay exist there.
 * Copy is the four real stages from STAGE_ORDER. Completion in hasSeenTour.
 */
export function useOnboardingTour() {
  const hydrated = useHydration();
  const hasSeenTour = useAppStore((s) => s.hasSeenTour);
  const stage = useWorkflowStore((s) => s.stage);

  useEffect(() => {
    if (!hydrated || hasSeenTour || stage !== "twin") return;

    let cancelled = false;
    let driverObj: { destroy: () => void } | null = null;

    async function startTour() {
      const { driver } = await import("driver.js");
      await import("driver.js/dist/driver.css");

      if (cancelled) return;

      const language = useAppStore.getState().language;
      const isKo = language === "ko";
      const steps = twinTourSteps(isKo).map((step) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: step.description,
        },
      }));

      const instance = driver({
        showProgress: true,
        animate: true,
        steps,
        onDestroyStarted: () => {
          useAppStore.getState().setHasSeenTour(true);
          instance.destroy();
        },
      });

      if (cancelled) {
        instance.destroy();
        return;
      }

      driverObj = instance;
      instance.drive();
    }

    startTour();

    return () => {
      cancelled = true;
      driverObj?.destroy();
    };
  }, [hydrated, hasSeenTour, stage]);
}
