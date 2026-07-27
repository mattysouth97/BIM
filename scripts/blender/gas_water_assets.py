# Authors the gas + water + bathroom asset kit into public/models/equipment
# via the same eq_helpers pipeline used for the 2026-07-26 asset kit.
#
# Run headless:
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" \
#       --background --factory-startup --python scripts/blender/gas_water_assets.py
#
# Assets (authored Z-up, exported GLB Y-up, base origin at z=0):
#   gas-meter        도시가스 다이어프램 계량기 + 조정기 (wall-mounted)
#   lpg-tank         LPG 용기 2본 + 보관 케이지 (pre-1990 era buildings)
#   water-meter      상수도 계량기 (브라스 바디 + 다이얼 + 밸브)
#   bathroom-fixture 화장실 기구 클러스터 (양변기 + 세면대)
#
# Prints a JSON bounds report (three.js axes: w=X, h=Z-up→Y, d=Y) used to
# fill ASSET_NATIVE_DIMS in src/lib/equipment-assets.ts.

import bpy, os, sys, json, math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import eq_helpers as eq
from mathutils import Vector

# Export into THIS worktree (eq_helpers still points at the old asset worktree).
eq.ASSET_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "equipment")
)

# Clean default startup objects so nothing stray ends up in exports.
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

def bounds(col):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in col.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            wc = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, wc))
            hi = Vector(map(max, hi, wc))
    return lo, hi

report = {}

def finish(col, asset_id):
    eq.finalize_merge(col)
    lo, hi = bounds(col)
    fp, kb = eq.export_glb(col, f"{asset_id}.glb")
    report[asset_id] = {
        "kb": kb,
        "tris": eq.tri_count(col),
        # three.js axes after Y-up export: w = Blender X, h = Blender Z, d = Blender Y
        "w": round(hi.x - lo.x, 3),
        "h": round(hi.z - lo.z, 3),
        "d": round(hi.y - lo.y, 3),
        "base_z": round(lo.z, 3),
    }

# ---------------------------------------------------------------------------
# gas-meter — grey diaphragm meter body, yellow in/out pipes, regulator
# ---------------------------------------------------------------------------
def build_gas_meter():
    col = eq.reset_collection("EQ_gas-meter")
    grey = eq.M("gm-grey", (0.62, 0.64, 0.66), rough=0.5, metal=0.35)
    yellow = eq.M("gm-yellow", (0.93, 0.76, 0.10), rough=0.45, metal=0.3)
    dial = eq.M("gm-dial", (0.93, 0.93, 0.90), rough=0.25)

    # Meter body (base z=0..0.28) with slight bevel
    eq.box(col, grey, "body", 0.24, 0.15, 0.28, 0, 0, 0.14, bevel=0.012)
    # Dial face on the front (-Y)
    eq.cyl(col, dial, "dialface", 0.055, 0.02, 0, -0.082, 0.19, axis="Y", verts=20)
    # In/out pipe stubs rising from the top
    eq.cyl(col, yellow, "pipe_in", 0.020, 0.18, -0.075, 0, 0.36, verts=12)
    eq.cyl(col, yellow, "pipe_out", 0.020, 0.18, 0.075, 0, 0.36, verts=12)
    # Union nuts where pipes meet the body
    eq.cyl(col, grey, "nut_in", 0.030, 0.035, -0.075, 0, 0.295, verts=8)
    eq.cyl(col, grey, "nut_out", 0.030, 0.035, 0.075, 0, 0.295, verts=8)
    # Regulator bell on the inlet pipe
    eq.cyl(col, grey, "regulator", 0.045, 0.055, -0.075, 0, 0.43, verts=16)
    eq.sph(col, grey, "reg_cap", 0.032, -0.075, 0, 0.462, seg=12)
    finish(col, "gas-meter")

# ---------------------------------------------------------------------------
# lpg-tank — two 50 kg cylinders in a painted-steel cage
# ---------------------------------------------------------------------------
def build_lpg_tank():
    col = eq.reset_collection("EQ_lpg-tank")
    steel = eq.M("lpg-cage", (0.55, 0.57, 0.60), rough=0.55, metal=0.5)
    tank = eq.M("lpg-body", (0.72, 0.70, 0.68), rough=0.45, metal=0.3)
    valve = eq.M("lpg-valve", (0.75, 0.30, 0.12), rough=0.4, metal=0.5)

    # Base plate
    eq.box(col, steel, "base", 1.05, 0.55, 0.04, 0, 0, 0.02)
    # Two cylinders (r=0.155, body h=1.10) with dome tops + valves
    for i, cx in enumerate((-0.26, 0.26)):
        eq.cyl(col, tank, f"cyl{i}", 0.155, 1.10, cx, 0, 0.59, verts=20)
        eq.sph(col, tank, f"dome{i}", 0.150, cx, 0, 1.13, seg=14)
        eq.cyl(col, tank, f"collar{i}", 0.075, 0.09, cx, 0, 1.255, verts=12)
        eq.cyl(col, valve, f"valve{i}", 0.028, 0.075, cx, 0, 1.315, verts=8)
        eq.box(col, valve, f"handw{i}", 0.09, 0.028, 0.022, cx, 0, 1.345)
    # Cage: 4 corner posts + two horizontal rail loops + top frame
    for px in (-0.5, 0.5):
        for py in (-0.25, 0.25):
            eq.cyl(col, steel, f"post_{px}_{py}", 0.016, 1.42, px, py, 0.75, verts=8)
    for zz in (0.45, 0.95):
        eq.box(col, steel, f"railx_f{zz}", 1.03, 0.012, 0.025, 0, -0.25, zz)
        eq.box(col, steel, f"railx_b{zz}", 1.03, 0.012, 0.025, 0, 0.25, zz)
        eq.box(col, steel, f"raily_l{zz}", 0.012, 0.52, 0.025, -0.5, 0, zz)
        eq.box(col, steel, f"raily_r{zz}", 0.012, 0.52, 0.025, 0.5, 0, zz)
    eq.box(col, steel, "top_f", 1.03, 0.012, 0.03, 0, -0.25, 1.46)
    eq.box(col, steel, "top_b", 1.03, 0.012, 0.03, 0, 0.25, 1.46)
    eq.box(col, steel, "top_l", 0.012, 0.52, 0.03, -0.5, 0, 1.46)
    eq.box(col, steel, "top_r", 0.012, 0.52, 0.03, 0.5, 0, 1.46)
    finish(col, "lpg-tank")

