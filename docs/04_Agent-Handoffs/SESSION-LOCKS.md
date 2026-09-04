# Session locks — live ownership map

**Volatile file: who is editing what right now, and what is actually true right now.**
Project state lives in `CURRENT.md`. Delete this file once the tree is down to one session.

> **TRACKED ON PURPOSE — do not un-track it to keep churn out of the log.**
> Until 15:37 this file was untracked, which meant **no session working in a worktree could
> read it at all** — a worktree gets tracked files only. Measured: 15 worktrees on disk, the
> file absent from every one, and not gitignored, merely never added. So the coordination
> record was legible only from the main checkout, i.e. to the minority of the fleet on any
> given afternoon. **It cost a real claim, confirmed by both parties**: a 15:30 claim on the
> CadRequestPanel tests did not reach bim-bf, who fixed them at 15:34 — they have confirmed
> receiving no message about those tests from anyone, and the register that would have carried
> the claim was unreadable from their worktree. Not a hedge: it did not reach them.
> Untracked bought a clean history and cost the file its entire purpose.
> Deleting it later is one commit; being unreadable was permanent.

Rewritten 13:35 by **bim-72**, at bim-f0's and register-building-fidelity-strategy's
request, folding in bim-8e's freeze note. The previous version's colour names
(violet/purple/yellow/pink/cyan/red/green/orange) are **dead** — every one of those
sessions has exited. Do not message them; do not use those names.

## Status: the freeze is LIFTED

The 10:34 "no new work starts" stopping point is over. **User-confirmed ~12:56, via
bim-8e**, who put the question directly and quotes the answer: *"Freeze is lifted —
Continue new work across all sessions — landing-page redesign, Clinic IFC reference
building, and any tasks fresh sessions pick up."* New work is expected, not tolerated.

## Roster 15:03 — name collision resolved, and a new fleet

**The two-`main-coordinator` collision is fixed** (the user renamed one). Unambiguous now:

| Name | Ref | Who it is |
|---|---|---|
| **main-coordinator** | `2e51d5` | The Clinic / reference-building session — formerly `register-building-fidelity-strategy`. Holds handoff item 2, assigned #2 to bim-bf, owns the `0337f04` brief. **This is the one item 1 coordinates with.** |
| **coordinator** | `2e7740` | Renamed *from* `main-coordinator` at 15:02. A different session, 7 min old. Not the Clinic one. |

**A new fleet appeared at ~14:56, purpose not yet declared to me:** `ASH` `ee32cb`,
`KILA` `a33fa7`, `GREG` `00a3e9`, `SARA` `294a33`, `BROCK` `e7ec8e` — all idle — plus
`coordinator` `2e7740` (waiting) and `temp-81` `b42942`. Also still live: `bim-f0`,
`bim-bf`, `ontowatt-c9`, and this session.

**Recorded as unknown rather than guessed.** I have not been told what that fleet is for and
am not claiming or routing it. If it starts writing in this tree, the lanes below are the ones
already spoken for — and **Rule 1 still applies to them: a claim is real only when the
claimant states it to the owner directly.** A newly-spawned session reading this file is
reading a record of claims, not a grant of them.

**The name-collision hazard is worth keeping even though this instance is resolved.** For
roughly ten minutes two live sessions answered to `main-coordinator`, and a message to that
bare name was a coin flip. `SendMessage` warned on the ambiguity, which is the only reason it
was caught. **Pair a name with its `[ref]` whenever a rename has happened recently** —
`ListAgents` is the authority and it shows the old name for a short window after a change.

## Roster change 14:52 — three sessions gone, one renamed

`ListAgents` is the authority and it has moved. **Live now: `main-coordinator`, `bim-f0`,
`bim-bf`, `bim-72`.**

- **`register-building-fidelity-strategy` → renamed `main-coordinator`** (same ref `2e51d5`,
  still alive, compacted at ~19% context and came back fresh). Messages to the old name bounce.
- **`bim-8e` has EXITED** (closed by the user), and it held **item 3 — reference building #2
  (Schependomlaan)**. **Nothing of it survived**: no branch, no commits, no docs, no artifacts.
  **Now re-assigned to bim-bf**, and the brief is committed as
  `docs/04_Agent-Handoffs/reference-building-2-schependomlaan.md` (`0337f04`) so it cannot be
  lost with a session again. The two figures that came from the lost session — 52°9′N 5°23′E
  and ~97 `IfcThermalTransmittance` — are written down as **things to re-verify, not findings**,
  because the evidence for them is gone.

  *The real failure was not the session ending. It was that the only copy of a selection
  decision lived in one session's context.* A decision that exists nowhere but in a context
  window is already lost; it just hasn't been noticed yet.
- **`bim-09` has EXITED.** Its five commits all landed and pushed (`d174e1b`, `b21b577`,
  `1b5238a`, `ff9ebc0`), so nothing of its work is stranded. Bug B (why the reconstruction
  took the divide-the-total fallback while the endpoint had complete 층별개요) was explicitly
  **not** chased and is now unowned, with the 0.48-short fingerprint as the lead.

*The morning's lesson repeats: with one author email across many sessions, `git log` cannot
attribute, so a session that exits without declaring leaves an unauditable gap rather than a
conflict. Both of these declared. Item 3 is the only loose end.*

## The map

Six sessions. **Only two write in the shared tree**; the rest are in their own worktrees,
which is why the morning's shared-index hazards are mostly not in play today.

