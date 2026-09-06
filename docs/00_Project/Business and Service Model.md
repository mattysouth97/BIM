---
type: strategy
status: proposed
last_reviewed: 2026-09-07
---

# BIMFIT: professional value, business and service model

## The value we intend to sell

**BIMFIT helps building professionals turn incomplete building information into a defensible retrofit recommendation: what to improve, why, what it may achieve, and what must be verified before committing capital.**

Korean positioning: **건물의 근거를 모아, 어떤 개선을 왜 선택할지 판단하는 도구.**

The customer's deliverable is a recommendation another professional can review. The model, simulator and report are instruments for producing it. Good taste means choosing the right problem, exposing the important tradeoffs and removing irrelevant detail. Evidence means another person can reconstruct the reasoning and challenge it.

This direction implements the user's 2026-09-07 mission. Customer selection, prices, delivery targets and commercial forecasts below are **hypotheses for validation**, not evidence of demand, current paid functionality or a launched service. No customer interviews, payments, contracts or sales outreach have occurred in this work.

## Start with a specific buyer and decision

| Role | Initial focus | Purchase reason to test |
|---|---|---|
| Paying customer | Principal or team lead at a Korean energy/retrofit consultancy, initially a small team | Produce repeatable client recommendations with less preparation and review work |
| Daily user | Building energy analyst, building-services engineer or retrofit architect | Reconcile drawings, material/system evidence and energy inputs; compare feasible packages |
| Recipient | Building owner or asset manager approving the next study or investment | Understand the recommendation, alternatives, risks and next action |
| Later customers | Owner engineering teams and multi-building operators | Reuse reviewed evidence across decisions and track outcomes |

Initial project: an existing small or medium non-residential building with a real envelope or HVAC investment question, accessible register/drawing information, and an engaged professional reviewer. This is a proposed starting segment, not a claim about market size. Complex hospitals, industrial processes and data centres enter only after their ventilation, process loads and operating requirements are supported.

**Job to be done:** “Before I recommend a retrofit to my client, help me establish a credible baseline, compare a few feasible alternatives and explain which missing information could change my advice.”

The first narrow service should reconcile evidence and produce a reviewed **envelope/HVAC screening brief**. The customer's appointed engineer owns the investment recommendation. Expand the scope only after this workflow proves useful and the detailed simulation path is validated.

Buy when a live project needs a proposal, an owner asks which measure to fund, equipment replacement creates a choice, or conflicting drawings and bills stall analysis. The product should fit that deadline. Generic interest in sustainability is insufficient buying evidence.

## The paid unit of value: a reviewed building decision

Define one decision package as one building, one stated investment question, one frozen baseline and up to three alternative packages. It includes:

1. **Decision brief:** client objective, budget/horizon assumptions, recommendation and conditions under which it changes.
2. **Evidence register:** source file/page/object, date, units, extraction method, conflict resolution, missing inputs and reviewer corrections.
3. **Comparable scenarios:** identical weather and operating basis, cost scope, energy by carrier, carbon factors, comfort limitations and implementation constraints.
4. **Verification plan:** the next measurement or document to obtain, the uncertain input it resolves, and whether the unresolved issue prevents a recommendation.
5. **Reproducible handover:** model/input versions, method and limitations, run identifiers, editable input data, results and review history.

The recommendation is allowed to be **“investigate first”** or **“defer this measure.”** A ranking that ignores unmeasured roof obstructions, an unknown ventilation requirement or unsupported HVAC savings does not qualify as a reviewed decision.

Before probabilistic modelling is validated, show named low/base/high assumption scenarios. Do not label their spread a confidence interval or invent a confidence percentage. A data-completeness score is not a probability of correctness.

## Service first, repeatable software second

