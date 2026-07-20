---
id: P2-03
title: Adopt App Router conventions (error/loading/not-found, metadata, fonts, link)
priority: P2
area: infra
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-03]
---

# P2-03 — Adopt App Router conventions

## 1. Requirement (RE)
- **Problem**: no `error.tsx`/`loading.tsx`/`not-found.tsx`/`global-error.tsx` anywhere under src/app (verified by glob — only page/layout/route files exist). `decodeBuildingId` (src/lib/constants.ts:103-106) returns `{ sigunguCd: undefined, ... }` for malformed ids instead of triggering `notFound()` — e.g. `/building/test-id` silently renders an empty shell. `/releases` prerenders at build time: src/app/releases/page.tsx:12-34 reads via StaticFileReleaseStore (node:fs, src/lib/portfolio/release-store.ts:46 — brief cited src/lib/release-store.ts, corrected) with no `export const dynamic`/`revalidate`, so new releases require a rebuild. Only one static metadata export exists (src/app/layout.tsx:31-35); `/building/[id]` has none. Header logo is a plain div, not a `next/link` (src/components/layout/header.tsx:30-38). Four Google variable fonts incl. 3-axis Fraunces load on every route (layout.tsx:2,7-29).
- **Impact**: bad URLs yield 200-with-empty-page (SEO + UX), stale release pages, no per-building social/OG metadata, wasted font bytes.
- **Use case**: As a user I want invalid building URLs to 404, release pages fresh, and shared links to show building-specific titles.

## 2. Specification (SDD)
- **Context pack**: node_modules/next/dist/docs/ (App Router conventions — read the relevant guide FIRST per AGENTS.md; this Next.js version has breaking changes vs training data); src/app/building/[id]/page.tsx; src/app/releases/page.tsx; src/lib/constants.ts:93-106; src/components/layout/header.tsx; src/app/layout.tsx.
- **BDD scenarios**:
  1. Given `/building/not-a-real-id`, When decoded parts are missing/invalid, Then `notFound()` renders not-found.tsx with 404 status.
  2. Given an upstream API throw on the building page, When it fails, Then error.tsx boundary renders with a retry path, not a white screen.
  3. Given a new release directory added after deploy, When /releases is requested, Then it reflects the new manifest (dynamic or revalidated).
  4. Given `/building/[valid-id]`, When metadata is generated, Then title/description include the building's address/name via `generateMetadata` in a thin server wrapper.
  5. Given any route, When the header logo is clicked, Then it navigates to `/` via next/link.

## 3. Constraints (CDD)
- **Design constraints**: follow this repo's Next.js version docs, not memory; keep client components client — server wrappers must stay server components; font reduction keeps the Twin-stage Fraunces identity (load display fonts only where used, e.g. route-level or subset).
- **May touch**: src/app/** (new error/loading/not-found/global-error files, building/[id] wrapper, releases dynamic config), src/lib/constants.ts (decode validation or a new `parseBuildingId` returning null), src/components/layout/header.tsx, src/app/layout.tsx (fonts/metadata).
- **Must not**: change API route behavior, release-store internals, or e2e specs (P2-09 scope); do not remove the explorer-purity guard on /releases (scripts/ci-check-plan.mjs).
- **Fitness functions**: malformed id → 404; /releases has `export const dynamic = "force-dynamic"` or a finite `revalidate`; zero Google-font fetches for fonts unused on the landing route.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: unit test `parseBuildingId` (valid, missing segments, extra segments, empty); component/route test that building page calls `notFound()` on invalid id.
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build` (must pass with new files); manual: `curl -I /building/test-id` → 404.
- **Security / honesty checklist**: error.tsx shows no stack/env/secrets to the client; not-found copy bilingual-consistent with the language store (see P2-06).
- **Acceptance criteria**:
  - [ ] error/loading/not-found/global-error boundaries exist and render
  - [ ] Invalid building ids → 404
  - [ ] /releases no longer build-time stale
  - [ ] generateMetadata on /building/[id]; logo is next/link; font payload reduced
- **Done when**: the four convention files exist, malformed ids 404, and /releases serves current data without a rebuild.