| Session | Working in | Owns — do not edit |
|---|---|---|
| **bim-f0** | shared tree | The landing rebuild, **landed as `7ce990a`**: `src/app/page.tsx`, `src/app/diagnostics/new/page.tsx`, `src/app/globals.css`, `src/components/landing/**`, `src/lib/landing/gallery.ts`, `src/components/energy-diagnostics/register-search-sheet.tsx`, `src/components/layout/header.tsx`, the **two "Start over" hrefs only** in `energy-diagnostics/energy-diagnostic-product.tsx`, and `e2e/{building-flow,energy-diagnostics,first-door,ledger-baseline}.spec.ts` |
| **bim-8e** | shared tree | Relay + verification runner. Landed and deployed `94c53da` (raw-pk explanation) and `32f32b3` (AGENTS.md product shape). **Now: reference building #2** — `scripts/lib/ifc-*.mjs`, `src/lib/reference-buildings/manifest.ts`, `src/components/reference-building/*`, and a second entry in `src/lib/landing/gallery.ts` (**bim-f0's file — claim it from them directly**). Runs the full e2e suite after bim-f0's work lands — **do not duplicate that run** |
| **bim-bf** | own worktree, `feat/reference-building-catalog` | Reference-building catalog wiring: `src/data/reference-buildings/index.ts`, `energy-diagnostics/{model-operations,energy-diagnostic-product,energy-diagnosis-workspace}`. Also landed `6381e4c` (the float64 관리번호 fix) in the shared tree, user-authorized |
| **bim-09** | `origin/xcheck/clinic-envelope` | Envelope-area cross-check — **LANDED and closed**, `d174e1b` off `feat/reference-building-clinic`, one file: `scripts/clinic-exterior-envelope-crosscheck.mjs`. **Produced the finding of the day** (see below). Also landed queue item 6 half A, `b21b577` (`mep/rules.ts` + first-ever test for `chooseArchetype`, 7 cases red-first, 74/74 mep suite, tsc clean). Also landed the `insetRing` miter fix (`1b5238a`) and per-storey room areas (`ff9ebc0`). **Five commits today; holding at a clean stopping point** |
| **register-building-fidelity-strategy** | own worktree, `scratchpad/clinic-wt`, `feat/reference-building-clinic` | Reference building #1, the buildingSMART Medical-Dental Clinic: `energy-diagnostics/reference-building-*.ts`, `energy-diagnostics/{types,classification}.ts`, `scripts/**`, `public/reference-buildings/**`. An 8-agent adversarial investigation owns the IFC window-area / curtain-wall / roof / ground-floor / spaces / azimuth / double-count questions |
| **bim-72** | own worktree, `feat/clinic-material-entries` (`1f4b55d`, `983e2cb`, `0467de7` — pushed, **not deployed**: nothing user-visible to confirm) | `src/lib/energy-standards/{materials,ground-coupling}.ts` + their tests, the §5.1 / PHY-GROUND / §7 rows in `docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md`, and this file. **Now also: handoff item 1** — the energy run through the real engine, starting at the extractor's missing `record.json` |

**⚠ Two reference-building registries, and each is invisible to the other.**
`src/lib/reference-buildings/manifest.ts` **exists in the shared tree**; bim-bf is creating
`src/data/reference-buildings/index.ts` as the catalog **in the worktree branch
`feat/reference-building-catalog`**, so it does not appear in any shared-tree search. Same
concept, two directories. bim-8e is adding reference building #2 and would land it in one
without seeing the other. **Settle which is the registry before #2 is written** — this is the
first hazard today that a worktree *created* rather than prevented: isolation stops sessions
clobbering each other's files, and equally stops them discovering each other's files.

**Unclaimed and worth taking:** queue items 4, 6, 7, 8 and most of 9 below.

## Handoff 14:47 — the three things register-building-fidelity-strategy could not start

That session hit ~19% context, compacted, and handed over. Current split:

| Item | Owner | State |
|---|---|---|
| **1. Energy through the real simulation engine** | **bim-72** | *The real remaining work.* Chain: `record` → `reference-building-source.ts` → `ingestDrawingSet` → `buildReferenceBuildingModel` → `compileCanonicalModelToEngineInput` → `runSimulation` |
| **2. Make the models engaging** (equipment GLBs at real IFC positions, flow animation) | **register-building-fidelity-strategy** — kept, do not route elsewhere | Four files that session wrote and nobody else has touched; splitting them buys a merge conflict and no parallelism |
| **3. Reference building #2 with full IFC** | **bim-8e** | Schependomlaan verified against criteria; proceeding. Has what the Clinic lacks — a **real site** (52°9′N 5°23′E, Nijmegen), so real climate and real orientation |

**Structural correction that reshapes item 1: the extractor has no record producer.**
`scripts/build-reference-building.mjs` emits `manifest.json`, which is **aggregate only** —
areas and counts, no per-surface rows, no openings, no assemblies, no storey list. So
`reference-building-record.ts` is a **contract with no producer**. Item 1 therefore starts at
the build step: extend the script to emit `record.json` from data it already traverses
(`netFaceAreasByElement`, `extractStoreys`, `extractSpaces`, `extractAssemblies`) but never
writes out.

**Branch note:** the seven sourced material entries the mapping needs (`mb-epdm`,
`ins-polyiso`, `mt-steel-deck`, `wd-plywood`, `pnl-imp-pir42`, `air-iso-h25`,
`fin-plasterboard-iso`) plus `ground-coupling.ts` are on **`feat/clinic-material-entries`**,
not on `feat/reference-building-clinic`. The two branches must be joined before the wiring
can resolve.

### Five reported traps — being verified against source, not inherited

Reported by register-building-fidelity-strategy; each is being read at its cited line and will
be marked CONFIRMED or REFUTED with quoted code. *(Today has twice shown a confidently-stated
claim failing on contact with the source — including a "settled, do not re-measure" instruction
that a live API call disproved — so a trap taken on trust is exactly the wrong shape.)*

1. `sensitivity.ts:155-161` and `ledger-baseline-model.ts:745` reportedly **throw unless an
   insulation layer's `name` contains the literal string 단열재**. Dies at sensitivity, not at build.
2. `collectEnergyFacts` reportedly **skips the `facts` key**, so climate facts never survive it
   and must be spread in by hand (`ledger-baseline-model.ts:1566-1569` is the working example).
3. `resolveClimate` (`adapter.ts:338-348`) reportedly needs **five** facts, not four — omit
   `site.climate.coolingSeasonSolarKwhPerM2` and it **silently falls back to Seoul's 350** via
   `getClimateData(undefined)`. No throw, no trace, and the number looks fine. *If confirmed,
   this deserves to be made loud rather than worked around — it is the same failure class as
   the chart claiming "ASHRAE 90.1 기반 비율" for unmatched use codes, closed earlier today.*
4. The Tier-1 acceptance gate reportedly activates on a `tier1-office-screening-`
   `MODEL_VERSION` prefix **or** that assumption id — reuse either and a clinic inherits an
   office screening's acceptance criteria.
5. **Never map IFC material names through `searchGenericMaterials`** — substring-matches
   `nameKo`/`nameEn` only, so `"Glass"` returns glass *wool* and `"Insulation"`,
   `"Plasterboard"`, `"Metal"` return nothing. The mapping must be a hand-written table with
   one `AssumptionRecord` per row.

## Clinic IFC topology — measured, and it constrains item 1

From `main-coordinator`'s probe of the three discipline models:

| System | Ports / connections | Resolves to |
|---|---|---|
| **HVAC** | 7,390 `IfcDistributionPort` — exactly 3,695 SOURCE + 3,695 SINK | **3,695 directed edges, zero ambiguous, zero unresolved.** Roots 205 return grilles + 6 fans; leaves 234 supply diffusers |
| **Electrical** | **zero ports, zero connections** | No circuit topology at all — panelboards and fixtures as placed objects |
| **Plumbing** | 6,529 connections | 5,575 do **not** resolve to a SOURCE/SINK pair — mostly ambiguous |