| Offering | Deliverable and scope | Proposed commercial test | Readiness |
|---|---|---|---|
| Public reference library | Source-linked models, illustrative materials and reproducible calculated datasets | Free; demonstrate quality and enable professional inspection | Available; published results remain screening estimates |
| Assisted decision pilot | One building, evidence review, baseline and up to three alternatives, one review meeting and one revision | **₩1.5m per project**, quoted scope; 10 business days after usable data is accepted | Proposed service; needs a qualified reviewer and delivery checklist |
| BIMFIT Professional | Private projects, reusable inputs, scenario review, versioned client reports and reproducible exports | **₩290,000 per analyst/month**, test only after repeat use is observed | Proposed; identity, private storage and workflow gaps remain |
| Additional specialist review | Named engineer reviews defined modelling/feasibility questions | Separately quoted after scoping | Proposed partner service; no partner currently appointed |
| Enterprise / data delivery | Controlled team access, batch workflows, connectors or curated custom datasets | Paid discovery followed by scoped annual contract | Later; no public price or SLA promised |

Prices are exclusive of tax for comparison; invoicing terms must be established when selling. These are deliberately concrete test offers, not researched market prices. Do not put a checkout, “enterprise ready” badge or response-time guarantee on the website before the associated capability and staffing exist.

Professional would exclude human engineering review. Test the analyst-seat price against a firm/project subscription before fixing the charging unit. Set included active projects, simulation allowance and overage terms from measured pilot usage; unlimited compute is not part of this proposal.

Pilot scope excludes a site survey, construction design, statutory certification, guaranteed savings and unrestricted remodelling. Record data insufficiency at intake and either narrow the question, quote added work or decline it. Extra work requires a revised scope rather than quietly consuming the service margin.

A provisional intake envelope is one use type, at most 20 thermal zones and no process-energy modelling. These limits constrain analyst work; they are not statements that the current simulator already supports hourly multi-zone analysis. An assisted pilot can use an established external simulator where needed and must identify that engine and the responsible modeller.

### Delivery sequence

| Stage | Owner | Evidence of completion |
|---|---|---|
| Intake | Account lead + analyst | Decision question, data inventory, permission to use client files, scope and acceptance criteria |
| Model preparation | Analyst | Source-to-input links, conflicts resolved or explicitly left open, geometry/area checks |
| Analysis | Analyst | Frozen baseline, supported alternatives, consistent tariffs/weather, recorded run versions |
| Independent review | Qualified reviewer | Critical input/claim checks and signed internal review record |
| Client handover | Lead + analyst | Decision package and unresolved-action list; one documented revision |
| Follow-up | Client + analyst | Whether the recommendation was useful, acted on, or changed; permission for any case study |

Do not refer to an internally reviewed package as a legally certified report. A customer's engineer retains responsibility appropriate to their appointment. Specialist engineering review is a real cost and cannot be replaced by an AI-generated approval paragraph.

## Why someone would pay

The economic hypothesis is saved professional time plus less avoidable rework. Measure those before claiming them.

Illustrative subscription calculation: if a firm values analyst time at **₩70,000/hour** and saves **8 hours/month**, gross time value is **₩560,000/month**. At ₩290,000/month, the difference is ₩270,000 before adoption, review and other costs. Break-even time is approximately **4.15 hours/month** (290,000 ÷ 70,000). These are assumed values, not observed customer savings.

Illustrative assisted-pilot economics:

| Item | Explicit assumption |
|---|---:|
| Revenue | ₩1,500,000 |
| Analyst labour | 8 h × ₩60,000 = ₩480,000 |
| Reviewer labour | 2 h × ₩100,000 = ₩200,000 |
| Variable compute/storage | ₩50,000 |
| Delivery contribution | **₩770,000 / 51.3%** |

This contribution excludes sales, overhead, taxes and product development; it is not net profit. Four extra analyst hours reduce it to ₩530,000 / 35.3%. Time tracking and tight intake are essential. Do not infer a sustainable subscription margin from the service margin.

The eight analyst hours must include intake, preparation, delivery administration, handover, follow-up and the included revision; otherwise add those costs separately. Any incremental external simulator licence or specialist fee must also be deducted. The example assumes none and is not a validated delivery budget.

