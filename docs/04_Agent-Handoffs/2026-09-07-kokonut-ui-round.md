---
type: handoff
status: implemented
last_verified: 2026-09-07
---

# Kokonut UI round — 2026-09-07

User request (08:00): *"Please use Kokonut UI to improve the UI components."*
Then: *"fan out subagents."* One session (`bim-a7`), three orchestrated runs:
an understand/design panel (8 surface readers, 3 source auditors, 3 proposals,
3 judges, 1 synthesizer), an implementation fan-out (1 foundation agent, 6
lanes on disjoint files, adversarial review + fix per lane) and a follow-up
that finished the reviews a spend limit had cut off, plus a separate review
of the shared tabs primitive.

## What "use Kokonut UI" came to mean here

Kokonut UI (kokonutui.com) is a shadcn registry of 51 copy-and-adapt
components on Tailwind + Motion. All 51 sources were cached and read. The
design panel's winning proposal — instrument fidelity, scored 38/39/40
against 37/36/38 (workflow friction) and 33/32/32 (considered delight) —
vendored **no file**. Every audited component hard-codes zinc/white/brand
colours and `dark:` literals that would fire inside the forced-light
`.landing-stage`, and several fake a state the product must never fake
(`file-upload` runs 0→100 % on a timer and fires success from the clock;
`ai-loading` is a scripted task log; `toolbar` sets the tool to `null` on
re-click and toasts "clicked!"; `hold-button` fills to 100 % and fires
nothing; `apple-activity-card` draws 479/800 as 85 %). What Kokonut *does*
carry is a set of mechanics this instrument lacked, so those were rebuilt on
the repo's Radix/shadcn primitives and oklch tokens, each marked in code with
`// Pattern: Kokonut UI "<name>" (kokonutui.com) — …`.

`motion` 13.2.0 is installed. Its only importers are
`src/components/ui/tabs.tsx` and `src/lib/motion.ts`; `MotionConfig
reducedMotion="user"` lives inside `Tabs`, so `/` never loads the runtime.

## Outcome table

| Kokonut source | Rebuilt as | Where | What changed for the user |
|---|---|---|---|
| smooth-tab | sliding selection pill in `ui/tabs.tsx` (`TabsList indicatorClassName`) | 지역으로/주소로 on the register sheet; 개요/재료/레이어/데이터 on every model page | the active tab's chip slides (spring 500/45, instant under reduced motion); inactive text is `text-muted-foreground` |
| loader | `ui/phase-ring.tsx` (one conic ring, indeterminate) | ledger loader, session loader, route `loading.tsx`, step-2 drop zone | the loader sentence now names the real phase: **record** (four register queries + VWorld outline) → **baseline** (model built and first run) → sample; no percentage anywhere |
| dynamic-text | `ui/settle-value.tsx` (keyed re-mount, 160 ms opacity settle, never on first paint) | energy strip intensities, NPV/회수기간/투자비, delta strip | replaces `AnimatedValue`, a rAF count-up that printed ~24 numbers the engine never produced and froze at ~4 % in background tabs |
| carousel-cards | arrows + edge fades on the measure chip row | 공사 선택 row on `/models/[id]` and `/building/[id]` | the chosen chip is scrolled into view once after the seed; ‹ › appear only when content is clipped and disable at the true ends |
| file-upload | drag-depth counter, in-zone processing layer, limits line, file name/size | twin step 2 `upload-dropzone`; diagnosis hero card (now a real drop target, multi-file) | no flicker over children; "파일을 읽는 중…" is a real operation phase; only a file drag lights the zone; the size caption is measured, not the limit-rounding |
| toolbar | named tools with `aria-pressed`, draft gate with a reachable reason, arm-then-confirm Clear | CAD viewer floating toolbar | draw tools are disabled with "(초안 편집 중에만)" when there is no draft; the grid toggle mirrors what is drawn; a stale draw tool falls back to pan |
| avatar-picker | stage + `aria-pressed` strip keyed by **ring index** | LayerPicker (needs-pick) | fixes a real bug: two rings on layer "0" highlighted together and confirm committed the first match |
| use-debounce | `hooks/use-debounce.ts` | 예산 (선택) field | the knapsack no longer re-prices at 5, 50, 500 while 5000 is typed |

Incidental fixes surfaced by the audit and kept because each was a label that
lied: header theme label reads `resolvedTheme`; schematic hints no longer
promise a Generate button (the diagnosis reads boundaries only); schematic
Clear asks first (Dialog); stage nav reads 모델 검사 / 시뮬레이션 to match the
panel eyebrows; `--header-height` is defined on `:root` (49 px) because a
custom property on the sibling `<header>` never reached the nine
`var(--header-height, 3.5rem)` readers under `<main>`.

Rejected with a verified defect (35 entries, full list in the session plan):
every background and text effect (ADR-004 keeps `/` bare; Hangul in the
latin-subset mono faces), spotlight/bento/card-stack/glass cards, hold-button,
switch-button, morphic-navbar (a second front door), smooth-drawer (needs
vaul, unmounts content the panels must keep), ai-prompt/ai-voice/profile
dropdown (imply accounts, a model picker, a microphone), the 법정동
typeahead (deferred — open question below).

## Verification (this checkout, 2026-09-07 13:30)

- TypeScript clean. ESLint `src` + `e2e`: 0 errors, the same 6 pre-existing
  warnings as before the round.
- Vitest, full: 5,518 passed, 4 skipped (459 files; 26 new tests, among them
  the two-rings-on-layer-0 case, the drop-target sequence, the toolbar gate
  and the Clear arm-then-confirm).
- Playwright, targeted 16 specs: 139 passed. Full suite: 161 passed (3.4 m),
  against the running dev server at 127.0.0.1:3000.
- Screenshots at 1440 px against the pre-round baseline: landing and
  releases unchanged; ledger differs in the tab pill only; model page and
  `/building/demo` differ in the chip-row arrows and the scrolled-in PV chip,
  with the strip figures 1+ / 108.8 / 23.1 / 180,580 W identical; upload
  gains the drop hint and the two renamed stage labels. Deep link
  `/models/x#materials` no longer slides the pill on first paint (static
  pre-hydration pill, then the shared pill mounts in place).

## Flagged, not fixed

- `use-editor-keybinds.ts` preventDefaults Tab window-wide while the CAD
  viewer is open, so `role="toolbar"` is still keyboard-unreachable
  upstream; no roving tabindex was added.
- Korean already sits in mono faces on the reference notice band
  (`reference-energy.tsx`) and in the markup overlay's SVG notes — pre-existing,
  outside these lanes.
- The shadcn Dialog/Select/Accordion enter/exit classes are inert (no
  `tw-animate-css`); the schematic Clear dialog therefore opens instantly and
  has no reduced-motion concern.
- NPV/회수기간/투자비 settle once on a ko↔en toggle because the string
  re-formats; the value did not change. Recorded, not fixed.
- On the ledger sheet under a saved dark theme the active pill is the dark
  `bg-input/30` chip (parity with the previous trigger classes), not the
  white card the forced-light palette shows in light mode.

## Open questions for the user

1. 법정동 typeahead above the 시/도 → 시/군/구 → 법정동 cascade (Kokonut
   action-search-bar's mechanic). Deferred: a new feature, 1.57 MB of codes on
   the first door, IME handling. Default taken: not in this round.
2. The theme toggle on `/` and the ledger sheet flips a theme those
   forced-light pages do not display. Default taken: keep it visible; its
   label is now honest (`resolvedTheme`).