**The constraint on item 1: there is no `IfcSystem` and no `IfcDistributionSystem` in any of
the three files — zero of each.** So *system membership is not stated anywhere in the source*.
Attributing load or area to a named air system would be an **inference from the port graph**,
not a fact, and would have to be minted as a named assumption or not made at all.

**Decision for the builder: don't make it.** A Tier-1 envelope-and-degree-day run needs
envelope areas, constructions, conditioned volume and a climate — not system attribution.
Inferring an air system from 3,695 edges would be real work producing a number the record
cannot back, feeding a stage that does not require it. The absence gets recorded honestly
instead: `systems` carries an explicit named assumption rather than a silently-defaulted
archetype. *That is the exact shape of the defect closed today at `mep/rules.ts:214`, where an
unrecognised use quietly acquired an 업무시설 profile.*

Two notes back on the topology itself:
- **Zero ambiguous and zero unresolved out of 3,695 is clean enough to want re-derived
  independently** before publication — on the same grounds bim-09's blind cross-check earned
  its keep this morning by finding a 37% undercount. A perfect number is often counting
  something narrower than it appears to.
- **Electrical having zero ports is a finding, not a gap.** "There is no circuit topology in
  this file" is a concrete, publishable statement about what a coordination model carries —
  which is the thesis the Clinic exists to demonstrate.

## The four red CadRequestPanel tests — FIXED 15:34, and the reported cause was wrong

`src/components/upload/__tests__/cad-request-panel.test.tsx` had 4 of 5 failing on the shared
branch, found by running the full suite before a ship. **Fixed by `0a3eb02`** "Wait for the
evidence gate the panel already publishes" — 5/5 green.

**The component was never broken.** Measured by instrumenting a real render:

    INITIAL  disabled=true   evidence-ready=false
    AFTER    disabled=false  evidence-ready=true
    RESULT present = true      ALERT present = false

`CadRequestPanel` has `disabled={running || evidenceLoading}`, and `useOsmBuilding` put a real
async lookup into that set — so the button is disabled on first render. The tests clicked
immediately, **and a click on a disabled button is a no-op**: the run never started, no error
was set, no result rendered, and `waitFor` timed out ~1,020 ms later reporting a missing
result element. It reads as a dead component; it is a race.

The fix waits on `data-evidence-ready`, which the component publishes **for exactly this
purpose** — and deliberately does not stub the hook, because the gate it tests is the real
guard stopping a reconstruction from running before the register has answered.

**Correction worth carrying: `dd0162d` (the shared QueryClient wrapper) was innocent.** It was
the reported suspect and the reasoning was plausible — "a provider moved, an async query that
now never resolves under test" — but nothing hangs. The query resolves fine; it merely has not
yet at t=0. The real cause is **`0ba9c38`, which added `useOsmBuilding`** — and
`render-with-query.tsx`'s own docstring names that commit as having "turned five passing tests
red without touching them". The answer was written down in the file next to the bug.

### A fifth variant of "the label lies while the number is right"

`1644bf4` names seven instances of a false claim sitting beside a correct value, all in the
UI. **This failure is the same shape in a test.** The error read:

    Unable to find an element by: [data-testid="cad-request-result"]

Every word of that is true — the element genuinely was not there. Its *implication* — that the
component failed to render its result — was false. The component was fine; the click never
landed. Three sessions read that message and took its implication rather than its content,
including the one that wrote the correction.

So the pattern generalises past rendered strings: **a diagnostic can be accurate and still
mislead, because what it states and what it implies are different claims.** When an error
message hands you a conclusion, check the conclusion separately from the fact.

### Rule 1, amended by the way this went

Two sessions worked this simultaneously. One had claimed it — **to a single peer**, who had
already declined the file. The session that actually fixed it never saw that claim.

