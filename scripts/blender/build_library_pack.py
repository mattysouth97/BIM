"""High-fidelity BIM families — one default type per family.

Rebuilds the 56 expansion GLBs (does NOT touch the original 46 course kit).
LOD is BIM-viewport detail: frames, leaves, sections, fixtures — not screws.

Run from Blender MCP:
    exec(open(r"...\\scripts\\blender\\build_library_pack.py", encoding="utf-8").read())
"""

from __future__ import annotations

import json
import math
import os
import sys
import traceback

import bpy

ROOT = r"C:\Users\남승헌\ProjectFiles\BIM"
HERE = os.path.join(ROOT, "scripts", "blender")
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import importlib
import authoring_helpers as H  # noqa: E402

importlib.reload(H)

H.ASSET_DIR = os.path.join(ROOT, "public", "models", "authoring")
H.TEX_DIR = os.path.join(ROOT, "public", "textures")
H.CATALOG_PATH = os.path.join(H.ASSET_DIR, "catalog.json")

M = None
CATALOG: list[dict] = []


def _root(col, name, loc=(0, 0, 0)):
    return H.empty(col, name, loc)


def _p(o, root):
    H.parent(o, root)
    return o


def _record(col, filename, spec):
    H.tag_and_measure(col, spec)
    path, kb = H.export_glb(col, filename)
    spec["file"] = filename
    spec["bytesKb"] = kb
    spec["path"] = f"/models/authoring/{filename}"
    CATALOG.append(spec)
    print(f"  exported {filename}  {kb} KB  tris={spec.get('triangles')}")
    return spec


def _spec(id_, category, category_ko, family, family_ko, type_en, type_ko, kind, host, origin, placement, **extra):
    d = {
        "id": id_,
        "category": category,
        "categoryKo": category_ko,
        "family": family,
        "familyKo": family_ko,
        "type": type_en,
        "typeKo": type_ko,
        "familyKind": kind,
        "host": host,
        "origin": origin,
        "placement": placement,
        "courseRef": extra.pop("courseRef", "BIM starter library expansion · LOD3"),
    }
    d.update(extra)
    return d


def _alum_opening(col, root, w, h, jam=0.05, depth=0.10, head=0.05, sill=0.04, mat=None):
    mat = mat or M["alum"]
    _p(H.box(col, mat, "JambL", jam, depth, h, -w / 2 + jam / 2, 0, h / 2, bevel=0.002), root)
    _p(H.box(col, mat, "JambR", jam, depth, h, w / 2 - jam / 2, 0, h / 2, bevel=0.002), root)
    _p(H.box(col, mat, "Head", w, depth, head, 0, 0, h - head / 2, bevel=0.002), root)
    _p(H.box(col, mat, "Sill", w, depth + 0.02, sill, 0, 0.01, sill / 2, bevel=0.002), root)
    return jam, head, sill


def _sash(col, root, name, w, h, x, y, z, mat_frame=None, mat_glass=None, rail=0.04):
    mat_frame = mat_frame or M["alum"]
    mat_glass = mat_glass or M["glass"]
    _p(H.box(col, mat_frame, name + "StileL", rail, 0.04, h, x - w / 2 + rail / 2, y, z, bevel=0.001), root)
    _p(H.box(col, mat_frame, name + "StileR", rail, 0.04, h, x + w / 2 - rail / 2, y, z, bevel=0.001), root)
    _p(H.box(col, mat_frame, name + "RailT", w, 0.04, rail, x, y, z + h / 2 - rail / 2, bevel=0.001), root)
    _p(H.box(col, mat_frame, name + "RailB", w, 0.04, rail, x, y, z - h / 2 + rail / 2, bevel=0.001), root)
    _p(H.box(col, mat_glass, name + "Glass", w - 2 * rail - 0.004, 0.012, h - 2 * rail - 0.004, x, y, z), root)


def _chrome_lever(col, root, x, y, z):
    _p(H.cyl(col, M["chrome"], "Rose", 0.026, 0.008, x, y, z, axis="Y", verts=14), root)
    _p(H.box(col, M["chrome"], "Lever", 0.10, 0.014, 0.016, x + 0.045, y, z, bevel=0.003), root)


def _h_column(col, root, bf=0.300, tf=0.015, tw=0.010, h=1.0):
    """H-section standing on Z, 1 m tall, origin at base centre."""
    _p(H.box(col, M["steel"], "FlangeA", bf, tf, h, 0, (bf - tf) / 2, h / 2, bevel=0.002), root)
    _p(H.box(col, M["steel"], "FlangeB", bf, tf, h, 0, -(bf - tf) / 2, h / 2, bevel=0.002), root)
    _p(H.box(col, M["steel"], "Web", tw, bf - 2 * tf, h, 0, 0, h / 2), root)
    _p(H.box(col, M["steel"], "BasePlate", bf + 0.06, bf + 0.06, 0.018, 0, 0, 0.009, bevel=0.002), root)
    for i, (x, y) in enumerate(((-0.14, -0.14), (0.14, -0.14), (-0.14, 0.14), (0.14, 0.14))):
        _p(H.cyl(col, M["metal_dark"], f"Anchor{i}", 0.012, 0.03, x * bf / 0.30, y * bf / 0.30, 0.024, verts=8), root)


def _i_beam(col, root, length=1.0, bf=0.200, d=0.400, tf=0.012, tw=0.008):
    """I-beam along +X, centroid at origin, start at x=0."""
    _p(H.box(col, M["steel"], "FlangeBot", length, bf, tf, length / 2, 0, -(d / 2 - tf / 2), bevel=0.001), root)
    _p(H.box(col, M["steel"], "FlangeTop", length, bf, tf, length / 2, 0, (d / 2 - tf / 2), bevel=0.001), root)
    _p(H.box(col, M["steel"], "Web", length, tw, d - 2 * tf, length / 2, 0, 0), root)


# ---------------------------------------------------------------------------
# Doors
# ---------------------------------------------------------------------------


def build_door_sliding():
    w, h, jam, depth = 1.80, 2.10, 0.05, 0.12
    col = H.reset_collection("FAM_door_sliding")
    root = _root(col, "door-sliding-1800")
    _alum_opening(col, root, w, h, jam, depth, head=0.08, sill=0.02)
    _p(H.box(col, M["metal_dark"], "Track", w - 2 * jam, 0.08, 0.04, 0, 0.02, h - 0.10, bevel=0.002), root)
    _p(H.box(col, M["metal_dark"], "Guide", w - 2 * jam, 0.04, 0.016, 0, 0.0, 0.03), root)
    _p(H.box(col, M["plastic"], "Sensor", 0.16, 0.06, 0.04, 0, -0.08, h + 0.02, bevel=0.004), root)
    lw = (w - 2 * jam) / 2 + 0.05
    lh = h - 0.16
    _sash(col, root, "LeafA", lw, lh, -0.22, -0.03, lh / 2 + 0.04)
    _sash(col, root, "LeafB", lw, lh, 0.22, 0.03, lh / 2 + 0.04)
    _p(H.box(col, M["alum"], "PullA", 0.02, 0.03, 0.28, -0.06, -0.06, 1.00, bevel=0.002), root)
    _p(H.box(col, M["alum"], "PullB", 0.02, 0.03, 0.28, 0.06, 0.06, 1.00, bevel=0.002), root)
    H.set_identity(root, category="Doors", family="Sliding Door", type_name="Automatic 1800mm", family_kind="loadable", origin="opening-center-floor", host="wall")
    return _record(col, "door-sliding-1800.glb", _spec(
        "door-sliding-1800", "Doors", "문", "Sliding Door", "미서기문", "Automatic 1800mm", "자동 1800mm",
        "loadable", "wall", "opening-center-floor", "hosted", widthM=w, heightM=h,
    ))


def build_door_revolving():
    d, h = 2.40, 2.20
    col = H.reset_collection("FAM_door_revolving")
    root = _root(col, "door-revolving-2400")
    _p(H.tube(col, M["alum"], "Drum", d / 2, d / 2 - 0.04, 0.08, 0, 0, 0.04, verts=28), root)
    _p(H.cyl(col, M["alum"], "Canopy", d / 2 + 0.04, 0.08, 0, 0, h - 0.04, verts=28, bevel=0.004), root)
    _p(H.tube(col, M["glass"], "Enclosure", d / 2 + 0.02, d / 2 - 0.01, h - 0.20, 0, 0, h / 2, verts=24), root)
    # four wings about +Z
    wing_h = h - 0.28
    for i in range(4):
        leaf = H.box(col, M["alum"], f"Wing{i}", 0.04, d / 2 - 0.12, wing_h, 0, (d / 2 - 0.12) / 2, wing_h / 2 + 0.10, bevel=0.002)
        glass = H.box(col, M["glass"], f"WingGlass{i}", 0.012, d / 2 - 0.28, wing_h - 0.22, 0.03, (d / 2 - 0.12) / 2 + 0.02, wing_h / 2 + 0.10)
        leaf.rotation_euler[2] = i * math.pi / 2
        glass.rotation_euler[2] = i * math.pi / 2
        H.parent(leaf, root)
        H.parent(glass, root)
    _p(H.cyl(col, M["chrome"], "Axis", 0.045, h - 0.18, 0, 0, h / 2, verts=14), root)
    _p(H.cyl(col, M["metal_dark"], "Hub", 0.08, 0.06, 0, 0, 0.10, verts=12), root)
    _p(H.box(col, M["alum"], "NightDoor", 0.90, 0.06, h - 0.20, 0, -d / 2 - 0.02, (h - 0.20) / 2 + 0.08, bevel=0.002), root)
    H.set_identity(root, category="Doors", family="Revolving Door", type_name="4-Wing 2400mm", family_kind="loadable", origin="center-floor", host="level")
    return _record(col, "door-revolving-2400.glb", _spec(
        "door-revolving-2400", "Doors", "문", "Revolving Door", "회전문", "4-Wing 2400mm", "4익 2400mm",
        "loadable", "level", "center-floor", "component", widthM=d, heightM=h,
    ))


