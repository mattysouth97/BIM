---
phase: "1"
slug: "honest-physics"
# status lifecycle: draft (seeded by plan-phase) -> validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-15"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` § Validation Architecture. Task-ID rows are seeded
> per requirement here because plans did not exist when this file was written;
> `/gsd-validate-phase` fills the task column once PLAN.md tasks are assigned.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 (confirmed installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `node node_modules/vitest/vitest.mjs run src/lib/energy` |
| **Full suite command** | `node node_modules/vitest/vitest.mjs run` |
| **Typecheck command** | `node node_modules/typescript/bin/tsc --noEmit` |
| **Estimated runtime** | quick ~15s, full suite ~3-5 min |

Bare `pnpm` and `pnpm exec` must NOT be used on this machine (AGENTS.md) — invoke
binaries directly via `node node_modules/<pkg>/...` exactly as written above.

---

## Sampling Rate

- **After every task commit:** `node node_modules/vitest/vitest.mjs run <changed-directory>`
- **After every plan wave:** `node node_modules/vitest/vitest.mjs run` (full suite — REQUIRED, not optional: the D-05/D-07 signature change touches 8 test files by direct import plus an unbounded transitive set through `use-energy-metrics` / `retrofit-delta` / `energy-dataset`)
- **Before `/gsd-verify-work`:** full suite green AND `node node_modules/typescript/bin/tsc --noEmit` clean
- **Max feedback latency:** 300 seconds

`tsc --noEmit` is a phase gate, not a nicety: the signature change is exactly the
class of change the compiler catches at every call site.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PHYS-01 | — | N/A | unit | `node node_modules/vitest/vitest.mjs run src/hooks/__tests__/use-energy-metrics.test.tsx` | exists — needs new assertions that `siteTotal` moves, not only `grade` | pending |
| TBD | TBD | TBD | PHYS-02 | — | N/A | unit | `node node_modules/vitest/vitest.mjs run src/lib/retrofit/__tests__/retrofit-delta.test.ts` | exists — needs a case exercising a `pvRoofType*` measure id asserting `pricedByEngine: true` | pending |
| TBD | TBD | TBD | PHYS-03 | — | N/A | unit | new test against `material-inference.ts` LPD fact-wrapping | MISSING — Wave 0 | pending |
| TBD | TBD | TBD | PHYS-04 | — | N/A | unit (contract, build-failing per D-15) | `node node_modules/vitest/vitest.mjs run src/lib/retrofit/__tests__/twin-diagnostics-parity.test.ts` | MISSING — Wave 0 | pending |
| TBD | TBD | TBD | PHYS-05 | — | N/A | unit (dataset snapshot) + manual (changelog) | `node node_modules/vitest/vitest.mjs run src/lib/reference-buildings` | exists — hard-coded expected numbers WILL change; that is expected breakage, not regression | pending |

*Status: pending / green / red / flaky*

**Failure signals** (what makes each command a real check):
- Any Vitest command: non-zero exit, or `Tests  0 passed` in the summary line.
- `tsc --noEmit`: non-zero exit, or any line matching `error TS`.

---

## Wave 0 Requirements

Owners assigned by plan-phase on 2026-09-15. Each gap is closed by the FIRST task of the plan
that implements the behaviour it tests, so the test is written red before the code moves.

- [ ] `src/lib/retrofit/__tests__/twin-diagnostics-parity.test.ts` — D-15's build-failing contract test does not exist → **Plan 01-04, Task 1** (written red; its failure must show a `solar-pv-` id present on one side only)
- [ ] A test asserting `material-inference.ts`'s inferred LPD is disclosed as a named assumption (PHYS-03) — no existing test covers this non-ledger inference path → **Plan 01-01, Task 3** (`src/lib/__tests__/material-inference-lpd.test.ts`)
- [ ] A test asserting `useEnergyMetrics().siteTotal` moves on a lighting change, not only `.grade` / `.primaryEnergyPerArea` — this is the assertion that would have caught the `calculateSystemBreakdown` gap → **Plan 01-01, Task 1** (written red; leads the phase's tracer)

Framework install: none needed — Vitest, Playwright, TypeScript and ESLint are all present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PHYS-05 changelog entry exists and names the physics change | PHYS-05 | The destination file is an open decision (`public/releases/CHANGELOG.md` documents a different, superseded product) | Read the changelog the plan selects; confirm it names the corrected split, the raised schema version, and the date |
| Disclosure strings read as assumptions beside the numbers they explain | PHYS-03 | AGENTS.md: a string can contain the right words and still contradict the value it sits next to | Open a reference-building page with an inferred LPD and with `capacity: 0`; parse each disclosure sentence back out and check it reproduces the number shown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
