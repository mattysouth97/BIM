---
phase: 13
slug: structural-analysis-visualization
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + happy-dom |
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
| 13-01-01 | 01 | 1 | STRUCT-02, STRUCT-03 | unit (TDD) | `pnpm vitest run src/lib/__tests__/structural-codes.test.ts` | Created in task | pending |
| 13-01-02 | 01 | 1 | STRUCT-04 | build | `pnpm build` | N/A (type/store changes) | pending |
| 13-02-01 | 02 | 2 | STRUCT-01, STRUCT-02 | unit (TDD) | `pnpm vitest run src/lib/layers/__tests__/layer-15-structural.test.ts` | Created in task | pending |
| 13-02-02 | 02 | 2 | STRUCT-03, STRUCT-04 | build | `pnpm build` | N/A (R3F component) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `src/lib/__tests__/structural-codes.test.ts` — created by Plan 01 Task 1 (TDD task writes tests first)
- [x] `src/lib/layers/__tests__/layer-15-structural.test.ts` — created by Plan 02 Task 1 (TDD task writes tests first)

*Both Wave 0 test files are created within their respective TDD tasks (tests written before implementation).*

---

## Nyquist Sampling Continuity

Consecutive task verify sequence:
1. 13-01-T1: `pnpm vitest run src/lib/__tests__/structural-codes.test.ts` (unit test)
2. 13-01-T2: `pnpm build` (build)
3. 13-02-T1: `pnpm vitest run src/lib/layers/__tests__/layer-15-structural.test.ts` (unit test) -- breaks the build-only chain
4. 13-02-T2: `pnpm build` (build)

No 3 consecutive tasks use only `pnpm build` as verify.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Load path arrows animate with 2s pulse cycle | STRUCT-01 | WebGL animation not testable headlessly | Toggle layer 15 on, verify arrows pulse from roof to foundation |
| Stress colors display correctly on columns | STRUCT-02 | WebGL color rendering | Toggle layer 15, verify green/yellow/red per column |
| Member sizing tooltip appears on hover | STRUCT-03 | Mouse interaction + WebGL | Hover column with layer 15 on, verify tooltip with dimensions |
| Layer 15 toggle works independently | STRUCT-04 | Layer panel interaction | Toggle layer 15 on/off while other layers are visible |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
