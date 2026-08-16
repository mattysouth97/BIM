import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config, Driver } from "driver.js";
import { useHomeTour } from "../use-home-tour";
import { useOnboardingTour } from "../use-onboarding-tour";
import { requestGuide, type GuideDriverLoader } from "@/lib/guide-events";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useWorkspaceStore } from "@/store/workspace-store";

function driverHarness() {
  const configs: Config[] = [];
  const drivers: Driver[] = [];
  const factory = vi.fn((config: Config) => {
    const mockDriver: Driver = {
      drive: vi.fn(),
      destroy: vi.fn(() => {
        config.onDestroyed?.(undefined, {}, {
          config,
          state: {},
          driver: mockDriver,
        });
      }),
    } as unknown as Driver;
    configs.push(config);
    drivers.push(mockDriver);
    return mockDriver;
  });
  const loadDriver: GuideDriverLoader = vi.fn(async () => factory);
  return { configs, drivers, factory, loadDriver };
}

function addTourAnchor(name: string) {
  const element = document.createElement("div");
  element.dataset.tour = name;
  document.body.appendChild(element);
}

beforeEach(() => {
  useAppStore.setState({
    language: "en",
    hasSeenTour: true,
    hasSeenHomeTour: true,
    hasSeenTwinTour: true,
  });
  useWorkflowStore.setState({ stage: "upload" });
  useWorkspaceStore.setState({
    leftDockOpen: true,
    rightDockOpen: true,
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("home guide lifecycle", () => {
  it("runs on first visit, exposes all landing anchors, and cleans up", async () => {
    useAppStore.setState({ hasSeenHomeTour: false });
    const harness = driverHarness();
    const prepare = vi.fn();
    const { unmount } = renderHook(() =>
      useHomeTour({ loadDriver: harness.loadDriver, prepare }),
    );

    await waitFor(() => expect(harness.factory).toHaveBeenCalledTimes(1));
    expect(prepare).toHaveBeenCalled();
    expect(harness.configs[0].steps?.map((step) => step.element)).toEqual([
      '[data-tour="home-hero"]',
      '[data-tour="home-cad-entry"]',
      '[data-tour="home-search-tabs"]',
      '[data-tour="home-campus-toggle"]',
      '[data-tour="guide-replay"]',
    ]);

    unmount();
    expect(harness.drivers[0].destroy).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().hasSeenHomeTour).toBe(false);
  });

  it("localizes Driver controls and close accessibility text in Korean", async () => {
    useAppStore.setState({ language: "ko", hasSeenHomeTour: false });
    const harness = driverHarness();
    renderHook(() => useHomeTour({ loadDriver: harness.loadDriver }));

    await waitFor(() => expect(harness.factory).toHaveBeenCalledTimes(1));
    const config = harness.configs[0];
    expect(config.nextBtnText).toBe("다음");
    expect(config.prevBtnText).toBe("이전");
    expect(config.doneBtnText).toBe("완료");
    expect(config.progressText).toBe("{{current}} / {{total}}");
    expect(config.disableActiveInteraction).toBe(true);

    const closeButton = document.createElement("button");
    const renderPopover = config.onPopoverRender as unknown as (
      popover: { closeButton: HTMLButtonElement },
    ) => void;
    renderPopover({ closeButton });
    expect(closeButton.getAttribute("aria-label")).toBe("가이드 닫기");
  });
});

describe("workspace guide stage behavior", () => {
  it("runs only the basic stepper and viewport tour outside twin stage", async () => {
    useAppStore.setState({ hasSeenTour: false });
    const harness = driverHarness();
    const { unmount } = renderHook(() =>
      useOnboardingTour({ loadDriver: harness.loadDriver }),
    );

    await waitFor(() => expect(harness.factory).toHaveBeenCalledTimes(1));
    expect(harness.configs[0].steps?.map((step) => step.element)).toEqual([
      '[data-tour="stepper"]',
      '[data-tour="viewport"]',
    ]);

    unmount();
    expect(harness.drivers[0].destroy).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().hasSeenTour).toBe(false);
  });

  it("opens both docks and runs twin-only panel guidance on first twin entry", async () => {
    addTourAnchor("left-dock");
    addTourAnchor("right-dock");
    useAppStore.setState({ hasSeenTour: true, hasSeenTwinTour: false });
    useWorkflowStore.setState({ stage: "twin" });
    useWorkspaceStore.setState({
      leftDockOpen: false,
      rightDockOpen: false,
    });
    const harness = driverHarness();
    renderHook(() => useOnboardingTour({ loadDriver: harness.loadDriver }));

    await waitFor(() => expect(harness.factory).toHaveBeenCalledTimes(1));
    expect(useWorkspaceStore.getState().leftDockOpen).toBe(true);
    expect(useWorkspaceStore.getState().rightDockOpen).toBe(true);
    expect(harness.configs[0].steps?.map((step) => step.element)).toEqual([
      '[data-tour="left-dock"]',
      '[data-tour="right-dock"]',
    ]);
  });

  it("replays a combined workspace and twin tour from the global control", async () => {
    addTourAnchor("left-dock");
    addTourAnchor("right-dock");
    useWorkflowStore.setState({ stage: "twin" });
    const harness = driverHarness();
    renderHook(() => useOnboardingTour({ loadDriver: harness.loadDriver }));

    act(() => requestGuide());

    await waitFor(() => expect(harness.factory).toHaveBeenCalledTimes(1));
    expect(harness.configs[0].steps).toHaveLength(4);
    expect(harness.configs[0].disableActiveInteraction).toBe(true);
  });

  it("does not create or persist a twin tour if the stage changes while loading", async () => {
    addTourAnchor("left-dock");
    addTourAnchor("right-dock");
    useAppStore.setState({ hasSeenTour: true, hasSeenTwinTour: false });
    useWorkflowStore.setState({ stage: "twin" });
    const harness = driverHarness();
    let resolveLoader: (
      factory: Awaited<ReturnType<GuideDriverLoader>>,
    ) => void = () => undefined;
    const pendingLoader = new Promise<
      Awaited<ReturnType<GuideDriverLoader>>
    >((resolve) => {
      resolveLoader = resolve;
    });
    const loadDriver = vi.fn(() => pendingLoader);
    renderHook(() => useOnboardingTour({ loadDriver }));

    await waitFor(() => expect(loadDriver).toHaveBeenCalledTimes(1));
    act(() => useWorkflowStore.setState({ stage: "upload" }));
    await act(async () => {
      resolveLoader(harness.factory);
      await pendingLoader;
    });

    expect(harness.factory).not.toHaveBeenCalled();
    expect(useAppStore.getState().hasSeenTwinTour).toBe(false);
  });
});