The test is whether a real firm pays and uses the output on a client decision. A positive interview, account creation or attractive model screenshot does not establish willingness to pay.

## Position against real alternatives

Established tools already perform sophisticated analysis. EQUA describes IDA ICE's dynamic multi-zone modelling, BIM import, version handling and optimisation. IES offers simulated-versus-operational comparison through iSCAN. Autodesk describes BIM-derived operational and embodied carbon analysis in Forma Carbon Insights. These are first-party capability statements, not independent performance comparisons. [IDA ICE](https://www.equa.se/en/ida-ice), [IES iSCAN](https://iesve.com/products/iscan), [Forma Carbon Insights](https://www.autodesk.com/products/forma-carbon-insights/overview).

| Alternative | Why a professional already uses it | BIMFIT must prove |
|---|---|---|
| Spreadsheet + drawings + existing simulator | Flexible, familiar, already embedded in review work | Less repeated input reconciliation and report preparation without losing control |
| Mature simulation suite | Detailed physics, established workflows and regional support | Faster preparation of a defensible problem; export and handover into the specialist workflow |
| Outsourced modelling | Access to expertise and someone accountable for the work | A repeatable assisted service with clear scope, review and reusable evidence |
| Do nothing / defer | No immediate software or study cost | A current decision is valuable enough to justify the work |

Do not base positioning on “the only transparent simulator,” “automatically accurate BIM,” or “more accurate than every engine.” There is no evidence for these claims. The proposed advantage is **the quality and speed of the complete evidence-to-recommendation process**, measured against the customer's current workflow.

## A moat that follows the mission

Build a corpus of difficult, resolved modelling cases: original evidence, ambiguous interpretation, reviewer correction, effect on the result and later measured outcome where available. It should improve ingestion rules, validation fixtures, uncertainty estimates and professional judgment. A large pile of unreviewed meshes has much less value.

Public source files retain their own licences. BIMFIT may sell preparation, hosted workflows and original review work, but must not imply exclusive ownership of openly licensed BIM. A required policy for future client work is privacy by default, with explicit, separate permission for training, publication or benchmarks. Private team storage is not implemented: gate client intake on an agreed and tested secure file-handling process, including any external analysis tools. Commercial data products should sell documented quality, compatibility and update service rather than access to a public download.

Increase library variety against a coverage matrix: use type, climate, construction, system, geometry complexity, source completeness and measured-data availability. Prefer a model that tests a new important failure mode over another visually similar building. “Public BIM,” “energy-input complete,” “runnable,” “benchmark validated” and “meter calibrated” are distinct states.

## Product consequences: what gets built next

The existing four steps stay fixed. The gallery remains a reference collection preceding them, without a new diagnostic entry or marketing funnel inserted into it.

| Existing step | Professional question | Required improvement |
|---|---|---|
| 건물 검색 | Is this the right building and scope? | Identity, conditioned-area basis, input coverage, missing evidence |
| 도면 업로드 | What do these files actually establish? | File/version traceability, geometry conflicts, supported extraction and actionable repair |
| 디지털 트윈 | Which alternatives are defensible? | Click an element to inspect evidence; consistent baseline/scenario accounting; assumptions that can change the ranking |
| 보고서 | Can someone else review and act on this? | Frozen decision package, alternatives, verification actions, reviewer record and reproducible export |

Priority order:

1. **Correctness of the recommendation:** unify the traceable inputs and visible energy path; reconcile energy carriers, existing/proposed systems and cost scope; stop unsupported measures appearing as quantified benefits.
2. **Evidence usability:** make missing/conflicting high-impact inputs actionable; tie material appearance to a clear illustrative/source distinction; show the input whose correction matters most.
3. **Professional handover:** versioned scenarios and an export that retains evidence and limitations. Review a generated report against its actual displayed numbers.
4. **Paid-project readiness:** authenticated private storage, team permissions, recoverable project history, deletion/export, metered compute and a tested service operation. Current browser-local persistence is insufficient for a paid team product.
5. **Validated simulation:** the staged engine programme in [[Energy0 Simulation Engine Research]]. Advanced optimisation follows trustworthy comparisons.

