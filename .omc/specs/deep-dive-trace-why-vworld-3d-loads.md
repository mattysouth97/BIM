# Deep Dive Trace: why-vworld-3d-loads

## Observed Result

In the Twin stage of the BIM Next.js app, toggling **VWorld 3D** returns zero buildings. The route at `/api/vworld/buildings-3d` either returns `buildings: []` or `error` strings about missing datasets. The cadastral-footprint route at `/api/vworld/footprint` (dataset `LP_PA_CBND_BUBUN`) **does** work on the same API key + domain — so VWorld access itself is functional.

A heuristic fix landed in commit `20f6e79`: a fallback chain (`LT_C_USABDLT_PG → LT_C_AISBLDG → LT_C_SPBD`) plus error surfacing in the toggle. The fix papers over the symptom but the root cause is unconfirmed.

## Ranked Hypotheses

| Rank | Hypothesis | Confidence | Evidence Strength | Why it leads |
|---|---|---|---|---|
| 1 | **Config/env: API-key tier doesn't include building polygon datasets while permitting cadastral** (Lane 2 narrow) | Low-Medium | Weak-Moderate | The asymmetry between cadastral-working and all-three-building-datasets-failing on the **same** key + same `VWORLD_DOMAIN` is the most parsimonious explanation. Per-dataset permission gating is documented VWorld behavior. |
| 2 | **Code-path: `geometry=true&attribute=true` extra params and ~5× larger bbox** (Lane 1) | Low-Medium | Moderate | Real, citable, line-level divergence vs the working footprint route. Falsifiable in one HTTP call. But all-three-fail pattern weakens it (extra params would normally yield `INVALID_PARAMETER`, not silent emptiness). |
| 3 | **Measurement: extractor mis-shapes features** (Lane 3) | Low | Weak | Property-name mismatch alone cannot produce zero buildings (would yield NaN attributes). Only the geometry-type rejection or redundant status-check sub-paths could; both speculative. The handoff explicitly admits dataset IDs were guesses. |

## Evidence Summary by Hypothesis

- **Lane 2 (config/env, narrow):** Cadastral route working with identical key + identical `VWORLD_DOMAIN="localhost"` default rules out the *general* config-broken hypothesis. What survives is a narrow per-dataset entitlement sub-hypothesis. Repo memory confirms VWorld gates 3D building data ("LOD3-4 for major cities only"). Route header comment itself says "the precise [dataset] available depends on the API key's permissions."
- **Lane 1 (code-path):** Diff vs working footprint route is exactly two extra params (`geometry=true`, `attribute=true`, lines 85–86 of `buildings-3d/route.ts`) and a ~5× larger bbox (240m² vs ~50m² footprint). CRS, BOX coord order, request shape otherwise byte-identical.
- **Lane 3 (measurement):** Extractor reads ~10 attribute keys with multi-spelling fallbacks — itself evidence the author was guessing schemas. But envelope-parsing (`response.response.result.featureCollection.features`) matches the working footprint route's pattern. Geometry-type filter at line 217 only accepts `Polygon`/`MultiPolygon` — would silently drop `LineString` outline datasets.

## Evidence Against / Missing Evidence

- **Lane 2:** Footprint route works → key valid + domain accepted at registration. No surfaced error string in the codebase mentions `KEY_INVALID`, `NOT_AUTHORIZED`, `REQUEST_USER_REQ_DENY`, or any VWorld permission sentinel — but those would only appear after a real probe.
- **Lane 1:** `geometry=true&attribute=true` are documented VWorld GetFeature params, not invented. If they were rejected, VWorld would normally return `INVALID_PARAMETER`, which the route would surface.
- **Lane 3:** Wrong property names alone produce **buildings with NaN attributes**, not zero buildings — incompatible with the observed symptom. The "geometry-type rejection" sub-path requires VWorld to actually return non-Polygon outlines, which is unusual for these datasets.

## Per-Lane Critical Unknowns

