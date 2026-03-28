---
phase: 11
slug: room-boundaries-3d-extrusion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react + happy-dom |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test --run && pnpm build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm test --run && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | PLAN-02 | unit | `pnpm test --run` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | PLAN-02 | unit | `pnpm test --run` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | PLAN-03 | unit | `pnpm test --run` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | PLAN-04 | unit | `pnpm test --run` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 3 | PLAN-03 | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/room-detection.test.ts` — stubs for PLAN-02 room detection
- [ ] `src/store/__tests__/plan-store-rooms.test.ts` — stubs for room/opening store actions

*Existing test infrastructure from Phase 10.1 covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Room fills render with correct color/opacity in plan view | PLAN-02 | WebGL canvas not inspectable in headless tests | Toggle plan view, draw enclosing walls, verify colored fill appears |
| Door/window snap to wall visually | PLAN-04 | Raycasting behavior requires visual confirmation | Enter authoring mode, click near wall in plan view, verify component snaps |
| 3D extrusion renders correctly when switching view mode | PLAN-03 | WebGL rendering | Draw walls in plan view, switch to 3D, verify extruded walls visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