def build_door_rollup():
    w, h = 3.00, 3.00
    col = H.reset_collection("FAM_door_rollup")
    root = _root(col, "door-rollup-3000")
    _p(H.box(col, M["metal_dark"], "GuideL", 0.08, 0.14, h, -w / 2 + 0.04, 0, h / 2, bevel=0.002), root)
    _p(H.box(col, M["metal_dark"], "GuideR", 0.08, 0.14, h, w / 2 - 0.04, 0, h / 2, bevel=0.002), root)
    _p(H.box(col, M["metal"], "Hood", w + 0.08, 0.36, 0.34, 0, 0.04, h + 0.08, bevel=0.006), root)
    _p(H.cyl(col, M["metal_dark"], "Barrel", 0.08, w - 0.20, 0, 0.04, h + 0.08, axis="X", verts=14), root)
    slat_h = 0.075
    n = int((h - 0.12) / slat_h)
    for i in range(n):
        z = slat_h / 2 + i * slat_h
        y = 0.008 if i % 2 == 0 else -0.008
        _p(H.box(col, M["metal"] if i % 2 == 0 else M["metal_dark"], f"Slat{i}", w - 0.20, 0.028, slat_h - 0.004, 0, y, z, bevel=0.001), root)
    _p(H.box(col, M["metal_dark"], "BottomBar", w - 0.18, 0.06, 0.06, 0, 0, 0.04, bevel=0.003), root)
    _p(H.box(col, M["rubber"], "Weather", w - 0.22, 0.03, 0.016, 0, 0, 0.008), root)
    H.set_identity(root, category="Doors", family="Roll-Up Door", type_name="Industrial 3000mm", family_kind="loadable", origin="opening-center-floor", host="wall")
    return _record(col, "door-rollup-3000.glb", _spec(
        "door-rollup-3000", "Doors", "문", "Roll-Up Door", "셔터문", "Industrial 3000mm", "공업용 3000mm",
        "loadable", "wall", "opening-center-floor", "hosted", widthM=w, heightM=h,
    ))


def build_door_fire():
    w, h, jam, depth = 0.90, 2.10, 0.055, 0.13
    col = H.reset_collection("FAM_door_fire")
    root = _root(col, "door-fire-single-900")
    _p(H.box(col, M["metal_dark"], "JambL", jam, depth, h, -w / 2 + jam / 2, 0, h / 2, bevel=0.002), root)
    _p(H.box(col, M["metal_dark"], "JambR", jam, depth, h, w / 2 - jam / 2, 0, h / 2, bevel=0.002), root)
    _p(H.box(col, M["metal_dark"], "Head", w, depth, jam, 0, 0, h - jam / 2, bevel=0.002), root)
    _p(H.box(col, M["metal"], "Threshold", w - 2 * jam, 0.10, 0.014, 0, 0, 0.007), root)
    lw, lh = w - 2 * jam - 0.008, h - jam - 0.012
    _p(H.box(col, M["metal"], "Leaf", lw, 0.052, lh, 0, -0.01, lh / 2 + 0.006, bevel=0.003), root)
    _p(H.box(col, M["metal_dark"], "Panel", lw - 0.14, 0.008, lh - 0.28, 0, -0.04, lh / 2 + 0.02), root)
    _p(H.box(col, M["metal_dark"], "VisionFrame", 0.18, 0.02, 0.28, 0, -0.042, 1.55, bevel=0.002), root)
    _p(H.box(col, M["glass_dark"], "Vision", 0.14, 0.01, 0.24, 0, -0.05, 1.55), root)
    _p(H.box(col, M["metal_dark"], "Kick", lw - 0.04, 0.01, 0.22, 0, -0.04, 0.16), root)
    _p(H.box(col, M["chrome"], "Panic", 0.46, 0.028, 0.028, 0, -0.045, 1.00, bevel=0.006), root)
    _p(H.box(col, M["metal"], "Closer", 0.22, 0.06, 0.05, 0.12, -0.05, h - 0.16, bevel=0.004), root)
    for i, z in enumerate((0.28, 1.05, 1.82)):
        _p(H.box(col, M["chrome"], f"Hinge{i}", 0.08, 0.014, 0.10, -w / 2 + jam, -0.01, z, bevel=0.002), root)
    H.set_identity(root, category="Doors", family="Fire-Rated Door", type_name="FD60 900mm", family_kind="loadable", origin="opening-center-floor", host="wall")
    return _record(col, "door-fire-single-900.glb", _spec(
        "door-fire-single-900", "Doors", "문", "Fire-Rated Door", "방화문", "FD60 900mm", "FD60 900mm",
        "loadable", "wall", "opening-center-floor", "hosted", widthM=w, heightM=h, fireRating="FD60",
    ))


# ---------------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------------


