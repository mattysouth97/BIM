---
type: project
status: implemented
last_verified: 2026-08-27
---

# BIMFIT Project Knowledge Vault

This folder is an **Obsidian vault**. Open it with *Open folder as vault → `docs`*.
Everything here is plain Markdown and stays useful without Obsidian.

## Read this first

| If you are… | Start here |
|---|---|
| New to the project | [[Project Overview]] |
| An AI agent starting a session | [[CURRENT]] — then this file's source-of-truth rules |
| Looking for what actually works today | [[Current State]] |
| Trying to find where code lives | [[Repository Map]] |
| About to change architecture | [[System Architecture]] → the relevant [[ADR-000 - Architecture Decision Record Guide|ADR]] |
| Trying to run or ship it | [[Build and Run]] → [[Deployment and Environment]] |

## Source-of-truth hierarchy

Documentation is **not** the top of this hierarchy. When a document disagrees
with working code, investigate the discrepancy — do not change the code to match
the document.

```text
1. Runtime evidence          ← what the deployed app actually does
2. Automated tests           ← vitest + Playwright
3. Source code / config
4. Architecture Decision Records
5. Current-state documentation  (00_Project/Current State.md)
6. Product and feature documentation  (02_Features/)
7. Research and historical notes  (05_Research/, 99_Archive/)
```

## Vault layout

```text
docs/
├── 00_Project/        What this is, what it is for, what is true today, where code lives
├── 01_Architecture/   Subsystems, data flow, runtime, integrations, ADRs
├── 02_Features/       One document per conceptual feature — not per component
├── 03_Development/    How to build, test, and work in this repository
├── 04_Agent-Handoffs/ CURRENT.md — verified session state. Archive/ for superseded handoffs
├── 05_Research/       Investigations and candidate approaches. NOT specification
├── 07_QA/             Test architecture, critical journeys, fragile areas
├── 08_Operations/     Deployment, environment, keys
├── Templates/         Obsidian templates for new documents
├── 99_Archive/        Superseded material, preserved rather than deleted
│
├── work-plan/         PINNED — the tracked remediation plan (RE→SDD→CDD→EDD)
├── superpowers/       PINNED — historical plans, specs and research
├── plans/             PINNED — historical implementation plans
└── (loose .md at docs root)  Domain references: assumptions, energy input sources
```

### Pinned folders

`work-plan/`, `superpowers/` and `plans/` predate this vault and are **referenced
by name** from `CLAUDE.md` and from each other. They were deliberately left in
place rather than reorganised, because moving them would break the documented
development process. Link to them; do not relocate them.

## Conventions

Documents carry YAML frontmatter so Obsidian's Properties view is useful:

```yaml
---
type: project | architecture | feature | adr | research | qa | handoff | operations | reference
status: implemented | partial | experimental | planned | deprecated | historical | unknown
last_verified: YYYY-MM-DD
---
```

`status` describes the **subject** of the document, not the document's own
completeness. A feature marked `partial` is partly built; the page describing it
may be perfectly complete.

Never describe planned or unmounted functionality as implemented. Several
subsystems in this repository are retained but not reachable at runtime — those
are called out explicitly where they appear.
