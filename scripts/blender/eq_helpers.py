# Helper library used to author public/models/equipment/*.glb via the
# Blender MCP session on 2026-07-26 (Blender 5.2 LTS). Each asset was
# built from these primitives, merged per material, and exported GLB
# (Y-up). Full construction scene: see equipment_assets.blend.


import bpy, math
from mathutils import Vector, Matrix, Euler
try:
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
except Exception:
    pass

ASSET_DIR = r"C:\Users\Nam\BIM\.claude\worktrees\blender-asset-creation-b29df2\public\models\equipment"

def reset_collection(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col

def M(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m

def _finish(o, col, m, name, bevel):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    o.name = name
    if m is not None:
        o.data.materials.clear()
        o.data.materials.append(m)
    if bevel and bevel > 0:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return o

def box(col, m, name, dx, dy, dz, x=0, y=0, z=0, rz=0, ry=0, rx=0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object or bpy.context.active_object
    o.data.transform(Matrix.Diagonal((dx, dy, dz, 1.0)))
    o.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
    return _finish(o, col, m, name, bevel)

def cyl(col, m, name, r, depth, x=0, y=0, z=0, axis="Z", verts=24, r2=None, bevel=0.0):
    if r2 is not None:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=(x, y, z))
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(x, y, z))
    o = bpy.context.object or bpy.context.active_object
    if axis == "X":
        o.data.transform(Euler((0, math.radians(90), 0)).to_matrix().to_4x4())
    elif axis == "Y":
        o.data.transform(Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    return _finish(o, col, m, name, bevel)

def tor(col, m, name, R, r, x=0, y=0, z=0, axis="Z", segM=32, segm=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=segM, minor_segments=segm, location=(x, y, z))
    o = bpy.context.object or bpy.context.active_object
    if axis == "X":
        o.data.transform(Euler((0, math.radians(90), 0)).to_matrix().to_4x4())
    elif axis == "Y":
        o.data.transform(Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    return _finish(o, col, m, name, 0)

def sph(col, m, name, r, x=0, y=0, z=0, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(8, seg // 2), radius=r, location=(x, y, z))
    o = bpy.context.active_object
    return _finish(o, col, m, name, 0)

def louvres(col, m, name, width, total_h, n, x, y, z, slat_d=0.012, tilt=42, gap_fill=0.85, front="-Y"):
    """Stack of n tilted slats spanning total_h, centered at (x,y,z), facing -Y or +Y."""
    made = []
    step = total_h / n
    slat_h = step * gap_fill
    for i in range(n):
        zz = z - total_h / 2 + step * (i + 0.5)
        s = box(col, m, f"{name}_{i}", width, slat_d, slat_h, x, y, zz)
        sign = -1 if front == "-Y" else 1
        s.rotation_euler = (math.radians(tilt * sign), 0, 0)
        made.append(s)
    return made

def radial_fan(col, m, name, r_outer, n_blades, x, y, z, blade_w=None, pitch=28, hub_r=None, hub_h=0.06, m_hub=None):
    """Axial fan: hub cylinder + n twisted blades, axis Z, centered at x,y,z."""
    hub_r = hub_r or r_outer * 0.22
    blade_w = blade_w or r_outer * 0.42
    blade_len = r_outer - hub_r * 0.6
    made = []
    hub = cyl(col, m_hub or m, name + "_hub", hub_r, hub_h, x, y, z, verts=20)
    made.append(hub)
    dome = sph(col, m_hub or m, name + "_dome", hub_r * 0.72, x, y, z + hub_h / 2, seg=14)
    made.append(dome)
    for i in range(n_blades):
        ang = i * 2 * math.pi / n_blades
        bx = x + math.cos(ang) * (hub_r * 0.5 + blade_len / 2)
        by = y + math.sin(ang) * (hub_r * 0.5 + blade_len / 2)
        b = box(col, m, f"{name}_blade{i}", blade_len, blade_w, 0.012, bx, by, z)
        b.rotation_euler = (math.radians(pitch), 0, ang)
        b.rotation_mode = "ZYX"
        made.append(b)
    return made

def fan_guard(col, m, name, r, x, y, z, rings=3, spokes=8, wire=0.008):
    made = []
    for i in range(rings):
        rr = r * (i + 1) / rings
        made.append(tor(col, m, f"{name}_ring{i}", rr, wire, x, y, z, segM=28, segm=6))
    for i in range(spokes):
        ang = i * 2 * math.pi / spokes
        sx = x + math.cos(ang) * r / 2
        sy = y + math.sin(ang) * r / 2
        s = cyl(col, m, f"{name}_spoke{i}", wire, r, sx, sy, z, axis="X", verts=6)
        s.rotation_euler = (0, 0, ang)
        made.append(s)
    return made

def flange(col, m, name, r, x, y, z, axis="Z", thick=0.03, bolts=8, bolt_r=0.012):
    made = [cyl(col, m, name, r, thick, x, y, z, axis=axis, verts=20)]
    for i in range(bolts):
        ang = i * 2 * math.pi / bolts
        br = r * 0.72
        if axis == "Z":
            bx, by, bz = x + math.cos(ang) * br, y + math.sin(ang) * br, z
        elif axis == "X":
            bx, by, bz = x, y + math.cos(ang) * br, z + math.sin(ang) * br
        else:
            bx, by, bz = x + math.cos(ang) * br, y, z + math.sin(ang) * br
        made.append(cyl(col, m, f"{name}_bolt{i}", bolt_r, thick + 0.015, bx, by, bz, axis=axis, verts=6))
    return made

def pipe_run(col, m, name, pts, r, verts=14):
    """Poly-line pipe: cylinders between consecutive points + sphere elbows."""
    made = []
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        d = b - a
        L = d.length
        mid = (a + b) / 2
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=L, location=mid)
        o = bpy.context.active_object
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = d.to_track_quat("Z", "Y")
        made.append(_finish(o, col, m, f"{name}_{i}", 0))
        if 0 < i:
            made.append(sph(col, m, f"{name}_elb{i}", r * 1.15, a.x, a.y, a.z, seg=12))
    return made

def join_collection(col, name, single_mat=None):
    bpy.ops.object.select_all(action="DESELECT")
    objs = [o for o in col.objects if o.type == "MESH"]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    if single_mat is not None:
        joined.data.materials.clear()
        joined.data.materials.append(single_mat)
    return joined

def tri_count(col):
    total = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in col.objects:
        if o.type == "MESH":
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            total += len(me.loop_triangles)
    return total

def finalize_merge(col, single_mat=None):
    """Apply modifiers on all meshes, then join into one object per material
    (or one object total when single_mat given). Returns list of merged objects."""
    objs = [o for o in col.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")  # applies modifiers on all selected
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
    import os, io, contextlib
    os.makedirs(ASSET_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in col.objects:
        o.select_set(True)
    fp = os.path.join(ASSET_DIR, filename)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        bpy.ops.export_scene.gltf(filepath=fp, use_selection=True, export_format="GLB", export_apply=True, export_yup=True)
    return fp, round(os.path.getsize(fp) / 1024.0, 1)

def preview(col, out_path, azim=35, elev=22, dist_f=2.6, sun_e=3.0):
    rig = bpy.data.collections.get("PreviewRig")
    if rig:
        for o in list(rig.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        rig = bpy.data.collections.new("PreviewRig")
        bpy.context.scene.collection.children.link(rig)
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for o in col.objects:
        if o.type != "MESH":
            continue
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, wc)); hi = Vector(map(max, hi, wc))
    center = (lo + hi) / 2
    size = max((hi - lo).length, 0.1)
    az, el = math.radians(azim), math.radians(elev)
    campos = center + Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))) * size * dist_f
    cam_data = bpy.data.cameras.new("PrevCam")
    cam = bpy.data.objects.new("PrevCam", cam_data)
    rig.objects.link(cam)
    cam.location = campos
    d = center - campos
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = d.to_track_quat("-Z", "Y")
    sun_data = bpy.data.lights.new("PrevSun", "SUN")
    sun_data.energy = sun_e
    sun = bpy.data.objects.new("PrevSun", sun_data)
    rig.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(15), math.radians(70))
    fill_data = bpy.data.lights.new("PrevFill", "AREA")
    fill_data.energy = 250 * size
    fill_data.size = size * 2
    fill = bpy.data.objects.new("PrevFill", fill_data)
    rig.objects.link(fill)
    fill.location = center + Vector((-size, -size, size * 1.2))
    fill.rotation_quaternion = (center - fill.location).to_track_quat("-Z", "Y")
    fill.rotation_mode = "QUATERNION"
    fill.rotation_quaternion = (center - fill.location).to_track_quat("-Z", "Y")
    hidden = []
    for c in bpy.data.collections:
        if c.name.startswith("EQ_") and c.name != col.name and not c.hide_render:
            c.hide_render = True
            hidden.append(c)
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = 720
    sc.render.resolution_y = 540
    sc.render.filepath = out_path
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.87, 0.9, 1)
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    bpy.ops.render.render(write_still=True)
    for c in hidden:
        c.hide_render = False
    return out_path