**A claim made to one session is not a claim made to the fleet.** Rule 1 ("real only when the
claimant states it to the owner directly") works when there *is* an owner. **Unowned work has
no owner to tell, so the only durable claim is one written into this file** — the thing every
session reads and no session has to be awake for. Second time today the answer has been *claim
into the record, not into a message*; the first was the reference-building selection decision
that died with `bim-8e` because it lived only in one context window.

## The untracked-file trap, generalised (bim-bf, 15:39)

Two instances today, wearing different costumes, same root cause:

| | Invisible to | How it surfaced |
|---|---|---|
| `public/landing/layer-all-peel-hd.png` | a **clean deploy** | Worked locally and on every dirty deploy; 404'd the instant a clean deploy ran |
| `docs/04_Agent-Handoffs/SESSION-LOCKS.md` | all **15 worktrees** | Legible in the main checkout; absent everywhere else, so a claim written in it reached nobody |

> **An untracked file is invisible to every consumer that does not share the one working
> directory it lives in — and it fails silently, because absence is indistinguishable from
> "not needed yet".**

The blast radius differs and the mechanism does not. State it as the general rule, because
**the next instance will look like neither of these two.** Note the existing guard,
`scripts/check-untracked-imports.mjs`, catches the *import* and *public-asset* cases — an
untracked module that tracked code imports, an untracked asset tracked code references. It
would not have caught either a document nobody imports or a record whose only consumer is a
human reading it. Coverage of one shape is not coverage of the class.

**Practical form:** if a file is meant to be read by anyone who is not you, in a directory that
is not yours, it must be tracked. "Volatile", "temporary" and "it'll be deleted soon" are
arguments about the *log*, not about *reachability*, and reachability is the one that bites.

## Rules

**Rule 0 — call every session by its name.** `ListAgents` is the authority. Open a
cross-session message with your own name (`bim-72: …`). Pair a name with its ref only
when the name is ambiguous.

**Rule 1 — a relay is not a claim.** *New, and it cost us today.* Four fresh sessions
cold-pinged the same two workers within minutes, and two of them relayed ownership in
parallel while each treated the other's relay as authoritative. `materials.ts` was
double-claimed straight through that gap. **A claim is real only when the claimant states
it to the owner directly.** A third party telling you something is claimed is news, not a
lock; a third party telling someone else that you claimed something is not your claim.

**Rule 2 — re-check status against the code at the moment you write it down.** Not against
what someone said fifteen minutes ago, and never against a commit title. Item 1 below was
called fixed when it was half-fixed, then called open nine minutes after it had been
fixed. Every "fixed" in the audit below was verified by reading the diff or the current
source, not the subject line. *(This file was itself edited by another session between
being read and being rewritten — the rule caught it.)*

**Rule 2b — a check you piped is not a check.** *Found today, and it had spread between
sessions.* `tsc --noEmit 2>&1 | tail -10 && echo "exit: $?"` reports **`tail`'s** status, not
`tsc`'s — it prints `exit: 0` on a tree with type errors. Several "tsc clean" claims today
rested on it. They happened to be true (empty output really does mean clean), which is worse
than if they had been false, because nothing forced the discovery. Redirect and read the real
status, or gate with `&&` and no pipe:
```bash
node node_modules/typescript/bin/tsc --noEmit > out.txt 2>&1; echo "real: $?"
node node_modules/typescript/bin/tsc --noEmit && echo clean     # also fine: no pipe
```
The same shape catches `vitest ... | tail` and `eslint ... | head`. And its sibling, also
found today: **"nothing constructs this type" is a claim `tsc` settles in one run** — a grep
for the type name misses a fixture that builds the object as a bare literal and never names
the type. Adding a required field broke exactly such a site (`eco2-export.test.ts:206`).

**Rule 3 — never commit bare.** The shared index holds other sessions' staged work.
```bash
git diff --cached --name-only          # read it, every time, immediately before
git commit -F - -- <your paths only>   # stage-and-commit as one command
```
Neither form is safe alone: bare `git commit` ships whatever is staged at that instant;
`git commit -- <paths>` ships the *working-tree* content of those paths and so ships a
co-editor's in-progress hunks. **Where a file is co-edited, yield the whole file rather
than split it.** Never stage before a message round-trip — the `add`→`commit` window is
exactly where someone else's bare commit takes your files.

**Rule 4 — never pull, stash, reset, or `checkout --` a path you don't own.** One working
tree means another session's commit *is* your HEAD the moment it lands. There is nothing
to pull; `git pull` here is a merge into a tree holding other sessions' uncommitted hours.
Scoped to the *shared* tree — inside your own worktree, reverting your own file is just
reverting your own file.

**Rule 5 — every commit goes to production, carefully.** Commit path-scoped → `git push
origin HEAD` → deploy **from a clean detached worktree, never the shared directory**
(`vercel --prod` uploads the working tree, not HEAD):
```bash
git worktree add --detach <wt> HEAD
SHA=$(git -C <wt> rev-parse HEAD)          # the WORKTREE's HEAD, never the shared tree's
cp -r .vercel <wt>/.vercel
vercel --cwd <wt> --prod --yes --scope matts-projects-d0677dc4 -e DEPLOY_COMMIT_SHA=$SHA
```
- **Do not omit `-e DEPLOY_COMMIT_SHA=$SHA`.** It was omitted today and `/api/health` came
  back `commit: null`, silently giving up the self-proving SHA check that is the whole
  point of step 4.
- HEAD author must be `namseunghun97@gmail.com` or Vercel returns `BLOCKED`; `--scope` is
  mandatory or it returns `Not authorized`. Different failures — don't confuse them.
- Verify live and **assert the payload, not the status code**: the canary
  `/api/vworld/footprint?lat=37.5663&lng=126.9779` must still say `source: "building"`
  with a 34-point ring. A silent degrade to the 건축면적-solved rectangle returns HTTP 200
  and is exactly the failure that hid the iad1 problem for weeks. `X-Vercel-Id`'s second
  segment must read `icn1`; the homepage cannot confirm a region, it has only one segment.
- **Don't deploy what nothing can confirm.** A no-behaviour-change commit should be pushed,
  not deployed; let it ride out on the next deploy that has something to check.
- One deploy in flight at a time. Announce `deploying <sha>` and `live <url>`.
- Run `node scripts/check-untracked-imports.mjs` first — an untracked file that live code
  references works locally and 404s on the first clean deploy.

**Rule 6 — a failure is not a failure until it reproduces on a warm-cache isolated run.**
With this many sessions in one checkout the suite result is a function of machine load.
Cold-cache isolation and loaded runs are the same signal, and both are real.

## Product decision — SETTLED 13:41: keep the gallery

**The user decided: the gallery stands.** bim-f0's redesign (`7ce990a`) is the landing
page, and the register lookup stays off `/`, at `/diagnostics/new?method=ledger`.
*Decision relayed by bim-8e, who put it to the user directly — same channel that carried
the 12:56 freeze lift.*

**This supersedes the ~11:50 decision** made with register-building-fidelity-strategy, which
pointed the other way. Do not read that earlier decision as still live; two sessions were
each acting correctly on what their own user had told them, and the conflict was in the
sequence, not in anyone's judgement. `ADR-004` records the decision and the evidence and
now stands rather than needing a superseded marker.

**`AGENTS.md` contradiction — CLOSED 13:43, `32f32b3`** (bim-8e, on the user's direct
instruction, after asking). It had said the landing page *is* step 1 and forbade a second
entry screen, so it contradicted production and would have told the next session to revert
the gallery on sight of the repo's own rule. Now: step 1 (건물 검색) is named as living at
`/diagnostics/new?method=ledger`, `/` is described as the gallery that links into it, and
the change is recorded as a **deliberate user-authorized exception** to "no second front
door" rather than the rule being quietly deleted — the guard against a *further* front door
survives intact. Cites `ADR-004`; the wikilink resolves to a real tracked file. Pushed,
docs-only, not deployed.

Worth keeping as a pattern rather than an incident: **two sessions independently declined to
make this edit and surfaced it instead**, and it was then made by a third only after the
user was asked outright. An agent instruction file amended by the session whose output it
contradicts stops being trustworthy — the file would have been retrofitted to justify
whatever had just been built. Declining to edit it was not timidity; it was the only thing
that kept the eventual edit worth anything.

## The queue, audited against the code at 13:30

The previous version listed nine items as "tomorrow's queue". Two are now done, one was
simply wrong, and the rest stand. Checked by reading source, not changelog.

**1. Navigation dead end + search paging — DONE, in two halves, both verified.**
Search paging fixed by `86ba601`: the use filter now pages the whole district
(서울청운초등학교 was row 344 of 358, page 18 of 18). The bare 404 fixed by `94c53da`:
`app/building/[id]/page.tsx:80` detects a raw pk via `isRawLedgerPk` and renders
`RawPkNotRoutable`, which names the id and links to search. **Still true, and by design:**
the pk is not *routable* — `parseBuildingId` still requires five segments and there is no
local pk→번/지 mapping to synthesise a redirect from. Making it routable needs a lookup
that does not exist yet, which is a bigger piece than the original entry implied.

**2. `mgmBldrgstPk` destroyed by float64 — FIXED, `6381e4c` (bim-bf, user-authorized).**
`quoteUnsafeIntegerLiterals` quotes unsafe integer literals before `JSON.parse`, using a
string-aware scanner that respects backslash escapes and leaves safe values alone.
**Verified on production** (`b474d6f`), by measurement rather than by a passing test:
100 rows of 청운동 via `/api/bldrgst/title?sigunguCd=11110&bjdongCd=10100` — 94 pks of
9/10/14 digits still arrive as **numbers** (the over-quoting guard working; areas and
counts stay arithmetic), 6 pks of 22 digits now arrive as **exact strings**, and all 6
would have had digits altered. Parsed as doubles those 6 collapse to **5 distinct values**:
two different buildings in one 법정동 sharing an identifier, after which no downstream code
could tell them apart.

**Correction to that commit's own message, from its author:** it says a 관리번호 "is a
25-26 digit integer". It is not. The register **mixes widths** — 9, 10, 14 and 22 digits in
a single district — and only the 22-digit ones exceed 2^53. Read literally, the message
implies every pk changed type when 94% did not. The honest statement is "some 관리번호 are
22 digits and unsafe; most are not". *(The author inherited "22-digit" from the old queue
entry and repeated it without measuring — Rule 2, broken in the commit message while being
followed everywhere else.)*

