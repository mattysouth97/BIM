"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Driver } from "driver.js";
import { useHydration } from "@/hooks/use-hydration";
import { useAppStore } from "@/store/app-store";
import { pick } from "@/lib/i18n";
import {
  GUIDE_REQUEST_EVENT,
  guideControlLabels,
  loadGuideDriver,
  type GuideDriverLoader,
} from "@/lib/guide-events";

interface UseHomeTourOptions {
  loadDriver?: GuideDriverLoader;
  prepare?: () => void;
}

export function useHomeTour({
  loadDriver = loadGuideDriver,
  prepare,
}: UseHomeTourOptions = {}) {
  const hydrated = useHydration();
  const hasSeenHomeTour = useAppStore((state) => state.hasSeenHomeTour);
  const activeDriverRef = useRef<Driver | null>(null);
  const ignoredDestroyRef = useRef(new WeakSet<Driver>());
  const mountedRef = useRef(false);
  const startingRef = useRef(false);

  const destroyActive = useCallback(() => {
    const active = activeDriverRef.current;
    if (!active) return;
    ignoredDestroyRef.current.add(active);
    activeDriverRef.current = null;
    active.destroy();
  }, []);

  const startTour = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    prepare?.();

    // Allow preparation state (such as leaving campus mode) to render anchors.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    try {
      const createDriver = await loadDriver();
      if (!mountedRef.current) return;

      destroyActive();
      const language = useAppStore.getState().language;
      const tour: Driver = createDriver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        disableActiveInteraction: true,
        popoverClass: "greenretrofit-guide",
        ...guideControlLabels(language),
        steps: [
          {
            element: '[data-tour="home-hero"]',
            popover: {
              title: pick(language, "시작하기", "Welcome"),
              description: pick(
                language,
                "건축물대장 또는 CAD 도면에서 시작해 에너지 개보수 효과를 비교할 수 있습니다.",
                "Start with building-ledger data or a CAD drawing, then compare energy-retrofit outcomes.",
              ),
            },
          },
          {
            element: '[data-tour="home-cad-entry"]',
            popover: {
              title: pick(language, "CAD로 시작", "Start with CAD"),
              description: pick(
                language,
                "건축물대장 없이 DXF, DWG 또는 PDF 도면으로 새 디지털 트윈을 시작합니다.",
                "Create a new digital twin from a DXF, DWG, or PDF when ledger data is unavailable.",
              ),
            },
          },
          {
            element: '[data-tour="home-search-tabs"]',
            popover: {
              title: pick(language, "건물 검색", "Building Search"),
              description: pick(
                language,
                "지역 또는 상세 주소로 건축물대장을 검색하고 결과에서 건물을 선택합니다.",
                "Search the building ledger by region or address, then select a result.",
              ),
            },
          },
          {
            element: '[data-tour="home-campus-toggle"]',
            popover: {
              title: pick(language, "캠퍼스 모드", "Campus Mode"),
              description: pick(
                language,
                "여러 건물을 한 번에 불러와 포트폴리오를 비교할 때 사용합니다.",
                "Use campus mode to load and compare a multi-building portfolio.",
              ),
            },
          },
          {
            element: '[data-tour="guide-replay"]',
            popover: {
              title: pick(language, "가이드 다시 보기", "Replay the Guide"),
              description: pick(
                language,
                "언제든지 상단의 가이드 버튼을 눌러 현재 화면의 안내를 다시 볼 수 있습니다.",
                "Use the Guide button at any time to replay help for the current screen.",
              ),
            },
          },
        ],
        onDestroyed: () => {
          if (!ignoredDestroyRef.current.has(tour)) {
            useAppStore.getState().setHasSeenHomeTour(true);
          }
          if (activeDriverRef.current === tour) {
            activeDriverRef.current = null;
          }
        },
      });
      activeDriverRef.current = tour;
      tour.drive();
    } finally {
      startingRef.current = false;
    }
  }, [destroyActive, loadDriver, prepare]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      destroyActive();
    };
  }, [destroyActive]);

  useEffect(() => {
    if (hydrated && !hasSeenHomeTour) {
      void startTour();
    }
  }, [hasSeenHomeTour, hydrated, startTour]);

  useEffect(() => {
    const replay = () => void startTour();
    window.addEventListener(GUIDE_REQUEST_EVENT, replay);
    return () => window.removeEventListener(GUIDE_REQUEST_EVENT, replay);
  }, [startTour]);
}
