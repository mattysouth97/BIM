# Reference-building energy dataset changelog

## 2026-09-15 — schema 2.0.0 (previously 1.3.0)

The published baseline is computed live per request. This release routes named end uses to their declared fuels, computes lighting from power density, conditioned area and annual operating hours, and includes declared PV capacity using regional assumed yield. PV offsets annual electricity up to annual electric demand; clipped surplus earns no grade credit. Gross site demand is reported before PV. Domestic hot water and plug loads remain ratio estimates.

Climate inputs resolve the explicitly selected comparison region. Historical city summer design temperatures have source references; unsupported regions identify the Seoul fallback. Cooling solar is an assumed scaling of Seoul 350 by the regional/Seoul peak-sun-hour ratio. Indoor setpoints remain assumptions.

Limitation IDs L-GRADE-SHARES, L-SITE-TOTAL and L-CLIMATE are preserved and their descriptions corrected. The JSON record and CSV catalogue both link to this changelog. End-use provenance and resolved climate details are included in the JSON.

### Captured before and after

Intensities below are kWh/(m²·year). Before values were executed from phase base commit `70c0560c846bc0ddeef99530d4e16b75ba70114d`; after values were executed from the corrected engine. The evidence test reads this table and compares its after values with the live dataset. These seven rows describe the original energy-enabled roster; newly registered geometry-only examples have no modeled grade or intensity.

| Building ID | Before grade | After grade | Before primary | After primary | Before gross site | After gross site |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| bs-medical-dental-clinic | 1+ | 4 | 183.559679 | 430.858480 | 258.977461 | 219.363772 |
| schependomlaan | 1++ | 2 | 65.654691 | 188.391714 | 80.930282 | 92.785162 |
| duplex-apartment | 4 | 7 | 256.823271 | 567.780379 | 285.239737 | 282.792956 |
| fzk-haus | 2 | 7 | 160.494409 | 379.225732 | 185.130336 | 189.691213 |
| kit-office | 5 | 7 | 450.492262 | 699.453595 | 489.333970 | 410.800477 |
| klassiqua-office-1970 | 2 | 5 | 287.395334 | 492.425471 | 322.056685 | 285.342513 |
| taltech-maemaja | 1++ | 1+ | 92.446898 | 161.546540 | 93.948819 | 114.261614 |

All seven original models cross a grade threshold in this captured run. Primary intensity and gross site intensity can move in different directions because primary energy weights the declared fuels and accounts for annual PV netting.

### Evidence boundary

Internal consistency: named end uses, fuel conversion and annual PV netting are tested against the same functions used by the application. This table documents a calculation change.

Accuracy against the Korean building stock: no metered series was ingested, no calibration was performed, and these modeled outputs are not measured consumption or representative of the Korean building stock. IFC quantities measure selected model geometry, not a site survey. Existing incomplete-envelope caveats remain applicable.
