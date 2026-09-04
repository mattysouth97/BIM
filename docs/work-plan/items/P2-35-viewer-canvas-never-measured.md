---
id: P2-35
title: The viewer canvas can stay at its 300x150 default and render nothing until something forces a measure
priority: P2
area: viewer
status: todo
owner: unassigned
effort: M
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-04, UC-05]
---

# P2-35 — A blank viewport that a single resize event fixes

**Read the whole of §1 before starting. This item is filed with a confirmed
observation and NO reliable reproduction, and the two must not be confused.**

Found on 2026-09-04. Observed by the coordinating session (violet) in real
headed Chrome; twenty-four attempts to reproduce it under Playwright by another
session (red) all failed. Filed deliberately unfixed at the end of the day: it
is a race in the viewer's mount path, and that is not a change to land in the
last hour with two other sessions working in adjacent files.

## 1. Requirement (RE)

### What was observed

Cold load of `/building/demo` in real headed Chrome, default realistic mode.
Measured, not eyeballed:

| | |
|---|---|
| canvas elements | 1 |
| canvas size | **300 x 150** — the HTML default, never sized |
| middle pixel | `[0,0,0,0]` — fully transparent, nothing drawn |
| WebGL context | alive, `isContextLost()` false |
| console errors | none |
| Next error overlay | absent |
| parent element | **1005 x 1919** — the container has size, the canvas does not |

Dispatching one `window.dispatchEvent(new Event('resize'))` made it
**1005 x 1919** (backing store 1105 x 2110) and the building rendered
correctly. The same page had rendered fine an hour earlier, so it is
intermittent.

### What did NOT reproduce it

Twenty-four cold loads of `/building/demo` under Playwright-driven Chromium,
**zero blank**. No animation frames were driven and no resize was dispatched,
so the harness was not masking it:

| trial | origin | viewport | mode | blank |
|---|---|---|---|---|
| 6 runs | 127.0.0.1:3000 | 1280x900 | headless | 0/6 |
| 6 runs | 127.0.0.1:3000 | 1280x900 | headed | 0/6 |
| 4 runs | localhost:3000 | 1280x900 | headless | 0/4 |
| 4 runs | localhost:3000 | 1005x1919 | headed | 0/4 |
| 4 runs | 127.0.0.1:3000 | 1005x1919 | headed | 0/4 |

The canvas was correctly sized within 3 s in all 24, and still correct at 10 s.
Note the layout differs from the observation even at the same viewport: at
1005x1919 the canvas measured 397x1715 here, against a 1005x1919 parent there,
so the two setups were not rendering the same layout. That difference is itself
a clue and should be chased.

**The trigger is not established.** Do not begin by writing a fix. Begin by
reproducing it, and expect "I cannot reproduce it" as the first result.

### Why it matters anyway

A user landing in this state sees an entirely blank 3D panel with no error of
any kind, and the app looks broken. It self-heals on any window resize, which is
the exact shape of a bug reported as "it works if I resize the window" and then
closed as unreproducible.

## 2. Specification (SDD)

### The mechanism, as far as it is understood

React Three Fiber sizes its canvas from `react-use-measure`
(`node_modules/.pnpm/react-use-measure@2.1.7*`), which:

- creates a `ResizeObserver` over the container and **debounces its callback** —
  R3F passes `debounce: { scroll: 50, resize: 0 }`, and the observer is wired to
  the *scroll*-debounced callback, so observer delivery sits behind a 50 ms
  `setTimeout`;
- **discards any measurement taken while its internal mounted ref is false**
  (`mounted.current && !equal(lastBounds, l) && setState(...)`);
- suppresses the state update when new bounds equal `lastBounds`, whose initial
  value is all zeros — so a measurement reading **0 x 0** is indistinguishable
  from "no change" and leaves `lastBounds` at zero.

R3F does not create its root until the measured size is non-zero. So any path
where the observer's only delivery reports zero, or is dropped by the mounted
guard, leaves the canvas at the browser default of 300 x 150 indefinitely —
until a resize, a scroll, or an orientation change calls the measure again. That
is consistent with every symptom above, including the one-event cure.

