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

Four steps, settled as a product decision. Step 1 (건물 검색, the 건축물대장
search) lives at `/diagnostics/new?method=ledger`; steps 2-4 live in
`/building/[id]`. Build **inside** these steps.

`/` is no longer step 1 — it is a gallery of the building models this project
has actually taken in (user decision, 2026-09-04; see
[[ADR-004 - The Landing Page Is a Model Gallery]]), and it precedes step 1
rather than being it. **It does not link to step 1.** Both the header's
diagnostic action and the card itself are deliberately absent from the
gallery by request, so step 1 is reached only by URL or from any non-gallery
page's header — recorded in ADR-004 as the sharpest edge of the decision,
not an oversight to close.

This is a user-authorized exception to "no second front door" below, not a
drift back into one — the gallery has no form of its own and does not
compete with the register search. Do not add a further front door or a
parallel entry screen — this repository has drifted into competing front
doors twice, and both times it made the product harder to explain.

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

### The label lies while the number is right

The invariant above fails at the **label** far more often than at the value,
and a test suite aimed at numbers cannot see it. Seven instances were found on
2026-09-04 alone, every one with correct arithmetic:

- A chart badged a generic fallback ratio "ASHRAE 90.1 기반 비율" for buildings
  whose use code the lookup never matched.
- `mep/rules.ts` returned reason `"2000년 이후 업무시설"` for a 교육연구시설 —
  a use type the code had not established, in user-visible text.
- A card read `IfcSpace − 6 ROOF − 3 OPEN TO BELOW` under the value 259. The
  subtraction gives 260. Right number, wrong explanation.
- A layer was labelled 외피·**구조** by a builder that is called without
  `includeStructure`, so the frame was never in the file. The manifest said so
  in `model.note`, and nothing rendered that sentence.
- A flow animation coloured 1,284 of 3,695 duct segments as return air because
  supply/return was propagated from the nearest graph root, and an air system
  is a loop. Every segment was in the right place. The colour was false, and
  it rendered beautifully.

Two later instances sharpened the rule rather than repeating it:

- **A verification pass that checks values does not check the claims made
  about them.** An adversarial workflow re-derived a set of counts, and the
  prose built from those counts then went out unchecked — a door figure of 20
  explained as `205 − 65 − 36`, which is 104. The numbers were verified and
  inherited the credibility of that verification; the sentence was not.
- **An error message can be accurate and still mislead**, because what it
  states and what it implies are different claims.
  `Unable to find [data-testid="cad-request-result"]` was true in every word
  and implied a component that failed to render, when the component was fine
  and the click had landed on a disabled button. Three sessions read it and
  took the implication. When a diagnostic hands you a conclusion, check the
  conclusion separately from the fact.

An eighth, and the author of this section wrote it: a workflow brief stated
as a known trap that *"roughly 40 of 58 IfcWindow are interior vision
panels."* All four independent routes refuted it. The 40 were the windows
with **no** `IfcRelSpaceBoundary` at all — an absence written up as a
classification. **Absent is not false**, whether the field is a property, a
boundary, or a row in a table; and a caution passed to others inherits no
more credibility than any other sentence.

A ninth, seen three times in one afternoon: **a right instinct about *which*
thing is wrong is not evidence about *how* it is wrong.** A session correctly
sensed that a disabled-button click was being misread, and concluded the
wrong component was at fault; another correctly saw the C19 "net summed into
a variable named gross" finding and concluded the window ratio must therefore
be quoted against the net wall — when the engine's own arithmetic
(`windows = gross × wwr`, then `gross − windows` priced as wall) meant the
opposite, and the net ratio would have quietly unpriced 267 m² of wall. In
each case the worry was sound and the conclusion in the same message was
not; the credibility of the first was spent on the second. Check the
conclusion as a separate claim from the suspicion that produced it.

A tenth, of a different shape — **the placeholder flatters.** Every
correction to an unmeasured envelope input on 2026-09-04 moved the building
the same way: the Clinic's floor area (6,935.8 → 4,314.2, so every intensity
had read 37 % too good), its space-boundary envelope (a third of the wall
missing), its ground coupling, its outdoor pad counted as conditioned slab;
and on the apartment three of six stand-ins say "understates" in their own
bias notes. A stand-in is not a coin flip in this pipeline; it is a
systematic optimism, because what a model omits is envelope and what it
states is floor. So a page carrying placeholders must not say "provisional",
which reads as "might move either way" — it must say which way. The
apartment's badge now predicts that its grade will fall when the
measurements land, and that prediction can be checked.

