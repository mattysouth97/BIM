# Architectural envelope kit for the twin 외피.
# Authored in the live Blender MCP session. Blender Z-up, metres.
# Export GLB with export_yup=True → three.js (X=width, Y=height, Z=depth).
#
# Assets:
#   facade-cladding   unit 1×1×1, raised face toward Blender +Y (= three +Z)
#   parapet-cap       1 m module, base origin, sits on the parapet
#   balcony-module    wall-hosted, origin at wall face / slab top
#   roof-pergola      roof-terrace canopy, base origin
#
# Run from Blender: exec(open(r"...\\envelope_assets.py", encoding="utf-8").read())

import math
import os

import bpy
from mathutils import Euler, Matrix

ASSET_DIR = r"C:\Users\남승헌\ProjectFiles\BIM\public\models\equipment"


def mat(name, rgb, rough=0.55, metal=0.0, alpha=1.0, trans=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Alpha" in b.inputs:
        b.inputs["Alpha"].default_value = alpha
    tw = b.inputs.get("Transmission Weight") or b.inputs.get("Transmission")
    if tw is not None:
        tw.default_value = trans
    if alpha < 0.99 or trans > 0.05:
        m.blend_method = "BLEND"
    return m


def reset_collection(name):
    try:
        if bpy.context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def finish(o, col, m, name):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    o.name = name
    if m is not None:
        o.data.materials.clear()
        o.data.materials.append(m)
    return o


def box(col, m, name, dx, dy, dz, x=0, y=0, z=0, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.data.transform(Matrix.Diagonal((dx, dy, dz, 1.0)))
    o.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
    return finish(o, col, m, name)


def cyl(col, m, name, r, depth, x=0, y=0, z=0, axis="Z", verts=12):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=r, depth=depth, location=(x, y, z)
    )
    o = bpy.context.object
    if axis == "X":
        o.data.transform(Euler((0, math.radians(90), 0)).to_matrix().to_4x4())
    elif axis == "Y":
        o.data.transform(Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    return finish(o, col, m, name)


def finalize_merge(col, single_mat=None):
    objs = [o for o in col.objects if o.type == "MESH"]
    if not objs:
        return []
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    if single_mat is not None:
        bpy.ops.object.join()
        j = bpy.context.active_object
        j.data.materials.clear()
        j.data.materials.append(single_mat)
        j.name = col.name.replace("EQ_", "")
        return [j]
    groups = {}
    for o in [o for o in col.objects if o.type == "MESH"]:
        key = o.data.materials[0].name if o.data.materials else "none"
        groups.setdefault(key, []).append(o)
    merged = []
    for key, gobjs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in gobjs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = gobjs[0]
        if len(gobjs) > 1:
            bpy.ops.object.join()
        j = bpy.context.active_object
        j.name = f"{col.name.replace('EQ_', '')}_{key}"
        merged.append(j)
    return merged


def export_glb(col, filename):
    os.makedirs(ASSET_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in col.objects:
        o.select_set(True)
        o.hide_set(False)
        o.hide_viewport = False
    fp = os.path.join(ASSET_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=fp,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )
    return fp, round(os.path.getsize(fp) / 1024.0, 1)


def tri_count(col):
    total = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in col.objects:
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return total


def build_facade_cladding():
    """Unit cladding tile. Raised face +Y (three.js +Z, outward)."""
    col = reset_collection("EQ_facade-cladding")
    stone = mat("CladStone", (0.86, 0.85, 0.81), rough=0.68)
    grout = mat("CladGrout", (0.62, 0.61, 0.58), rough=0.85)
    box(col, grout, "body", 1.0, 1.0, 1.0, 0, 0, 0)
    box(col, stone, "face", 0.92, 0.04, 0.92, 0, 0.48, 0)
    finalize_merge(col, single_mat=stone)
    return col


def build_parapet_cap():
    """1 m coping. Base origin. Blender Z = height."""
    col = reset_collection("EQ_parapet-cap")
    stone = mat("CapStone", (0.90, 0.89, 0.85), rough=0.55)
    box(col, stone, "cap", 1.00, 0.38, 0.055, 0, 0.02, 0.040)
    box(col, stone, "drip", 1.00, 0.04, 0.03, 0, 0.20, 0.012)
    finalize_merge(col, single_mat=stone)
    return col


def build_balcony_module():
    """Wall-hosted balcony. Origin = wall face, slab top. Extends +Y."""
    col = reset_collection("EQ_balcony-module")
    slab_m = mat("BalcSlab", (0.78, 0.77, 0.74), rough=0.72)
    metal = mat("BalcMetal", (0.55, 0.56, 0.58), rough=0.28, metal=0.85)
    glass = mat("BalcGlass", (0.78, 0.84, 0.88), rough=0.04, alpha=0.22, trans=0.88)
    wood = mat("BalcSoffit", (0.42, 0.26, 0.14), rough=0.55)

    depth = 1.40
    width = 2.40
    box(col, slab_m, "slab", width, depth, 0.12, 0, depth / 2, -0.06)
    box(col, wood, "soffit", width - 0.08, depth - 0.08, 0.03, 0, depth / 2, -0.135)

    post_h = 1.08
    for sx, sy in (
        (-width / 2 + 0.05, 0.08),
        (width / 2 - 0.05, 0.08),
        (-width / 2 + 0.05, depth - 0.05),
        (width / 2 - 0.05, depth - 0.05),
    ):
        box(col, metal, "post", 0.04, 0.04, post_h, sx, sy, post_h / 2)

    box(col, metal, "rail-front", width - 0.04, 0.03, 0.04, 0, depth - 0.04, 1.05)
    box(col, metal, "rail-l", 0.03, depth - 0.08, 0.04, -width / 2 + 0.04, depth / 2, 1.05)
    box(col, metal, "rail-r", 0.03, depth - 0.08, 0.04, width / 2 - 0.04, depth / 2, 1.05)
    box(col, glass, "glass-front", width - 0.12, 0.016, 0.92, 0, depth - 0.055, 0.50)
    box(col, glass, "glass-l", 0.016, depth - 0.16, 0.92, -width / 2 + 0.055, depth / 2 + 0.02, 0.50)
    box(col, glass, "glass-r", 0.016, depth - 0.16, 0.92, width / 2 - 0.055, depth / 2 + 0.02, 0.50)
    finalize_merge(col)
    return col


def build_roof_pergola():
    """Roof-terrace timber canopy. Base origin, posts sit on the deck."""
    col = reset_collection("EQ_roof-pergola")
    wood = mat("PergWood", (0.38, 0.22, 0.11), rough=0.52)
    wood_d = mat("PergWoodDark", (0.24, 0.14, 0.07), rough=0.48)
    metal = mat("PergMetal", (0.35, 0.36, 0.37), rough=0.35, metal=0.7)

    w, d, h = 5.40, 3.20, 2.35
    inset = 0.18
    for sx, sy in (
        (-w / 2 + inset, -d / 2 + inset),
        (w / 2 - inset, -d / 2 + inset),
        (-w / 2 + inset, d / 2 - inset),
        (w / 2 - inset, d / 2 - inset),
    ):
        box(col, wood_d, "post", 0.16, 0.16, h, sx, sy, h / 2)

    box(col, wood, "beam-x1", w - 0.20, 0.14, 0.18, 0, -d / 2 + inset, h - 0.08)
    box(col, wood, "beam-x2", w - 0.20, 0.14, 0.18, 0, d / 2 - inset, h - 0.08)
    box(col, wood, "beam-y1", 0.14, d - 0.20, 0.18, -w / 2 + inset, 0, h - 0.08)
    box(col, wood, "beam-y2", 0.14, d - 0.20, 0.18, w / 2 - inset, 0, h - 0.08)

    slats = 11
    span = w - 0.40
    for i in range(slats):
        t = i / (slats - 1)
        x = -span / 2 + t * span
        box(col, wood, "slat", 0.08, d - 0.28, 0.05, x, 0, h + 0.02)

    box(col, metal, "plate", 0.22, 0.22, 0.03, -w / 2 + inset, -d / 2 + inset, 0.02)
    box(col, metal, "plate2", 0.22, 0.22, 0.03, w / 2 - inset, -d / 2 + inset, 0.02)
    box(col, metal, "plate3", 0.22, 0.22, 0.03, -w / 2 + inset, d / 2 - inset, 0.02)
    box(col, metal, "plate4", 0.22, 0.22, 0.03, w / 2 - inset, d / 2 - inset, 0.02)
    finalize_merge(col)
    return col


BUILDERS = {
    "facade-cladding": build_facade_cladding,
    "parapet-cap": build_parapet_cap,
    "balcony-module": build_balcony_module,
    "roof-pergola": build_roof_pergola,
}

reports = []
for asset_id, builder in BUILDERS.items():
    col = builder()
    tris = tri_count(col)
    path, kb = export_glb(col, asset_id + ".glb")
    reports.append({"id": asset_id, "tris": tris, "kb": kb, "path": path})

result = {"ok": True, "assets": reports, "dir": ASSET_DIR}
