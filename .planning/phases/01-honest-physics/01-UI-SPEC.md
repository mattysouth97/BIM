---
phase: "01"
slug: honest-physics
status: approved
shadcn_initialized: true
preset: new-york
created: "2026-09-15"
---

# Phase 01 — UI Design Contract

Retrospective contract for the Plan 01 lighting disclosure and corrected energy
figures; subsequent plans reuse these presentation rules for their assumption
text. Authored and checked inline, not by independent agents. User confirmed
the scope and wrapping on 2026-09-15: "현재 범위와 줄바꿈 방식 확정".

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing shadcn components; no installation |
| Preset | `components.json`: new-york, neutral, CSS variables |
| Component library | Installed radix-ui 1.4.3; React 19.2.4 |
| Icon library | Existing Lucide; no new icon |
| Font | Existing `--font-sans` / Geist Sans; inherit from globals.css |
| Scope | Add explanatory text inside existing energy panels; correct their values and labels |

The existing building viewer remains the visual anchor. Within the energy panel,
the grade and annual site intensity lead; the lighting equation follows the energy
basis; source and operating-hours assumptions are secondary paragraphs. Preserve
the four-step product flow and existing reference-model route.

## Component Inventory

Enumerated by `Get-ChildItem src/components/ui -Name` — 19 local components —
installed radix-ui@1.4.3 — 2026-09-15. This inventories local wrappers, not every
Radix package export. Version read from `node_modules/radix-ui/package.json`.

| Component | Import path | Notes |
|-----------|-------------|-------|
| accordion, badge, button, card, chart | `@/components/ui/<name>` | Existing wrappers |
| dialog, dropdown-menu, input, label | `@/components/ui/<name>` | Existing wrappers |
| phase-ring, select, separator, settle-value | `@/components/ui/<name>` | Existing local components |
| skeleton, slider, sonner, table, tabs, textarea | `@/components/ui/<name>` | Existing wrappers |
| LightingLoadDisclosure | `@/components/viewer/lighting-load-disclosure` | Shared native paragraphs; no registry dependency |

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | New disclosure paragraph gaps and inset |
| sm | 8px | Existing compact group separation |
| md | 16px | Existing panel separation |
| lg | 24px | Existing section separation |

No new spacing exceptions. Existing component internals retain their current
layout; this contract does not authorize a phase-wide visual redesign.

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| New assumption and formula text | 10px | 400 | Inherited 1.5 |
| Existing compact labels | 12px | 400 | Inherited 1.5 |
| Existing panel body | 14px | 400 | Inherited 1.5 |

No new heading or display style. Existing headline figures keep their current
component styles. The new 10px disclosure matches adjacent provenance labels;
desktop and 390px mobile screenshots were inspected for legibility and wrapping.

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60% guideline) | `--background`, light `oklch(1 0 0)` | Existing page surface |
| Secondary (30% guideline) | `--muted`, light `oklch(0.97 0 0)` | Existing grouped surfaces |
| Accent (10% ceiling) | Existing semantic chart/grade colors | Grade badge and energy end-use marks only |
| Text | `--muted-foreground`, light `oklch(0.556 0 0)` | Disclosure inherits theme token |
| Destructive | Existing `--destructive` | No destructive action introduced |

The percentage split is a hierarchy guideline, not a measured screenshot claim.
No decorative accent is added. Dark mode inherits existing semantic token values;
this task did not perform a separate dark-mode browser audit.

## Copywriting Contract

| Element | Contract |
|---------|----------|
| Primary CTA | None introduced; disclosure is read-only |
| Lighting equation | Actual `LPD × conditioned area × annual hours ÷ 1000 = annual kWh`; every number comes from the computed load |
| Default LPD | Name the actual LPD, use-code default and assumption; never attribute it to the building register |
| User LPD | `조명전력밀도: 사용자 입력` / `LPD: user input` |
| Retrofit LPD | Name the actual LPD as an assumed LED target, never as measured input |
| Unrecorded LPD source | State that the actual LPD has no recorded source and is treated as an assumption |
| Operating hours | State the actual annual hours and use-code assumption, or unmatched-profile fallback |
| Site intensity | Annual site energy includes lighting; divide by the same conditioned intensity area used in the comparison |
| Grade explanation | Distinguish primary intensity from the actual site intensity shown on the card |
| Empty state | Keep the existing parent-panel empty state; missing intensity is `—`, zero remains zero |
| Loading state | Synchronous disclosure derives from the already mounted parent data; no separate request or spinner |
| Error state | No independent request/error state; missing provenance uses the explicit assumption sentence above |
| Destructive confirmation | Not applicable: no destructive action |

All new text has Korean and English variants. Preserve units and avoid truncating
the equation or hiding source text in a tooltip. Broader phase work must not call
derived weather or solar values measured values.

## UI Considerations

Confirmed elements: E1 lighting formula/source disclosure (static-content);
E2 site-intensity value and grade explanation (static-content). Existing forms,
navigation, chart interactions and model media are outside the changed interaction
scope. The heuristic missed E2; the author proposed its static-content kind and
the user confirmed the two-area scope. The compiled probe was rerun with explicit
`elements: ["static-content"]` overrides: 4 applicable, 4 explicitly resolved,
0 unresolved.

| Category | Element(s) | Status | Proposed resolution / evidence |
|----------|------------|--------|-------------------------------|
| overflow | E1, E2 | covered | Wrap text in the panel. KIT Office at 390px: clientWidth and scrollWidth both 390; disclosure width 358. |
| long-text | E1, E2 | covered | Preserve full Korean/English equation, provenance and grade explanation. Browser screenshots and DOM arithmetic checks support this contract. |

Evidence: `qa-evidence/phase01-task3/task3-lighting-disclosure-en.png` and
`qa-evidence/phase01-task3/task3-lighting-disclosure-mobile.png` (local ignored
artifacts); bilingual rendered-equation unit tests; reference grade-basis tests.
Arbitrary unbounded custom source strings were not separately browser-tested.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Existing local shadcn wrappers | No new blocks | No install required |
| Third-party registries | None | Not applicable |

## Checker Sign-Off

Inline review against the installed checker criteria, limited to the declared
changes; no independent-agent review claim.

- [x] Dimension 1 Copywriting: PASS — computed values and all source branches named
- [x] Dimension 2 Visuals: PASS — viewer/figures/disclosure hierarchy specified
- [x] Dimension 3 Color: PASS — existing semantic roles and accent scope specified
- [x] Dimension 4 Typography: PASS — constrained new text; existing styles preserved
- [x] Dimension 5 Spacing: PASS — new spacing uses 4px scale
- [x] Dimension 6 Registry Safety: PASS — no new registry code
- [x] Dimension 7 Inventory Provenance: PASS — filesystem enumeration and installed version

**Approval:** approved 2026-09-15. User reply: "현재 범위와 줄바꿈 방식 확정".
UI safety gate rerun: `block: false`.