# ---------------------------------------------------------------------------
# water-meter — brass body, round dial, blue gate-valve handle
# ---------------------------------------------------------------------------
def build_water_meter():
    col = eq.reset_collection("EQ_water-meter")
    brass = eq.M("wm-brass", (0.78, 0.62, 0.30), rough=0.35, metal=0.8)
    dial = eq.M("wm-dial", (0.92, 0.93, 0.94), rough=0.2)
    blue = eq.M("wm-blue", (0.13, 0.35, 0.75), rough=0.45, metal=0.3)

    # Horizontal body along X, lifted so the pipe axis sits at z=0.06
    eq.cyl(col, brass, "body", 0.042, 0.24, 0, 0, 0.06, axis="X", verts=16)
    # Flange collars at both ends
    eq.cyl(col, brass, "flangeL", 0.055, 0.025, -0.115, 0, 0.06, axis="X", verts=14)
    eq.cyl(col, brass, "flangeR", 0.055, 0.025, 0.115, 0, 0.06, axis="X", verts=14)
    # Register dome + dial face on top
    eq.cyl(col, brass, "register", 0.052, 0.05, 0, 0, 0.115, verts=16)
    eq.cyl(col, dial, "dialface", 0.046, 0.012, 0, 0, 0.146, verts=16)
    # Gate valve on the inlet side with a blue handwheel
    eq.cyl(col, brass, "valvebody", 0.030, 0.05, -0.155, 0, 0.085, verts=10)
    eq.tor(col, blue, "handwheel", 0.038, 0.009, -0.155, 0, 0.115, axis="Z")
    finish(col, "water-meter")

# ---------------------------------------------------------------------------
# bathroom-fixture — toilet + pedestal washbasin on a tile plate
# ---------------------------------------------------------------------------
def build_bathroom_fixture():
    col = eq.reset_collection("EQ_bathroom-fixture")
    porcelain = eq.M("bf-porcelain", (0.94, 0.95, 0.96), rough=0.12)
    chrome = eq.M("bf-chrome", (0.75, 0.77, 0.80), rough=0.15, metal=0.9)
    tile = eq.M("bf-tile", (0.80, 0.83, 0.85), rough=0.6)

    # Tile plate
    eq.box(col, tile, "plate", 1.40, 0.90, 0.02, 0, 0, 0.01)

    # Toilet at -X half: bowl + tank + seat
    tx = -0.38
    eq.box(col, porcelain, "bowl_base", 0.34, 0.30, 0.16, tx, 0.02, 0.10, bevel=0.03)
    eq.cyl(col, porcelain, "bowl", 0.185, 0.16, tx, -0.08, 0.30, verts=18)
    eq.box(col, porcelain, "seat", 0.38, 0.42, 0.035, tx, -0.05, 0.40, bevel=0.015)
    eq.box(col, porcelain, "tank", 0.40, 0.16, 0.36, tx, 0.26, 0.56, bevel=0.02)
    eq.box(col, chrome, "flush_btn", 0.07, 0.05, 0.015, tx, 0.26, 0.75)

    # Pedestal washbasin at +X half
    bx = 0.40
    eq.cyl(col, porcelain, "pedestal", 0.075, 0.68, bx, 0, 0.34, verts=14)
    eq.cyl(col, porcelain, "basin", 0.21, 0.12, bx, 0, 0.74, verts=20, r2=0.16)
    eq.cyl(col, chrome, "tap_riser", 0.014, 0.14, bx, 0.16, 0.85, verts=8)
    eq.cyl(col, chrome, "tap_spout", 0.012, 0.14, bx, 0.09, 0.91, axis="Y", verts=8)
    finish(col, "bathroom-fixture")

build_gas_meter()
build_lpg_tank()
build_water_meter()
build_bathroom_fixture()

print("ASSET_REPORT_JSON=" + json.dumps(report, indent=2))
