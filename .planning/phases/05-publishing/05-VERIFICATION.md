---
phase: 05-publishing
status: passed-local-production-verification-pending
verified: 2026-09-15
requirements: [PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-07, PUB-08, PUB-09]
---

# Publishing verification

The first reviewed pilot release is stored durably in Neon, outside git.
`0.1.0-pilot` contains 71 baselines and four exclusions. Its source commit is
`4e44b1b5a0dbb01d475a466a6e23dd3b5e03cdc4`; its validated snapshot SHA-256 is
`211ed326bca2b4ce48c8731457c1368ba87304a65a09be5681f26f6836c67bbc`.

All nine publishing requirements pass local integration against the real store:

- Dated/versioned release metadata includes actual coverage, omissions,
  assumption prevalence, exclusions, changelog and separate consistency/accuracy claims.
- Full streamed JSON: 4,868,243 bytes, all71 records, independently reproduced hash.
  Exact reviewed JSON text survives JSONB's query-projection key reordering.
- All71 stable record URLs return matching records. Every represented region,
  use and era filter matches the source snapshot; pagination is stable and literal
  unmatched search returns zero. Public mutation requests are rejected.
- The public dictionary describes 38 record fields and release fields/units.
- `/corpus` reads the actual release. Korean390px and English1440px checks passed
  first/second pages, combined filters, exact-ID search, export and no overflow.
  Long provenance is accessible on demand, rather than mounting thousands of
  hidden entries before a user opens it.
- Licence/privacy decisions and concrete artifact review are recorded in
  `docs/02_Features/Corpus Licence and Publication Review.md`.

Backend tests:30 passed; UI tests:4 passed; mocked-transport browser tests:5
passed, separately from the real-release checks above. Root main3000 repeated
the actual71-result browser and complete download successfully. Production
verification follows clean-checkout deployment and is recorded separately.

Phase4's unknown account quota does not become a measured limit through
publication. This is a bounded pilot, not a full-scale national sweep.
