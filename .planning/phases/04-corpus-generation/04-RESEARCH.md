# Phase4 research — 2026-09-15

Official source: https://www.data.go.kr/data/15134735/openapi.do, modified
2026-07-10. Portal labels reuse unrestricted and advertises development traffic
10,000. This is not evidence of this account's measured daily quota.

The exported Vercel environment contains a short non-working credential value;
three direct credential attempts yielded HTTP403/zero rows. These are credential
transport diagnostics, not upstream quota measurements. A normal browser on the
published site's same origin successfully used the deployed proxy and its private
credential: Seoul/Busan/Daegu first-page queries yielded 25 rows each. No spoofed
headers, saturation requests or exported working secrets were used.

Pipeline inspection found canonical primary parsing retained separate DHW fuel
routing and omitted PV, despite retrofit parity being green. The corpus must not
copy that obsolete result: canonical parsing now calls shared EndUseLoads routing
and calculatePrimaryEnergy, verified with declared PV plus district cooling.

Storage contract is append-once per-row outcome JSON, atomic checkpoint and pinned
job metadata. A complete bounded release exports records.ndjson, exclusions.ndjson
and manifest.json outside git. Generation-status is explicit so a partial job
cannot look publishable. Existing production database is Phase5's storage concern.