### Ranked hypotheses, most likely first

1. **Persisted panel layout hydrating after mount, resizing the container under
   the observer.** This is the strongest lead, and it comes from the one hard
   difference between the two setups: at the *same* 1005x1919 viewport the
   observation had a **1005x1919** viewer parent and the reproduction attempts
   had a **397x1715** one. The viewer was in a full-width layout there and in a
   ~397 px column here, so the two differed in panel state before any rendering
   question arises.

   Verified while filing this: `sidePanelOpen` is persisted through zustand
   `persist` and is included in the partialize list
   (`src/store/app-store.ts:66`), and the reproduction attempts seeded it
   `true` in `localStorage` while real Chrome carried whatever the user last
   left. That alone accounts for the width difference.

   The race follows from the repo's own known issue: **zustand persist plus SSR
   hydration**, which is why `useHydration()` exists. The server renders the
   default layout, hydration then applies the persisted layout, and the viewer's
   container changes width shortly after mount. Whether that lands before or
   after the `ResizeObserver` attaches is exactly the kind of thing that varies
   run to run — which fits an intermittent bug far better than a constant one.
   A first visit and a returning visit are genuinely different mount conditions.

   **This is a mechanism worth testing, not a proven cause.** Test it by loading
   with each persisted `sidePanelOpen` value, and by toggling the panel state
   between loads, rather than by reasoning about it.

2. **Page visibility / occlusion.** A backgrounded, occluded or not-yet-painted
   tab throttles animation frames and can defer observer delivery. The
   observation came from a browser-extension-driven real Chrome, where the tab
   is not necessarily foreground; every failed reproduction was a Playwright tab
   that was the only tab in its browser. Ranked second only because hypothesis 1
   explains the *layout* evidence as well as the race, but this remains **the
   cheapest single thing to test** — do it first if time is short.

3. **ResizeObserver attaching to a container already at its final size.** The
   classic form of this bug, and the general case of hypothesis 1. It is not
   obviously the mechanism on its own, since a `ResizeObserver` does fire an
   initial callback on `observe()`, but combined with the zero-equals-zero
   suppression above it is plausible.

### What a fix would look like (do NOT write it before reproducing)

Candidates, cheapest first: give the `Canvas` an explicit `resize` config; force
one measure on mount; or set an initial size. All three touch the viewer's mount
path in `src/components/viewer/building-scene.tsx`, which is released and
heavily shared — agree the location before writing.

## 3. Constraints (CDD)

- **Must not** be "fixed" by dispatching a synthetic resize from app code on
  mount. That hides the bug and costs a layout pass on every mount.
- **Must not** land without a reproduction. A race fixed blind is a race that
  moves.
- `building-scene.tsx` is the single Canvas mount for both the twin and the
  diagnostics scene, so a regression here is a regression everywhere.

## 4. Evaluation (EDD)

- A reproduction, or an honest stated frequency ("1 in N under conditions X").
- A regression test that fails before the fix. **Trap:** an assertion that polls
  via `page.waitForFunction` polls on animation frames and therefore *supplies*
  the frame the app is missing — it can make this bug disappear rather than
  detect it. `e2e/plan-view.spec.ts` uses exactly that assertion, correctly, for
  a different purpose. A regression test for THIS bug must observe without
  driving frames.

## 5. Notes

The interaction that hid this: the same missing-measure mechanism was diagnosed
earlier the same day as a pure test-harness artifact in `plan-view.spec.ts`,
where a `boundingBox()` poll waited ~12 s for a canvas the DOM had sized within
~650 ms. Replacing that poll with `waitForFunction` was correct for the test,
and it also, accidentally, supplied the animation frame the app needs — which is
why the product bug stayed hidden behind a test-harness explanation. See
`4cd33f4`.

Related: [[P2-36]] covers the same subsystem from the test-infrastructure side.
