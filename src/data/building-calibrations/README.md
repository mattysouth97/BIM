# Building Calibrations

Per-buildingId calibration data layered on top of era+code material inference
(`src/lib/material-inference.ts`). Default resolver: `buildingId = PNU`
(19-digit 필지고유번호).

This directory is data, not code — no per-building special-casing belongs in
`src/lib/procedural/*` or `src/lib/fidelity/*` (see
`.omc/plans/bim-fidelity-strategy-plan.md`, Principle 3).

## File format

One JSON file per buildingId: `{buildingId}.json`, matching the
`BuildingCalibration` interface in `src/lib/fidelity/fidelity-types.ts`:

```json
{
  "buildingId": "1111010100100010000",
  "pnu": "1111010100100010000",
  "geometricLOD": "L3",
  "notes": "Optional free-text context for this calibration.",
  "overrides": [
    {
      "field": "walls.uValue",
      "inferredValue": 0.47,
      "overrideValue": 0.28,
      "source": "permit-drawing-A3 sheet 4 insulation schedule",
      "hypothesisForInference": "if material-inference.ts could read insulation-thickness from permit OCR, it would produce ~0.28 for this era+structure"
    }
  ]
}
```

`source` must cite a specific document (건축물대장 field, permit drawing,
operator self-report, manufacturer spec sheet, or a cited GX-engineer
knowledge claim). Values like `"backfit"` or `"tuned"` are invalid —
overrides chosen to make a target grade pass by fitting the number are
tautological (see plan Step 5, rule c).

## Registering a file

Next.js cannot `require()` a directory dynamically at runtime, so new
calibration files must be registered explicitly in the registry map in
`src/lib/fidelity/building-calibration-loader.ts`:

```ts
import myBuilding from "@/data/building-calibrations/1111010100100010000.json";

const CALIBRATION_REGISTRY: Record<string, BuildingCalibration> = {
  "1111010100100010000": myBuilding as BuildingCalibration,
};
```

An unregistered buildingId resolves to `null` via `loadCalibration()` — this
is the intended "no calibration" path (proves extensibility, see plan C2).
