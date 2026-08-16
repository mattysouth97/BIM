"""Primitives, PBR materials, and GLB export for Revit Architecture families.

Authored in Blender 5.2 via the lab_blender_org MCP addon (127.0.0.1:9876).
Convention: Blender Z-up, metres. Export with export_yup=True (three.js Y-up).
"""

from __future__ import annotations

import contextlib
import io
import json
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ASSET_DIR = r"C:\Users\Nam\BIM\public\models\authoring"
TEX_DIR = r"C:\Users\Nam\BIM\public\textures"
CATALOG_PATH = os.path.join(ASSET_DIR, "catalog.json")

# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------


def ensure_object_mode():
    try:
        if bpy.context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass


def reset_collection(name: str):
    ensure_object_mode()
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def empty(col, name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = "PLAIN_AXES"
    o.empty_display_size = 0.15
    o.location = loc
    col.objects.link(o)
    return o


def parent(child, parent_obj):
    mw = child.matrix_world.copy()
    child.parent = parent_obj
    child.matrix_world = mw
    return child


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

_TEX_CACHE: dict[str, bpy.types.Image] = {}


def _load_image(path: str):
    if path in _TEX_CACHE:
        return _TEX_CACHE[path]
    if not os.path.isfile(path):
        return None
    img = bpy.data.images.load(path, check_existing=True)
    _TEX_CACHE[path] = img
    return img


def _sock(node, *names):
    for n in names:
        if n in node.inputs:
            return node.inputs[n]
    return None


def principled(name, rgb, rough=0.55, metal=0.0, trans=0.0, ior=1.45, alpha=1.0, tex=None):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    if b is None:
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bc = _sock(b, "Base Color")
    if bc:
        bc.default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    r = _sock(b, "Roughness")
    if r:
        r.default_value = rough
    met = _sock(b, "Metallic")
    if met:
        met.default_value = metal
    tw = _sock(b, "Transmission Weight", "Transmission")
    if tw:
        tw.default_value = trans
    io = _sock(b, "IOR")
    if io:
        io.default_value = ior
    a = _sock(b, "Alpha")
    if a:
        a.default_value = alpha
    if trans > 0.05 or alpha < 0.99:
        m.blend_method = "BLEND"
        try:
            m.shadow_method = "HASHED"
        except Exception:
            pass
        m.use_screen_refraction = True

    if tex:
        color_path = os.path.join(TEX_DIR, tex, "color.jpg")
        normal_path = os.path.join(TEX_DIR, tex, "normal.jpg")
        rough_path = os.path.join(TEX_DIR, tex, "roughness.jpg")
        img = _load_image(color_path)
        if img and bc:
            tex_node = nt.nodes.get(f"{name}_tex")
            if tex_node is None:
                tex_node = nt.nodes.new("ShaderNodeTexImage")
                tex_node.name = f"{name}_tex"
                tex_node.location = (-420, 200)
            tex_node.image = img
            # keep a colour even if the link exists (fallback)
            if not any(l.to_socket == bc for l in nt.links):
                nt.links.new(tex_node.outputs["Color"], bc)
            nrm_img = _load_image(normal_path)
            if nrm_img:
                ntex = nt.nodes.get(f"{name}_nrmtex")
                if ntex is None:
                    ntex = nt.nodes.new("ShaderNodeTexImage")
                    ntex.name = f"{name}_nrmtex"
                    ntex.location = (-420, -80)
                    ntex.image = nrm_img
                    ntex.image.colorspace_settings.name = "Non-Color"
                    nmap = nt.nodes.new("ShaderNodeNormalMap")
                    nmap.name = f"{name}_nmap"
                    nmap.location = (-180, -80)
                    nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
                    ns = _sock(b, "Normal")
                    if ns:
                        nt.links.new(nmap.outputs["Normal"], ns)
            rimg = _load_image(rough_path)
            if rimg and r:
                rtex = nt.nodes.get(f"{name}_rtex")
                if rtex is None:
                    rtex = nt.nodes.new("ShaderNodeTexImage")
                    rtex.name = f"{name}_rtex"
                    rtex.location = (-420, 40)
                    rtex.image = rimg
                    rtex.image.colorspace_settings.name = "Non-Color"
                    if not any(l.to_socket == r for l in nt.links):
                        nt.links.new(rtex.outputs["Color"], r)
    return m


def MATS():
    """Shared library. Created once, reused across families."""
    return {
        # Colours only — the app already ships /textures/* for runtime PBR.
        # Embedding those JPEGs in every family GLB inflated 12-tri walls to 4–7 MB.
        "brick": principled("A_Brick", (0.55, 0.28, 0.20), 0.78),
        "cmu": principled("A_CMU", (0.52, 0.51, 0.48), 0.82),
        "concrete": principled("A_Concrete", (0.62, 0.61, 0.58), 0.72),
        "concrete_rough": principled("A_ConcreteRough", (0.48, 0.47, 0.45), 0.88),
        "gypsum": principled("A_Gypsum", (0.93, 0.92, 0.88), 0.74),
        "paint_white": principled("A_PaintWhite", (0.91, 0.90, 0.86), 0.62),
        "paint_warm": principled("A_PaintWarm", (0.86, 0.80, 0.70), 0.64),
        "insulation": principled("A_Insulation", (0.92, 0.78, 0.22), 0.95),
        "air": principled("A_AirGap", (0.75, 0.88, 0.95), 0.4, trans=0.55, alpha=0.22),
        "membrane": principled("A_Membrane", (0.12, 0.12, 0.12), 0.45),
        "wood": principled("A_Wood", (0.45, 0.28, 0.14), 0.55),
        "wood_dark": principled("A_WoodDark", (0.22, 0.13, 0.07), 0.48),
        "metal": principled("A_Metal", (0.55, 0.56, 0.58), 0.35, 0.85),
        "metal_dark": principled("A_MetalDark", (0.18, 0.19, 0.20), 0.32, 0.9),
        "alum": principled("A_Alum", (0.72, 0.73, 0.75), 0.28, 0.92),
        "steel": principled("A_Steel", (0.40, 0.41, 0.43), 0.38, 0.88),
        "chrome": principled("A_Chrome", (0.82, 0.83, 0.85), 0.12, 1.0),
        "glass": principled("A_Glass", (0.72, 0.82, 0.88), 0.04, trans=0.92, ior=1.52, alpha=0.18),
        "glass_dark": principled("A_GlassDark", (0.18, 0.24, 0.28), 0.06, trans=0.7, ior=1.52, alpha=0.35),
        "ceramic": principled("A_Ceramic", (0.94, 0.93, 0.90), 0.22),
        "ceramic_grey": principled("A_CeramicGrey", (0.72, 0.73, 0.74), 0.28),
        "rubber": principled("A_Rubber", (0.08, 0.08, 0.08), 0.7),
        "fabric": principled("A_Fabric", (0.28, 0.32, 0.36), 0.85),
        "fabric_warm": principled("A_FabricWarm", (0.42, 0.30, 0.22), 0.86),
        "plastic": principled("A_Plastic", (0.15, 0.16, 0.17), 0.4),
        "plastic_white": principled("A_PlasticWhite", (0.9, 0.9, 0.88), 0.38),
        "roof_flat": principled("A_RoofFlat", (0.22, 0.23, 0.24), 0.7),
        "roof_tile": principled("A_RoofTile", (0.42, 0.22, 0.16), 0.72),
        "acoustic": principled("A_Acoustic", (0.84, 0.80, 0.72), 0.9),
        "soil": principled("A_Soil", (0.22, 0.16, 0.10), 0.92),
        "bark": principled("A_Bark", (0.25, 0.16, 0.09), 0.88),
        "leaf": principled("A_Leaf", (0.22, 0.38, 0.16), 0.7),
        "leaf_dark": principled("A_LeafDark", (0.14, 0.28, 0.12), 0.74),
        "emissive": _emissive("A_Emissive", (1.0, 0.95, 0.82), 6.0),
        "sign_green": _emissive("A_SignGreen", (0.15, 0.85, 0.35), 4.0),
    }


def _emissive(name, rgb, strength):
    m = principled(name, rgb, 0.4)
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    em = _sock(b, "Emission Color", "Emission")
    if em:
        if hasattr(em, "default_value") and len(getattr(em, "default_value", [])) == 4:
            em.default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        else:
            try:
                em.default_value = rgb
            except Exception:
                pass
    st = _sock(b, "Emission Strength")
    if st:
        st.default_value = strength
    return m


# ---------------------------------------------------------------------------
# Mesh primitives (no bpy.ops — MCP-safe)
# ---------------------------------------------------------------------------


def _new_mesh_obj(name, bm, col, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    # Bake insertion offset into verts so glTF export cannot drop object TRS.
    # Family origin is then the object origin (0,0,0) — the Revit insertion point.
    if rot != (0, 0, 0) or loc != (0, 0, 0):
        R = Euler(rot).to_matrix().to_4x4()
        T = Matrix.Translation(loc)
        bmesh.ops.transform(bm, matrix=T @ R, verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    col.objects.link(o)
    if mat is not None:
        mesh.materials.clear()
        mesh.materials.append(mat)
    return o


def box(col, mat, name, dx, dy, dz, x=0, y=0, z=0, rx=0, ry=0, rz=0, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= dx
        v.co.y *= dy
        v.co.z *= dz
    o = _new_mesh_obj(name, bm, col, mat, (x, y, z), (math.radians(rx), math.radians(ry), math.radians(rz)))
    if bevel and bevel > 0:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(35)
    return o


def cyl(col, mat, name, r, depth, x=0, y=0, z=0, axis="Z", verts=24, r2=None, bevel=0.0):
    bm = bmesh.new()
    if r2 is not None:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r2, depth=depth)
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=depth)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Euler((0, math.radians(90), 0)).to_matrix())
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Euler((math.radians(90), 0, 0)).to_matrix())
    o = _new_mesh_obj(name, bm, col, mat, (x, y, z))
    if bevel and bevel > 0:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return o


