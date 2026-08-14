# New twin assets that do NOT exist in the current kit.
# Run inside Blender via the MCP add-on (execute this file).
# Never overwrites an existing public/models/equipment/<id>.glb.

import bpy
import math
import os
from mathutils import Vector, Matrix, Euler

ASSET_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if "__file__" in dir()
    else r"C:\Users\남승헌\ProjectFiles\BIM",
    "public",
    "models",
    "equipment",
)
# MCP exec() has no __file__; pin the workspace kit folder.
ASSET_DIR = r"C:\Users\남승헌\ProjectFiles\BIM\public\models\equipment"


def mat(name, rgb, rough=0.45, metal=0.15):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def reset_collection(name):
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


def cyl(col, m, name, r, depth, x=0, y=0, z=0, axis="Z", verts=16, r2=None):
    if r2 is not None:
        bpy.ops.mesh.primitive_cone_add(
            vertices=verts, radius1=r, radius2=r2, depth=depth, location=(x, y, z)
        )
    else:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=verts, radius=r, depth=depth, location=(x, y, z)
        )
    o = bpy.context.object
    if axis == "X":
        o.data.transform(Euler((0, math.radians(90), 0)).to_matrix().to_4x4())
    elif axis == "Y":
        o.data.transform(Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    return finish(o, col, m, name)


def tri_count(col):
    total = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in col.objects:
        if o.type == "MESH":
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            total += len(me.loop_triangles)
            o.evaluated_get(dg).to_mesh_clear()
    return total


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
        j.name = col.name.replace("EQ_", "") + "_merged"
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
    fp = os.path.join(ASSET_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=fp,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )
    return fp, round(os.path.getsize(fp) / 1024.0, 1)


def skip_if_exists(asset_id):
    fp = os.path.join(ASSET_DIR, asset_id + ".glb")
    return os.path.isfile(fp) and os.path.getsize(fp) > 1024


def build_junction_box():
    col = reset_collection("EQ_junction-box")
    steel = mat("JboxSteel", (0.45, 0.38, 0.18), rough=0.4, metal=0.55)
    box(col, steel, "body", 0.20, 0.14, 0.14, 0, 0, 0)
    box(col, steel, "lid", 0.188, 0.012, 0.128, 0, 0.076, 0)
    cyl(col, steel, "hub", 0.018, 0.03, 0.10, 0, 0, axis="X", verts=10)
    finalize_merge(col, single_mat=steel)
    return col


def build_ev_charger():
    col = reset_collection("EQ_ev-charger")
    body = mat("EvBody", (0.12, 0.14, 0.16), rough=0.35, metal=0.4)
    accent = mat("EvAccent", (0.05, 0.55, 0.28), rough=0.4, metal=0.1)
    box(col, body, "plinth", 0.36, 0.28, 0.08, 0, 0, 0.04)
    box(col, body, "post", 0.16, 0.14, 1.10, 0, 0, 0.63)
    box(col, body, "head", 0.28, 0.18, 0.32, 0, 0, 1.28)
    box(col, accent, "screen", 0.16, 0.02, 0.14, 0, -0.10, 1.30)
    cyl(col, body, "hook", 0.03, 0.12, 0.12, -0.08, 1.12, axis="Y", verts=10)
    cyl(col, accent, "cable", 0.016, 0.45, 0.16, -0.05, 0.88, axis="Z", verts=8)
    finalize_merge(col)
    return col


def build_exhaust_fan():
    col = reset_collection("EQ_exhaust-fan")
    galv = mat("FanGalv", (0.55, 0.56, 0.58), rough=0.45, metal=0.7)
    dark = mat("FanDark", (0.18, 0.19, 0.20), rough=0.5, metal=0.4)
    box(col, galv, "curb", 0.72, 0.72, 0.10, 0, 0, 0.05)
    cyl(col, galv, "housing", 0.28, 0.32, 0, 0, 0.26, verts=16)
    cyl(col, dark, "cowl", 0.42, 0.10, 0, 0, 0.46, r2=0.18, verts=16)
    cyl(col, galv, "cap", 0.20, 0.04, 0, 0, 0.58, verts=12)
    finalize_merge(col)
    return col


def build_fire_pump():
    col = reset_collection("EQ_fire-pump")
    red = mat("PumpRed", (0.62, 0.08, 0.08), rough=0.4, metal=0.25)
    steel = mat("PumpSteel", (0.4, 0.41, 0.43), rough=0.35, metal=0.7)
    box(col, steel, "skid", 1.55, 0.62, 0.08, 0, 0, 0.04)
    cyl(col, red, "volute", 0.22, 0.28, -0.28, 0, 0.36, axis="Y", verts=16)
    cyl(col, red, "suction", 0.08, 0.35, -0.55, 0.22, 0.36, axis="Y", verts=12)
    cyl(col, red, "discharge", 0.07, 0.32, -0.28, 0, 0.62, verts=12)
    cyl(col, steel, "motor", 0.18, 0.48, 0.32, 0, 0.36, axis="X", verts=14)
    box(col, steel, "jbox", 0.14, 0.12, 0.10, 0.32, 0.18, 0.52)
    finalize_merge(col)
    return col


def build_emergency_generator():
    col = reset_collection("EQ_emergency-generator")
    olive = mat("GenOlive", (0.22, 0.24, 0.18), rough=0.5, metal=0.25)
    steel = mat("GenSteel", (0.42, 0.43, 0.44), rough=0.35, metal=0.65)
    black = mat("GenBlack", (0.08, 0.08, 0.08), rough=0.55, metal=0.2)
    box(col, steel, "skid", 2.15, 0.95, 0.10, 0, 0, 0.05)
    box(col, olive, "hood", 1.55, 0.85, 0.85, -0.15, 0, 0.55)
    box(col, black, "grille", 0.04, 0.70, 0.62, -0.94, 0, 0.55)
    cyl(col, black, "muffler", 0.09, 0.55, 0.72, 0.28, 1.05, axis="X", verts=12)
    box(col, olive, "tank", 0.45, 0.70, 0.40, 0.82, 0, 0.32)
    box(col, steel, "ctrl", 0.22, 0.18, 0.28, 0.55, -0.38, 0.72)
    finalize_merge(col)
    return col


BUILDERS = {
    "junction-box": build_junction_box,
    "ev-charger": build_ev_charger,
    "exhaust-fan": build_exhaust_fan,
    "fire-pump": build_fire_pump,
    "emergency-generator": build_emergency_generator,
}

reports = []
for asset_id, builder in BUILDERS.items():
    dest = os.path.join(ASSET_DIR, asset_id + ".glb")
    if skip_if_exists(asset_id):
        reports.append(
            {
                "id": asset_id,
                "skipped": True,
                "reason": "existing glb left untouched",
                "path": dest,
            }
        )
        continue
    col = builder()
    tris = tri_count(col)
    path, kb = export_glb(col, asset_id + ".glb")
    reports.append(
        {
            "id": asset_id,
            "skipped": False,
            "tris": tris,
            "kb": kb,
            "path": path,
        }
    )

result = {"ok": True, "assets": reports, "dir": ASSET_DIR}
