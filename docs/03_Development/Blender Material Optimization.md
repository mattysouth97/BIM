# Blender material optimization

The optional material-fabric payloads can be losslessly compressed through the
official Blender Lab MCP. This reduces download size; it does not rebuild the
building, improve its authored shape, identify an outer finish, or measure a
material's visual appearance. Base models, architectural details, service
layers, and material binding indices are unchanged.

## Requirements

- Blender 5.2 or later, with the official Blender Lab `MCP` extension installed
  and enabled. The extension exposes the `blender_mcp` background CLI command.
- `uvx` on PATH, or pass `--uvx-path`. Blender can be supplied with
  `--blender-path` or `BLENDER_PATH`.
- The app's existing dependencies, including the decoder shipped in
  `three-stdlib` and used by Drei's `useGLTF` defaults.

No new runtime dependency or permanent MCP configuration is required. The
script launches its own hidden background Blender process on a free loopback
port and leaves existing Blender sessions untouched. The official MCP stdio
bridge is fetched by uv from commit
`4309a39646e644261624bfcd2bca669b343b7621` of
[Blender Lab's repository](https://projects.blender.org/lab/blender_mcp).
Its MCP SDK is pinned to 1.29.1 because the bridge's current FastMCP API is
incompatible with SDK 2.x.

## Workflow

For one model whose hash-verified IFC sources are already in the source
builder's cache, regenerate and optimize its material fabric:

```powershell
node scripts/build-reference-materials.mjs --building fzk-haus
node scripts/optimize-reference-materials-blender-mcp.mjs --buildings fzk-haus
```

The optimizer performs actual MCP `initialize`, `tools/list`, and
`tools/call` requests. It writes uncompressed baselines, compressed candidates,
MCP version/connection evidence, and a verification report under
`qa-evidence/blender-mcp/run-<timestamp>/`. It does not replace public files
during this preparation step. A subset can be prepared with
`--buildings fzk-haus,kit-office`. Each source build needs its own
`--building <id>` argument. Omitting `--buildings` from the optimizer prepares
all published material variants that have not already been compressed. If the
source cache is empty, run the normal reference-building source builder first;
the material builder refuses IFC files whose hashes differ from the manifest.

After the printed report passes, publish the candidate batch:

```powershell
node scripts/optimize-reference-materials-blender-mcp.mjs --apply-from qa-evidence/blender-mcp/run-<timestamp>/report.json
```

Publication re-verifies every candidate and refuses to proceed if any live
source asset or binding index changed after preparation. Only each
`material-fabric.glb` and its manifest `materialFabric.byteLength` and `sha256`
change. Already compressed assets are skipped; rebuild the material variants
to begin another optimization run.

## Preservation contract

The Python helper runs inside Blender and calls its bundled Meshopt encoder
on the source buffer bytes. It does not import meshes, apply modifiers, generate
UVs, alter normals, or quantize values. The `INDICES` codec preserves exact
index order; the triangle codec is intentionally avoided because it can rotate
a triangle's index sequence. `ATTRIBUTES` compression uses no precision filters.
Encoding version 0 works with the currently shipped decoder.

Before publication, the separate Node verifier:

- Decodes every buffer view with the same decoder factory used by Drei and
  compares every byte, including positions, normals, indices and instance TRS.
- Requires the source scene graph, accessor metadata, materials, binding names,
  and instance references to remain identical.
- Loads both GLBs through the shipped `GLTFLoader` and compares runtime vertex
  arrays, exact index order, world matrices and instance matrices.
- Preserves draw calls and placed/stored triangle counts, and requires a size
  reduction. The binding index and its hash remain unchanged.

The helper is deliberately limited to the static, indexed material-fabric GLBs
produced here: one accessor per buffer view, one material per mesh, no images,
skins or animations. It is not a general-purpose glTF optimizer.

## Verified six-building batch

| Model | Original bytes | Compressed bytes | Draw calls |
| --- | ---: | ---: | ---: |
| Clinic | 2,038,040 | 890,712 | 45 |
| Duplex | 363,624 | 170,460 | 19 |
| FZK Haus | 641,484 | 305,176 | 12 |
| KIT Office | 518,384 | 235,124 | 26 |
| Klassiqua 1970 | 409,392 | 215,552 | 37 |
| Schependomlaan | 3,485,220 | 1,601,832 | 124 |
| Total | 7,456,144 | 3,418,856 | 263 |

The batch reduces these six payloads by 54.1%, preserving all decoded source
bytes. Plain Blender mesh roundtrip was rejected: FZK grew from 641,484 to 677,004
bytes even with GPU instancing enabled, added vertex splits, changed normal
precision, and showed no useful shading improvement in matching Cycles renders.
Default Blender Meshopt settings were also rejected because they apply 12-bit
position filtering and 8-bit quaternion filtering. Those settings are not used
by this workflow.

The later TalTech batch uses the same preservation contract: **3,950,408 →
1,923,980 bytes (51.3% smaller), 260 draw calls unchanged**. Its material groups
separate occurrence and inherited type assignments even when they share a layer
set, so each displayed assignment basis describes every element in its group.

Run the relevant guards and real material/picking browser checks after a batch:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/reference-buildings/__tests__/material-fabric.test.ts src/lib/reference-buildings/__tests__/lossless-materials.test.ts
node node_modules/@playwright/test/cli.js test e2e/reference-material-expression.spec.ts --workers=1
```