**Consequence anyone touching this route must know:** `mgmBldrgstPk` is now
`string | number` from that route, not uniformly either. **Compare it as a string.**

**3. Uniform-prism model — OPEN. Two bugs, one located, one upstream and newly found.**

*Third revision of this entry. It said "data gap" (wrong), then "the register has no 층별개요,
settled, do not re-measure" (also wrong — I had trusted `work-plan/README.md:117` without
checking it). **bim-09 went and measured the live endpoint anyway, and that settled it.**
Runtime evidence sits above documentation in this repo's own source-of-truth hierarchy for
exactly this reason.*

**MEASURED, live on production, reproduced independently by two sessions:**
`/api/bldrgst/floors?sigunguCd=11110&bjdongCd=10100&platGbCd=0&bun=0123&ji=0000` returns
**7 rows of complete 층별개요**:

    지2층 198.00 · 지1층 2961.97 · 1층 2499.78 · 2층 2587.70
    3층 1884.13 · 4층 1884.13 · 5층 941.87        SUM = 12,957.58

**Exactly the stated 연면적, to the cent.** The data is not missing, not partial, and not
imprecise. *(Verification note: a bare cross-origin `curl` gets `401 Missing x-api-key` —
the proxy only falls back to the server key for same-origin requests, so send
`-H "Origin: https://bim-self.vercel.app" -H "Referer: https://bim-self.vercel.app/"` or you
will mistake an auth failure for absent data.)*

**Bug A — FIXED, `ff9ebc0` (bim-09).** `deriveRoomElements` had computed
`const area = footprintArea(recipe)` **once, outside** the `recipe.floors.map()`, so every
storey reported the whole-building footprint and `floor.plate` was never consulted
(7 × 2,749.71 = 19,248.0 against 12,957.58, +48.5%; intensity 51.2 vs 76.1 kWh/m²·yr).
Now calls a new exported `floorPlateAreaSqm(recipe, floor)` **inside** the map. Verified by
reading it. The good part: that helper was **extracted from** `envelope-quantities.ts`'s
existing `plateOf` closure and `envelopeQuantities()` refactored onto the same
`basePlateOf` — so there is now **one formula, not a second copy of it**, and the existing
11 tests were checked byte-identical across the refactor. Test uses the school's real
per-floor values, not merely "different from each other".

*Residual, minor and honestly named:* `perimeter` is still one building-level value for
every storey (`perimeterFallback`) — there is no `floorPlatePerimeterM` sibling. Area was
what fed intensity, so this changes no number that matters today, but floors ranging
198 → 2,961.97 m² do not share a perimeter either.

**Bug B — upstream, and the floor data above is what exposes it.** `work-plan/README.md:117`
claims the reconstruction "divides the stated 연면적 across the storeys and returns
**12,957.1**". That figure is the tell: it is **0.48 m² short** of the stated total, whereas
the real per-floor rows sum to it *exactly*. A 0.48 shortfall is the fingerprint of the
divide-the-total fallback, so **the code took the no-floors branch while the endpoint had
complete data** — meaning something upstream is not fetching or not passing 층별개요 through.
Being checked. Note the real floors are wildly uneven (198 → 2,961.97), so per-storey plates
change the model substantially; this is not a rounding-scale fix.

**Bug C — NEW, found by bim-09 while tracing, and deliberately not fixed.** The chain is
`building-workspace.tsx` → `useEnsureBuildingModel` → `seedBuildingFromLedger` →
`generateBuildingGeometry`/`toRecipe` (`building-geometry.ts`). Verified here:
`building-geometry.ts:167` **does** capture each storey's real `area` into
`FloorGeometry`, and `toRecipe` at `:249` forwards `plate` when present — but the register
branch never *sets* a plate, and `FloorSpec` (`procedural/types.ts:75-93`) has **no `area`
field at all**. So the real per-storey area is captured and then silently dropped at the
`FloorGeometry` → `FloorSpec` boundary. Same shape as Bug A, one level upstream, in the
**old twin path** that `CURRENT.md` already flags as its top item — i.e. the larger
migration, correctly scoped out rather than half-done.

> **Trap for whoever fixes Bug C.** The register states an *area*; it does not state a
> *shape*. Synthesising a plate by scaling the footprint to match a stated area is an
> **inference**, and must be recorded as one — a scaled outline is not
> `dimensioned_vector_geometry` and must never be graded as observed. Giving `FloorSpec` a
> real `area` field is the smaller and more honest change; deriving a polygon from a scalar
> is where this repo has been bitten before (ADR-003).

**`docs/work-plan/README.md:117` is now doubly stale** and should be corrected: its
"no 층별개요" claim is disproven by measurement, and its "sign-off withheld" is half-resolved
now that `twin-elements.ts` is fixed. Left alone deliberately — reporting the code state
first, so the doc gets written once against something settled rather than drifting again.

**4. No interior subdivision — OPEN, unowned.** Rooms 7 at mean 2,749.7 m² (a whole floor
plate each) and **2 doors** in a school. plant→riser→main→branch→terminal has no terminals
to serve. `src/lib/mep` is **not** implicated — nothing there was touched. Note that
`src/lib/generative/generate/{partitions,space-plan,openings}.ts` exist, but they are the
generative engine, not the ledger-reconstruction path.

**5. Blank viewport (P2-35) — OPEN and still UNREPRODUCED. Do not write a fix.**
Item file reads `status: todo`, `owner: unassigned`. Seen twice in extension-driven headed
Chrome (canvas stuck at 300×150, middle pixel transparent, context alive, no errors; one
synthetic `resize` and it rendered), but **24 controlled cold loads produced zero blanks**.
Ranked leads, all mechanisms to test and none proven: (a) persisted `sidePanelOpen`
colliding with hydration — it *is* in the persist partialize list (`app-store.ts:66`), so a
probe seeding it differs from a real browser carrying whatever was last left; test by
loading under each persisted value and toggling between loads, not by reasoning;
(b) page visibility / occlusion — cheapest single test; (c) the general
ResizeObserver-attaches-after-final-size case. **Trap:** a regression test must observe
*without* driving animation frames — `waitForFunction` polls on rAF and would supply the
very frame the app is missing, so it would pass on a broken viewer.