def build_window_double_casement():
    w, h = 1.50, 1.20
    col = H.reset_collection("FAM_window_dbl_casement")
    root = _root(col, "window-double-casement-1500x1200")
    jam, head, sill = _alum_opening(col, root, w, h, jam=0.05, depth=0.09, head=0.05, sill=0.05)
    _p(H.box(col, M["alum"], "Mullion", 0.04, 0.06, h - head - sill, 0, 0, 0, bevel=0.001), root)
    sw, sh = (w - 2 * jam - 0.04) / 2, h - head - sill - 0.01
    _sash(col, root, "L", sw, sh, -sw / 2 - 0.02, -0.01, 0)
    _sash(col, root, "R", sw, sh, sw / 2 + 0.02, -0.01, 0)
    _p(H.box(col, M["chrome"], "HandleL", 0.014, 0.04, 0.08, -0.06, -0.04, 0, bevel=0.002), root)
    _p(H.box(col, M["chrome"], "HandleR", 0.014, 0.04, 0.08, 0.06, -0.04, 0, bevel=0.002), root)
    H.set_identity(root, category="Windows", family="Double Casement", type_name="1500 x 1200mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-double-casement-1500x1200.glb", _spec(
        "window-double-casement-1500x1200", "Windows", "창", "Double Casement", "양여닫이창",
        "1500 x 1200mm", "1500 × 1200mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


def build_window_double_hung():
    w, h = 0.90, 1.50
    col = H.reset_collection("FAM_window_hung")
    root = _root(col, "window-double-hung-900x1500")
    jam, head, sill = _alum_opening(col, root, w, h, jam=0.05, depth=0.10, head=0.05, sill=0.06)
    sw, sh = w - 2 * jam - 0.01, (h - head - sill) / 2 + 0.03
    _sash(col, root, "Upper", sw, sh, 0, -0.015, sh / 2 - 0.02)
    _sash(col, root, "Lower", sw, sh, 0, 0.015, -sh / 2 + 0.02)
    _p(H.box(col, M["alum"], "MeetingRail", sw, 0.05, 0.036, 0, 0, 0, bevel=0.001), root)
    _p(H.box(col, M["chrome"], "Lift", 0.08, 0.016, 0.012, 0, -0.04, -sh / 2 + 0.08, bevel=0.002), root)
    H.set_identity(root, category="Windows", family="Double-Hung", type_name="900 x 1500mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-double-hung-900x1500.glb", _spec(
        "window-double-hung-900x1500", "Windows", "창", "Double-Hung", "오르내리창",
        "900 x 1500mm", "900 × 1500mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


def build_window_louvre():
    w, h = 1.20, 1.20
    col = H.reset_collection("FAM_window_louvre")
    root = _root(col, "window-louvre-1200x1200")
    _alum_opening(col, root, w, h, jam=0.045, depth=0.08, head=0.045, sill=0.05)
    for i in range(9):
        z = -0.48 + i * 0.12
        _p(H.box(col, M["alum"], f"Blade{i}", w - 0.14, 0.09, 0.016, 0, 0, z, rx=32, bevel=0.001), root)
    H.set_identity(root, category="Windows", family="Louvre", type_name="1200 x 1200mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-louvre-1200x1200.glb", _spec(
        "window-louvre-1200x1200", "Windows", "창", "Louvre", "루버창",
        "1200 x 1200mm", "1200 × 1200mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


def build_window_industrial():
    w, h = 1.80, 0.90
    col = H.reset_collection("FAM_window_industrial")
    root = _root(col, "window-industrial-1800x900")
    _alum_opening(col, root, w, h, jam=0.06, depth=0.10, head=0.06, sill=0.06, mat=M["steel"])
    _p(H.box(col, M["steel"], "BarV1", 0.028, 0.04, h - 0.16, -0.42, 0, 0, bevel=0.001), root)
    _p(H.box(col, M["steel"], "BarV2", 0.028, 0.04, h - 0.16, 0.42, 0, 0, bevel=0.001), root)
    _p(H.box(col, M["steel"], "BarH", w - 0.16, 0.04, 0.028, 0, 0, 0, bevel=0.001), root)
    _p(H.box(col, M["glass"], "Glass", w - 0.18, 0.014, h - 0.18, 0, 0, 0), root)
    _p(H.box(col, M["steel"], "SillDrip", w, 0.06, 0.02, 0, 0.04, -h / 2 + 0.01), root)
    H.set_identity(root, category="Windows", family="Industrial Window", type_name="1800 x 900mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-industrial-1800x900.glb", _spec(
        "window-industrial-1800x900", "Windows", "창", "Industrial Window", "공업용 창",
        "1800 x 900mm", "1800 × 900mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------


def build_column_steel_h():
    col = H.reset_collection("FAM_column_steel_h")
    root = _root(col, "column-steel-h-300")
    _h_column(col, root, 0.300, 0.015, 0.010, 1.0)
    H.set_identity(root, category="Structural Columns", family="Steel H Column", type_name="H 300×300", family_kind="system", origin="base-center", host="level")
    return _record(col, "column-steel-h-300.glb", _spec(
        "column-steel-h-300", "Structural Columns", "구조 기둥", "Steel H Column", "H형강 기둥",
        "H 300×300", "H 300×300", "system", "level", "base-center", "point",
        scaleAxes={"x": "section", "y": "section", "z": "height"},
    ))


def build_column_steel_box():
    col = H.reset_collection("FAM_column_steel_box")
    root = _root(col, "column-steel-box-300")
    t, s, h = 0.012, 0.300, 1.0
    _p(H.box(col, M["steel"], "WallY1", s, t, h, 0, (s - t) / 2, h / 2, bevel=0.001), root)
    _p(H.box(col, M["steel"], "WallY2", s, t, h, 0, -(s - t) / 2, h / 2, bevel=0.001), root)
    _p(H.box(col, M["steel"], "WallX1", t, s - 2 * t, h, (s - t) / 2, 0, h / 2), root)
    _p(H.box(col, M["steel"], "WallX2", t, s - 2 * t, h, -(s - t) / 2, 0, h / 2), root)
    _p(H.box(col, M["steel"], "BasePlate", 0.38, 0.38, 0.018, 0, 0, 0.009, bevel=0.002), root)
    H.set_identity(root, category="Structural Columns", family="Steel Box Column", type_name="Box 300×300×12", family_kind="system", origin="base-center", host="level")
    return _record(col, "column-steel-box-300.glb", _spec(
        "column-steel-box-300", "Structural Columns", "구조 기둥", "Steel Box Column", "각형강관 기둥",
        "Box 300×300×12", "각형 300×300×12", "system", "level", "base-center", "point",
    ))


def build_column_steel_pipe():
    col = H.reset_collection("FAM_column_steel_pipe")
    root = _root(col, "column-steel-pipe-273")
    _p(H.tube(col, M["steel"], "Pipe", 0.1365, 0.124, 1.0, 0, 0, 0.50, verts=20), root)
    _p(H.cyl(col, M["steel"], "BasePlate", 0.20, 0.018, 0, 0, 0.009, verts=20), root)
    H.set_identity(root, category="Structural Columns", family="Steel Pipe Column", type_name="Ø273.1", family_kind="system", origin="base-center", host="level")
    return _record(col, "column-steel-pipe-273.glb", _spec(
        "column-steel-pipe-273", "Structural Columns", "구조 기둥", "Steel Pipe Column", "원형강관 기둥",
        "Ø273.1", "Ø273.1", "system", "level", "base-center", "point",
    ))


def build_beam_rc():
    col = H.reset_collection("FAM_beam_rc")
    root = _root(col, "beam-rc-rect-300x500")
    _p(H.box(col, M["concrete"], "Beam", 1.0, 0.300, 0.500, 0.50, 0, 0, bevel=0.008), root)
    H.set_identity(root, category="Structural Framing", family="RC Rectangular Beam", type_name="300 x 500mm", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-rc-rect-300x500.glb", _spec(
        "beam-rc-rect-300x500", "Structural Framing", "구조 보", "RC Rectangular Beam", "RC 각형 보",
        "300 x 500mm", "300 × 500mm", "system", "level", "start-center", "linear",
        scaleAxes={"x": "length", "y": "section", "z": "section"},
    ))


def build_beam_steel_i():
    col = H.reset_collection("FAM_beam_steel_i")
    root = _root(col, "beam-steel-i-200x400")
    _i_beam(col, root, 1.0, 0.200, 0.400, 0.013, 0.008)
    H.set_identity(root, category="Structural Framing", family="Steel I Beam", type_name="I 200×400", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-i-200x400.glb", _spec(
        "beam-steel-i-200x400", "Structural Framing", "구조 보", "Steel I Beam", "I형강 보",
        "I 200×400", "I 200×400", "system", "level", "start-center", "linear",
    ))


def build_beam_steel_h():
    col = H.reset_collection("FAM_beam_steel_h")
    root = _root(col, "beam-steel-h-300x300")
    _i_beam(col, root, 1.0, 0.300, 0.300, 0.015, 0.010)
    H.set_identity(root, category="Structural Framing", family="Steel H Beam", type_name="H 300×300", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-h-300x300.glb", _spec(
        "beam-steel-h-300x300", "Structural Framing", "구조 보", "Steel H Beam", "H형강 보",
        "H 300×300", "H 300×300", "system", "level", "start-center", "linear",
    ))


def build_beam_steel_box():
    col = H.reset_collection("FAM_beam_steel_box")
    root = _root(col, "beam-steel-box-200")
    t, s = 0.010, 0.200
    _p(H.box(col, M["steel"], "Top", 1.0, s, t, 0.50, 0, (s - t) / 2, bevel=0.001), root)
    _p(H.box(col, M["steel"], "Bot", 1.0, s, t, 0.50, 0, -(s - t) / 2, bevel=0.001), root)
    _p(H.box(col, M["steel"], "SideA", 1.0, t, s - 2 * t, 0.50, (s - t) / 2, 0), root)
    _p(H.box(col, M["steel"], "SideB", 1.0, t, s - 2 * t, 0.50, -(s - t) / 2, 0), root)
    H.set_identity(root, category="Structural Framing", family="Steel Box Beam", type_name="Box 200×200", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-box-200.glb", _spec(
        "beam-steel-box-200", "Structural Framing", "구조 보", "Steel Box Beam", "각형강관 보",
        "Box 200×200", "각형 200×200", "system", "level", "start-center", "linear",
    ))


def build_beam_channel():
    col = H.reset_collection("FAM_beam_channel")
    root = _root(col, "beam-steel-channel-200")
    _p(H.box(col, M["steel"], "Web", 1.0, 0.010, 0.200, 0.50, -0.040, 0), root)
    _p(H.box(col, M["steel"], "FlangeTop", 1.0, 0.080, 0.012, 0.50, 0.0, 0.094, bevel=0.001), root)
    _p(H.box(col, M["steel"], "FlangeBot", 1.0, 0.080, 0.012, 0.50, 0.0, -0.094, bevel=0.001), root)
    H.set_identity(root, category="Structural Framing", family="Steel Channel", type_name="C 200", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-channel-200.glb", _spec(
        "beam-steel-channel-200", "Structural Framing", "구조 보", "Steel Channel", "채널 보",
        "C 200", "C 200", "system", "level", "start-center", "linear",
    ))


def build_beam_timber():
    col = H.reset_collection("FAM_beam_timber")
    root = _root(col, "beam-timber-100x200")
    _p(H.box(col, M["wood"], "Beam", 1.0, 0.100, 0.200, 0.50, 0, 0, bevel=0.006), root)
    H.set_identity(root, category="Structural Framing", family="Timber Beam", type_name="100 x 200mm", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-timber-100x200.glb", _spec(
        "beam-timber-100x200", "Structural Framing", "구조 보", "Timber Beam", "목재 보",
        "100 x 200mm", "100 × 200mm", "system", "level", "start-center", "linear",
    ))


def build_footing_isolated():
    col = H.reset_collection("FAM_footing_isolated")
    root = _root(col, "footing-isolated-1500")
    _p(H.box(col, M["concrete"], "Pad", 1.50, 1.50, 0.40, 0, 0, -0.30, bevel=0.02), root)
    _p(H.box(col, M["concrete"], "Step", 1.10, 1.10, 0.12, 0, 0, -0.04, bevel=0.01), root)
    _p(H.box(col, M["concrete"], "Pedestal", 0.50, 0.50, 0.36, 0, 0, 0.18, bevel=0.008), root)
    _p(H.box(col, M["steel"], "Dowels", 0.28, 0.28, 0.12, 0, 0, 0.42), root)
    H.set_identity(root, category="Structural Foundations", family="Isolated Footing", type_name="1500 x 1500 x 500", family_kind="system", origin="top-center", host="level")
    return _record(col, "footing-isolated-1500.glb", _spec(
        "footing-isolated-1500", "Structural Foundations", "기초", "Isolated Footing", "독립기초",
        "1500 x 1500 x 500", "1500 × 1500 × 500", "system", "level", "top-center", "point",
    ))


def build_footing_strip():
    col = H.reset_collection("FAM_footing_strip")
    root = _root(col, "footing-strip-600")
    _p(H.box(col, M["concrete"], "Strip", 1.0, 0.600, 0.320, 0.50, 0, -0.24, bevel=0.01), root)
    _p(H.box(col, M["concrete"], "Stem", 1.0, 0.220, 0.16, 0.50, 0, 0.0, bevel=0.004), root)
    H.set_identity(root, category="Structural Foundations", family="Strip Footing", type_name="600 x 400mm", family_kind="system", origin="start-top-center", host="level")
    return _record(col, "footing-strip-600.glb", _spec(
        "footing-strip-600", "Structural Foundations", "기초", "Strip Footing", "줄기초",
        "600 x 400mm", "600 × 400mm", "system", "level", "start-top-center", "linear",
    ))


def build_pile():
    col = H.reset_collection("FAM_pile")
    root = _root(col, "pile-400")
    _p(H.cyl(col, M["concrete"], "Shaft", 0.200, 7.40, 0, 0, -3.70, verts=16), root)
    _p(H.cyl(col, M["concrete"], "Tip", 0.200, 0.50, 0, 0, -7.65, r2=0.04, verts=16), root)
    _p(H.cyl(col, M["steel"], "Cage", 0.16, 0.20, 0, 0, 0.08, verts=12), root)
    H.set_identity(root, category="Structural Foundations", family="Pile", type_name="Ø400 × 8m", family_kind="system", origin="top-center", host="level")
    return _record(col, "pile-400.glb", _spec(
        "pile-400", "Structural Foundations", "기초", "Pile", "말뚝",
        "Ø400 × 8m", "Ø400 × 8m", "system", "level", "top-center", "point",
    ))


def build_pile_cap():
    col = H.reset_collection("FAM_pile_cap")
    root = _root(col, "pile-cap-1800")
    _p(H.box(col, M["concrete"], "Cap", 1.80, 1.80, 0.70, 0, 0, -0.35, bevel=0.02), root)
    for i, (x, y) in enumerate(((-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45))):
        _p(H.cyl(col, M["concrete"], f"PileStub{i}", 0.18, 0.16, x, y, -0.78, verts=12), root)
    H.set_identity(root, category="Structural Foundations", family="Pile Cap", type_name="1800 x 1800 x 800", family_kind="system", origin="top-center", host="level")
    return _record(col, "pile-cap-1800.glb", _spec(
        "pile-cap-1800", "Structural Foundations", "기초", "Pile Cap", "말뚝머리",
        "1800 x 1800 x 800", "1800 × 1800 × 800", "system", "level", "top-center", "point",
    ))


# ---------------------------------------------------------------------------
# Plumbing / furniture / lighting / electrical / MEP / fire / energy / site
# ---------------------------------------------------------------------------


def build_urinal():
    col = H.reset_collection("FAM_urinal")
    root = _root(col, "plumbing-urinal")
    _p(H.box(col, M["ceramic"], "Back", 0.38, 0.08, 0.70, 0, 0.02, 1.00, bevel=0.016), root)
    _p(H.cyl(col, M["ceramic"], "Bowl", 0.14, 0.16, 0, -0.12, 0.78, r2=0.10, verts=20, bevel=0.008), root)
    _p(H.box(col, M["ceramic"], "Hood", 0.30, 0.18, 0.10, 0, -0.06, 1.22, bevel=0.02), root)
    _p(H.cyl(col, M["chrome"], "Flush", 0.028, 0.04, 0, 0.04, 1.34, verts=12), root)
    _p(H.cyl(col, M["chrome"], "Waste", 0.03, 0.08, 0, -0.04, 0.62, verts=10), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Urinal", type_name="Wall Hung", family_kind="loadable", origin="wall-face-floor", host="wall")
    return _record(col, "plumbing-urinal.glb", _spec(
        "plumbing-urinal", "Plumbing Fixtures", "위생기구", "Urinal", "소변기",
        "Wall Hung", "벽걸이", "loadable", "wall", "wall-face-floor", "hosted",
    ))


def build_shower():
    col = H.reset_collection("FAM_shower")
    root = _root(col, "plumbing-shower")
    _p(H.box(col, M["ceramic"], "Tray", 0.90, 0.90, 0.06, 0, 0.45, 0.03, bevel=0.01), root)
    _p(H.cyl(col, M["metal"], "Waste", 0.04, 0.02, 0, 0.45, 0.065, verts=12), root)
    _p(H.box(col, M["glass"], "Screen", 0.012, 0.82, 1.90, 0.42, 0.48, 1.01), root)
    _p(H.box(col, M["alum"], "ScreenFrame", 0.03, 0.84, 0.04, 0.42, 0.48, 1.96, bevel=0.002), root)
    _p(H.cyl(col, M["chrome"], "Riser", 0.012, 1.70, 0, 0.05, 0.95, verts=10), root)
    _p(H.cyl(col, M["chrome"], "Arm", 0.012, 0.18, 0, 0.14, 1.82, axis="Y", verts=10), root)
    _p(H.cyl(col, M["chrome"], "Head", 0.10, 0.025, 0, 0.22, 1.80, axis="Y", verts=16), root)
    _p(H.box(col, M["chrome"], "Mixer", 0.18, 0.06, 0.08, 0, 0.04, 1.05, bevel=0.008), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Shower", type_name="900 Tray", family_kind="loadable", origin="tray-back-center", host="level")
    return _record(col, "plumbing-shower.glb", _spec(
        "plumbing-shower", "Plumbing Fixtures", "위생기구", "Shower", "샤워",
        "900 Tray", "900 트레이", "loadable", "level", "tray-back-center", "component",
    ))


def build_bathtub():
    col = H.reset_collection("FAM_bathtub")
    root = _root(col, "plumbing-bathtub")
    _p(H.box(col, M["ceramic"], "Shell", 1.70, 0.75, 0.52, 0, 0.375, 0.26, bevel=0.03), root)
    _p(H.box(col, M["ceramic_grey"], "Well", 1.42, 0.52, 0.28, 0, 0.375, 0.36, bevel=0.02), root)
    _p(H.box(col, M["ceramic"], "Rim", 1.70, 0.75, 0.04, 0, 0.375, 0.54, bevel=0.016), root)
    _p(H.cyl(col, M["chrome"], "Waste", 0.03, 0.02, -0.62, 0.375, 0.23, verts=10), root)
    _p(H.cyl(col, M["chrome"], "Spout", 0.016, 0.12, 0.70, 0.16, 0.62, axis="Y", verts=10), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Bathtub", type_name="1700 mm", family_kind="loadable", origin="back-center-floor", host="level")
    return _record(col, "plumbing-bathtub.glb", _spec(
        "plumbing-bathtub", "Plumbing Fixtures", "위생기구", "Bathtub", "욕조",
        "1700 mm", "1700 mm", "loadable", "level", "back-center-floor", "component",
    ))


def build_floor_drain():
    col = H.reset_collection("FAM_floor_drain")
    root = _root(col, "plumbing-floor-drain")
    _p(H.cyl(col, M["metal"], "Rim", 0.078, 0.010, 0, 0, 0.005, verts=16), root)
    _p(H.tube(col, M["metal_dark"], "Body", 0.055, 0.042, 0.08, 0, 0, -0.04, verts=14), root)
    for i in range(6):
        a = i * math.pi / 6
        _p(H.box(col, M["metal"], f"Bar{i}", 0.13, 0.008, 0.004, 0, 0, 0.011, rz=math.degrees(a)), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Floor Drain", type_name="Ø150", family_kind="loadable", origin="finish-floor", host="floor")
    return _record(col, "plumbing-floor-drain.glb", _spec(
        "plumbing-floor-drain", "Plumbing Fixtures", "위생기구", "Floor Drain", "바닥배수",
        "Ø150", "Ø150", "loadable", "floor", "finish-floor", "hosted",
    ))


def build_fountain():
    col = H.reset_collection("FAM_fountain")
    root = _root(col, "plumbing-fountain")
    _p(H.box(col, M["steel"], "Body", 0.34, 0.22, 1.02, 0, -0.04, 0.51, bevel=0.01), root)
    _p(H.box(col, M["ceramic"], "Basin", 0.32, 0.24, 0.06, 0, -0.18, 0.94, bevel=0.012), root)
    _p(H.cyl(col, M["ceramic"], "Well", 0.08, 0.04, 0, -0.18, 0.90, r2=0.06, verts=14), root)
    _p(H.cyl(col, M["chrome"], "Bubbler", 0.012, 0.08, 0, -0.08, 0.98, verts=8), root)
    _p(H.box(col, M["chrome"], "Button", 0.04, 0.02, 0.04, 0.10, -0.14, 0.96, bevel=0.004), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Drinking Fountain", type_name="Wall Hung", family_kind="loadable", origin="wall-face-floor", host="wall")
    return _record(col, "plumbing-fountain.glb", _spec(
        "plumbing-fountain", "Plumbing Fixtures", "위생기구", "Drinking Fountain", "음수대",
        "Wall Hung", "벽걸이", "loadable", "wall", "wall-face-floor", "hosted",
    ))


def build_conference_table():
    col = H.reset_collection("FAM_conference")
    root = _root(col, "furniture-conference-table")
    _p(H.box(col, M["wood"], "Top", 3.20, 1.20, 0.036, 0, 0, 0.742, bevel=0.01), root)
    _p(H.box(col, M["wood_dark"], "Edge", 3.22, 1.22, 0.012, 0, 0, 0.720, bevel=0.004), root)
    _p(H.box(col, M["metal_dark"], "Pedestal", 0.70, 0.36, 0.68, 0, 0, 0.34, bevel=0.008), root)
    _p(H.box(col, M["metal"], "Foot", 1.40, 0.50, 0.04, 0, 0, 0.02, bevel=0.004), root)
    H.set_identity(root, category="Furniture", family="Conference Table", type_name="3200 x 1200mm", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-conference-table.glb", _spec(
        "furniture-conference-table", "Furniture", "가구", "Conference Table", "회의 테이블",
        "3200 x 1200mm", "3200 × 1200mm", "loadable", "level", "base-center", "component",
    ))


def build_cabinet():
    col = H.reset_collection("FAM_cabinet")
    root = _root(col, "furniture-cabinet")
    _p(H.box(col, M["wood"], "Carcass", 0.90, 0.40, 1.72, 0, 0.02, 0.94, bevel=0.004), root)
    _p(H.box(col, M["wood"], "Plinth", 0.90, 0.38, 0.08, 0, 0.02, 0.04), root)
    _p(H.box(col, M["wood_dark"], "DoorL", 0.42, 0.018, 1.60, -0.22, -0.19, 0.96, bevel=0.003), root)
    _p(H.box(col, M["wood_dark"], "DoorR", 0.42, 0.018, 1.60, 0.22, -0.19, 0.96, bevel=0.003), root)
    _p(H.box(col, M["chrome"], "PullL", 0.012, 0.02, 0.12, -0.04, -0.21, 0.96, bevel=0.002), root)
    _p(H.box(col, M["chrome"], "PullR", 0.012, 0.02, 0.12, 0.04, -0.21, 0.96, bevel=0.002), root)
    H.set_identity(root, category="Furniture", family="Cabinet", type_name="900 x 400 x 1800", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-cabinet.glb", _spec(
        "furniture-cabinet", "Furniture", "가구", "Cabinet", "수납장",
        "900 x 400 x 1800", "900 × 400 × 1800", "loadable", "level", "base-center", "component",
    ))


def build_bookshelf():
    col = H.reset_collection("FAM_bookshelf")
    root = _root(col, "furniture-bookshelf")
    _p(H.box(col, M["wood"], "Back", 0.98, 0.018, 1.78, 0, 0.15, 0.91), root)
    _p(H.box(col, M["wood"], "SideL", 0.022, 0.32, 1.80, -0.49, 0, 0.90, bevel=0.002), root)
    _p(H.box(col, M["wood"], "SideR", 0.022, 0.32, 1.80, 0.49, 0, 0.90, bevel=0.002), root)
    for i, z in enumerate((0.03, 0.48, 0.92, 1.36, 1.78)):
        _p(H.box(col, M["wood_dark"], f"Shelf{i}", 0.94, 0.30, 0.022, 0, -0.01, z, bevel=0.002), root)
    H.set_identity(root, category="Furniture", family="Bookshelf", type_name="1000 x 1800mm", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-bookshelf.glb", _spec(
        "furniture-bookshelf", "Furniture", "가구", "Bookshelf", "책장",
        "1000 x 1800mm", "1000 × 1800mm", "loadable", "level", "base-center", "component",
    ))


def build_wardrobe():
    col = H.reset_collection("FAM_wardrobe")
    root = _root(col, "furniture-wardrobe")
    _p(H.box(col, M["wood"], "Carcass", 1.20, 0.56, 2.00, 0, 0.02, 1.08, bevel=0.004), root)
    _p(H.box(col, M["wood"], "Plinth", 1.20, 0.54, 0.08, 0, 0.02, 0.04), root)
    _p(H.box(col, M["wood_dark"], "DoorL", 0.56, 0.018, 1.90, -0.30, -0.27, 1.10, bevel=0.003), root)
    _p(H.box(col, M["wood_dark"], "DoorR", 0.56, 0.018, 1.90, 0.30, -0.27, 1.10, bevel=0.003), root)
    _p(H.cyl(col, M["chrome"], "Rail", 0.012, 1.00, 0, 0.05, 1.70, axis="X", verts=8), root)
    _p(H.box(col, M["chrome"], "PullL", 0.012, 0.02, 0.16, -0.06, -0.29, 1.10, bevel=0.002), root)
    _p(H.box(col, M["chrome"], "PullR", 0.012, 0.02, 0.16, 0.06, -0.29, 1.10, bevel=0.002), root)
    H.set_identity(root, category="Furniture", family="Wardrobe", type_name="1200 x 2100mm", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-wardrobe.glb", _spec(
        "furniture-wardrobe", "Furniture", "가구", "Wardrobe", "옷장",
        "1200 x 2100mm", "1200 × 2100mm", "loadable", "level", "base-center", "component",
    ))


def build_casework_base():
    col = H.reset_collection("FAM_casework_base")
    root = _root(col, "casework-base-cabinet")
    _p(H.box(col, M["wood"], "Carcass", 0.80, 0.56, 0.78, 0, 0.02, 0.47, bevel=0.003), root)
    _p(H.box(col, M["wood"], "Toe", 0.80, 0.48, 0.10, 0, 0.06, 0.05), root)
    _p(H.box(col, M["ceramic"], "Top", 0.84, 0.60, 0.036, 0, 0.00, 0.90, bevel=0.004), root)
    _p(H.box(col, M["wood_dark"], "Door", 0.38, 0.018, 0.62, -0.19, -0.27, 0.48, bevel=0.002), root)
    _p(H.box(col, M["wood_dark"], "Drawer", 0.36, 0.018, 0.16, 0.20, -0.27, 0.72, bevel=0.002), root)
    _p(H.box(col, M["wood_dark"], "Drawer2", 0.36, 0.018, 0.36, 0.20, -0.27, 0.40, bevel=0.002), root)
    _p(H.box(col, M["chrome"], "Pull1", 0.08, 0.014, 0.012, -0.19, -0.29, 0.48, bevel=0.002), root)
    _p(H.box(col, M["chrome"], "Pull2", 0.08, 0.014, 0.012, 0.20, -0.29, 0.72, bevel=0.002), root)
    H.set_identity(root, category="Casework", family="Base Cabinet", type_name="800 mm", family_kind="loadable", origin="back-center-floor", host="level")
    return _record(col, "casework-base-cabinet.glb", _spec(
        "casework-base-cabinet", "Casework", "붙박이", "Base Cabinet", "하부장",
        "800 mm", "800 mm", "loadable", "level", "back-center-floor", "component",
    ))


def build_light_linear():
    col = H.reset_collection("FAM_light_linear")
    root = _root(col, "light-linear-1200")
    _p(H.box(col, M["alum"], "Body", 1.20, 0.07, 0.055, 0, 0, -0.028, bevel=0.004), root)
    _p(H.box(col, M["alum"], "EndL", 0.02, 0.074, 0.058, -0.61, 0, -0.028, bevel=0.002), root)
    _p(H.box(col, M["alum"], "EndR", 0.02, 0.074, 0.058, 0.61, 0, -0.028, bevel=0.002), root)
    _p(H.box(col, M["emissive"], "Lens", 1.14, 0.05, 0.008, 0, 0, -0.058), root)
    H.set_identity(root, category="Lighting Fixtures", family="Linear LED", type_name="1200 mm", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "light-linear-1200.glb", _spec(
        "light-linear-1200", "Lighting Fixtures", "조명 기구", "Linear LED", "라인 LED",
        "1200 mm", "1200 mm", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_light_highbay():
    col = H.reset_collection("FAM_light_highbay")
    root = _root(col, "light-highbay")
    _p(H.cyl(col, M["metal_dark"], "Housing", 0.16, 0.10, 0, 0, -0.07, verts=20, bevel=0.004), root)
    _p(H.cyl(col, M["metal"], "Reflector", 0.22, 0.06, 0, 0, -0.14, r2=0.16, verts=20), root)
    _p(H.cyl(col, M["emissive"], "Lens", 0.14, 0.016, 0, 0, -0.17, verts=16), root)
    _p(H.cyl(col, M["metal"], "Hook", 0.014, 0.08, 0, 0, 0.03, verts=8), root)
    _p(H.tube(col, M["metal"], "Eye", 0.018, 0.012, 0.012, 0, 0, 0.08, axis="Y", verts=12), root)
    H.set_identity(root, category="Lighting Fixtures", family="High-Bay", type_name="LED 150W", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "light-highbay.glb", _spec(
        "light-highbay", "Lighting Fixtures", "조명 기구", "High-Bay", "하이베이",
        "LED 150W", "LED 150W", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_light_wall():
    col = H.reset_collection("FAM_light_wall")
    root = _root(col, "light-wall")
    _p(H.box(col, M["metal"], "Back", 0.16, 0.03, 0.26, 0, 0.015, 0, bevel=0.004), root)
    _p(H.box(col, M["metal_dark"], "Arm", 0.04, 0.08, 0.04, 0, -0.04, 0.06, bevel=0.004), root)
    _p(H.box(col, M["emissive"], "Shade", 0.18, 0.10, 0.10, 0, -0.10, 0.02, bevel=0.012), root)
    H.set_identity(root, category="Lighting Fixtures", family="Wall Light", type_name="Surface 180mm", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "light-wall.glb", _spec(
        "light-wall", "Lighting Fixtures", "조명 기구", "Wall Light", "벽등",
        "Surface 180mm", "벽면 180mm", "loadable", "wall", "wall-face", "hosted",
    ))


def build_light_emergency():
    col = H.reset_collection("FAM_light_emergency")
    root = _root(col, "light-emergency")
    _p(H.box(col, M["plastic_white"], "Body", 0.30, 0.08, 0.10, 0, 0, -0.05, bevel=0.006), root)
    _p(H.cyl(col, M["emissive"], "HeadL", 0.028, 0.05, -0.08, -0.05, -0.08, axis="Y", verts=12), root)
    _p(H.cyl(col, M["emissive"], "HeadR", 0.028, 0.05, 0.08, -0.05, -0.08, axis="Y", verts=12), root)
    _p(H.box(col, M["plastic"], "Charge", 0.02, 0.006, 0.02, 0.12, -0.042, -0.04), root)
    H.set_identity(root, category="Lighting Fixtures", family="Emergency Light", type_name="Twin-head", family_kind="loadable", origin="wall-or-ceiling", host="wall")
    return _record(col, "light-emergency.glb", _spec(
        "light-emergency", "Lighting Fixtures", "조명 기구", "Emergency Light", "비상조명",
        "Twin-head", "쌍두형", "loadable", "wall", "wall-or-ceiling", "hosted",
    ))


def build_outlet():
    col = H.reset_collection("FAM_outlet")
    root = _root(col, "device-outlet-single")
    _p(H.box(col, M["plastic_white"], "Plate", 0.086, 0.008, 0.130, 0, 0, 0, bevel=0.003), root)
    _p(H.box(col, M["plastic"], "Yoke", 0.05, 0.012, 0.07, 0, -0.006, 0), root)
    _p(H.cyl(col, M["plastic"], "SockL", 0.011, 0.008, -0.014, -0.012, 0.012, axis="Y", verts=8), root)
    _p(H.cyl(col, M["plastic"], "SockR", 0.011, 0.008, 0.014, -0.012, 0.012, axis="Y", verts=8), root)
    _p(H.cyl(col, M["plastic"], "Earth", 0.008, 0.008, 0, -0.012, -0.016, axis="Y", verts=8), root)
    H.set_identity(root, category="Electrical Fixtures", family="Single Outlet", type_name="230V", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "device-outlet-single.glb", _spec(
        "device-outlet-single", "Electrical Fixtures", "전기기구", "Single Outlet", "단구 콘센트",
        "230V", "230V", "loadable", "wall", "wall-face", "hosted",
    ))


def build_switch():
    col = H.reset_collection("FAM_switch")
    root = _root(col, "device-switch")
    _p(H.box(col, M["plastic_white"], "Plate", 0.086, 0.008, 0.130, 0, 0, 0, bevel=0.003), root)
    _p(H.box(col, M["plastic"], "Rocker", 0.038, 0.010, 0.055, 0, -0.008, 0.004, bevel=0.004), root)
    H.set_identity(root, category="Electrical Fixtures", family="Light Switch", type_name="1-gang", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "device-switch.glb", _spec(
        "device-switch", "Electrical Fixtures", "전기기구", "Light Switch", "전등 스위치",
        "1-gang", "1구", "loadable", "wall", "wall-face", "hosted",
    ))


def build_thermostat():
    col = H.reset_collection("FAM_thermostat")
    root = _root(col, "device-thermostat")
    _p(H.box(col, M["plastic_white"], "Body", 0.104, 0.018, 0.104, 0, 0, 0, bevel=0.006), root)
    _p(H.box(col, M["glass_dark"], "Screen", 0.072, 0.004, 0.048, 0, -0.010, 0.012), root)
    _p(H.cyl(col, M["plastic"], "Dial", 0.012, 0.006, 0, -0.010, -0.032, axis="Y", verts=10), root)
    H.set_identity(root, category="Electrical Fixtures", family="Thermostat", type_name="Digital", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "device-thermostat.glb", _spec(
        "device-thermostat", "Electrical Fixtures", "전기기구", "Thermostat", "온도조절기",
        "Digital", "디지털", "loadable", "wall", "wall-face", "hosted",
    ))


def build_transformer():
    col = H.reset_collection("FAM_transformer")
    root = _root(col, "electrical-transformer")
    _p(H.box(col, M["metal"], "Tank", 1.40, 1.00, 1.50, 0, 0, 0.77, bevel=0.02), root)
    _p(H.cyl(col, M["metal"], "Conservator", 0.18, 0.90, 0, 0, 1.70, axis="X", verts=14), root)
    for i, x in enumerate((-0.40, 0.0, 0.40)):
        _p(H.cyl(col, M["ceramic"], f"Bush{i}", 0.055, 0.38, x, 0, 1.72, verts=12), root)
        _p(H.cyl(col, M["chrome"], f"Cap{i}", 0.03, 0.04, x, 0, 1.93, verts=8), root)
    for i in range(6):
        _p(H.box(col, M["metal_dark"], f"Fin{i}", 0.012, 0.90, 1.10, 0.72, 0, 0.70 + (i - 2.5) * 0.004), root)
    _p(H.box(col, M["metal_dark"], "Radiator", 0.14, 0.92, 1.16, 0.78, 0, 0.70, bevel=0.006), root)
    H.set_identity(root, category="Electrical Equipment", family="Transformer", type_name="Pad 500 kVA", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "electrical-transformer.glb", _spec(
        "electrical-transformer", "Electrical Equipment", "전기설비", "Transformer", "변압기",
        "Pad 500 kVA", "패드 500 kVA", "loadable", "level", "base-center", "component",
    ))


def build_ups():
    col = H.reset_collection("FAM_ups")
    root = _root(col, "electrical-ups")
    _p(H.box(col, M["metal"], "Cabinet", 0.60, 0.80, 1.76, 0, 0, 0.92, bevel=0.008), root)
    _p(H.box(col, M["plastic"], "Display", 0.24, 0.016, 0.14, 0, -0.41, 1.52, bevel=0.002), root)
    for i in range(8):
        _p(H.box(col, M["metal_dark"], f"Louver{i}", 0.48, 0.008, 0.018, 0, -0.405, 0.28 + i * 0.05), root)
    _p(H.box(col, M["metal_dark"], "Plinth", 0.62, 0.82, 0.06, 0, 0, 0.03), root)
    H.set_identity(root, category="Electrical Equipment", family="UPS", type_name="Floor 80 kVA", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "electrical-ups.glb", _spec(
        "electrical-ups", "Electrical Equipment", "전기설비", "UPS", "UPS",
        "Floor 80 kVA", "바닥형 80 kVA", "loadable", "level", "base-center", "component",
    ))


def build_vav():
    col = H.reset_collection("FAM_vav")
    root = _root(col, "mep-vav")
    _p(H.box(col, M["metal"], "Box", 0.52, 0.32, 0.28, 0, 0, 0, bevel=0.004), root)
    _p(H.tube(col, M["metal_dark"], "Inlet", 0.10, 0.092, 0.14, -0.33, 0, 0, axis="X", verts=14), root)
    _p(H.box(col, M["metal_dark"], "Outlet", 0.08, 0.26, 0.22, 0.30, 0, 0, bevel=0.002), root)
    _p(H.box(col, M["plastic"], "Actuator", 0.12, 0.10, 0.09, 0.04, 0, 0.185, bevel=0.006), root)
    _p(H.box(col, M["metal"], "Damper", 0.01, 0.22, 0.18, -0.05, 0, 0), root)
    H.set_identity(root, category="Mechanical Equipment", family="VAV", type_name="Single Duct", family_kind="loadable", origin="center", host="level")
    return _record(col, "mep-vav.glb", _spec(
        "mep-vav", "Mechanical Equipment", "기계설비", "VAV", "VAV",
        "Single Duct", "단일덕트", "loadable", "level", "center", "component",
    ))


def build_pump():
    col = H.reset_collection("FAM_pump")
    root = _root(col, "mep-pump")
    _p(H.box(col, M["metal_dark"], "Base", 0.52, 0.28, 0.05, 0, 0, 0.025, bevel=0.004), root)
    _p(H.cyl(col, M["metal"], "Volute", 0.13, 0.14, -0.08, 0, 0.20, axis="Y", verts=18, bevel=0.006), root)
    _p(H.cyl(col, M["metal"], "Motor", 0.105, 0.26, 0.16, 0, 0.20, axis="X", verts=16), root)
    _p(H.cyl(col, M["metal_dark"], "Fan", 0.09, 0.03, 0.30, 0, 0.20, axis="X", verts=12), root)
    _p(H.tube(col, M["metal"], "Suction", 0.04, 0.032, 0.10, -0.08, -0.16, 0.20, axis="Y", verts=10), root)
    _p(H.tube(col, M["metal"], "Discharge", 0.035, 0.028, 0.10, -0.08, 0, 0.36, verts=10), root)
    H.set_identity(root, category="Mechanical Equipment", family="Circulation Pump", type_name="Inline", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "mep-pump.glb", _spec(
        "mep-pump", "Mechanical Equipment", "기계설비", "Circulation Pump", "순환펌프",
        "Inline", "인라인", "loadable", "level", "base-center", "component",
    ))


def build_expansion_tank():
    col = H.reset_collection("FAM_exp_tank")
    root = _root(col, "mep-expansion-tank")
    _p(H.cyl(col, M["paint_white"], "Vessel", 0.22, 0.72, 0, 0, 0.50, verts=18, bevel=0.01), root)
    _p(H.cyl(col, M["paint_white"], "Dome", 0.22, 0.10, 0, 0, 0.90, r2=0.08, verts=18), root)
    _p(H.cyl(col, M["metal"], "Foot", 0.16, 0.05, 0, 0, 0.025, verts=14), root)
    _p(H.cyl(col, M["chrome"], "Conn", 0.022, 0.08, 0, 0, 0.08, verts=10), root)
    _p(H.cyl(col, M["chrome"], "Gauge", 0.028, 0.02, 0.16, 0, 0.62, axis="Y", verts=12), root)
    H.set_identity(root, category="Mechanical Equipment", family="Expansion Tank", type_name="80 L", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "mep-expansion-tank.glb", _spec(
        "mep-expansion-tank", "Mechanical Equipment", "기계설비", "Expansion Tank", "팽창탱크",
        "80 L", "80 L", "loadable", "level", "base-center", "component",
    ))


def build_diffuser():
    col = H.reset_collection("FAM_diffuser")
    root = _root(col, "mep-diffuser")
    _p(H.box(col, M["alum"], "Face", 0.60, 0.60, 0.016, 0, 0, 0, bevel=0.002), root)
    _p(H.box(col, M["alum"], "Neck", 0.26, 0.26, 0.10, 0, 0, 0.058, bevel=0.002), root)
    for i, s in enumerate((0.50, 0.38, 0.26, 0.14)):
        _p(H.box(col, M["alum"], f"Cone{i}", s, s, 0.006, 0, 0, -0.008 - i * 0.010), root)
    H.set_identity(root, category="Air Terminals", family="Supply Diffuser", type_name="600 x 600", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "mep-diffuser.glb", _spec(
        "mep-diffuser", "Air Terminals", "디퓨저", "Supply Diffuser", "급기 디퓨저",
        "600 x 600", "600 × 600", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_heat_detector():
    col = H.reset_collection("FAM_heat_det")
    root = _root(col, "fire-heat-detector")
    _p(H.cyl(col, M["plastic_white"], "Base", 0.058, 0.014, 0, 0, 0.0, verts=18), root)
    _p(H.cyl(col, M["plastic_white"], "Dome", 0.048, 0.012, 0, 0, -0.012, verts=16), root)
    _p(H.cyl(col, M["metal"], "Thermistor", 0.016, 0.014, 0, 0, -0.022, verts=10), root)
    H.set_identity(root, category="Fire Alarm Devices", family="Heat Detector", type_name="Rate-of-rise", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "fire-heat-detector.glb", _spec(
        "fire-heat-detector", "Fire Alarm Devices", "화재경보", "Heat Detector", "열감지기",
        "Rate-of-rise", "차동식", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_mcp():
    col = H.reset_collection("FAM_mcp")
    root = _root(col, "fire-mcp")
    red = H.principled("A_PaintRed", (0.72, 0.10, 0.08), 0.42)
    _p(H.box(col, M["plastic_white"], "Backbox", 0.10, 0.036, 0.14, 0, 0.008, 0, bevel=0.003), root)
    _p(H.box(col, red, "Face", 0.092, 0.010, 0.128, 0, -0.016, 0, bevel=0.003), root)
    _p(H.box(col, M["glass"], "Window", 0.05, 0.004, 0.06, 0, -0.022, 0.01), root)
    _p(H.box(col, M["plastic_white"], "Hammer", 0.03, 0.008, 0.012, 0, -0.024, -0.04, bevel=0.002), root)
    H.set_identity(root, category="Fire Alarm Devices", family="Manual Call Point", type_name="Type A", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "fire-mcp.glb", _spec(
        "fire-mcp", "Fire Alarm Devices", "화재경보", "Manual Call Point", "발신기",
        "Type A", "A형", "loadable", "wall", "wall-face", "hosted",
    ))


def build_alarm_bell():
    col = H.reset_collection("FAM_alarm_bell")
    root = _root(col, "fire-alarm-bell")
    red = H.principled("A_PaintRed", (0.72, 0.10, 0.08), 0.42)
    _p(H.cyl(col, red, "Dome", 0.09, 0.045, 0, -0.01, 0, axis="Y", verts=18, bevel=0.004), root)
    _p(H.cyl(col, M["metal_dark"], "Base", 0.04, 0.04, 0, 0.03, 0, axis="Y", verts=12), root)
    _p(H.cyl(col, M["chrome"], "Striker", 0.008, 0.03, 0.06, -0.02, 0.02, verts=8), root)
    H.set_identity(root, category="Fire Alarm Devices", family="Alarm Bell", type_name="Ø150", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "fire-alarm-bell.glb", _spec(
        "fire-alarm-bell", "Fire Alarm Devices", "화재경보", "Alarm Bell", "경종",
        "Ø150", "Ø150", "loadable", "wall", "wall-face", "hosted",
    ))


def build_temp_sensor():
    col = H.reset_collection("FAM_temp_sensor")
    root = _root(col, "bems-temp-sensor")
    _p(H.box(col, M["plastic_white"], "Body", 0.072, 0.018, 0.108, 0, 0, 0, bevel=0.004), root)
    for i in range(4):
        _p(H.box(col, M["plastic"], f"Slot{i}", 0.04, 0.004, 0.004, 0, -0.010, -0.028 + i * 0.01), root)
    H.set_identity(root, category="BEMS", family="Temperature Sensor", type_name="Wall", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "bems-temp-sensor.glb", _spec(
        "bems-temp-sensor", "BEMS", "BEMS", "Temperature Sensor", "온도센서",
        "Wall", "벽면", "loadable", "wall", "wall-face", "hosted",
    ))


def build_co2_sensor():
    col = H.reset_collection("FAM_co2_sensor")
    root = _root(col, "bems-co2-sensor")
    _p(H.box(col, M["plastic_white"], "Body", 0.094, 0.022, 0.112, 0, 0, 0, bevel=0.005), root)
    _p(H.box(col, M["glass_dark"], "Window", 0.042, 0.004, 0.018, 0, -0.012, 0.028), root)
    for i in range(3):
        _p(H.box(col, M["plastic"], f"Vent{i}", 0.05, 0.004, 0.004, 0, -0.012, -0.03 + i * 0.01), root)
    H.set_identity(root, category="BEMS", family="CO2 Sensor", type_name="Wall", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "bems-co2-sensor.glb", _spec(
        "bems-co2-sensor", "BEMS", "BEMS", "CO2 Sensor", "CO₂ 센서",
        "Wall", "벽면", "loadable", "wall", "wall-face", "hosted",
    ))


def build_smart_meter():
    col = H.reset_collection("FAM_smart_meter")
    root = _root(col, "energy-smart-meter")
    _p(H.box(col, M["plastic"], "Body", 0.16, 0.078, 0.24, 0, 0, 0, bevel=0.006), root)
    _p(H.box(col, M["glass_dark"], "LCD", 0.10, 0.006, 0.055, 0, -0.040, 0.055), root)
    _p(H.box(col, M["plastic_white"], "Keys", 0.08, 0.006, 0.03, 0, -0.040, -0.02), root)
    _p(H.box(col, M["metal_dark"], "Terminals", 0.12, 0.03, 0.04, 0, 0.02, -0.10), root)
    H.set_identity(root, category="Electrical Equipment", family="Smart Meter", type_name="3-phase", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "energy-smart-meter.glb", _spec(
        "energy-smart-meter", "Electrical Equipment", "전기설비", "Smart Meter", "스마트미터",
        "3-phase", "3상", "loadable", "wall", "wall-face", "hosted",
    ))


def build_pcs():
    col = H.reset_collection("FAM_pcs")
    root = _root(col, "ess-pcs")
    _p(H.box(col, M["metal"], "Cabinet", 0.80, 0.60, 1.96, 0, 0, 1.02, bevel=0.008), root)
    _p(H.box(col, M["metal_dark"], "Plinth", 0.84, 0.64, 0.08, 0, 0, 0.04), root)
    for i in range(10):
        _p(H.box(col, M["metal_dark"], f"Louver{i}", 0.56, 0.008, 0.018, 0, -0.305, 0.30 + i * 0.045), root)
    _p(H.box(col, M["plastic"], "HMI", 0.20, 0.016, 0.14, 0, -0.308, 1.62, bevel=0.002), root)
    _p(H.box(col, M["metal"], "BusBar", 0.50, 0.04, 0.08, 0, 0.28, 1.80), root)
    H.set_identity(root, category="Electrical Equipment", family="PCS", type_name="Cabinet 250 kW", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "ess-pcs.glb", _spec(
        "ess-pcs", "Electrical Equipment", "전기설비", "PCS", "PCS",
        "Cabinet 250 kW", "캐비닛 250 kW", "loadable", "level", "base-center", "component",
    ))


def build_generic_equipment():
    col = H.reset_collection("FAM_generic_eq")
    root = _root(col, "generic-equipment")
    _p(H.box(col, M["metal"], "Body", 1.00, 0.80, 1.16, 0, 0, 0.62, bevel=0.012), root)
    _p(H.box(col, M["metal_dark"], "Plinth", 1.04, 0.84, 0.08, 0, 0, 0.04), root)
    _p(H.box(col, M["plastic"], "Panel", 0.28, 0.016, 0.16, 0, -0.41, 0.95, bevel=0.002), root)
    for i in range(5):
        _p(H.box(col, M["metal_dark"], f"Vent{i}", 0.70, 0.008, 0.02, 0, -0.405, 0.28 + i * 0.06), root)
    H.set_identity(root, category="Generic Models", family="Generic Equipment", type_name="Placeholder", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "generic-equipment.glb", _spec(
        "generic-equipment", "Generic Models", "일반모델", "Generic Equipment", "일반 장비",
        "Placeholder", "플레이스홀더", "loadable", "level", "base-center", "component",
    ))


def build_generic_sensor():
    col = H.reset_collection("FAM_generic_sensor")
    root = _root(col, "generic-sensor")
    _p(H.box(col, M["plastic_white"], "Body", 0.08, 0.028, 0.08, 0, 0, 0, bevel=0.006), root)
    _p(H.cyl(col, M["plastic"], "Lens", 0.016, 0.008, 0, -0.016, 0, axis="Y", verts=10), root)
    H.set_identity(root, category="Generic Models", family="Generic Sensor", type_name="Placeholder", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "generic-sensor.glb", _spec(
        "generic-sensor", "Generic Models", "일반모델", "Generic Sensor", "일반 센서",
        "Placeholder", "플레이스홀더", "loadable", "wall", "wall-face", "hosted",
    ))


def build_bollard():
    col = H.reset_collection("FAM_bollard")
    root = _root(col, "site-bollard")
    _p(H.cyl(col, M["metal_dark"], "Post", 0.075, 0.84, 0, 0, 0.48, verts=16, bevel=0.004), root)
    _p(H.cyl(col, M["paint_white"], "Cap", 0.082, 0.05, 0, 0, 0.925, verts=16), root)
    _p(H.cyl(col, M["paint_white"], "Ring1", 0.078, 0.03, 0, 0, 0.72, verts=16), root)
    _p(H.cyl(col, M["paint_white"], "Ring2", 0.078, 0.03, 0, 0, 0.28, verts=16), root)
    H.set_identity(root, category="Site", family="Bollard", type_name="Fixed 900mm", family_kind="loadable", origin="base-center", host="toposurface")
    return _record(col, "site-bollard.glb", _spec(
        "site-bollard", "Site", "외부", "Bollard", "볼라드",
        "Fixed 900mm", "고정 900mm", "loadable", "toposurface", "base-center", "component",
    ))


def build_streetlight():
    col = H.reset_collection("FAM_streetlight")
    root = _root(col, "site-streetlight")
    _p(H.cyl(col, M["metal_dark"], "Pole", 0.075, 5.80, 0, 0, 2.90, r2=0.05, verts=14), root)
    _p(H.box(col, M["metal_dark"], "Arm", 1.30, 0.055, 0.055, 0.55, 0, 5.82, bevel=0.006), root)
    _p(H.box(col, M["metal"], "Head", 0.46, 0.22, 0.10, 1.18, 0, 5.74, bevel=0.012), root)
    _p(H.box(col, M["emissive"], "Lens", 0.38, 0.16, 0.02, 1.18, 0, 5.68), root)
    _p(H.cyl(col, M["metal_dark"], "Base", 0.14, 0.18, 0, 0, 0.09, verts=14), root)
    H.set_identity(root, category="Site", family="Streetlight", type_name="6 m pole", family_kind="loadable", origin="base-center", host="toposurface")
    return _record(col, "site-streetlight.glb", _spec(
        "site-streetlight", "Site", "외부", "Streetlight", "가로등",
        "6 m pole", "6 m 폴", "loadable", "toposurface", "base-center", "component",
    ))


def build_fence():
    col = H.reset_collection("FAM_fence")
    root = _root(col, "site-fence-module")
    _p(H.box(col, M["metal"], "PostL", 0.06, 0.06, 1.24, 0.03, 0, 0.62, bevel=0.003), root)
    _p(H.box(col, M["metal"], "PostR", 0.06, 0.06, 1.24, 0.97, 0, 0.62, bevel=0.003), root)
    _p(H.box(col, M["metal"], "RailTop", 0.94, 0.03, 0.03, 0.50, 0, 1.12, bevel=0.002), root)
    _p(H.box(col, M["metal"], "RailMid", 0.94, 0.03, 0.03, 0.50, 0, 0.66, bevel=0.002), root)
    _p(H.box(col, M["metal"], "RailBot", 0.94, 0.03, 0.03, 0.50, 0, 0.18, bevel=0.002), root)
    for i in range(8):
        _p(H.box(col, M["metal_dark"], f"Pick{i}", 0.014, 0.014, 0.92, 0.14 + i * 0.105, 0, 0.66), root)
    H.set_identity(root, category="Site", family="Fence", type_name="1 m module 1200h", family_kind="system", origin="start-base", host="toposurface")
    return _record(col, "site-fence-module.glb", _spec(
        "site-fence-module", "Site", "외부", "Fence", "펜스",
        "1 m module 1200h", "1 m 모듈 1200h", "system", "toposurface", "start-base", "linear",
    ))


BUILDERS = [
    build_door_sliding, build_door_revolving, build_door_rollup, build_door_fire,
    build_window_double_casement, build_window_double_hung, build_window_louvre, build_window_industrial,
    build_column_steel_h, build_column_steel_box, build_column_steel_pipe,
    build_beam_rc, build_beam_steel_i, build_beam_steel_h, build_beam_steel_box, build_beam_channel, build_beam_timber,
    build_footing_isolated, build_footing_strip, build_pile, build_pile_cap,
    build_urinal, build_shower, build_bathtub, build_floor_drain, build_fountain,
    build_conference_table, build_cabinet, build_bookshelf, build_wardrobe, build_casework_base,
    build_light_linear, build_light_highbay, build_light_wall, build_light_emergency,
    build_outlet, build_switch, build_thermostat, build_transformer, build_ups,
    build_vav, build_pump, build_expansion_tank, build_diffuser,
    build_heat_detector, build_mcp, build_alarm_bell,
    build_temp_sensor, build_co2_sensor, build_smart_meter, build_pcs,
    build_generic_equipment, build_generic_sensor,
    build_bollard, build_streetlight, build_fence,
]


def merge_catalog():
    existing = []
    if os.path.isfile(H.CATALOG_PATH):
        with open(H.CATALOG_PATH, encoding="utf-8") as f:
            payload = json.load(f)
            existing = payload.get("families", [])
    by_id = {f["id"]: f for f in existing}
    for spec in CATALOG:
        by_id[spec["id"]] = spec
    families = list(by_id.values())
    out = {
        "version": 1,
        "source": "Universidad Europea Revit Basic Course + BIM starter library expansion (LOD3)",
        "units": "metres",
        "blender": "5.2 Z-up",
        "gltf": "Y-up, export_yup=True",
        "count": len(families),
        "families": families,
    }
    os.makedirs(H.ASSET_DIR, exist_ok=True)
    with open(H.CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    return H.CATALOG_PATH, len(families)


def run():
    global M
    H.ensure_object_mode()
    M = H.MATS()
    errors = []
    for fn in BUILDERS:
        try:
            fn()
        except Exception as e:
            errors.append(f"{fn.__name__}: {e}")
            traceback.print_exc()
    path, total = merge_catalog()
    print("DONE new", len(CATALOG), "catalog", total, "errors", errors)
    return {"new": len(CATALOG), "catalogTotal": total, "errors": errors, "ids": [c["id"] for c in CATALOG]}


if __name__ == "__main__" or True:
    RESULT = run()
