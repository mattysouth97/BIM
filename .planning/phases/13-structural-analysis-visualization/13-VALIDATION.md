---
phase: 13
slug: structural-analysis-visualization
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 13-01-01 | 01 | 1 | STRUCT-01, STRUCT-02 | unit | `pnpm test --run` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | STRUCT-03 | unit | `pnpm test --run` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | STRUCT-01, STRUCT-02 | build | `pnpm build` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | STRUCT-04 | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/structural-analysis.test.ts` — stubs for load calculation and stress level functions
- [ ] `src/lib/__tests__/structural-codes.test.ts` — stubs for Korean code sizing table lookups

*Existing test infrastructure from Phase 10.1 covers framework setup.*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