**6. Silent use-code fallbacks — OPEN, unchanged, and still asserts something false.**
Verified: `mep/rules.ts:214` returns `reason: "2000년 이후 업무시설: …"` for **any**
non-residential, non-retail use — including a 교육연구시설 (`10000` → family `default`).
That is a false claim inside a reason string shown to a user. Separately,
`energy/system-breakdown.ts:112` does `SYSTEM_RATIOS[prefix] ?? DEFAULT_RATIOS` with no
assumption record, and the table holds only 01/02/07/14, so **21.5%** of that 법정동 gets
generic ratios silently. **Split it: make the fallback visible first.** Extending the table
needs real MOLIT data, not a guess. The user authorized the honesty half only.

> **SPLIT, not contested — resolved 13:47 between bim-09 and bim-bf themselves.** The item
> always had two separable halves in two different files, and they took one each.
>
> **Half A — `mep/rules.ts` — DONE, `b21b577` (bim-09).** Verified by reading the code, not
> the subject line. `chooseArchetype` now has a distinct `family === "default"` branch:
> `ruleId: "KR-10-DEFAULT"`, `basis: "defaulted"`, and a reason that names itself a fallback —
> *"미분류 용도(연구된 프로파일 없음): 사무시설 계통 설비 관행을 잠정 적용"* — instead of
> asserting 업무시설 for a building whose use the function does not know. The `"office"`
> branch keeps its original 업무시설 wording, which is correct there. **The archetype choice
> is unchanged**: no new MOLIT ratios were invented, only the honesty of the label, which is
> exactly the authorized scope. Ships with `__tests__/rules-archetype.test.ts` (66 lines) —
> the first test this function has ever had.
>
> bim-09 also caught a defect nobody had listed: `basis` was `"estimated"` where
> `"defaulted"` was meant. That value is in the `MepBasis` union (`types.ts:42`) and already
> used in `context.ts:368`, `plan.ts:99` and `size.ts:117`, so this follows an existing
> convention rather than inventing one.
>
> **Half B — `energy/system-breakdown.ts` — DONE, `a88e10a` (bim-bf).** The
> `SYSTEM_RATIOS[prefix] ?? DEFAULT_RATIOS` fallback now resolves through a function
> returning a `SystemRatioProvenance` **discriminated union** — `{source:"use_code"}` or
> `{source:"generic_default", useCodePrefix, assumption}`. A union rather than an optional
> field on purpose: an optional field is forgettable at one call site, which is how the
> silent default arose to begin with. **No kWh moves**, and two tests assert the four shares
> of the total on both paths so this can never quietly become a recalculation. No ratio rows
> added — extending the table still needs real MOLIT data.
>
> **The larger half of that finding: the chart was making the false claim, not just the
> library.** `viewer/energy-breakdown-chart.tsx` rendered the badge sub-label
> "ASHRAE 90.1 기반 비율" for **every** building, including those whose use code the table
> had never matched — so the silent fallback was not merely unrecorded, it was actively
> described to the user as a looked-up ratio. It now names the unmatched code. **A provenance
> field nobody renders would have been half a fix**, and that is the general shape: surfacing
> an assumption in the data model is not the same as surfacing it to the reader.
>
> *Process note worth keeping: this was recorded here as contested, both claimants were told
> about each other, and they resolved it directly in nine minutes — by discovering the item
> was two items. The map surfaced the collision; it did not arbitrate it.*

**7. Roof deck reads as a slab — OPEN, unchanged. Not a geometry defect: tone.**
Every geometry hypothesis died by measurement (roof inset 0.124 m inside the facade,
concentric, seated on the columns, parapet 1.1 m above; window coverage 96.5%/98.3%,
symmetric to the millimetre). Verified still live: `pbr-materials.ts:49` `ROOF_MATERIALS.flat`
= `#808080` rough non-metallic against `:58` `USE_TYPE_MODIFIERS["14000"]` = `#C0C8D0`
smooth half-metallic, plus 1.7 m of blank envelope above the last window head (0.4 spandrel
+ 0.2 deck + 1.1 parapet). The eye draws the building boundary at the window band.
Realistic mode only. **Parapet height is a design decision, the user's.** Keep the related
arithmetic: a 34 m deck spans ~250 px at the default camera ⇒ ~14 cm/px, so a 12 mm seam is
<0.1 px — **surface detail authored at material-sample scale cannot render at building
scale**; only metre-scale variation carries the wide shot.

**8. The demo page is half-real — OPEN, unchanged, user's call.**
Verified: `app/building/[id]/building-workspace.tsx:84` still calls
`useBuildingFootprint(address)` on a title-derived address, and `DEMO_ADDRESS` is still
`"서울특별시 강남구 역삼동 000-0 (데모)"` — a fake lot number on a **real** 법정동. It
geocodes, so `ContextMassing` fetches up to 30 real Gangnam buildings while the subject
stays the canned 34×24 tower. A synthetic building stands at a real address among real
neighbours at their true positions, with no scale relationship between them, and the demo
makes live GIS calls for an address that does not exist. **User's call:** synthesise the
context so the demo is wholly a demo, or label it.

**9. The smaller ones, re-checked individually — one had already landed, one was wrong.**
- `insetRing` under-insets by 1/√2 — **DONE, `1b5238a` (bim-09).** Verified by tracing the
  maths, not the message. `cosHalfAngle = |n0+n1|/2` by the half-angle identity, so no extra
  trig call; the normalisation is folded into `scale = (distance × miterScale) / nl`, which
  is algebraically identical to normalising first. A 90° corner now offsets by (d, d), so a
  rectangle insets to exactly (w−2d)×(h−2d). The near-180° degenerate fallback is preserved.
  Covered by 444 tests across gis/procedural/rendering/layers, i.e. all four call sites.

  **Two things this turned up that are worth more than the 0.037 m it fixed.**
  (a) *The old test passed a 29.3% error.* It asserted only `x > −10 && x < −9.85` on a
  0.1 inset — a window accepting anything from 0 to 0.15. A test can be present, passing,
  and no net at all. It is now a closed-form assertion on a square.
  (b) *The naive fix would have been worse than the bug.* The correction factor is
  `1/sin(θ/2)`: 1.41 at 90°, but **22.9 at a 5° vertex** and unbounded as θ→0. The old
  code was *accidentally* safe against spikes precisely because it never over-moved, so
  removing the under-inset removes that safety too. `RING_INSET_MITER_LIMIT = 4` clamps it
  (bevelling below ~29° interior, = 2·asin(1/4)), with a red test on a 6° apex proving the
  clamp holds. **GIS outlines and CAD traces do contain near-degenerate spikes**, so this
  was not defensive polish — it was part of the fix.
- `"vworld-measured"` — **mostly done.** Gone from production source; only two **test
  fixtures** still name it (`report-stage-bim-fidelity.test.tsx`,
  `fidelity-detail-panel-engine.test.tsx`). A dead evidence kind living on in fixtures.
