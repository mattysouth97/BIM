# Corpus browser

`/corpus` is a read-only dataset browser reached from the existing gallery and model-page download area. It adds no diagnostic workflow step.

The browser uses the published-release and paginated-record APIs described in [[Corpus Publication API]]. Region, use and era choices come from the selected release's actual coverage. Search is limited to record IDs, codes and eras; addresses, building names and owners are not exposed. Changing a filter returns to page one. Failed and superseded requests cannot leave previous search results presented as current results.

Each release provides dates, versions, total records, whole-release JSON, a data dictionary, explicit coverage and omissions, exclusion counts, assumption prevalence and changelog. Each record links to immutable JSON and retains its source identifiers, retrieval timestamp, input hash, assumptions and field provenance. Missing approval years remain unavailable.

Energy and carbon are screening calculations rather than measured consumption. Grades are not certified. Internal calculation consistency and accuracy against Korean building stock are separately stated; the browser does not invent national representation, comparison ranks or validated performance.

## Verification

Four focused component tests and five browser tests passed. Korean/English 390 and 1440 px layouts passed wrapping and overflow checks with expanded evidence. Browser transport fixtures are explicitly synthetic and never enter production bundles. TypeScript and scoped ESLint passed. Actual local endpoints returned a valid dictionary (200) and a distinct unavailable-storage state (503 without database configuration). Verification against the first reviewed release remains an integration task.
