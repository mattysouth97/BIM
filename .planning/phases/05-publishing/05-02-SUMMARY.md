---
phase: 05-publishing
plan: 02
status: verified
requirements: [PUB-01, PUB-02, PUB-04, PUB-05, PUB-08, PUB-09]
---

# Corpus browser implementation

The existing gallery/model dataset outlet now links to `/corpus`. The browser consumes only the published-release API, with version selection, actual coverage options, ID/code/era search and paginated records. It exposes bulk JSON, immutable record JSON, the data dictionary, coverage/omissions, exclusions, assumption prevalence, source provenance, limitations and changelog. Modeled results are explicitly distinct from measured use and official certification. Pipeline consistency and Korean building-stock accuracy remain separate claims.

## Verified

- Four component tests passed: empty publication, unavailable store, release/filter/pagination query behavior with source assumptions, and clearing stale results after a failed query.
- Five Playwright cases passed: Korean/English at 390 and 1440 px, plus unavailable store. They use explicitly synthetic API transport fixtures and validate presentation, not a real published population.
- Both locales and widths have no page overflow or clipped text, including expanded provenance and release evidence. The 390 px English screenshot was visually inspected.
- TypeScript and scoped ESLint passed.
- Actual local API probes returned dictionary HTTP 200 with 38 record fields, and releases HTTP 503 without database configuration. No fallback dataset was shown.

## Live release integration

The local application was then connected to the existing private database using only `DATABASE_URL` in its process environment. No credential file was copied into the repository. Published release `0.1.0-pilot` was read successfully: 71 records in its manifest and whole-release export, and 38 record fields in the dictionary.

Real-browser checks passed in Korean at 390 px and English at 1440 px. Both displayed the first 20 records, reached the second page, combined region/use/era filters and exact-ID search to one matching record, and had no horizontal overflow. The initial DOM contained zero provenance lists; opening the first record mounted all 1,175 provenance entries, and closing it removed them again. The real Korean mobile screenshot was visually inspected. Evidence is stored locally in `qa-evidence/phase02-panel/corpus-live.json` and matching screenshots.

The area label reads “계산 대상 면적 / Modeled floor area,” because the modeled denominator excludes basement area. The introduction describes registered areas and use, without presenting an inferred outline as source geometry. Backend publication and durable-storage evidence belong to 05-01. No deployment or publication was performed by this UI lane.