- `generateRoof` reading the recipe footprint instead of the top plate — **reported fixed**
  by `6209196` "Cap the roof on the top storey, not on the ground floor". The commit exists
  and its subject matches; I did not re-verify the code.
- Landing assets — **not moot, and bigger than the original item.** Re-checked by bim-f0
  against the code: `public/landing/` holds **21 files of which exactly one ships** —
  `layer-all-peel-hd.png`, via `BANNER_LAYER_META.all` in `register-search-sheet.tsx:100`.
  Three more posters in `layers.ts` are reachable only through `LayerRail`, which is
  imported by nothing but its own test, so they were already dead before the gallery
  rebuild — that change did not create this. The other 17 are referenced by no code at all.
  The byte-identical pairs are still real (`layer-shape.jpg` = `layer-shape-plinth.jpg`,
  `hero-promise.jpg` = `layer-all-peel.jpg`, md5-verified) but they are a symptom: the
  honest item is **~8 MB of `public/landing/` of which one file is reachable**. Nobody
  should prune it as a side effect of other work — the user asked for a landing page, not
  an asset purge. **Whoever does prune it must run `git ls-files --others --exclude-standard`
  over `public/` first:** this exact directory produced the untracked-asset 404 this morning,
  where a file live code referenced worked locally and 404'd on the first clean deploy.
- `public/hdr/sky.hdr` — **still true.** 1.44 MB, referenced by nothing (the realistic path
  builds its environment procedurally from `Sky.js`). `studio.hdr` is live. Unowned.
- Playwright `workers: 12` — **this item was wrong.** `playwright.config.ts:62` reads
  `workers: process.env.CI ? 1 : undefined`. There is no 12 and there was no 12. Struck.
- The fourth evidence source, trace-from-imagery vs show-imagery — **user decision**, open.

## Findings from today worth keeping

**bim-09's blind cross-check earned its keep.** An independent element-geometry envelope
derivation showed the Clinic's space-boundary extraction **understates exterior wall area
by 37%**: the model's space boundaries stop at the suspended **ceiling** (2.80 m) rather
than the storey (4.57 m) — 250 ceiling coverings — so the ~1.8 m plenum above every ceiling
was bounded by nothing and omitted. Real envelope, real heat loss, omitted in the flattering
direction. The argument for blind second derivations, not for more review.

**`IfcRelSpaceBoundary` is unusable for this model.** Six independent defects found by the
adversarial investigation, including a feet/metres unit bug in the source file (a 0.905 m
sill written as 2.969 m), 16% double-counting, and 60.17 m² of chain-link fence inside a
total that had been claimed to exclude fences "by construction". **Every area derived from
it is dead.** U-values are unaffected.

**The ground floor was the largest single error in the Clinic model.** A slab on grade has
no air-to-air U. `calculateAssembly` returns 3.87 W/m²K for its 150 mm slab where ISO 13370
gives **0.238** (bounded 0.186–0.377 across soil types; soil is never in a drawing set and
moves it by 2×). `heat-loss.ts` is not naively wrong — it already applies a reduced ΔT
against a 13.5 °C ground temperature — but that substitutes a warmer sink while omitting
the soil's resistance, which is most of what ISO 13370 computes. End to end it is still
**14×**: ~267 MWh/yr of phantom heating against a whole-building expectation of ~863 MWh/yr,
i.e. **about 31% of the building's entire annual energy would have been heat leaving through
a slab that isn't leaving it.** Implemented in `energy-standards/ground-coupling.ts`
(`983e2cb`) and **deliberately not wired into `heat-loss.ts`**, because that moves every
existing building's number; it is fed instead at the seam where the builder emits the ground
construction's own U, which touches no Korean building.

**Two errors were masking each other.** The envelope was understated ~37% (too little wall)
while the ground floor was overstated 14× (too much loss). They push in opposite directions,
so **no before/after total means anything until both land.** No kWh/m² should be published
before then.

**Second-largest open question:** the Standing Seam roof is the sole roof over the atrium
spine (~296.6 m²), with **no insulation layer at all** — U 3.34–7.37. Not a canopy, as had
been assumed.

## Principles, preserved

Stated by sessions that have since exited. They survived because they are about how to be
right, not about what was true this morning.