- **Lane 1 (code-path):** *Whether `geometry=true&attribute=true` (or the ~5× larger bbox) causes VWorld to reject the request.* Resolved by removing those params and retrying.
- **Lane 2 (config/env):** *What `response.status` string VWorld actually returns for each of the three datasets.* If `NOT_AUTHORIZED` / `REQUEST_USER_REQ_DENY` / `INVALID_DOMAIN` → confirmed. If `OK` with empty `features` → falsified.
- **Lane 3 (measurement):** *What the raw VWorld response body looks like on the failing path.* Specifically: status, feature count, first-feature `geometry.type`, first-feature property keys.

## Rebuttal Round

**Best rebuttal to Lane 2 leader:** "If the API key was un-entitled to building datasets, you'd expect a clear permission status string from VWorld; the code surfaces `response.status` verbatim and the user reports 'no buildings' rather than a specific permission error." → **Counter-rebuttal:** the status string surfaces *only when seen* — the user hasn't pasted it. The route's `error` field carries it; we just haven't seen the actual string. So this rebuttal is non-falsifying without the probe.

**Why the leader held:** Lane 2's narrow form (per-dataset permission gating) is the only hypothesis fully consistent with the asymmetry pattern (one VWorld dataset working, three failing simultaneously) without requiring a coincidence (e.g., all three datasets independently break extractor schemas).

## Convergence / Separation Notes

**All three lanes collapse on a single artifact: the actual VWorld response body.** Each lane named the same probe in different language. This is high-grade convergence and means:

1. The trace cannot be sharpened further by code inspection alone.
2. A single 30-second HTTP probe will eliminate at least two of the three lanes.
3. Running the probe **before** moving to interview/spec is strictly more informative than discussing requirements based on inconclusive evidence.

## Most Likely Explanation

**Insufficient evidence to declare a single leader, but Lane 2 (per-dataset permission gating on the API key) is the most parsimonious explanation given the asymmetry between cadastral-working and all-three-buildings-failing.** Lane 1 (request-shape) is a falsifiable secondary with a one-line fix if confirmed.

## Critical Unknown (synthesized)

**For the failing buildings-3d route at a known-populated centroid: what does VWorld's `response.status` field contain, and if `OK`, how many features come back and what does the first feature's `geometry.type` and property keys look like?**

This single artifact partitions all three lanes:
- `status !== "OK"` (e.g., `NOT_AUTHORIZED`, `INVALID_KEY`, `INVALID_DOMAIN`) → Lane 2 confirmed.
- `status: "OK"` + `features=[]` → request reached VWorld and was accepted but no buildings exist there OR dataset ID is wrong (probably Lane 2 narrow).
- `status: "OK"` + `features.length > 0` + extractor returns 0 → Lane 3 confirmed.
- `status: "OK"` + `features.length > 0` + extractor returns N → "VWorld 3D loads no data" was a false report, real bug is elsewhere.

## Recommended Discriminating Probe

**Hit the route with `?debug=true` against a known-populated Seoul centroid and inspect the response.** Then compare with the same query against VWorld directly using the footprint-route's exact param shape (no `geometry=true&attribute=true`).

```bash
# Probe A — current code path with the new ?debug=true:
curl "http://localhost:3000/api/vworld/buildings-3d?lat=37.5665&lng=126.9780&radiusM=200&size=5&debug=true" | jq

# Probe B — bypass route, hit VWorld directly with footprint-style params:
curl "https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_USABDLT_PG&key=$VWORLD_API_KEY&domain=localhost&crs=EPSG:4326&geomFilter=BOX(126.9775,37.5660,126.9785,37.5670)&size=5&format=json" | jq

# Probe C — known-broad-tier dataset to isolate permission tier:
curl "https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_DAMYOJI&key=$VWORLD_API_KEY&domain=localhost&crs=EPSG:4326&geomFilter=BOX(126.9775,37.5660,126.9785,37.5670)&size=5&format=json" | jq
```