def sph(col, mat, name, r, x=0, y=0, z=0, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=r)
    return _new_mesh_obj(name, bm, col, mat, (x, y, z))


def torus(col, mat, name, R, r, x=0, y=0, z=0, axis="Z", major=24, minor=8):
    bm = bmesh.new()
    bmesh.ops.create_torus(bm, major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Euler((0, math.radians(90), 0)).to_matrix())
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Euler((math.radians(90), 0, 0)).to_matrix())
    return _new_mesh_obj(name, bm, col, mat, (x, y, z))


def apply_mods(o):
    """Apply modifiers in local space. Do not bake object transforms — that
    recenters walls/doors on the origin and breaks insertion points."""
    if not o.modifiers:
        return o
    # Evaluate without applying the object matrix (preserve location/parent).
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    # new_from_object applies the world matrix. Undo that so origin stays put.
    me.transform(o.matrix_world.inverted())
    old = o.data
    o.data = me
    o.modifiers.clear()
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return o


def set_identity(o, *, category, family, type_name, family_kind, origin, host=None, extras=None):
    o["revit.category"] = category
    o["revit.family"] = family
    o["revit.type"] = type_name
    o["revit.familyKind"] = family_kind
    o["revit.origin"] = origin
    if host:
        o["revit.host"] = host
    if extras:
        for k, v in extras.items():
            o[k] = v


