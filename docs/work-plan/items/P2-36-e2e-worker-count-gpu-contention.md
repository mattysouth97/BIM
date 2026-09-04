---
id: P2-36
title: Playwright's default worker count puts twelve GPU-bound browsers on one integrated GPU
priority: P2
area: infra
status: todo
owner: unassigned
effort: S
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-01, UC-05]
---

# P2-36 — The e2e suite defaults to more parallelism than the GPU can serve

Filed 2026-09-04 by red as a first measurement, not a diagnosis. **No config
change was made.** The curve below is the useful part; it should be re-taken on
a quiet machine before anything is changed.

## 1. Requirement (RE)

`playwright.config.ts` sets `workers: process.env.CI ? 1 : undefined`. Locally
`undefined` means half the logical cores. This machine has **24 logical cores**,
so the local default is **12 workers** — twelve concurrent Chromium instances,
each rendering a WebGL scene, all against one integrated GPU (Intel Core Ultra 9
285). Since `4cd33f4` pointed ANGLE at the real GPU, that contention is GPU
contention; before it, the same twelve contended on SwiftShader in software.

Memory is **not** the constraint: 102 GB total, 52 GB free during the runs.

## 2. Measurement

Full suite, 43 tests, run back to back on the shared tree against one dev
server, so the eight-session background load is at least common to every row.
**That background load is a confound, and it is why the numbers need re-taking
on a quiet machine.**

| workers | result | wall |
|---|---|---|
| 1 | 43 passed / 0 failed | 3.9m |
| 1 (repeat) | 42 / 1 | 2.5m |
| 2 | 42 / 1 | 2.9m |
| **4** | **43 / 0** | **2.2m** |
| 6 | 33 / 10 | 2.9m |
| 12 (local default) | 21 passed, rest failed | 3.0m |

Two things stand out. **Four workers was both green and the fastest row
measured**, faster than one worker, so the answer is not simply "run it
serially". And the collapse between 4 and 6 is steep, which is what a saturating
shared resource looks like rather than a gradual slowdown.

The single failures at 1 and 2 workers did not reproduce in isolation
(`cad-reconstruction.spec.ts` 5/5 twice, 29.0 s and 30.3 s), so those are
contention too, not defects.

## 3. What this reframes

The default-workers collapse had been attributed to "eight agent sessions on one
machine". That is a real confound but not the whole story: a single developer
running the suite on this hardware also gets 12 GPU-bound browsers against one
iGPU. That makes it plausibly repo-fixable rather than purely local conditions.

## 4. What to do next

1. Re-take the curve on a quiet machine with no other sessions running. If the
   4-versus-6 cliff survives, it is the GPU and not the agents.
2. Only then consider a worker cap. If one is added, record *why* — a GPU-bound
   suite, not a magic number — and leave CI's `workers: 1` alone.
3. Consider whether a cap belongs only to the GPU-heavy specs. Most of the 43
   tests never mount a viewer and parallelise fine.

## 5. Related

- `4cd33f4` — the ANGLE change that made the suite GPU-bound rather than
  CPU-bound, with the shader-compilation measurements behind it.
- [[P2-35]] — the same subsystem from the product side.
