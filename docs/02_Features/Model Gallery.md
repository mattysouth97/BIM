---
type: feature
status: verified
last_verified: 2026-09-15
---

# Model Gallery

The landing route `/` presents the ingested reference buildings. Each card opens
its own `/models/[id]` route. It carries the source model's section datums, selected
quantities, extraction explanations and licence attribution. The gallery has no
diagnostic entry; see [[ADR-004 - The Landing Page Is a Model Gallery]].

## Presentation contract

The September 15 refinement follows the user's request for a consistent grid and
modern, minimalist typography:

- One column below 700 px, two from 700 px, three from 1120 px, inside a 1440 px
  container. Equal fractional grid rows keep all card heights consistent.
- Equal section-diagram frames and shared title, figure-start and source-footer
  positions make the collection easy to scan. Inner source paragraphs wrap at
  their natural length; no title, number or evidence text uses ellipsis.
- The existing Geist sans family provides the page title, card names and values;
  Korean falls back to the system sans face. Tabular figures retain number alignment.
  The section drawing retains its existing technical labels.
- Source and rights text remains fully visible. Each card explicitly states
  that it has no linked measured energy data; calculated energy is not monitoring.
- The card link has a visible keyboard focus outline. Hover only changes the
  border; reduced-motion preferences disable that transition.

Presentation lives in `src/components/landing/gallery.module.css` and the two
landing components. The catalogue remains owned by the generated manifest
projection in `src/lib/landing/gallery.ts` and `gallery-data.json`.

## Verification

At 390, 768 and 1440 px in Korean and English, Playwright checked equal card
heights and matching title/figure/footer offsets within 1 px, no clipped HTML
copy, no horizontal page overflow, and the absence of diagnostic links. A keyboard
activation opened the KIT Office route and its rendered canvas. All seven browser
tests passed on the local server; 29 gallery component and source-agreement tests
passed. TypeScript and scoped ESLint were clean.

Before/after screenshots and numeric geometry are retained locally under
`qa-evidence/gallery-grid/`. The original gallery had 22–30 clipped text elements
and 76–108 px card-height differences across these viewports; the revised gallery
had none. This verification covered the seven-model catalogue at that time.
New entries must run the same dynamic-count browser tests before release.

This is local verification. No production deployment was performed here.
