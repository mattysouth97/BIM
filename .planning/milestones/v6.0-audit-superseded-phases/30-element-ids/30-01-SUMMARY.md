---
phase: 30
plan: "01"
subsystem: bim/element-id
tags: [element-ids, uuid, registry, branded-types, typescript]
dependency_graph:
  requires: []
  provides: [ElementId, ElementRegistry, WallId, SlabId, ColumnId, WindowId, DoorId, MepInstanceId, AnnotationId, LevelId, GridId]
  affects: []
tech_stack:
  added: [UUIDv7 (hand-rolled, RFC-9562 compliant), branded TypeScript types]
  patterns: [Brand pattern for nominal typing, monotonic sequence for sub-ms UUIDv7 ordering, secondary-index Map registry]
key_files:
  created:
    - src/lib/bim/element-id.ts
    - src/lib/bim/element-record.ts
    - src/lib/bim/element-registry.ts
    - src/lib/bim/__tests__/element-id.test.ts
    - src/lib/bim/__tests__/element-registry.test.ts
  modified: []
decisions:
  - "Used Map (not WeakMap) for registry primary store — ElementIds are strings, WeakMap requires object keys"
  - "Monotonic 12-bit sequence counter in rand_a for same-ms ordering (RFC-9562 §6.2 method 3)"
  - "Kind prefix embedded in ElementId string (e.g. 'wall:...') so serialized IDs are self-describing without a lookup"
  - "ElementRecord.userData typed as Record<string,any> to remain open for v7.0 Family/Type/Instance extension"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 5
  files_created: 5
  files_modified: 0
---

# Phase 30 Plan 01: ElementId + Typed Branded IDs + Registry Summary

**One-liner:** RFC-9562 UUIDv7 generator with monotonic sequencing, 9 branded string types (WallId…GridId), and a Map-backed ElementRegistry with kind + buildingPk secondary indexes — the stable identity substrate for annotations, schedules, and views.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | `element-id.ts` — UUIDv7 generator + branded types + factory | b1714f9 |
| 2 | `element-record.ts` — ElementRecord + SerializedElementRecord interfaces | b1714f9 |
| 3 | `element-registry.ts` — ElementRegistry class + singleton export | b1714f9 |
| 4 | `__tests__/element-id.test.ts` — 20 tests (shape, format, collision, ordering) | b1714f9 |
| 5 | `__tests__/element-registry.test.ts` — 16 tests (CRUD, indexes, serialisation) | b1714f9 |

## Verification

- `pnpm test src/lib/bim/__tests__` — **36/36 tests pass**
- `pnpm build` — **clean, 0 TypeScript errors**
- 10,000 ID collision test: **0 collisions**
- Time-ordering test: **100 sequential IDs remain sorted after lexicographic sort**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed UUIDv7 timestamp encoding for correct time-ordering**

- **Found during:** Task 4 test run
- **Issue:** Initial implementation encoded `tsLow` (32-bit) as group 1 and `tsHigh` (16-bit) as group 2, which is the reverse of the standard layout. The 12-bit `rand_a` was also pure random rather than a monotonic counter. Both issues meant lexicographic sort did not match generation order within the same millisecond.
- **Fix:** Corrected to RFC-9562 layout: group 1 = upper 32 ms bits, group 2 = lower 16 ms bits. Added a module-level monotonic sequence counter (`_seq`) that increments within the same millisecond (method 3 from RFC §6.2) with random seed on ms boundary change.
- **Files modified:** `src/lib/bim/element-id.ts`
- **Commit:** b1714f9 (same commit, fix applied before commit)

## Known Stubs

None — module is pure logic with no UI rendering or data source wiring.

## Threat Flags

None — no network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- [x] `src/lib/bim/element-id.ts` — exists
- [x] `src/lib/bim/element-record.ts` — exists
- [x] `src/lib/bim/element-registry.ts` — exists
- [x] `src/lib/bim/__tests__/element-id.test.ts` — exists
- [x] `src/lib/bim/__tests__/element-registry.test.ts` — exists
- [x] Commit b1714f9 — verified
- [x] 36 tests passing
- [x] Build clean
