---
type: reference
status: implemented
last_verified: 2026-09-02
---

# Visual QA

## Cameras

| Id | Preset | Purpose |
|---|---|---|
| CAM_01 | architectural-exterior | Street-oblique facade (iso) |
| CAM_02 | street | Window close-up |
| CAM_03 | birds-eye | Roof, ground, context |
| CAM_04 | architectural-exterior + golden | Time-of-day |

Script: `node scripts/render-visual-qa.mjs` (dev server on :3000, sample
building `/building/demo`).

Shots land in `docs/rendering/qa/`.

## Loop

1. Load `/building/demo` with `bim-render-settings` in localStorage
2. Dismiss the driver.js tour (`hasSeenTour: true`)
3. Wait for canvas + 5 s for texture atlas / sky PMREM
4. Capture the `[data-tour=viewport]` region
5. Compare BIM vs realistic vs golden vs street vs aerial

## Defects still open

See [[BEFORE_AFTER_REPORT]] — remaining issues are curtain-wall typology
(thin white spandrels), simple tree impostors, neighbor massing boxes, and
WebGL sky that stays pale under ACES in headless Chromium.