Two consequences for how work here is checked:

1. **Assert what a string claims, not that it appears.** A test asserting the
   words "ROOF" and "OPEN TO BELOW" were present passed happily while the
   sentence containing them contradicted itself. Where a rendered string
   explains a number, parse the explanation back out and check it reproduces
   the number.
2. **Look at the thing.** Four of the seven were invisible to `tsc`, ESLint and
   4,395 passing tests, and obvious within seconds of opening the page or
   reading the label beside the value it describes.

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

```bash
vercel --prod --yes --scope matts-projects-d0677dc4
```

Two distinct traps, easy to confuse:

- **`Not authorized`** — the scope flag is missing. The bare
  `vercel --prod --yes` fails this way even when `vercel whoami` succeeds: the
  CLI does not resolve the `orgId` in `.vercel/project.json` to the team on its
  own. Not an auth problem, and not the BLOCKED trap below.
- **`BLOCKED`** — not a build failure. The HEAD commit author email is not on
  the Vercel account:

```bash
git log -1 --format=%ae   # must be namseunghun97@gmail.com
```

The `bim` project lives under `matts-projects-d0677dc4` and serves
`https://bim-self.vercel.app`.

**`vercel --prod` uploads the working tree, not `HEAD`.** Two consequences, both
of which have bitten this repo:

- Deploying from a dirty checkout ships uncommitted work — including other
  sessions' — straight to production. Deploy from a clean detached worktree:

```bash
git worktree add --detach <tmp>/deploy HEAD
cp -r .vercel <tmp>/deploy/.vercel
vercel --cwd <tmp>/deploy --prod --yes --scope matts-projects-d0677dc4
```

- An **untracked** file that live code references still works locally and still
  reaches production from a dirty deploy — then 404s the moment a clean deploy
  runs. `public/landing/layer-all-peel-hd.png` (referenced by
  `src/lib/landing/layers.ts`) did exactly that on 2026-09-04. Commit assets
  under `public/`; `git ls-files --others --exclude-standard` finds the strays.

## Three kinds of visibility, and each fails silently

A worktree is the standard way to work here, and what it can *see* is narrower
than it looks:

- A worktree cut from `origin/<branch>` sees only what has been **pushed**.
- A worktree cut from the local branch ref sees only what has been **committed**.
- Neither sees what is merely **on disk** in another checkout — a worktree gets
  tracked files, so an untracked file is invisible to every consumer that does
  not share the one working directory it lives in.

All three have cost this repo real time on 2026-09-04, and in each case the
failure mode was silence rather than an error:

- `707f20a` (a units fix) was committed but not pushed, with 12 unpushed commits
  on the branch. A worktree reset to `origin/` came up without it, `file.units`
  read `null`, and it was nearly filed as a bug against working code.
- `docs/04_Agent-Handoffs/SESSION-LOCKS.md`, the fleet's live claim register,
  was never `git add`ed — so it was absent from all 15 worktrees on disk and
  legible only from the main checkout. A claim made at 15:30 never reached the
  session that acted on the same file at 15:34.
- `public/landing/layer-all-peel-hd.png`, above: untracked, worked locally and
  on every dirty deploy, 404'd on the first clean one.

`scripts/check-untracked-imports.mjs` catches the import/asset case. It cannot
catch a *document* nobody imports, and it cannot catch committed-not-pushed at
all. Before concluding another session's code is broken, check that you can see
their commit: `git merge-base --is-ancestor <sha> HEAD`.

Functions are pinned to Seoul in `vercel.json` (`regions: ["icn1"]`). Do not
remove it: `api.vworld.kr` refuses Vercel's `iad1` egress, so every VWorld read
silently degrades to the 건축면적-solved rectangle if the functions move back to
the default region. `X-Vercel-Id`'s second segment is the compute region — it
must read `icn1`.

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