def bounds_of(col):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    count = 0
    for o in col.objects:
        if o.type != "MESH":
            continue
        o.data.calc_loop_triangles()
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            lo.x, lo.y, lo.z = min(lo.x, wc.x), min(lo.y, wc.y), min(lo.z, wc.z)
            hi.x, hi.y, hi.z = max(hi.x, wc.x), max(hi.y, wc.y), max(hi.z, wc.z)
            count += 1
    if count == 0:
        return (0, 0, 0), (0, 0, 0), (0, 0, 0)
    size = hi - lo
    return (round(lo.x, 4), round(lo.y, 4), round(lo.z, 4)), (
        round(hi.x, 4),
        round(hi.y, 4),
        round(hi.z, 4),
    ), (round(size.x, 4), round(size.y, 4), round(size.z, 4))


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


def bake_transform(o):
    """Collapse location/rotation/parent into mesh verts. Origin stays at world 0
    of the family (the insertion point)."""
    if o.type != "MESH":
        return o
    mw = o.matrix_world.copy()
    if mw == Matrix.Identity(4):
        return o
    o.data.transform(mw)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
    return o


def export_glb(col, filename):
    os.makedirs(ASSET_DIR, exist_ok=True)
    ensure_object_mode()
    # select only this collection
    for o in bpy.data.objects:
        o.select_set(False)
    exported = []
    for o in list(col.objects):
        if o.type == "MESH":
            if o.modifiers:
                apply_mods(o)
            bake_transform(o)
        o.select_set(True)
        exported.append(o.name)
    if not exported:
        raise RuntimeError(f"nothing to export in {col.name}")
    # pick a mesh as active
    active = next((o for o in col.objects if o.type == "MESH"), col.objects[0])
    try:
        bpy.context.view_layer.objects.active = active
    except Exception:
        pass
    fp = os.path.join(ASSET_DIR, filename)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        bpy.ops.export_scene.gltf(
            filepath=fp,
            use_selection=True,
            export_format="GLB",
            export_apply=True,
            export_yup=True,
            export_extras=True,
            export_cameras=False,
            export_lights=False,
        )
    kb = round(os.path.getsize(fp) / 1024.0, 1)
    return fp, kb


def tag_and_measure(col, spec: dict):
    lo, hi, size = bounds_of(col)
    spec["boundsMin"] = list(lo)
    spec["boundsMax"] = list(hi)
    spec["nativeDimsM"] = {
        "x": size[0],
        "y": size[2],  # three.js height after Y-up export (Blender Z)
        "z": size[1],  # three.js depth (Blender Y)
        "blenderXYZ": list(size),
    }
    spec["triangles"] = tri_count(col)
    return spec
