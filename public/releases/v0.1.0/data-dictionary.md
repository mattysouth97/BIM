# Data Dictionary — v0.1.0

Human-readable companion to [`schema.json`](./schema.json). Every field below is
derivable **only** from Korean public data — 건축물대장 (Building Ledger),
footprint geometry (VWorld), and era-based physical priors. No user-supplied
inputs, no proprietary data.

Source of truth: `PortfolioFeatureVector` in `src/lib/portfolio/features.ts`
(`FEATURE_SCHEMA.version = "1.0.0"`).

## bldrgst (11 fields)

Derived directly from 건축물대장 (Building Ledger) records.

| Field | Type | Unit | Description |
|---|---|---|---|
| `gfaSqm` | number | m² | Gross floor area |
| `floorCountAbove` | number | floors | Above-grade storey count |
| `floorCountBelow` | number | floors | Below-grade storey count |
| `buildingHeightM` | number | m | Total above-grade height |
| `constructionYear` | number | year | Four-digit construction year |
| `structureTypeCode` | number | enum | Encoded structure type: 0=masonry, 1=concrete, 2=steel, 3=wood, 4=other |
| `useTypeCode` | number | enum | Encoded use type: 0=residential, 1=office, 2=mixed, 3=retail, 4=other |
| `mainPurpsCode` | number | code | Main-purpose subclassification numeric code from Korean building ledger |
| `bcRat` | number | ratio | Building coverage ratio (건폐율), 0–1 |
| `vlRat` | number | ratio | Floor area ratio (용적률), can exceed 1 |
| `platAreaSqm` | number | m² | Plot area |

## geometry (4 fields)

Derived from footprint polygon geometry (VWorld cadastral/building-outline fusion).

| Field | Type | Unit | Description |
|---|---|---|---|
| `footprintAreaSqm` | number | m² | Ground-floor footprint area |
| `aspectRatio` | number | unitless | Long-axis divided by short-axis (≥1) |
| `perimeterM` | number | m | Footprint perimeter |
| `compactness` | number | unitless | 4π·A / P² — isoperimetric compactness (0–1, 1=circle) |

## era_prior (4 fields)

Physical property priors looked up by construction-era bucket (see
`src/lib/korean-building-codes.ts`). Not measured — inferred from the era the
building was built in, per Korean building-code timelines.

| Field | Type | Unit | Description |
|---|---|---|---|
| `wallUValuePrior` | number | W/m²K | Wall U-value prior from era lookup table |
| `windowUValuePrior` | number | W/m²K | Window U-value prior from era lookup table |
| `windowShgcPrior` | number | unitless | Window solar heat gain coefficient prior, 0–1 |
| `lightingPowerDensityPrior` | number | W/m² | Lighting power density prior from era lookup table |

## location (1 field)

| Field | Type | Unit | Description |
|---|---|---|---|
| `climateZoneCode` | number | enum | Climate zone: 0=central, 1=southern, 2=jeju |

## Prediction output fields (Parquet-only, not part of the feature vector)

When `predictions.parquet` is published, each row additionally carries:

| Field | Type | Unit | Description |
|---|---|---|---|
| `bjdongCd` | string | code | 10-digit 법정동 code the building belongs to |
| `buildingPk` | string | code | 건축물대장 PK (mgmBldrgstPk) |
| `predictedEuiKwhPerSqmYr` | number | kWh/m²·yr | Predicted primary energy use intensity |
| `predictedGrade` | string | grade | K-Green-Grade-v2 predicted energy grade |
| `modelVersion` | string | semver | Model artifact version used for inference |
| `generatedAt` | string | ISO-8601 | Timestamp the row was generated |

## Notes

- All 20 feature-vector fields are `number` type — strict, flat, no optionals.
- Sentinel value `0` on `bcRat`, `vlRat`, `platAreaSqm`, or `buildingHeightM`
  (before height-inference fallback) indicates source data unavailable upstream,
  per the 건축HUB API contract (see CLAUDE.md "API Gotchas").
- Schema is semver-versioned. Breaking changes bump `FEATURE_SCHEMA.version`
  major and start a new release track (see plan's Schema Evolution Process).
