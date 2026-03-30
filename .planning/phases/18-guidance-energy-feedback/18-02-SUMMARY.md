---
phase: 18-guidance-energy-feedback
plan: "02"
subsystem: onboarding
tags: [driver.js, onboarding-tour, zustand, workspace]
dependency_graph:
  requires: ["18-01"]
  provides: ["hasSeenTour-flag", "useOnboardingTour-hook", "data-tour-attributes"]
  affects: ["src/store/app-store.ts", "src/components/workspace/workspace-shell.tsx"]
tech_stack:
  added: ["driver.js@1.4.0"]
  patterns: ["dynamic-import for CSS+JS tour library", "Zustand persist flag for one-time UX"]
key_files:
  created:
    - src/hooks/use-onboarding-tour.ts
  modified:
    - src/store/app-store.ts
    - src/components/workspace/workspace-shell.tsx
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Dynamic import of driver.js + CSS avoids SSR issues and skips load entirely for returning users"
  - "onDestroyStarted callback (not onDestroyed) used to mark tour complete — fires when user exits or completes"
  - "data-tour attributes on inner div containers (not ResizablePanel wrappers) for left/right docks — ensures driver.js can highlight the actual content area"
  - "WorkflowStepper wrapped in plain div for data-tour since component doesn't accept HTML data-* props"
metrics:
  duration_seconds: 195
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 5
---

# Phase 18 Plan 02: Onboarding Tour Summary

**One-liner:** driver.js 4-step onboarding tour with Zustand-persisted hasSeenTour flag, triggered once on first workspace visit.

## What Was Built

Installed driver.js 1.4.0 and wired a 4-step onboarding tour into the workspace. First-time visitors automatically see a guided overlay highlighting the workflow stepper, 3D viewport, left dock (scene outliner + catalog), and right dock (properties panel). The tour does not replay after completion — the `hasSeenTour` flag persists in localStorage via Zustand's partialize.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install driver.js + add hasSeenTour to app-store + create tour hook | c5f8445 | src/store/app-store.ts, src/hooks/use-onboarding-tour.ts |
| 2 | Wire tour into WorkspaceShell with data-tour attributes | d547061 | src/components/workspace/workspace-shell.tsx |

## Decisions Made

1. **Dynamic import pattern:** driver.js and its CSS are dynamically imported inside a `useEffect` after hydration. This prevents SSR errors and avoids shipping the library bundle to users who have already seen the tour.

2. **onDestroyStarted callback:** Used instead of `onDestroyed` to mark tour completion — this fires both when the user manually dismisses and when the tour finishes naturally.

3. **Inner div targeting for docks:** `data-tour` attributes placed on the inner container `<div>` elements of the left and right docks (not on `ResizablePanel`), ensuring driver.js highlights the visible dock content area.

4. **WorkflowStepper wrapper div:** Since `WorkflowStepper` is a component that doesn't forward HTML data attributes, it's wrapped in a `<div data-tour="stepper">` for tour targeting.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data-tour targets are live DOM elements that driver.js can locate.

## Self-Check: PASSED
