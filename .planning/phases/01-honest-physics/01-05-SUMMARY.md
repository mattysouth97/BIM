---
phase: 01-honest-physics
plan: 05
status: passed
requirements: [PHYS-05]
---

# Published physics evidence

Reference energy datasets now use schema 2.0.0 and link to
`/reference-buildings/CHANGELOG.md`. Protected limitation IDs L-SITE-TOTAL,
L-GRADE-SHARES and L-CLIMATE remain stable; their explanations describe named
end uses, LPD lighting, ratio-estimated DHW/plug loads, regional assumptions and
the annual electric cap on PV credits. The JSON and CSV are computed per request.

## Decisions and scope

The user directed: “Lets focus on getting all the phases finished quickly as possible.”
The proposed existing-ID preservation and dataset-family changelog destination
were implemented as routine choices within that authorized scope. No separate
option-number reply is claimed. Climate calculation and bilingual wrapping had
already been explicitly approved by the user.

## Executed before/after comparison

The old physics was executed from detached commit
`70c0560c846bc0ddeef99530d4e16b75ba70114d`. The corrected implementation was
executed against the same seven input models. The committed changelog contains
all seven primary/site intensities and grades, rather than a generated narrative
about an unexecuted comparison. A regression test parses the table's after
values and compares them to the live dataset and shared carbon helper.

All seven grades changed: Clinic 1+→4, Schependomlaan 1++→2, Duplex 4→7,
FZK 2→7, KIT Office 5→7, Klassiqua 2→5 and TalTech 1++→1+.
These are modeled screening grades, not certified or measured performance.

The roster now additionally contains two source-geometry hotel models with
unresolved envelopes. Their modeled energy and model inputs remain null;
unresolved envelope quantities are missing rather than measured zero.

## Verified evidence

- Live local JSON and CSV endpoints returned HTTP 200, schema 2.0.0, nine
  entries, the seven corrected grades and two unavailable energy baselines.
  The linked changelog returned HTTP 200 and is tracked in git.
- 743 reference/parity tests and 101 hook/evidence tests passed during integration.
- The pre-panel full suite passed 5,647 tests with four existing skips;
  final milestone-wide checks are recorded in the phase verification report.
- Whole-building carbon is used by the dataset and live energy metrics.
  `predictedVsActualDelta` retains its HVAC-only scope and is not presented as
  whole-building calibration.
- ADR-006 records the named-end-use decision. Dataset, twin energy and
  retrofit economics feature documents describe the implemented boundary.

Implementation commit: `03f5a6e`. Corpus canonical primary mapping subsequently
converged on the same end-use path in `bdbfa50`; isolated retrofit bill savings
respect existing-PV saturation in `bc2de35`.
