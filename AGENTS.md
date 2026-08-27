<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- The block above is tool-managed. Everything below is project-authored. -->

# Repository Agent Instructions

## Start here

Before making substantial changes:

1. `docs/00_Project/Project Overview.md` — what this is
2. `docs/04_Agent-Handoffs/CURRENT.md` — verified state, in-flight work, traps
3. The relevant document under `docs/01_Architecture/`
4. The relevant document under `docs/02_Features/`
5. **The actual implementation** — before changing it

`docs/` is an Obsidian vault, and also plain Markdown that reads fine without it.

## Source-of-truth hierarchy

```text
1. Runtime evidence
2. Automated tests
3. Source code / configuration
4. Architecture Decision Records
5. Current-state documentation
6. Planning / research
```

Documentation must never override contradictory runtime evidence without
investigation. If a document disagrees with working code, find out why — do not
change the code to match the document.

## The product shape is fixed

```text
건물 검색  →  도면 업로드  →  디지털 트윈  →  보고서
```

Four steps, settled as a product decision. Step 1 is the landing page (`/`);
steps 2-4 live in `/building/[id]`. Build **inside** these steps. Do not add a
fifth step, a second front door, or a parallel entry screen — this repository has
drifted into competing front doors twice, and both times it made the product
harder to explain.

## Non-negotiable: stated versus assumed

The 건축물대장 states areas, storey counts, height, use, structure and dates. It
states **no** U-value, window ratio, airtightness, HVAC, lighting or occupancy —
those come from era-indexed code tables and must always read as assumptions.

This is enforced at construction time: `createEnergyFact` throws unless a fact
cites sources, names an assumption, or is explicit user input. **Do not add a
convenience helper that attaches register references to a defaulted value.** That
is exactly how the guarantee dies.

Traps already covered by regression tests — do not "simplify" them away:

- ACH50 must be divided by 20 to reach a natural air-change rate.
- A documented zero (`platArea=0`, `heit=0`) means *unavailable*; emit no fact.
- Use `classifyEraExplicit`, never `classifyEra`, on the traceable path.
- A synthesised outline is an inference, never `dimensioned_vector_geometry`.
- The register's four endpoints fail independently and intermittently; never
  require all four to succeed.

## During implementation

- Preserve established architecture unless intentionally changing it — and if you
  are, write an ADR.
- Do not modify unrelated systems.
- Do not hide or skip failing tests.
- Do not classify untested behaviour as complete.
- Check whether a subsystem is actually **reachable at runtime** before calling it
  a feature. Several are retained but flag-gated — see `CURRENT.md`.
- Follow `docs/03_Development/Repository Conventions.md`.

## Before completion

Bare `pnpm` fails on this machine and `pnpm exec` attempts to purge
`node_modules`, so invoke binaries directly:

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
node node_modules/eslint/bin/eslint.js src
```

Report real results. Never claim a check you did not run.

## Deploying

`vercel --prod --yes`. A deploy returns **BLOCKED** — not a build failure — when
the HEAD commit author email is not on the Vercel account:

```bash
git log -1 --format=%ae   # must be namseunghun97@gmail.com
```

## Documentation

After a substantial **verified** change: update the affected feature document,
update architecture docs if architecture changed, write an ADR for a meaningful
architectural decision, and update `docs/04_Agent-Handoffs/CURRENT.md` when
project state materially changes.

Do not document unverified work as complete. Move superseded handoff detail into
`docs/04_Agent-Handoffs/Archive/` rather than growing `CURRENT.md` into a log.

## Do not relocate

`docs/work-plan/`, `docs/superpowers/` and `docs/plans/` are referenced by name
from `CLAUDE.md` and from each other. Link to them; moving them breaks the
documented development process.
