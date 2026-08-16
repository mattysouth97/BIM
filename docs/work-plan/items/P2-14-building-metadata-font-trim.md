---
id: P2-14
title: generateMetadata on /building/[id] via a thin server wrapper + font payload trim
priority: P2
area: infra
status: done
owner: claude-fable-5-session
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-03]
---

# P2-14 — Building-page metadata + font payload trim (P2-03 follow-up)

Split out from P2-03. The four App Router convention files, `parseBuildingId` +
`notFound()`, `/releases` dynamic, and the header `next/link` all landed in
P2-03; these two remaining pieces carry refactor/optimization risk and were
deferred to keep P2-03's core low-risk and fully verified.

## 1. Requirement (RE)
- `/building/[id]` has no `generateMetadata`, so shared links lack building-specific
  titles/description. The page is a client component, so metadata needs a thin
  **server wrapper** (`page.tsx` server → renders a `building-workspace.tsx` client
  child, passing `params` through). Derive title from the parsed id (or the composite
  building fetch) without leaking secrets.
- `src/app/layout.tsx` loads 4 Google variable fonts (incl. 3-axis Fraunces) on every
  route; the display fonts are only used on the Twin stage. Load display fonts only
  where used (route-level or subset) to cut the landing-route font payload.

## 2. Specification (SDD)
- Server-wrapper pattern per this repo's Next docs (`next/dist/docs/01-app/.../generate-metadata.md`).
- Keep the client workspace behavior byte-identical (mechanical move).
- Font trim must preserve the Twin-stage Fraunces identity.

## 3. Constraints (CDD)
- **May touch**: `src/app/building/[id]/**`, `src/app/layout.tsx`.
- **Must not**: change workspace behavior, API routes, or the explorer-purity guard.
- **Fitness**: `generateMetadata` present on the building route; zero Google-font
  fetches for fonts unused on the landing route.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`; manual: a `/building/<valid-id>`
  share preview shows the building title.
- **Acceptance criteria**:
  - [x] `generateMetadata` on `/building/[id]` via a server wrapper; client workspace unchanged.
  - [x] Display-font payload reduced on the landing route.
- **Done when**: shared building links show building-specific titles and the landing
  route no longer ships unused display fonts.
