---
id: P0-01
title: Secure twin-data routes against path traversal and unauthenticated writes
priority: P0
area: api
status: done
owner: claude-fable-5-ultrawork
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-04, UC-05]
---

# P0-01 — Secure twin-data routes against path traversal and unauthenticated writes

## 1. Requirement (RE)

- **Problem**: The twin-data API routes join a user-supplied `buildingId` directly into a
  filesystem path with no sanitization, no authentication, and no body-size cap.
  - `src/app/api/twin-data/upload/route.ts:9-11` — `getTwinDataPath()` does
    `path.join(process.cwd(), ".twin-data", buildingId, ...)`; `buildingId` is only checked
    for non-empty (`:27-29`), so `../../x` escapes `.twin-data` and the write at `:46-53`
    (`fs.mkdir` + `fs.writeFile`) becomes an **unauthenticated arbitrary file write**.
  - `src/app/api/twin-data/[buildingId]/route.ts:9-11,35` — same unsanitized join on the GET
    path; `../../etc/passwd`-style reads are attempted (content is not returned verbatim, but
    the traversal is still real and `buildingId` is reflected into the 404 error at `:45`).
  - No auth on either route; no JSON body-size cap on POST; no rate limit.
  - `upload/route.ts:59` — response leaks the absolute server path: `storedAt: filePath`.
  - `[buildingId]/route.ts:51` — `lastUpdated: new Date().toISOString()` reports response
    time, not data time (dishonest metadata).
- **Impact**: Any unauthenticated network caller can write attacker-controlled JSON to
  arbitrary paths on the server disk (potential RCE via writable config/startup files,
  disk-fill DoS via unbounded body), probe the filesystem via the GET route, and learn
  absolute server paths from responses.
- **Use case**: As the platform operator, I want twin-data upload/read endpoints to accept
  only slug-shaped building ids, require an API key on writes, and cap request bodies, so
  that the local/preview server cannot be used as an open file-write oracle.

## 2. Specification (SDD)

- **Context pack** (read first, in order):
  1. `src/app/api/twin-data/upload/route.ts` (full file, 60 lines) — POST handler to harden.
  2. `src/app/api/twin-data/[buildingId]/route.ts` (full file, 68 lines) — GET handler to harden.
  3. `src/app/api/v1/eco2-imports/route.ts:60-97` — the in-repo reference pattern:
     `MAX_BODY_BYTES = 64 * 1024` (`:60`, enforced via content-length at `:88-91`),
     `BUILDING_PK_PATTERN` regex (`:61`), `safeKeyEquals()` constant-time compare (`:63-69`),
     dev-only gate (`:81`). Mirror this style; do not import from the route file.
  4. `src/app/api/v1/eco2-imports/__tests__/route.test.ts:39-56` — test DI style:
     `fs.mkdtemp` + `process.chdir(tempDir)` + `vi.resetModules()` + `vi.stubEnv` +
     dynamic `await import("../route")`. Twin-data tests must reuse this pattern so
     `.twin-data` writes land in a temp dir.
- **BDD scenarios**:
  1. *Traversal rejected on POST*: Given a POST body `{ buildingId: "../../evil", dataType: "energy-bills", data: {...} }` with a valid key, When the route handles it, Then it returns 400 and **no file is created** outside `.twin-data` (assert temp dir tree unchanged).
  2. *Traversal rejected on GET*: Given `GET /api/twin-data/..%2F..%2Fevil`, When the route handles it, Then it returns 400 (not 404, not a filesystem read).
  3. *Unauthenticated POST rejected*: Given no/invalid `x-twin-data-key` header, When POSTing a valid body, Then 401 and nothing is written.
  4. *Oversized body rejected*: Given `content-length` > 65536, When POSTing, Then 413 before body parsing.
  5. *Happy path*: Given a slug `bldg_01-A` and a valid key, When POSTing then GETting, Then POST returns 200 with `storedAt` as an ISO timestamp (no path substring like `.twin-data` or drive letters), and GET returns `lastUpdated` equal to the stored `storedAt`, not the response wall-clock time.

## 3. Constraints (CDD)

- **Design constraints**:
  - Validate `buildingId` against `/^[A-Za-z0-9_-]{1,64}$/` on **both** routes; reject with 400 on mismatch.
  - Resolve paths with `path.resolve(...)` and verify containment: the resolved file path must start with the resolved `.twin-data` root + `path.sep`; reject otherwise (defense-in-depth behind the regex).
  - Extract the shared logic (slug validation, containment-checked path builder, key compare, body-size guard) into a new module, e.g. `src/lib/twin-data/guards.ts`, imported by both routes. Server-only code; no React.
  - Auth: POST requires header `x-twin-data-key` matching env `TWIN_DATA_API_KEY`, compared with `crypto.timingSafeEqual` (copy the `safeKeyEquals` pattern from `eco2-imports/route.ts:63-69`). If the env var is unset, POST must fail closed (401/503 — pick one and document it in the route header comment; mirror `eco2-imports/route.ts:93-97` semantics).
  - Body cap: `MAX_BODY_BYTES = 64 * 1024`, enforced on `content-length` before `request.json()` (413), mirroring `eco2-imports/route.ts:88-91`.
  - POST response: return `{ success: true, storedAt: <ISO timestamp> }` — never the filesystem path.
  - GET `lastUpdated`: read each stored file's `storedAt` field (already written at `upload/route.ts:51`) and return the max; if a file lacks `storedAt`, fall back to `fs.stat` mtime; never `new Date()` of the response.
  - Do not reflect raw `buildingId` into error bodies beyond the validated slug form.
