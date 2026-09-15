# Phase 03 source research

Checked 2026-09-15. This is source intake research, not a claim that models have been integrated, that geometry has passed validation, or that energy has been calibrated.

## Actionable model candidates

### TUM Fantasy Hotel 1 — hospitality gap

- Publisher: IFC-Bench, maintained by TUM researcher Sylvain Hellin; project-specific author and copyright: **2025 TUM Students, BIM Fundamentals SS2025**.
- [Dataset](https://huggingface.co/datasets/sylvainHellin/ifc-bench), [model card](https://huggingface.co/datasets/sylvainHellin/ifc-bench/raw/main/projects/fantasy_hotel_1/model_card.md), [model licence](https://huggingface.co/datasets/sylvainHellin/ifc-bench/raw/main/projects/fantasy_hotel_1/license.txt), [IFC download](https://huggingface.co/datasets/sylvainHellin/ifc-bench/resolve/main/projects/fantasy_hotel_1/arc.ifc).
- MIT is assigned to this IFC project by its model card and adjacent licence, separately from the dataset's CC BY 4.0 documentation licence. Preserve the full MIT copyright and permission text with substantial copies and derivatives.
- A fictitious educational hotel, explicitly described that way by the model card. Do not claim a real building or an as-built survey. TUM attribution does not establish German geographic location.
- Downloaded outside the repository to `C:\Users\남승헌\AppData\Local\Temp\bim-phase03-source-cache\fantasy-hotel-1\arc.ifc`; `license.txt` and `model_card.md` are alongside it.
- 8,455,469 bytes. SHA-256 `cd976f3e9222a49ad072078ed27934f20dbc11c889271b1ee3c1ab4ce504a03e`, matching the upstream LFS content hash.
- Header: IFC4, ReferenceView_V1.2, Revit 2024 export dated 2025-06-11; declared metre and square-metre units.
- Raw entity census: 26 IfcSpace, 4 IfcBuildingStorey, 53 IfcWall, 73 IfcWindow, 49 IfcSlab, 25 IfcDoor, 0 IfcRoof. This is a syntax census, not a conditioned-area or envelope determination. Storey elevations: 0, 4.9, 9.8, 11.8 m; the last storey is named Mumti.
- A Default IfcSite carries approximately 42.36/-71.06 coordinates. The source calls this a fantasy model; these coordinates must not be promoted into a verified actual location. Energy climate needs an explicitly labelled scenario assumption, or remains unresolved.
- Geometry, quantity plausibility, excluded spaces, real material properties, window boundary classification and thermal assumptions still require the normal extractor checks. No measured energy is provided.

### TUM Fantasy Hotel 2 — additional educational candidate

- Same original authorship and project-specific MIT terms.
- [Model card](https://huggingface.co/datasets/sylvainHellin/ifc-bench/raw/main/projects/fantasy_hotel_2/model_card.md), [licence](https://huggingface.co/datasets/sylvainHellin/ifc-bench/raw/main/projects/fantasy_hotel_2/license.txt), [IFC download](https://huggingface.co/datasets/sylvainHellin/ifc-bench/resolve/main/projects/fantasy_hotel_2/arc.ifc).
- Upstream API lists 9,952,273 bytes, LFS SHA-256 `3d6e1e7426686366f42b3c6738f17b636aa3e697150dd87bb658f449962c3b39`. IFC not downloaded in this pass; that hash is upstream metadata, not locally recomputed.
- Adds another model, but does not add a second typology beyond hospitality, and does not meet the Korean-model requirement.

### RWTH DigitalHub — original publisher alternative

- [Original RWTH E3D repository](https://github.com/RWTH-E3D/DigitalHub), [README](https://raw.githubusercontent.com/RWTH-E3D/DigitalHub/master/README.md), [MIT licence](https://raw.githubusercontent.com/RWTH-E3D/DigitalHub/master/LICENSE).
- Copyright 2020 RWTH Aachen University, E3D Institute. Repository is a model delivery collection; licence is from that original publisher, not an unrelated IFC reader's software repository.
- [Architecture v2 download](https://raw.githubusercontent.com/RWTH-E3D/DigitalHub/master/Version_2/DigitalHub_FM-ARC_v2.ifc), 9,022,255 bytes from publisher tree metadata. README identifies October 2023 v2 as Revit IFC4 Reference View. Also has heating, ventilation, plumbing and a v1 architecture export with first/second-level space boundaries.
- The seven-model roster supplied for this research omits DigitalHub. Check actual catalog before counting it as new. Office use does not fill the missing hospitality/school/retail typology by itself. This research did not establish construction status or verify coordinates.

## Korean geometry: unresolved IFC/DXF licence gate

The strongest modern Korean IFC lead is the **21st Century Building, University of Seoul**. The [primary 2026 research paper](https://sensors.myu-group.co.jp/sm_pdf/SM4297.pdf), Table 2 / PDF page 9, identifies IFC2x3, provided through Busan National University BIM data. Reference 29 names national research report `TRKO202200003936`. This establishes that the Korean IFC was used by the researchers. It does **not** establish a public IFC download, copyright ownership, or permission to redistribute converted geometry. No such permission was found in this pass. Do not ingest or mark Korean-model acceptance complete from the paper alone.

An explicitly licensed Korean measured-drawing fallback exists: National Research Institute of Cultural Heritage's [한국의 고건축 제1호](https://portal.nrich.go.kr/kor/originalUsrView.do?info_idx=58&menuIdx=1046), 1973, lists a 11.43 MB PDF and measured drawings of Haeinsa Janggyeong Pango, Muwisa Geungnakjeon and Dogapsa Haetalmun. The item itself assigns KOGL Type 1 attribution terms. This is a PDF/photo drawing collection, **not an established IFC/DXF file**; model reconstruction would be a separate documented inference workflow and heritage building energy assumptions are not appropriate calibration defaults. Do not silently label this dimensioned vector geometry or use its licence as permission for unrelated models.

Searches also reached Korean BIM research papers, BIM-library references and government news pages. A licence on a news article does not license an underlying construction model. No foreign model was relabelled with Korean coordinates, and no outreach was sent.

## Korean metered-energy sources

| Source | Licensing evidence | Scope and calibration limitations |
|---|---|---|
| [MOLIT building electricity](https://www.data.go.kr/data/15054214/fileData.do), [machine-readable licence metadata](https://www.data.go.kr/catalog/15054214/fileData.json) | Portal explicitly says unrestricted permitted use, free | Monthly parcel/customer-level records with address and codes. Detached homes and apartments below 200 units excluded since Jan 2020. Industrial, transport, generation, CHP and charging uses excluded. Parcel/customer is not automatically one BIM building. |
| [MOLIT building gas](https://www.data.go.kr/data/15054213/fileData.do), [metadata](https://www.data.go.kr/catalog/15054213/fileData.json) | Portal metadata says unrestricted permitted use | Same geography/exclusion issues. Confirm downloaded gas unit before converting; portal description alone does not establish it. |
| [Suwon building electricity GIS](https://www.data.go.kr/data/15110037/fileData.do), [metadata](https://www.data.go.kr/catalog/15110037/fileData.json) | Unrestricted permitted use, free | SHP data for 2019–2021, building-level monthly electricity in kWh, field-definition document supplied. Stronger bounded calibration intake candidate if a Suwon building can be matched to geometry. No file downloaded in this pass. |
| [KEA commercial-sector energy/GHG statistics](https://www.data.go.kr/data/15075917/openapi.do) | Unrestricted permitted use; free API, service key and operating-stage approval | Aggregated commercial-sector statistics, not a per-building meter truth. Suitable for contextual benchmarks only. |

Provider entry points are [electricity](https://www.hub.go.kr/portal/opn/tyb/idx-nbem-elcty.do) and [gas](https://www.hub.go.kr/portal/opn/tyb/idx-nbem-gas.do). They were reachable; no bulk dataset or authenticated download was attempted. Sitewide copyright footers do not negate the explicit dataset licence, but actual release files, units and building matching still need to be captured.

Before calibration, require a matched building identifier, complete months, actual year, fuel units, covered meters/uses and conditioned-area denominator. A simulation-to-aggregate comparison is not metered building calibration. These sources do not provide a matched metered record for either fictitious hotel.

## Acceptance status from this research

- Hospitality model intake can proceed using Hotel 1 with MIT notice and educational-model disclosure.
- A further licensed candidate exists (Hotel 2 or DigitalHub after catalog check).
- Korean IFC/DXF ingestion remains blocked by missing public file plus model-specific derivative redistribution evidence; the bounded search is not proof that no licensed Korean model exists.
- Korean meter source and licence discovery succeeded; model-to-meter matching and actual calibration remain unverified.

## Independent plan review

Reviewed `03-01-PLAN.md`, `03-02-PLAN.md`, `03-03-PLAN.md` against the current `REQUIREMENTS.md` definitions on 2026-09-15. Verdict: **PASS for bounded safe execution; full Phase 3 completion remains conditional.**

| Check | Verdict | Evidence / action |
|---|---|---|
| ANCH-01/02 roster and all-card contracts | PASS | Plan 01 gives the registry sole enumeration ownership, derives quantitative projections, and requires a deliberate manifest mutation test. Preserve existing editorial labels only where they make no unverified quantitative claims. |
| ANCH-03 Korean building | OPEN | Plan 02 correctly refuses a foreign model with Korean weather. The current candidate search has not provided the required licensed Korean IFC/DXF; do not mark this requirement or the phase complete. |
| ANCH-04 missing typology | PASS, pending ingest | Hotel 1 is a documented hospitality candidate. Runtime and artifact validation still required. |
| ANCH-05 further licensed model | FLAG | Plan 02 maps this requirement but does not name a distinct additional candidate in its done condition. Register Hotel 2 or another eligible model separately from the model counted for ANCH-04. Do not count one hotel twice as both the gap model and the further model. |
| ANCH-06 meter reuse finding | PASS | Plan 03 requires primary licensing/coverage evidence and makes no claim of obtainable meter joins. The recorded official findings above satisfy discovery, not calibration. |
| ANCH-07 honest absence of meter anchor | PASS, pending UI verification | Plan 01 owns actual product rendering; Plan 03 alone cannot prove runtime disclosure. Verify KO/EN cards and detail surfaces after integration. |
| Source rights and fictional geography | PASS | Plan 02 requires licence, hash, source geography and fiction status; do not infer location from the hotel's template IfcSite. |
| Parallel ownership and release | PASS | No physics/global state/deploy writes. Docs/rendering handoff needs coordination because Plan 01 disclosure and Plan 03 documentation share one acceptance requirement. |
| Verification | PASS | All-model contracts, types, hashes and actual browser rendering required. The three plan files are execution intent, not completed evidence. |

No source or application files were changed by this research worker; only this report and the authorized external hotel cache were written.
