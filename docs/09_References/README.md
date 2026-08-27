---
type: reference
status: implemented
last_verified: 2026-08-27
---

# References

External reference material and vault attachments.

This folder is configured as Obsidian's **attachment folder**
(`docs/.obsidian/app.json`), so images and files pasted into notes land here
rather than scattering through the vault.

## External systems this project depends on

| System | What it provides | Where it is documented |
|---|---|---|
| 건축물대장 (data.go.kr) | The building register — the product's primary data source | [[Integration Map]] |
| VWorld | GIS building outlines and measured attributes | [[Integration Map]] |
| Anthropic API | Natural-language building generation | [[Integration Map]] |

## In-repository reference data

| Path | Contents |
|---|---|
| [`src/data/bjdong-codes.json`](../../src/data/bjdong-codes.json) | 20K+ 법정동 codes |
| [`src/data/region-codes.json`](../../src/data/region-codes.json) | 시도 / 시군구 hierarchy (250 districts) |
| [`src/lib/korean-building-codes.ts`](../../src/lib/korean-building-codes.ts) | Era-indexed default tables — every assumption traces here |
| [`docs/assumption-catalog.md`](../assumption-catalog.md) | The catalogue of named assumptions |
| [`docs/energy-input-source-map.md`](../energy-input-source-map.md) | Which energy input comes from which source |

## Note on codes

전라북도 uses the **new 52xxx** 시군구 codes, not the retired 45xxx. Both are
handled, but new data should use 52xxx.

## Related

[[Repository Map]] · [[Integration Map]]
