---
type: reference
status: historical
last_verified: 2026-08-27
---

# Archive and Legacy Documentation Index

Nothing was deleted when this vault was introduced. Several documents were also
deliberately **not moved** — they are referenced by tooling or by each other, and
relocating them would break something for no real gain.

This page classifies that material so it stays discoverable. Classification is
one of: `CURRENT`, `USEFUL BUT MISPLACED`, `DUPLICATED`, `STALE`, `HISTORICAL`.

## Left in place — referenced by tooling or by the documented process

| Path | Classification | Why it stays |
|---|---|---|
| [`QA-Checklist.md`](../../QA-Checklist.md) | CURRENT | **Read by tooling** — `.grok/workflows/twin-stage-qa.rhai` references it by name |
| [`docs/work-plan/`](../work-plan/README.md) | CURRENT | The tracked remediation process (RE → SDD → CDD → EDD). Referenced by name from `CLAUDE.md` |
| [`docs/superpowers/`](../superpowers) | HISTORICAL | Plans, specs and research from earlier phases. Cross-referenced internally |
| [`docs/plans/`](../plans) | HISTORICAL | Earlier implementation plans |
| [`CLAUDE.md`](../../CLAUDE.md) | CURRENT | Project instructions loaded automatically by the coding agent |
| [`AGENTS.md`](../../AGENTS.md) | CURRENT | Agent operating instructions. Contains a tool-managed block — append below it, never rewrite it |
| [`README.md`](../../README.md) | CURRENT | Human-facing project readme |

## Session handoffs — superseded by `04_Agent-Handoffs/CURRENT.md`

| Path | Classification | Notes |
|---|---|---|
| `handoff.md` | DELETED 2026-09-04 | 2026-08-17 generative-unification handoff. Its "Product direction" section asserted the register was retired as a data source — **that decision was reversed on 2026-08-27**. Recoverable at `git show ad6a068:handoff.md` |
| `model_refine_handoff.md` | DELETED 2026-09-04 | Earlier model-refinement session notes. `git show ad6a068:model_refine_handoff.md` |
| `Project-CORE-Memory.md` | DELETED 2026-09-04 | Long-running project memory predating this vault. `git show ad6a068:Project-CORE-Memory.md` |
| [`docs/work-plan/handoffs/`](../work-plan/handoffs) | HISTORICAL | Per-wave handoffs inside the tracked plan |

> The three root handoffs were **removed from the working tree on 2026-09-04** in
> a repo cleanup: everything they still asserted is either superseded by
> [[CURRENT]] or preserved in `AGENTS.md` (the Vercel BLOCKED trap). They remain
> in git history at the commands above if the *why* behind an old decision is
> ever needed. `docs/work-plan/handoffs/` was kept in place.
>
> When any of this disagrees with [[Current State]] or [[CURRENT]], the vault wins.

## Superseded by this vault — kept for provenance

| Path | Classification | Notes |
|---|---|---|
| `.planning/codebase/ARCHITECTURE.md` | DUPLICATED | Superseded by [[System Architecture]] |
| `.planning/codebase/STRUCTURE.md` | DUPLICATED | Superseded by [[Repository Map]] |
| `.planning/codebase/CONVENTIONS.md` | DUPLICATED | Superseded by [[Repository Conventions]] |
| `.planning/codebase/TESTING.md` | DUPLICATED | Superseded by [[Testing Strategy]] |
| `.planning/codebase/INTEGRATIONS.md` | DUPLICATED | Superseded by [[Integration Map]] |
| `.planning/codebase/STACK.md` | USEFUL BUT MISPLACED | Dependency rationale not fully restated in the vault |
| `.planning/codebase/CONCERNS.md` | USEFUL BUT MISPLACED | Recorded concerns; check against [[Current State]] before acting on any |
| `.planning/DEPLOY.md` | DUPLICATED | Superseded by [[Deployment and Environment]] |
| `.planning/milestones/` | HISTORICAL | Milestone audits |

`.planning/` was left on disk rather than migrated: parts of it predate and
explain decisions the vault only summarises, and nothing in the vault depends on
its contents.

## Domain references still living at `docs/` root

These are neither archive nor vault-structure — they are reference material that
other documents cite directly. Left in place.

| Path | Classification |
|---|---|
| [`docs/assumption-catalog.md`](../assumption-catalog.md) | CURRENT — the catalogue of named assumptions |
| [`docs/design-stage-energy-diagnostics.md`](../design-stage-energy-diagnostics.md) | CURRENT — the P0-06 design-stage diagnosis contract |
| [`docs/energy-input-source-map.md`](../energy-input-source-map.md) | CURRENT — which energy input comes from where |

## Known contradictions to correct on sight

Some historical documents still assert the **generative-first** product direction
(buildings enter only via prompt, drawn schematic, or imported CAD; the register
is retired). That was reversed on 2026-08-27. `CLAUDE.md`, `README.md` and
`README.md` were updated; anything under `docs/superpowers/`, `docs/plans/` or
`.planning/` was **not**, and should be read as of its own date.

## Related

[[Current State]] · [[CURRENT]] · [[Project Overview]]