- **A guard that makes the failure total instead of partial is worse than the failure it
  prevented.** (On `ledger-lookup.tsx:177-179`: the pager was hidden to avoid silently
  dropping matches from other pages, which turned "some matches missing" into "all matches
  missing, with no cue that 94% of the district was never examined".)
- **Never send a source's own answer back to the thing you are checking it against; refuse
  rather than emit a low-confidence guess; keep an image a person eyeballs out of the
  evidence path entirely.** (On the four-source evidence design.)
- **Corrections propagate through the channel that carried the original.** A coordinator
  repeating a corrected claim relaunches it with more authority than it had.
- **A number that lands near a half-remembered threshold is not corroboration.** *New
  today.* An unsourced λ produced a roof U near a recalled ASHRAE figure and was cited
  twice as "independent evidence the layer data is genuine". It was neither independent nor
  evidence — and the comparison target was wrong as well. This is backfitting arriving
  through confirmation bias rather than through tuning, and
  `src/data/building-calibrations/README.md` already names backfitting as invalid.
- **Prefer a wrong-for-the-right-reason number you can disclose over a right-looking one
  you cannot defend.** Applied today: a 13% ΔT-basis mismatch was accepted and written into
  the assumption ledger rather than reconciled, because reconciling it properly means
  changing ground-temperature handling for every building in the app. Trading a disclosed
  13% for an undisclosed 1400% is not a close call.
- **A substitution is not a source.** Korean 별표 values standing in for a US building's
  properties is the same category of error as trusting a Revit-default site — even when the
  number is close. Cite what you actually read: `energy-standards` cites EN 12524:2000 *as*
  EN 12524:2000, precisely because EN ISO 10456:2007 is not freely readable and pretending
  otherwise would launder a secondary source into a standard. But the boundary matters —
  the ~1% 해설서-vs-ISO surface-resistance difference in `assembly.ts` is a disclosure;
  putting a 해설서 value inside ISO 13370's `d_t`, whose correlation was fitted with ISO's
  own 0.17/0.04, would be a category error. Don't apply a ruling mechanically across cases
  that differ in kind.

## Verified facts — do not re-research

- **Production functions run in Seoul.** `vercel.json` pins `regions: ["icn1"]`. Before the
  pin, `X-Vercel-Id` read `icn1::iad1::…` and `/api/vworld/footprint` returned HTTP 502 —
  every VWorld read had been silently degrading to the 건축면적-solved rectangle. **Do not
  remove the pin.**
- **"KR-only egress block" is disproven — don't repeat it.** api.vworld.kr answers a
  US-based non-Korean host with a clean `INVALID_KEY` body. It refuses Vercel's iad1 egress
  specifically. Domain-lock, TLS, Node version and IPv6 are all ruled out.
- **Preview cannot verify VWorld.** `VWORLD_API_KEY` is Production-only; a preview deploy
  takes the 503 "not configured" path. A preview failure is not a valid negative result.
- **P2-25's measured-height tier is dead code.** `LT_C_SPBD` returns exactly ten keys and
  none is a height; 34 buildings sampled, `height: null` in every one, `groundFloors`
  present in 28/30. VWorld is a **storey-count** source, not a height source. Hunting for a
  layer carrying `buld_hg` is a separate unowned research note — do not assume one exists.
- **There is no open VWorld 3D building endpoint.** `req/3ddata` 404s. Stop looking.
- **VWorld LT_C_UQ111 does return 용도지역** in `uname`, so P2-31's 일조권 사선제한 is a
  sourced rule, not a guessed pattern.
- `src/lib/report/pdf-fonts.ts` is imported **for its side effect** by `pdf-renderer.tsx:12`
  and is the whole of P0-03 (Korean PDF glyphs, no tofu). A greedy `from`-clause import
  analyzer runs straight past `import './pdf-fonts';` and `tsc` stays quiet. Nearly deleted
  once — only a test run caught it.
- **Filenames in `docs/` contain spaces.** A bare `$(git diff --cached --name-only)` loop
  word-splits and silently skips exactly the current-state architecture docs. Use `-z` or
  `--pathspec-from-file`, and check the count afterwards.
- `react-resizable-panels` is in `package.json` with zero imports left in `src/`. If
  `components/ui/resizable.tsx` is ever deleted for real, drop the dependency with it.

## Open before reference building #2 exists — decide, don't default

**A reference building has no Korean use code, and nothing has needed one yet.**
`ReferenceBuildingManifest` (`src/lib/reference-buildings/manifest.ts`) carries
`useType: string` — free text — and **no `mainPurpsCd`**; nothing under
`src/lib/reference-buildings/` or `src/components/reference-building/` references
`buildingUseFamily` or `SYSTEM_RATIOS`. So the first time a reference building needs system
ratios or an MEP archetype, somebody will map a foreign use type onto a Korean 건축물대장
code.

**That is a cross-jurisdictional inference and must be labelled as one.** It is the same
class of defect item 6 closed today — an unrecognised use silently acquiring an 업무시설
profile — so defaulting it would re-open that bug one layer out. Two acceptable answers:
the reference path never touches those tables (state it), or the mapping is explicit,
visible and recorded as an assumption. **Settle it before #2 is built**, not after.

*Criteria for choosing #2, from the energy side, since they differ from the BIM-completeness
criteria:* what binds the energy path is `IfcMaterialLayerSetUsage` **with real thicknesses**,
not discipline-file count — a model missing its Structural file but carrying complete layer
sets is worth more here than one with five disciplines and generic material names. A
**non-US, EU-jurisdiction** building would also let EN 12524 / ISO 10456 apply *natively*
instead of as the disclosed substitution §5.1 exists to justify.

*(An earlier version of this entry also claimed an insulated envelope would exercise
ISO 13370's well-insulated branch. **That was wrong and is withdrawn** — see the finding
below. Insulation alone does not select the branch; floor size does.)*

## ISO 13370's well-insulated branch is effectively unreachable here

The branch is selected by `d_t ≥ B′`, and `B′ = A/(0.5P)` grows with the floor. The floor
resistance needed to reach it, at soil λ 2.0 and a 0.3 m wall:

| floor | B′ | R_f needed to reach the well-insulated branch |
|---|---|---|
| single dwelling (100 m², P 40) | 5.0 | 2.14 |
| small block footprint (400 m², P 80) | 10.0 | 4.64 |
| whole apartment block (1000 m², P 130) | 15.4 | **7.33** |
| 서울청운초등학교-scale / the Clinic (2605.7 m², P 217) | 24.0 | **11.65** |

Real floors do not reach the upper figures — Dutch Bouwbesluit tops out around Rc 3.5–6, and
Korean 별표1 floor limits are far below that. **So for every building this product actually
targets — multi-storey blocks and schools at B′ 15–25 — the uninsulated branch is the one
that runs, always.** Not dead code (a small detached house at B′ 5 with R_f ≥ 2.14 reaches
it) and the formula is correct and must stay, but nobody should reason about ground coupling
here on the assumption that insulating a floor changes which formula applies. It does not,
at this scale.

Same shape as the P2-25 finding that VWorld's measured-height tier can never fire: a branch
that exists, is correct, and never executes on real input.

**Pinned in tests, `0467de7`** — the crossover R_f for each floor scale, the assertion that a
generously insulated 2,605 m² floor (R_f 6.0, above any real requirement) still takes the
uninsulated branch, and the one case that does cross over (a 100 m² dwelling at R_f 2.14, an
ordinary domestic floor) so it is clear the physics is reachable and only the *scale* rules
it out. Recorded rather than removed: an unreachable branch that looks reachable invites
reasoning that is quietly wrong, which is exactly what it did.

## Still open, nobody owns

- `api/vworld/footprint/route.ts` discards `error.cause`, so every occurrence of that outage
  reads as the undiagnosable string "fetch failed". Surfacing `cause.code` is small and
  additive.
- `src/lib/cad/dwg-parser.ts:127` reaches for `http://localhost:3000/wasm/libdxfrw.js`
  **from a unit test**, so its behaviour depends on whether a dev server happens to be up.
  Latent cross-environment coupling in the DWG WASM loader.
- Dev-server cold compile: five woff2 fonts take ~12.3 s each and the viewer chunks queue
  behind them until ~12.97 s; warm, the whole thing is 645 ms. Likely inflating every cold
  e2e run. Look at the `next/font` self-hosting path (P2-14 trimmed it once).
- `src/components/viewer/architectural-ground.tsx` is a deliberate **uncommitted** design
  pass, preserved separately as `orphan/architectural-ground-design-pass` → `7535392`.
  Hands off — do not edit, revert, or stash it. Resuming it means deciding
  `QualityBudget.vegetation`'s fate at the same time, since `{budget.vegetation &&
  <SiteTrees/>}` was its only reader; landing it as-is would strand that flag in three of
  five tiers. Note the diff is bigger than it was described as: it repaves the ground to 6×
  the site extent and deletes seven procedural trees. Site appearance is a user design call.
- 8.62 MB of normal maps are downloaded on the default path and never bound —
  `rendering/architectural-material.ts` skips `normalMap` under triplanar, and every quality
  tier sets `triplanar: true`. The only thing that sets it false is BIM mode, where the
  atlas is not mounted at all.
