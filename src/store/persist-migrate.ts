// src/store/persist-migrate.ts
// P2-07 — shared zustand persist migrator for the initial `version: 1` stamp.
//
// Behavior (deterministic — never silent garbage):
//   - v0 (unversioned legacy payload): shape is compatible with v1, so adopt
//     it as-is (existing users migrate rather than lose data).
//   - any newer/unknown version: fall back to defaults by returning undefined
//     (zustand's shallow merge then yields the store's initial state).
//
// When a store's shape actually changes, bump its `version` and give it a
// dedicated migrator instead of this generic one.

export function versionedMigrate<T>(persisted: unknown, version: number): T | undefined {
  if (version < 1) return persisted as T;
  return undefined;
}
