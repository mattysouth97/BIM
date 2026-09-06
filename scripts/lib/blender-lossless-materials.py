"""Lossless static GLB encoding, executed inside Blender through MCP.

This uses Blender's bundled Meshopt library without importing/rebuilding meshes.
Raw float32 attributes and exact index sequences are preserved; no precision
filters, UV generation, smoothing, simplification, or material changes occur.
The caller must independently decode and compare every accessor before publish.
"""
import ctypes
import hashlib
import json
from pathlib import Path
import struct

import numpy as np
from io_scene_gltf2.io.exp.meshopt import MeshoptEncoder


def compress_material_glb(source_path, destination_path):
    source = Path(source_path)
    destination = Path(destination_path)
    assert source.resolve() != destination.resolve(), 'Source must remain intact'
    blob = source.read_bytes()
    magic, version, declared = struct.unpack_from('<III', blob)
    assert (magic, version, declared) == (0x46546C67, 2, len(blob))
    json_size, json_type = struct.unpack_from('<II', blob, 12)
    assert json_type == 0x4E4F534A
    gltf = json.loads(blob[20:20 + json_size])
    bin_size, bin_type = struct.unpack_from('<II', blob, 20 + json_size)
    assert bin_type == 0x004E4942
    binary = blob[28 + json_size:]
    assert len(binary) == bin_size
    assert len(gltf['buffers']) == 1 and not gltf['buffers'][0].get('uri')
    assert not gltf.get('images') and not gltf.get('animations') and not gltf.get('skins')
    assert 'EXT_meshopt_compression' not in gltf.get('extensionsUsed', [])
    index_accessors = {p['indices'] for mesh in gltf['meshes'] for p in mesh['primitives']}
    assert all(p.get('mode', 4) == 4 for mesh in gltf['meshes'] for p in mesh['primitives'])
    settings = {'gltf_meshopt_extension': 'EXT_meshopt_compression'}
    MeshoptEncoder.load_library(settings)
    encoder = settings['meshopt_encoder']
    # Version zero is supported by the decoder bundled with current Drei.
    encoder.encodeIndexVersion(0)
    encoder.encodeVertexVersion(0)
    output = bytearray()
    types = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    components = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    for view_id, view in enumerate(gltf['bufferViews']):
        accessors = [(i, a) for i, a in enumerate(gltf['accessors']) if a.get('bufferView') == view_id]
        assert len(accessors) == 1, 'Material builder must retain one accessor per view'
        accessor_id, accessor = accessors[0]
        assert not accessor.get('byteOffset') and not accessor.get('sparse')
        assert not view.get('extensions') and view['buffer'] == 0
        stride = view.get('byteStride', types[accessor['type']] * components[accessor['componentType']])
        count = accessor['count']
        start = view.get('byteOffset', 0)
        raw = binary[start:start + view['byteLength']]
        assert len(raw) == stride * count
        if accessor_id in index_accessors:
            assert accessor['type'] == 'SCALAR' and accessor['componentType'] in (5123, 5125)
            indices = np.frombuffer(raw, dtype=np.uint16 if accessor['componentType'] == 5123 else np.uint32).astype(np.uint32)
            bound = encoder.encodeIndexSequenceBound(count, int(indices.max()) + 1)
            compressed = (ctypes.c_ubyte * bound)()
            written = encoder.encodeIndexSequence(compressed, bound, indices.ctypes.data_as(ctypes.c_void_p), count)
            # TRIANGLES codec may cyclically rotate each triangle's indices.
            # INDICES preserves the exact index sequence as well as its winding.
            mode = 'INDICES'
        else:
            assert stride % 4 == 0 and stride <= 256
            bound = encoder.encodeVertexBufferBound(count, stride)
            compressed = (ctypes.c_ubyte * bound)()
            raw_array = np.frombuffer(raw, dtype=np.uint8)
            written = encoder.encodeVertexBuffer(compressed, bound, raw_array.ctypes.data_as(ctypes.c_void_p), count, stride)
            mode = 'ATTRIBUTES'
        assert written > 0
        view['buffer'] = 1
        view['extensions'] = {'EXT_meshopt_compression': {
            'buffer': 0, 'byteOffset': len(output), 'byteLength': written,
            'count': count, 'byteStride': stride, 'mode': mode,
        }}
        output.extend(bytes(compressed[:written]))
        output.extend(b'\0' * ((-len(output)) % 4))
    gltf['buffers'] = [
        {'byteLength': len(output)},
        {'byteLength': len(binary), 'extensions': {'EXT_meshopt_compression': {'fallback': True}}},
    ]
    for key in ('extensionsUsed', 'extensionsRequired'):
        gltf[key] = list(dict.fromkeys(gltf.get(key, []) + ['EXT_meshopt_compression']))
    encoded_json = json.dumps(gltf, separators=(',', ':')).encode()
    encoded_json += b' ' * ((-len(encoded_json)) % 4)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(
        struct.pack('<III', 0x46546C67, 2, 28 + len(encoded_json) + len(output))
        + struct.pack('<II', len(encoded_json), 0x4E4F534A) + encoded_json
        + struct.pack('<II', len(output), 0x004E4942) + output
    )
    return {'sourceBytes': len(blob), 'bytes': destination.stat().st_size,
            'sourceSha256': hashlib.sha256(blob).hexdigest(),
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
