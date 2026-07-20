# ADR Index — Architecture Decision Records

> An ADR records a decision that changes the rules the AI agents build under.
> Process reference: `docs/work-plan/AI_PROCESS.md` §1 Stage 3 (rule R3.2).

## When an ADR is REQUIRED

1. **Constraint break** — an item's `Must-not` constraint or a global AFF must be violated
   to complete the work. The AI **stops**, files the ADR, and implements only after the ADR
   is accepted.
2. **Domain assumption change** — e.g. cost data sources, escalation rates, subsidy ratios,
   primary-energy factors, climate tables, feed-in tariff model (see
   `docs/work-plan/knowledge/domain-glossary.md` for current assumptions).
3. **Fitness function retired** — removing or weakening a global AFF in
   `docs/work-plan/AI_PROCESS.md` §1 Stage 3.

Not required for: ordinary bug fixes, new items inside existing constraints, refactors
within May-touch paths.

## Index

| ADR | Title | Status | Date | Related items |
|-----|-------|--------|------|---------------|
| — | *(empty — no ADRs yet)* | | | |

## How to add one

1. Copy the template below to `NNNN-short-title.md` (next sequential number, e.g. `0001-….md`).
2. Fill every section; link the item id(s) and any superseded ADR.
3. Set `Status: proposed`. Only a human (via PR merge) sets `accepted`.
4. Add a row to the index table above in the same PR.
5. Reference the ADR in the affected item file(s) and, if it changes a rule, update
   `docs/work-plan/AI_PROCESS.md` or `docs/work-plan/knowledge/domain-glossary.md` in the
   same PR.

## Template

```markdown
# ADR-NNNN — Short title

- **Status**: proposed | accepted | superseded by ADR-XXXX | rejected
- **Date**: YYYY-MM-DD
- **Related items**: P0-00, P1-00
- **Deciders**: <human approver> (author: <AI session id>)

## Context
What forces the decision: the constraint/AFF/assumption affected, with file:line evidence;
the alternatives' constraints (cost, risk, deadlines).

## Decision
The single decision taken, stated in one or two sentences. Include the exact rule text
being changed (quote the old Must-not/AFF/assumption and the new one).

## Consequences
Positive and negative. What becomes allowed/required/forbidden; which existing code,
tests, or items are affected; follow-up work created.

## Alternatives
Each alternative considered and why it was rejected (including "do nothing").
```