- **May touch**:
  - `src/app/api/twin-data/upload/route.ts`
  - `src/app/api/twin-data/[buildingId]/route.ts`
  - new: `src/lib/twin-data/` (guards module + its tests)
  - new: `__tests__` directories next to the two routes
  - `.env.example` / `.env.local.example` if present (document `TWIN_DATA_API_KEY`; no real secrets)
- **Must not**:
  - Do not modify `src/app/api/v1/eco2-imports/**` (reference pattern only).
  - Do not change the `DataType` set (`energy-bills | floor-plans | equipment`) or the on-disk file layout (`<id>/<dataType>.json`).
  - Do not add external dependencies (no express-rate-limit, no zod schema for this — keep to the existing hand-rolled validator style).
  - Do not make GET require auth in this item (upload-write hardening is the P0; note GET auth as a P1 follow-up in the PR description if desired).
- **Fitness functions**:
  - `grep` of both routes shows no `path.join(process.cwd(), ".twin-data", buildingId` without an intervening slug validation + containment check.
  - POST with `buildingId` containing `/`, `\`, `..`, or length > 64 always yields 400; nothing is written (asserted by test).
  - POST response body contains no substring matching the repo root or `.twin-data`.
  - GET `lastUpdated` is byte-identical to the stored payload's `storedAt`.
  - `src/lib/twin-data/` contains no `"use client"` and imports no React.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/app/api/twin-data/upload/__tests__/route.test.ts` — mirror `eco2-imports/__tests__/route.test.ts` DI (tempdir chdir + `vi.stubEnv("TWIN_DATA_API_KEY", ...)` + dynamic import). Cases: (a) 400 on `../../x`, `a/b`, `a\b`, 65-char id, `id with space`; (b) 401 missing/wrong key; (c) 413 oversize content-length; (d) 200 happy path, response has ISO `storedAt`, file exists under tempdir `.twin-data/<id>/energy-bills.json`; (e) 400 invalid JSON / invalid dataType (regression: keep existing behavior).
  - `src/app/api/twin-data/[buildingId]/__tests__/route.test.ts` — (a) 400 on traversal ids (raw and URL-encoded forms after `await params`); (b) 404 for valid slug with no data; (c) 200 happy path where `lastUpdated` equals the stored `storedAt` written by the upload route (write a fixture file in the tempdir instead of calling POST if simpler); (d) camelCase key mapping regression (`energyBills`, `floorPlans`, `equipment`).
  - GET handler signature note: params arrive as `Promise<{ buildingId: string }>` (`[buildingId]/route.ts:23-27`); construct the same shape in tests.
- **Gates**:
  - `pnpm test -- twin-data`
  - `pnpm test -- eco2-imports` (reference route untouched, must stay green)
  - `pnpm lint`
  - `pnpm build`
- **Security / honesty checklist**:
  - No absolute or relative server path in any response body or error message.
  - Key comparison is constant-time; no logging of the provided key.
  - Validation failure happens before any `fs` call.
  - `lastUpdated` reflects data time, never response time.
  - `.env*` example files document `TWIN_DATA_API_KEY` with a placeholder value only.
- **Acceptance criteria**:
  - [x] Slug regex + `path.resolve` containment enforced on both routes (400 on violation).
  - [x] POST requires `x-twin-data-key` (timing-safe compare) and fails closed when env unset.
  - [x] 64 KB body cap returns 413 pre-parse.
  - [x] POST response carries ISO `storedAt`, no filesystem path.
  - [x] GET `lastUpdated` sourced from stored data.
  - [x] All new tests + existing 902-test suite green; lint/build green.
- **Done when**: Both twin-data routes reject traversal/unauthenticated/oversize requests with tests proving it, and no filesystem internals leak in responses.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- Implemented `src/lib/twin-data/guards.ts` (slug regex, containment-checked
  `resolveTwinDataPath`, `safeKeyEquals`, `exceedsBodyCap`); both routes rewritten on top.
- Fail-closed choice: **401** when `TWIN_DATA_API_KEY` unset (mirrors eco2-imports); documented
  in the upload route header comment.
- Gates: `vitest run twin-data` 33/33 · `vitest run eco2-imports` 12/12 (untouched, green) ·
  `pnpm lint` 0 errors (60 pre-existing warnings) · `pnpm test` 935 passed / 1 skipped ·
  `pnpm build` green.
- Security checklist: no path in any response (asserted by test); constant-time compare, key
  never logged; validation precedes every `fs` call; `lastUpdated` = stored `storedAt`
  (mtime fallback named in code + tested).
- Deviation note: repo has **no `.env*` example files** (may-touch said "if present"), so
  `TWIN_DATA_API_KEY` is documented in the guards/route header comments instead.
- Follow-up noted for P1-06: GET route remains unauthenticated by design in this item.