Rendering earns priority when it helps inspect envelope, material, space or system evidence. Realistic finishes should improve comprehension; they must never make an inferred assembly look surveyed. Collapse secondary controls, retain a stable spatial context and lead with the decision-relevant information.

### Definition of done for a decision feature

- Names the professional task and the decision it improves.
- Shows the source, assumption or user input behind the important claim.
- Explains unavailable inputs and whether they change the recommendation.
- Uses the same baseline and units in the scene, figures and export.
- Lets the user inspect, correct and reverse the input.
- Passes meaningful computational checks and a visual/wording review.
- Records the observed benefit or leaves the commercial benefit explicitly unproven.

## 90-day commercial validation plan

This is a proposed sequence, not an active outreach campaign. Sending messages or entering contracts needs the user's explicit instruction.

**Days 1–15:** recruit 10 relevant firms for workflow interviews through user-authorized channels. Ask each to walk through a recent real project, files, hours, review loops and purchasing authority. Do not pitch a feature list first. Capture the current workaround and the decision deadline. Target five firms willing to provide a suitably permitted project for assessment.

**Days 16–45:** offer five separately scoped pilots at the test price; aim for at least three paid acceptances. Run the same input case through the customer's current process and BIMFIT-assisted work where practicable. Count all setup, correction, review and export time. Record material errors, unsupported cases and client-requested revisions. No invented testimonials or discounted “paid” conversions presented as full-price demand.

**Days 46–75:** deliver, interview both analyst and report recipient, and test a second paid project or a subscription commitment. Prioritize the repeated bottleneck observed in at least three projects. If manual preparation dominates, improve ingestion before expanding solver features.

**Days 76–90:** decide whether to offer Professional, retain an assisted-service business or change the initial segment.

Proposed go/no-go gates: three of five qualified pilot offers accepted at the stated price; at least two repeat purchases or explicit paid continuation commitments; median total analyst/reviewer effort at least 30% below the documented comparison workflow on matched scopes; no unresolved material false claim in delivered packages; positive delivery contribution after actual labour and compute. This is a small directional experiment, not statistical proof of a market. Failing a gate triggers a diagnosis, not a rewritten success metric.

## Measure what reflects professional value

Primary metric: **reviewed building decisions completed and used by the customer**, with an auditable definition of “used” (included in a client proposal, authorised further investigation, or informed an investment decision).

Supporting metrics: time to reviewable baseline; total delivery/rework hours; critical assumptions resolved; reviewer disagreement rate; source-to-result reproducibility; repeat paid projects; realised contribution by scope; scenario ranking stability under plausible inputs. Later, measure prediction errors on withheld operational data separately from process productivity.

Downloads, model count, photorealism, generated tokens and number of simulations are diagnostic activity measures. They do not by themselves establish professional value.

## Public language

Use now, consistent with available functions:

> **Inspect the evidence behind a building's energy performance.** Explore source BIM, examine materials and systems, and compare screening scenarios with their assumptions visible.

The current model does not quantify every measure's energy effect: PV/LED economics and grade calculations still have separate limitations. Keep those limitations beside the affected result, including in exported material.

Use for the intended paid service, clearly marked as proposed until operational:

> **From building evidence to a defensible retrofit recommendation.** A reviewed baseline, comparable options and a clear plan for what to verify next.

Avoid claims of official certification, guaranteed savings, universal accuracy, live operational monitoring, enterprise security or paid services that have not been implemented and verified.

## Next concrete experiment

Prepare one complete decision package using a public model, explicitly labelled as an illustrative case without measured bills. Have an independent practitioner reconstruct its principal recommendation from the attached inputs, flag the evidence they would require for a real client, and record their time. Then test the same workflow on a permitted client project. This makes the product's commercial promise reviewable before building billing or a sales page.

The curated public example demonstrates review quality, not preparation-time savings. A productivity comparison must begin from comparable uncurated inputs and include all prior cleanup, setup and review effort.