**Probe A** reveals what VWorld actually returns for the three guessed datasets. **Probe B** falsifies/confirms Lane 1 (if same error as A → Lane 1 dead). **Probe C** isolates whether the user's key has wide-tier dataset access at all → if `LT_C_DAMYOJI` works while building datasets fail, Lane 2 confirmed.

## Probe Results (2026-04-29, Seoul 광화문 centroid)

```bash
curl "http://localhost:3000/api/vworld/buildings-3d?lat=37.5665&lng=126.9780&radiusM=200&size=5&debug=true"
```

```json
{
  "buildings": [5 real polygons w/ heights up to 75.9m, 23 floors],
  "error": null,
  "dataset": "LT_C_SPBD",
  "_attempts": [
    {"dataset": "LT_C_USABDLT_PG", "error": "LT_C_USABDLT_PG: ERROR", "count": 0},
    {"dataset": "LT_C_AISBLDG",    "error": "LT_C_AISBLDG: ERROR",    "count": 0},
    {"dataset": "LT_C_SPBD",       "error": null,                     "count": 5}
  ]
}
```

## Final Synthesis

**Lane verdicts (post-probe):**

- **Lane 1 (code-path): FALSIFIED.** Request shape, extractor, geometry handling all work — `LT_C_SPBD` returned 5 valid buildings with real polygons and heights.
- **Lane 2 (config/env, narrow): PARTIALLY CONFIRMED.** The user's API key tier supports `LT_C_SPBD` but explicitly rejects `LT_C_USABDLT_PG` and `LT_C_AISBLDG` (both return generic `ERROR` from VWorld, not `OK + empty`). The narrow per-dataset entitlement hypothesis was correct in form but my fallback-chain ordering had the wrong leader.
- **Lane 3 (measurement): FALSIFIED.** Extractor returned 5 buildings with all properties populated correctly.

**Most likely explanation for the user's "loads no data" report:** Three candidates, none fully ruled out by the probe:

1. **My fallback-chain reorder regression** — pre-fix, the route hit `LT_C_SPBD` directly. Post-fix (commit 20f6e79), it tried two failing datasets first. If either of those returned `OK + empty features` (instead of `ERROR`) at the user's specific centroid, the chain would have stopped at the empty result and never tried `LT_C_SPBD`. Fixed by re-reordering with `LT_C_SPBD` first (this commit).

2. **The user's test centroid had no `LT_C_SPBD` coverage** — VWorld's simplified building polygon dataset has gaps in older / rural / less-developed areas. Confirmed-working at 광화문 (dense urban Seoul) doesn't generalize.

3. **`wgsCentroid` was `null` in the user's test** — buildings-3d hook is `enabled: false` when centroid is null, so the route never fires. Happens when the cadastral footprint (`LP_PA_CBND_BUBUN`) returned no polygon. UI silently shows empty.

**Required to fully resolve:** the user re-tests with the specific building/region where they originally saw "loads no data" — the probe at 광화문 doesn't reproduce that scenario.

## Files Inspected

- `src/app/api/vworld/buildings-3d/route.ts` (request construction lines 75-86; extractBuildings 154-220; fetch wrapper status check 95-98; fallback iteration 152-178)
- `src/app/api/vworld/footprint/route.ts` (working comparator: 116-156 PNU lookup, 158-184 bbox lookup, 214-313 extraction)
- `src/hooks/use-vworld-buildings-3d.ts` (client wrapper, transparent passthrough)
- `src/components/viewer/building-scene.tsx` (lines 287-296 wgsCentroid derivation, 349-355 hook call)
- `.env` (key present, `VWORLD_DOMAIN` absent → defaults to `"localhost"`)
- `.planning/handoffs/frontend-design-twin-vworld.md` (line 40: "Investigate the exact dataset ID in the fresh session — candidate datasets per VWorld docs include `building_3d_bl` and others" — explicit admission that IDs were unverified)
- VWorld developer portal pages (WebFetch returned generic index / 404 on schema-detail pages — JS-rendered)
