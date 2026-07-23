# Agentic BIM Engine — Slice 3: Ground-floor entrance IfcDoor

> Extends Slice 2. One entrance door, hosted via void/fill like windows, honestly scored
> (heuristic placement → estimated → HITL-flagged). Same discipline: pure modules, strict
> TDD, verified by the real `web-ifc-node.wasm` round-trip test.

**Goal:** Generate exactly one ground-floor (storey 0) entrance `IfcDoor`, voided into its
host wall and filling its opening, centered on the building's longest footprint edge.

## Global constraints
- Coordinates meters/XZ/origin-centered. Engine modules stay PURE (no WASM at module scope).
- VERIFY the `IfcDoor` express code + field shapes (incl. `OverallHeight`/`OverallWidth`) against
  `node_modules/web-ifc/web-ifc-api.js` before writing it — do NOT guess. The void/fill machinery
  (`IfcOpeningElement`/`IfcRelVoidsElement`/`IfcRelFillsElement`) already exists for windows — reuse it.
- The door is an ESTIMATED placement (no measured entrance data) → it MUST score `< 0.85`
  (HITL-flagged), never presented as measured.
- Do NOT touch `src/lib/campus/**`, `src/hooks/use-campus-buildings.ts`,
  `src/app/api/vworld/footprint/route.ts` (concurrent session).
- Do NOT git commit — the controller commits.

## Changes

- **types.ts:** `ElementKind` gains `"door"`. Add `ENGINE_CONSTANTS.DEFAULT_DOOR = { width: 1.2,
  height: 2.1 }`. Reuse the existing `FACADE_ESTIMATE_SCORE` (0.5) for doors too — add a comment
  that it applies to all heuristic-placed openings (windows AND doors).
- **generate-ifc.ts:**
  - Add exported pure `pickEntranceEdge(outerRing: [number, number][]): number` — the index of the
    longest edge of the outer ring (ties broken by lowest index). Exported so `validate.ts` reuses it
    (single source of truth).
  - On storey 0 only, after that storey's windows, emit ONE entrance door centered on
    `pickEntranceEdge`'s edge, at floor level (sill 0), size `DEFAULT_DOOR.width × DEFAULT_DOOR.height`,
    depth through the wall (`wallThicknessM`): an `IfcOpeningElement` voided from that wall
    (`IfcRelVoidsElement`) + an `IfcDoor` filling it (`IfcRelFillsElement`, with `OverallHeight`/
    `OverallWidth`). Contain it in storey 0. Track as `GeneratedElement { kind: "door", storey: 0,
    geomSource: model.footprintSource, heightSource: model.heightSource, facadeSource:
    model.facadeSource ?? "era-estimate" }`.
  - Honest simplification to DOCUMENT in a comment: the door may visually overlap a window on the
    entrance edge — Slice-3 scope is honest hosting + provenance, not clash-free detailed geometry.
- **score.ts:** treat `kind === "door"` exactly like `"window"` (geomScore =
  `min(GEOM_SCORE[geomSource], FACADE_SCORE[facadeSource ?? "era-estimate"])`). Flagged reason for a
  door names "entrance (estimated door placement)".
- **validate.ts:**
  - Fold the door into `checkElementCount`'s expected total (`+1` when a footprint with ≥1 edge exists).
  - Extend `checkOpeningsHosted` (or add a sibling check) to assert exactly ONE `door` element and that
    it is on storey 0. Keep the honest "does not re-parse IFC bytes" comment.
- **round-trip integration test** (`generate-ifc-roundtrip.integration.test.ts`): assert
  `GetLineIDsWithType(IFCDOOR).size() === 1`, that `IFCOPENINGELEMENT` count === windows + 1, the file
  re-opens cleanly, and (via runEngine result) the door element's `sconf < 0.85` with a HITL flag.

## Report
status, files changed, exact test commands + counts, round-trip outcome (observed IFCDOOR /
IFCOPENINGELEMENT counts), concerns.
