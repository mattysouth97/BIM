---
phase: 05-publishing
plan: 02
status: implemented-live-release-verification-pending
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

## Integration remaining

The configured integration environment must verify the first reviewed release and its real filtered records/downloads after publication. Backend publication and durable-storage evidence belong to 05-01. No deployment or publication was performed by this UI lane.
