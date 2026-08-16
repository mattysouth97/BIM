"""Missing Revit-class BIM families — one default type per family.

Does NOT rebuild the existing 46 authoring GLBs. Exports new files into
public/models/authoring and merges them into catalog.json.

Run from Blender MCP:
    exec(open(r"...\\scripts\\blender\\build_library_pack.py", encoding="utf-8").read())
"""

from __future__ import annotations

import json
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
        "courseRef": extra.pop("courseRef", "BIM starter library expansion"),
    }
    d.update(extra)
    return d


# ---------------------------------------------------------------------------
# Doors
# ---------------------------------------------------------------------------


def build_door_sliding():
    w, h, jam = 1.80, 2.10, 0.05
    col = H.reset_collection("FAM_door_sliding")
    root = _root(col, "door-sliding-1800")
    H.parent(H.box(col, M["alum"], "JambL", jam, 0.10, h, -w / 2 + jam / 2, 0, h / 2), root)
    H.parent(H.box(col, M["alum"], "JambR", jam, 0.10, h, w / 2 - jam / 2, 0, h / 2), root)
    H.parent(H.box(col, M["alum"], "Head", w, 0.10, jam, 0, 0, h - jam / 2), root)
    H.parent(H.box(col, M["alum"], "Track", w - 2 * jam, 0.06, 0.04, 0, 0.02, h - 0.08), root)
    lw = (w - 2 * jam) / 2 + 0.04
    H.parent(H.box(col, M["alum"], "LeafA", lw, 0.04, h - 0.12, -0.22, -0.02, (h - 0.12) / 2), root)
    H.parent(H.box(col, M["glass"], "GlassA", lw - 0.08, 0.01, h - 0.28, -0.22, -0.04, (h - 0.12) / 2), root)
    H.parent(H.box(col, M["alum"], "LeafB", lw, 0.04, h - 0.12, 0.22, 0.02, (h - 0.12) / 2), root)
    H.parent(H.box(col, M["glass"], "GlassB", lw - 0.08, 0.01, h - 0.28, 0.22, 0.04, (h - 0.12) / 2), root)
    H.set_identity(root, category="Doors", family="Sliding Door", type_name="Automatic 1800mm", family_kind="loadable", origin="opening-center-floor", host="wall")
    return _record(col, "door-sliding-1800.glb", _spec(
        "door-sliding-1800", "Doors", "문", "Sliding Door", "미서기문", "Automatic 1800mm", "자동 1800mm",
        "loadable", "wall", "opening-center-floor", "hosted", widthM=w, heightM=h,
    ))


def build_door_revolving():
    d, h = 2.40, 2.20
    col = H.reset_collection("FAM_door_revolving")
    root = _root(col, "door-revolving-2400")
    H.parent(H.cyl(col, M["alum"], "Drum", d / 2, 0.08, 0, 0, 0.04, verts=32), root)
    H.parent(H.cyl(col, M["alum"], "Canopy", d / 2 + 0.02, 0.10, 0, 0, h - 0.05, verts=32), root)
    for i, name in enumerate(("WingA", "WingB", "WingC", "WingD")):
        leaf = H.box(col, M["alum"], name, 0.04, d / 2 - 0.08, h - 0.22, 0, (d / 2 - 0.08) / 2, (h - 0.22) / 2 + 0.08)
        glass = H.box(col, M["glass"], name + "Glass", 0.01, d / 2 - 0.18, h - 0.40, 0.03, (d / 2 - 0.08) / 2, (h - 0.22) / 2 + 0.08)
        leaf.rotation_euler[2] = i * 1.5708
        glass.rotation_euler[2] = i * 1.5708
        H.parent(leaf, root)
        H.parent(glass, root)
    H.parent(H.cyl(col, M["chrome"], "Axis", 0.04, h - 0.16, 0, 0, h / 2, verts=12), root)
    H.set_identity(root, category="Doors", family="Revolving Door", type_name="4-Wing 2400mm", family_kind="loadable", origin="center-floor", host="level")
    return _record(col, "door-revolving-2400.glb", _spec(
        "door-revolving-2400", "Doors", "문", "Revolving Door", "회전문", "4-Wing 2400mm", "4익 2400mm",
        "loadable", "level", "center-floor", "component", widthM=d, heightM=h,
    ))


def build_door_rollup():
    w, h = 3.00, 3.00
    col = H.reset_collection("FAM_door_rollup")
    root = _root(col, "door-rollup-3000")
    H.parent(H.box(col, M["metal_dark"], "GuideL", 0.08, 0.12, h, -w / 2 + 0.04, 0, h / 2), root)
    H.parent(H.box(col, M["metal_dark"], "GuideR", 0.08, 0.12, h, w / 2 - 0.04, 0, h / 2), root)
    H.parent(H.box(col, M["metal"], "Hood", w, 0.28, 0.28, 0, 0, h + 0.06), root)
    slat_h = 0.08
    n = int((h - 0.1) / slat_h)
    for i in range(n):
        z = slat_h / 2 + i * slat_h
        H.parent(H.box(col, M["metal"] if i % 2 == 0 else M["metal_dark"], f"Slat{i}", w - 0.18, 0.03, slat_h - 0.006, 0, 0, z), root)
    H.set_identity(root, category="Doors", family="Roll-Up Door", type_name="Industrial 3000mm", family_kind="loadable", origin="opening-center-floor", host="wall")
    return _record(col, "door-rollup-3000.glb", _spec(
        "door-rollup-3000", "Doors", "문", "Roll-Up Door", "셔터문", "Industrial 3000mm", "공업용 3000mm",
        "loadable", "wall", "opening-center-floor", "hosted", widthM=w, heightM=h,
    ))


def build_door_fire():
    w, h, jam = 0.90, 2.10, 0.05
    col = H.reset_collection("FAM_door_fire")
    root = _root(col, "door-fire-single-900")
    H.parent(H.box(col, M["metal_dark"], "JambL", jam, 0.12, h, -w / 2 + jam / 2, 0, h / 2), root)
    H.parent(H.box(col, M["metal_dark"], "JambR", jam, 0.12, h, w / 2 - jam / 2, 0, h / 2), root)
    H.parent(H.box(col, M["metal_dark"], "Head", w, 0.12, jam, 0, 0, h - jam / 2), root)
    H.parent(H.box(col, M["metal"], "Leaf", w - 2 * jam - 0.01, 0.05, h - jam - 0.01, 0, 0, (h - jam) / 2), root)
    H.parent(H.box(col, M["sign_green"] if "sign_green" in M else M["paint_white"], "Closer", 0.08, 0.06, 0.05, 0, -0.04, h - 0.18), root)
    H.parent(H.box(col, M["chrome"], "Panic", 0.42, 0.03, 0.03, 0, -0.04, 1.00), root)
    H.set_identity(root, category="Doors", family="Fire-Rated Door", type_name="FD60 900mm", family_kind="loadable", origin="opening-center-floor", host="wall")
    return _record(col, "door-fire-single-900.glb", _spec(
        "door-fire-single-900", "Doors", "문", "Fire-Rated Door", "방화문", "FD60 900mm", "FD60 900mm",
        "loadable", "wall", "opening-center-floor", "hosted", widthM=w, heightM=h, fireRating="FD60",
    ))


# ---------------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------------


def _window_frame(col, root, w, h, jam=0.05, depth=0.08):
    H.parent(H.box(col, M["alum"], "JambL", jam, depth, h, -w / 2 + jam / 2, 0, 0), root)
    H.parent(H.box(col, M["alum"], "JambR", jam, depth, h, w / 2 - jam / 2, 0, 0), root)
    H.parent(H.box(col, M["alum"], "Head", w, depth, jam, 0, 0, h / 2 - jam / 2), root)
    H.parent(H.box(col, M["alum"], "Sill", w, depth + 0.02, jam, 0, 0.01, -h / 2 + jam / 2), root)


def build_window_double_casement():
    w, h = 1.50, 1.20
    col = H.reset_collection("FAM_window_dbl_casement")
    root = _root(col, "window-double-casement-1500x1200")
    _window_frame(col, root, w, h)
    H.parent(H.box(col, M["alum"], "Mullion", 0.04, 0.06, h - 0.10, 0, 0, 0), root)
    H.parent(H.box(col, M["glass"], "GlassL", 0.66, 0.01, h - 0.16, -0.36, 0, 0), root)
    H.parent(H.box(col, M["glass"], "GlassR", 0.66, 0.01, h - 0.16, 0.36, 0, 0), root)
    H.set_identity(root, category="Windows", family="Double Casement", type_name="1500 x 1200mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-double-casement-1500x1200.glb", _spec(
        "window-double-casement-1500x1200", "Windows", "창", "Double Casement", "양여닫이창",
        "1500 x 1200mm", "1500 × 1200mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


def build_window_double_hung():
    w, h = 0.90, 1.50
    col = H.reset_collection("FAM_window_hung")
    root = _root(col, "window-double-hung-900x1500")
    _window_frame(col, root, w, h)
    H.parent(H.box(col, M["alum"], "MeetingRail", w - 0.10, 0.05, 0.04, 0, 0, 0), root)
    H.parent(H.box(col, M["glass"], "SashUpper", w - 0.16, 0.01, 0.64, 0, -0.01, 0.36), root)
    H.parent(H.box(col, M["glass"], "SashLower", w - 0.16, 0.01, 0.64, 0, 0.01, -0.36), root)
    H.set_identity(root, category="Windows", family="Double-Hung", type_name="900 x 1500mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-double-hung-900x1500.glb", _spec(
        "window-double-hung-900x1500", "Windows", "창", "Double-Hung", "오르내리창",
        "900 x 1500mm", "900 × 1500mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


def build_window_louvre():
    w, h = 1.20, 1.20
    col = H.reset_collection("FAM_window_louvre")
    root = _root(col, "window-louvre-1200x1200")
    _window_frame(col, root, w, h, jam=0.04, depth=0.07)
    for i in range(8):
        z = -h / 2 + 0.14 + i * 0.13
        blade = H.box(col, M["alum"], f"Blade{i}", w - 0.12, 0.08, 0.018, 0, 0, z, rx=28)
        H.parent(blade, root)
    H.set_identity(root, category="Windows", family="Louvre", type_name="1200 x 1200mm", family_kind="loadable", origin="opening-center", host="wall")
    return _record(col, "window-louvre-1200x1200.glb", _spec(
        "window-louvre-1200x1200", "Windows", "창", "Louvre", "루버창",
        "1200 x 1200mm", "1200 × 1200mm", "loadable", "wall", "opening-center", "hosted", widthM=w, heightM=h,
    ))


def build_window_industrial():
    w, h = 1.80, 0.90
    col = H.reset_collection("FAM_window_industrial")
    root = _root(col, "window-industrial-1800x900")
    _window_frame(col, root, w, h, jam=0.06, depth=0.09)
    H.parent(H.box(col, M["steel"], "BarV1", 0.03, 0.04, h - 0.12, -0.40, 0, 0), root)
    H.parent(H.box(col, M["steel"], "BarV2", 0.03, 0.04, h - 0.12, 0.40, 0, 0), root)
    H.parent(H.box(col, M["steel"], "BarH", w - 0.14, 0.04, 0.03, 0, 0, 0), root)
    H.parent(H.box(col, M["glass"], "Glass", w - 0.16, 0.012, h - 0.16, 0, 0, 0), root)
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
    # 1 m tall H 300×300×10/15 — scale Y in viewer
    H.parent(H.box(col, M["steel"], "FlangeBot", 0.300, 0.300, 0.015, 0, 0, 0.0075), root)
    H.parent(H.box(col, M["steel"], "Web", 0.010, 0.270, 0.970, 0, 0, 0.50), root)
    H.parent(H.box(col, M["steel"], "FlangeTop", 0.300, 0.300, 0.015, 0, 0, 0.9925), root)
    # Wait, H-section column: flanges are on Y sides, web in XZ, height Z
    # Rebuild correctly: flanges 300 wide (X) × 15 thick (Y), web 10 (X) × 270 (Y)
    for o in list(col.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    H.parent(H.box(col, M["steel"], "FlangeA", 0.300, 0.015, 1.0, 0, 0.1425, 0.50), root)
    H.parent(H.box(col, M["steel"], "FlangeB", 0.300, 0.015, 1.0, 0, -0.1425, 0.50), root)
    H.parent(H.box(col, M["steel"], "Web", 0.010, 0.270, 1.0, 0, 0, 0.50), root)
    H.set_identity(root, category="Structural Columns", family="Steel H Column", type_name="H 300×300", family_kind="system", origin="base-center", host="level")
    return _record(col, "column-steel-h-300.glb", _spec(
        "column-steel-h-300", "Structural Columns", "구조 기둥", "Steel H Column", "H형강 기둥",
        "H 300×300", "H 300×300", "system", "level", "base-center", "point",
        scaleAxes={"x": "section", "y": "section", "z": "height"},
    ))


def build_column_steel_box():
    col = H.reset_collection("FAM_column_steel_box")
    root = _root(col, "column-steel-box-300")
    t, s = 0.012, 0.300
    H.parent(H.box(col, M["steel"], "WallX1", s, t, 1.0, 0, (s - t) / 2, 0.50), root)
    H.parent(H.box(col, M["steel"], "WallX2", s, t, 1.0, 0, -(s - t) / 2, 0.50), root)
    H.parent(H.box(col, M["steel"], "WallY1", t, s - 2 * t, 1.0, (s - t) / 2, 0, 0.50), root)
    H.parent(H.box(col, M["steel"], "WallY2", t, s - 2 * t, 1.0, -(s - t) / 2, 0, 0.50), root)
    H.set_identity(root, category="Structural Columns", family="Steel Box Column", type_name="Box 300×300×12", family_kind="system", origin="base-center", host="level")
    return _record(col, "column-steel-box-300.glb", _spec(
        "column-steel-box-300", "Structural Columns", "구조 기둥", "Steel Box Column", "각형강관 기둥",
        "Box 300×300×12", "각형 300×300×12", "system", "level", "base-center", "point",
    ))


def build_column_steel_pipe():
    col = H.reset_collection("FAM_column_steel_pipe")
    root = _root(col, "column-steel-pipe-273")
    H.parent(H.cyl(col, M["steel"], "Pipe", 0.1365, 1.0, 0, 0, 0.50, verts=24), root)
    H.set_identity(root, category="Structural Columns", family="Steel Pipe Column", type_name="Ø273.1", family_kind="system", origin="base-center", host="level")
    return _record(col, "column-steel-pipe-273.glb", _spec(
        "column-steel-pipe-273", "Structural Columns", "구조 기둥", "Steel Pipe Column", "원형강관 기둥",
        "Ø273.1", "Ø273.1", "system", "level", "base-center", "point",
    ))


def build_beam_rc():
    col = H.reset_collection("FAM_beam_rc")
    root = _root(col, "beam-rc-rect-300x500")
    # 1 m along +X, section 300 (Y) × 500 (Z), start at origin
    H.parent(H.box(col, M["concrete"], "Beam", 1.0, 0.300, 0.500, 0.50, 0, 0), root)
    H.set_identity(root, category="Structural Framing", family="RC Rectangular Beam", type_name="300 x 500mm", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-rc-rect-300x500.glb", _spec(
        "beam-rc-rect-300x500", "Structural Framing", "구조 보", "RC Rectangular Beam", "RC 각형 보",
        "300 x 500mm", "300 × 500mm", "system", "level", "start-center", "linear",
        scaleAxes={"x": "length", "y": "section", "z": "section"},
    ))


def build_beam_steel_i():
    col = H.reset_collection("FAM_beam_steel_i")
    root = _root(col, "beam-steel-i-200x400")
    H.parent(H.box(col, M["steel"], "FlangeBot", 1.0, 0.200, 0.012, 0.50, 0, -0.194), root)
    H.parent(H.box(col, M["steel"], "Web", 1.0, 0.010, 0.376, 0.50, 0, 0), root)
    H.parent(H.box(col, M["steel"], "FlangeTop", 1.0, 0.200, 0.012, 0.50, 0, 0.194), root)
    H.set_identity(root, category="Structural Framing", family="Steel I Beam", type_name="I 200×400", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-i-200x400.glb", _spec(
        "beam-steel-i-200x400", "Structural Framing", "구조 보", "Steel I Beam", "I형강 보",
        "I 200×400", "I 200×400", "system", "level", "start-center", "linear",
    ))


def build_beam_steel_h():
    col = H.reset_collection("FAM_beam_steel_h")
    root = _root(col, "beam-steel-h-300x300")
    H.parent(H.box(col, M["steel"], "FlangeBot", 1.0, 0.300, 0.015, 0.50, 0, -0.1425), root)
    H.parent(H.box(col, M["steel"], "Web", 1.0, 0.010, 0.270, 0.50, 0, 0), root)
    H.parent(H.box(col, M["steel"], "FlangeTop", 1.0, 0.300, 0.015, 0.50, 0, 0.1425), root)
    H.set_identity(root, category="Structural Framing", family="Steel H Beam", type_name="H 300×300", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-h-300x300.glb", _spec(
        "beam-steel-h-300x300", "Structural Framing", "구조 보", "Steel H Beam", "H형강 보",
        "H 300×300", "H 300×300", "system", "level", "start-center", "linear",
    ))


def build_beam_steel_box():
    col = H.reset_collection("FAM_beam_steel_box")
    root = _root(col, "beam-steel-box-200")
    t, s = 0.010, 0.200
    H.parent(H.box(col, M["steel"], "Top", 1.0, s, t, 0.50, 0, (s - t) / 2), root)
    H.parent(H.box(col, M["steel"], "Bot", 1.0, s, t, 0.50, 0, -(s - t) / 2), root)
    H.parent(H.box(col, M["steel"], "SideA", 1.0, t, s - 2 * t, 0.50, (s - t) / 2, 0), root)
    H.parent(H.box(col, M["steel"], "SideB", 1.0, t, s - 2 * t, 0.50, -(s - t) / 2, 0), root)
    H.set_identity(root, category="Structural Framing", family="Steel Box Beam", type_name="Box 200×200", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-box-200.glb", _spec(
        "beam-steel-box-200", "Structural Framing", "구조 보", "Steel Box Beam", "각형강관 보",
        "Box 200×200", "각형 200×200", "system", "level", "start-center", "linear",
    ))


def build_beam_channel():
    col = H.reset_collection("FAM_beam_channel")
    root = _root(col, "beam-steel-channel-200")
    H.parent(H.box(col, M["steel"], "Web", 1.0, 0.010, 0.200, 0.50, -0.040, 0), root)
    H.parent(H.box(col, M["steel"], "FlangeTop", 1.0, 0.080, 0.012, 0.50, 0, 0.094), root)
    H.parent(H.box(col, M["steel"], "FlangeBot", 1.0, 0.080, 0.012, 0.50, 0, -0.094), root)
    H.set_identity(root, category="Structural Framing", family="Steel Channel", type_name="C 200", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-steel-channel-200.glb", _spec(
        "beam-steel-channel-200", "Structural Framing", "구조 보", "Steel Channel", "채널 보",
        "C 200", "C 200", "system", "level", "start-center", "linear",
    ))


def build_beam_timber():
    col = H.reset_collection("FAM_beam_timber")
    root = _root(col, "beam-timber-100x200")
    H.parent(H.box(col, M["wood"], "Beam", 1.0, 0.100, 0.200, 0.50, 0, 0), root)
    H.set_identity(root, category="Structural Framing", family="Timber Beam", type_name="100 x 200mm", family_kind="system", origin="start-center", host="level")
    return _record(col, "beam-timber-100x200.glb", _spec(
        "beam-timber-100x200", "Structural Framing", "구조 보", "Timber Beam", "목재 보",
        "100 x 200mm", "100 × 200mm", "system", "level", "start-center", "linear",
    ))


def build_footing_isolated():
    col = H.reset_collection("FAM_footing_isolated")
    root = _root(col, "footing-isolated-1500")
    H.parent(H.box(col, M["concrete"], "Pad", 1.50, 1.50, 0.50, 0, 0, -0.25), root)
    H.parent(H.box(col, M["concrete"], "Pedestal", 0.50, 0.50, 0.40, 0, 0, 0.20), root)
    H.set_identity(root, category="Structural Foundations", family="Isolated Footing", type_name="1500 x 1500 x 500", family_kind="system", origin="top-center", host="level")
    return _record(col, "footing-isolated-1500.glb", _spec(
        "footing-isolated-1500", "Structural Foundations", "기초", "Isolated Footing", "독립기초",
        "1500 x 1500 x 500", "1500 × 1500 × 500", "system", "level", "top-center", "point",
    ))


def build_footing_strip():
    col = H.reset_collection("FAM_footing_strip")
    root = _root(col, "footing-strip-600")
    H.parent(H.box(col, M["concrete"], "Strip", 1.0, 0.600, 0.400, 0.50, 0, -0.20), root)
    H.set_identity(root, category="Structural Foundations", family="Strip Footing", type_name="600 x 400mm", family_kind="system", origin="start-top-center", host="level")
    return _record(col, "footing-strip-600.glb", _spec(
        "footing-strip-600", "Structural Foundations", "기초", "Strip Footing", "줄기초",
        "600 x 400mm", "600 × 400mm", "system", "level", "start-top-center", "linear",
    ))


def build_pile():
    col = H.reset_collection("FAM_pile")
    root = _root(col, "pile-400")
    H.parent(H.cyl(col, M["concrete"], "Pile", 0.200, 8.0, 0, 0, -4.0, verts=16), root)
    H.set_identity(root, category="Structural Foundations", family="Pile", type_name="Ø400 × 8m", family_kind="system", origin="top-center", host="level")
    return _record(col, "pile-400.glb", _spec(
        "pile-400", "Structural Foundations", "기초", "Pile", "말뚝",
        "Ø400 × 8m", "Ø400 × 8m", "system", "level", "top-center", "point",
    ))


def build_pile_cap():
    col = H.reset_collection("FAM_pile_cap")
    root = _root(col, "pile-cap-1800")
    H.parent(H.box(col, M["concrete"], "Cap", 1.80, 1.80, 0.80, 0, 0, -0.40), root)
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
    H.parent(H.box(col, M["ceramic"], "Body", 0.36, 0.32, 0.62, 0, -0.10, 0.95), root)
    H.parent(H.box(col, M["ceramic_grey"], "Bowl", 0.28, 0.22, 0.18, 0, -0.18, 0.72), root)
    H.parent(H.cyl(col, M["chrome"], "Flush", 0.03, 0.12, 0, 0.02, 1.28, verts=10), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Urinal", type_name="Wall Hung", family_kind="loadable", origin="wall-face-floor", host="wall")
    return _record(col, "plumbing-urinal.glb", _spec(
        "plumbing-urinal", "Plumbing Fixtures", "위생기구", "Urinal", "소변기",
        "Wall Hung", "벽걸이", "loadable", "wall", "wall-face-floor", "hosted",
    ))


def build_shower():
    col = H.reset_collection("FAM_shower")
    root = _root(col, "plumbing-shower")
    H.parent(H.box(col, M["ceramic"], "Tray", 0.90, 0.90, 0.08, 0, 0.45, 0.04), root)
    H.parent(H.cyl(col, M["chrome"], "Riser", 0.012, 1.80, 0, 0.06, 0.98, verts=8), root)
    H.parent(H.cyl(col, M["chrome"], "Head", 0.10, 0.03, 0, 0.16, 1.85, axis="Y", verts=16), root)
    H.parent(H.box(col, M["chrome"], "Mixer", 0.16, 0.06, 0.08, 0, 0.04, 1.05), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Shower", type_name="900 Tray", family_kind="loadable", origin="tray-back-center", host="level")
    return _record(col, "plumbing-shower.glb", _spec(
        "plumbing-shower", "Plumbing Fixtures", "위생기구", "Shower", "샤워",
        "900 Tray", "900 트레이", "loadable", "level", "tray-back-center", "component",
    ))


def build_bathtub():
    col = H.reset_collection("FAM_bathtub")
    root = _root(col, "plumbing-bathtub")
    H.parent(H.box(col, M["ceramic"], "Tub", 1.70, 0.75, 0.55, 0, 0.375, 0.275, bevel=0.04), root)
    H.parent(H.box(col, M["ceramic_grey"], "Interior", 1.46, 0.55, 0.28, 0, 0.375, 0.38), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Bathtub", type_name="1700 mm", family_kind="loadable", origin="back-center-floor", host="level")
    return _record(col, "plumbing-bathtub.glb", _spec(
        "plumbing-bathtub", "Plumbing Fixtures", "위생기구", "Bathtub", "욕조",
        "1700 mm", "1700 mm", "loadable", "level", "back-center-floor", "component",
    ))


def build_floor_drain():
    col = H.reset_collection("FAM_floor_drain")
    root = _root(col, "plumbing-floor-drain")
    H.parent(H.cyl(col, M["metal"], "Grate", 0.075, 0.012, 0, 0, 0.006, verts=16), root)
    H.parent(H.cyl(col, M["metal_dark"], "Body", 0.055, 0.08, 0, 0, -0.04, verts=12), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Floor Drain", type_name="Ø150", family_kind="loadable", origin="finish-floor", host="floor")
    return _record(col, "plumbing-floor-drain.glb", _spec(
        "plumbing-floor-drain", "Plumbing Fixtures", "위생기구", "Floor Drain", "바닥배수",
        "Ø150", "Ø150", "loadable", "floor", "finish-floor", "hosted",
    ))


def build_fountain():
    col = H.reset_collection("FAM_fountain")
    root = _root(col, "plumbing-fountain")
    H.parent(H.box(col, M["steel"], "Body", 0.32, 0.28, 1.00, 0, -0.08, 0.50), root)
    H.parent(H.box(col, M["ceramic"], "Basin", 0.30, 0.22, 0.08, 0, -0.18, 0.92), root)
    H.parent(H.cyl(col, M["chrome"], "Spout", 0.012, 0.10, 0, -0.04, 1.02, axis="Y", verts=8), root)
    H.set_identity(root, category="Plumbing Fixtures", family="Drinking Fountain", type_name="Wall Hung", family_kind="loadable", origin="wall-face-floor", host="wall")
    return _record(col, "plumbing-fountain.glb", _spec(
        "plumbing-fountain", "Plumbing Fixtures", "위생기구", "Drinking Fountain", "음수대",
        "Wall Hung", "벽걸이", "loadable", "wall", "wall-face-floor", "hosted",
    ))


def build_conference_table():
    col = H.reset_collection("FAM_conference")
    root = _root(col, "furniture-conference-table")
    H.parent(H.box(col, M["wood"], "Top", 3.20, 1.20, 0.04, 0, 0, 0.74), root)
    H.parent(H.box(col, M["metal_dark"], "Pedestal", 0.80, 0.40, 0.70, 0, 0, 0.35), root)
    H.set_identity(root, category="Furniture", family="Conference Table", type_name="3200 x 1200mm", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-conference-table.glb", _spec(
        "furniture-conference-table", "Furniture", "가구", "Conference Table", "회의 테이블",
        "3200 x 1200mm", "3200 × 1200mm", "loadable", "level", "base-center", "component",
    ))


def build_cabinet():
    col = H.reset_collection("FAM_cabinet")
    root = _root(col, "furniture-cabinet")
    H.parent(H.box(col, M["wood"], "Carcass", 0.90, 0.40, 1.80, 0, 0, 0.90), root)
    H.parent(H.box(col, M["wood_dark"], "DoorL", 0.42, 0.02, 1.68, -0.22, -0.21, 0.90), root)
    H.parent(H.box(col, M["wood_dark"], "DoorR", 0.42, 0.02, 1.68, 0.22, -0.21, 0.90), root)
    H.set_identity(root, category="Furniture", family="Cabinet", type_name="900 x 400 x 1800", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-cabinet.glb", _spec(
        "furniture-cabinet", "Furniture", "가구", "Cabinet", "수납장",
        "900 x 400 x 1800", "900 × 400 × 1800", "loadable", "level", "base-center", "component",
    ))


def build_bookshelf():
    col = H.reset_collection("FAM_bookshelf")
    root = _root(col, "furniture-bookshelf")
    H.parent(H.box(col, M["wood"], "Sides", 1.00, 0.32, 1.80, 0, 0, 0.90), root)
    for i, z in enumerate((0.04, 0.48, 0.92, 1.36, 1.76)):
        H.parent(H.box(col, M["wood_dark"], f"Shelf{i}", 0.94, 0.30, 0.024, 0, 0, z), root)
    H.set_identity(root, category="Furniture", family="Bookshelf", type_name="1000 x 1800mm", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-bookshelf.glb", _spec(
        "furniture-bookshelf", "Furniture", "가구", "Bookshelf", "책장",
        "1000 x 1800mm", "1000 × 1800mm", "loadable", "level", "base-center", "component",
    ))


def build_wardrobe():
    col = H.reset_collection("FAM_wardrobe")
    root = _root(col, "furniture-wardrobe")
    H.parent(H.box(col, M["wood"], "Carcass", 1.20, 0.58, 2.10, 0, 0, 1.05), root)
    H.parent(H.box(col, M["wood_dark"], "DoorL", 0.56, 0.02, 2.00, -0.30, -0.30, 1.05), root)
    H.parent(H.box(col, M["wood_dark"], "DoorR", 0.56, 0.02, 2.00, 0.30, -0.30, 1.05), root)
    H.set_identity(root, category="Furniture", family="Wardrobe", type_name="1200 x 2100mm", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "furniture-wardrobe.glb", _spec(
        "furniture-wardrobe", "Furniture", "가구", "Wardrobe", "옷장",
        "1200 x 2100mm", "1200 × 2100mm", "loadable", "level", "base-center", "component",
    ))


def build_casework_base():
    col = H.reset_collection("FAM_casework_base")
    root = _root(col, "casework-base-cabinet")
    H.parent(H.box(col, M["wood"], "Carcass", 0.80, 0.58, 0.86, 0, 0, 0.45), root)
    H.parent(H.box(col, M["ceramic"], "Top", 0.82, 0.60, 0.04, 0, 0, 0.90), root)
    H.parent(H.box(col, M["wood_dark"], "Door", 0.74, 0.02, 0.70, 0, -0.30, 0.42), root)
    H.set_identity(root, category="Casework", family="Base Cabinet", type_name="800 mm", family_kind="loadable", origin="back-center-floor", host="level")
    return _record(col, "casework-base-cabinet.glb", _spec(
        "casework-base-cabinet", "Casework", "붙박이", "Base Cabinet", "하부장",
        "800 mm", "800 mm", "loadable", "level", "back-center-floor", "component",
    ))


def build_light_linear():
    col = H.reset_collection("FAM_light_linear")
    root = _root(col, "light-linear-1200")
    H.parent(H.box(col, M["alum"], "Body", 1.20, 0.08, 0.06, 0, 0, -0.03), root)
    H.parent(H.box(col, M["emissive"], "Lens", 1.14, 0.06, 0.01, 0, 0, -0.065), root)
    H.set_identity(root, category="Lighting Fixtures", family="Linear LED", type_name="1200 mm", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "light-linear-1200.glb", _spec(
        "light-linear-1200", "Lighting Fixtures", "조명 기구", "Linear LED", "라인 LED",
        "1200 mm", "1200 mm", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_light_highbay():
    col = H.reset_collection("FAM_light_highbay")
    root = _root(col, "light-highbay")
    H.parent(H.cyl(col, M["metal_dark"], "Housing", 0.18, 0.12, 0, 0, -0.08, verts=16), root)
    H.parent(H.cyl(col, M["emissive"], "Lens", 0.16, 0.02, 0, 0, -0.15, verts=16), root)
    H.parent(H.cyl(col, M["metal"], "Hook", 0.015, 0.08, 0, 0, 0.02, verts=8), root)
    H.set_identity(root, category="Lighting Fixtures", family="High-Bay", type_name="LED 150W", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "light-highbay.glb", _spec(
        "light-highbay", "Lighting Fixtures", "조명 기구", "High-Bay", "하이베이",
        "LED 150W", "LED 150W", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_light_wall():
    col = H.reset_collection("FAM_light_wall")
    root = _root(col, "light-wall")
    H.parent(H.box(col, M["metal"], "Back", 0.18, 0.04, 0.28, 0, 0.02, 0), root)
    H.parent(H.box(col, M["emissive"], "Shade", 0.16, 0.10, 0.22, 0, -0.06, 0), root)
    H.set_identity(root, category="Lighting Fixtures", family="Wall Light", type_name="Surface 180mm", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "light-wall.glb", _spec(
        "light-wall", "Lighting Fixtures", "조명 기구", "Wall Light", "벽등",
        "Surface 180mm", "벽면 180mm", "loadable", "wall", "wall-face", "hosted",
    ))


def build_light_emergency():
    col = H.reset_collection("FAM_light_emergency")
    root = _root(col, "light-emergency")
    H.parent(H.box(col, M["plastic_white"], "Body", 0.28, 0.08, 0.10, 0, 0, -0.05), root)
    H.parent(H.box(col, M["emissive"], "Heads", 0.22, 0.04, 0.04, 0, -0.03, -0.08), root)
    H.set_identity(root, category="Lighting Fixtures", family="Emergency Light", type_name="Twin-head", family_kind="loadable", origin="wall-or-ceiling", host="wall")
    return _record(col, "light-emergency.glb", _spec(
        "light-emergency", "Lighting Fixtures", "조명 기구", "Emergency Light", "비상조명",
        "Twin-head", "쌍두형", "loadable", "wall", "wall-or-ceiling", "hosted",
    ))


def build_outlet():
    col = H.reset_collection("FAM_outlet")
    root = _root(col, "device-outlet-single")
    H.parent(H.box(col, M["plastic_white"], "Plate", 0.08, 0.01, 0.12, 0, 0, 0), root)
    H.parent(H.cyl(col, M["plastic"], "SockL", 0.012, 0.008, -0.015, -0.006, 0.01, axis="Y", verts=8), root)
    H.parent(H.cyl(col, M["plastic"], "SockR", 0.012, 0.008, 0.015, -0.006, 0.01, axis="Y", verts=8), root)
    H.set_identity(root, category="Electrical Fixtures", family="Single Outlet", type_name="230V", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "device-outlet-single.glb", _spec(
        "device-outlet-single", "Electrical Fixtures", "전기기구", "Single Outlet", "단구 콘센트",
        "230V", "230V", "loadable", "wall", "wall-face", "hosted",
    ))


def build_switch():
    col = H.reset_collection("FAM_switch")
    root = _root(col, "device-switch")
    H.parent(H.box(col, M["plastic_white"], "Plate", 0.08, 0.01, 0.12, 0, 0, 0), root)
    H.parent(H.box(col, M["plastic"], "Rocker", 0.04, 0.008, 0.06, 0, -0.008, 0), root)
    H.set_identity(root, category="Electrical Fixtures", family="Light Switch", type_name="1-gang", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "device-switch.glb", _spec(
        "device-switch", "Electrical Fixtures", "전기기구", "Light Switch", "전등 스위치",
        "1-gang", "1구", "loadable", "wall", "wall-face", "hosted",
    ))


def build_thermostat():
    col = H.reset_collection("FAM_thermostat")
    root = _root(col, "device-thermostat")
    H.parent(H.box(col, M["plastic_white"], "Body", 0.10, 0.018, 0.10, 0, 0, 0), root)
    H.parent(H.box(col, M["glass_dark"], "Screen", 0.07, 0.004, 0.05, 0, -0.01, 0.01), root)
    H.set_identity(root, category="Electrical Fixtures", family="Thermostat", type_name="Digital", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "device-thermostat.glb", _spec(
        "device-thermostat", "Electrical Fixtures", "전기기구", "Thermostat", "온도조절기",
        "Digital", "디지털", "loadable", "wall", "wall-face", "hosted",
    ))


def build_transformer():
    col = H.reset_collection("FAM_transformer")
    root = _root(col, "electrical-transformer")
    H.parent(H.box(col, M["metal"], "Tank", 1.40, 1.10, 1.60, 0, 0, 0.80), root)
    H.parent(H.cyl(col, M["ceramic"], "BushingA", 0.06, 0.35, -0.35, 0, 1.78, verts=10), root)
    H.parent(H.cyl(col, M["ceramic"], "BushingB", 0.06, 0.35, 0.00, 0, 1.78, verts=10), root)
    H.parent(H.cyl(col, M["ceramic"], "BushingC", 0.06, 0.35, 0.35, 0, 1.78, verts=10), root)
    H.parent(H.box(col, M["metal_dark"], "Radiator", 0.16, 1.00, 1.20, 0.78, 0, 0.70), root)
    H.set_identity(root, category="Electrical Equipment", family="Transformer", type_name="Pad 500 kVA", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "electrical-transformer.glb", _spec(
        "electrical-transformer", "Electrical Equipment", "전기설비", "Transformer", "변압기",
        "Pad 500 kVA", "패드 500 kVA", "loadable", "level", "base-center", "component",
    ))


def build_ups():
    col = H.reset_collection("FAM_ups")
    root = _root(col, "electrical-ups")
    H.parent(H.box(col, M["metal"], "Cabinet", 0.60, 0.80, 1.80, 0, 0, 0.90), root)
    H.parent(H.box(col, M["plastic"], "Display", 0.28, 0.02, 0.16, 0, -0.41, 1.50), root)
    H.parent(H.box(col, M["metal_dark"], "Vent", 0.50, 0.02, 0.40, 0, -0.41, 0.40), root)
    H.set_identity(root, category="Electrical Equipment", family="UPS", type_name="Floor 80 kVA", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "electrical-ups.glb", _spec(
        "electrical-ups", "Electrical Equipment", "전기설비", "UPS", "UPS",
        "Floor 80 kVA", "바닥형 80 kVA", "loadable", "level", "base-center", "component",
    ))


def build_vav():
    col = H.reset_collection("FAM_vav")
    root = _root(col, "mep-vav")
    H.parent(H.box(col, M["metal"], "Box", 0.50, 0.30, 0.28, 0, 0, 0), root)
    H.parent(H.cyl(col, M["metal_dark"], "Inlet", 0.10, 0.12, -0.31, 0, 0, axis="X", verts=12), root)
    H.parent(H.box(col, M["metal_dark"], "Outlet", 0.08, 0.24, 0.20, 0.29, 0, 0), root)
    H.parent(H.box(col, M["plastic"], "Actuator", 0.12, 0.10, 0.10, 0, 0, 0.19), root)
    H.set_identity(root, category="Mechanical Equipment", family="VAV", type_name="Single Duct", family_kind="loadable", origin="center", host="level")
    return _record(col, "mep-vav.glb", _spec(
        "mep-vav", "Mechanical Equipment", "기계설비", "VAV", "VAV",
        "Single Duct", "단일덕트", "loadable", "level", "center", "component",
    ))


def build_pump():
    col = H.reset_collection("FAM_pump")
    root = _root(col, "mep-pump")
    H.parent(H.box(col, M["metal_dark"], "Base", 0.50, 0.28, 0.06, 0, 0, 0.03), root)
    H.parent(H.cyl(col, M["metal"], "Volute", 0.14, 0.16, -0.06, 0, 0.22, axis="Y", verts=16), root)
    H.parent(H.cyl(col, M["metal"], "Motor", 0.11, 0.28, 0.16, 0, 0.22, axis="X", verts=14), root)
    H.set_identity(root, category="Mechanical Equipment", family="Circulation Pump", type_name="Inline", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "mep-pump.glb", _spec(
        "mep-pump", "Mechanical Equipment", "기계설비", "Circulation Pump", "순환펌프",
        "Inline", "인라인", "loadable", "level", "base-center", "component",
    ))


def build_expansion_tank():
    col = H.reset_collection("FAM_exp_tank")
    root = _root(col, "mep-expansion-tank")
    H.parent(H.cyl(col, M["paint_white"], "Vessel", 0.22, 0.80, 0, 0, 0.46, verts=16), root)
    H.parent(H.cyl(col, M["metal"], "Foot", 0.18, 0.06, 0, 0, 0.03, verts=12), root)
    H.parent(H.cyl(col, M["chrome"], "Conn", 0.025, 0.08, 0, 0, 0.90, verts=8), root)
    H.set_identity(root, category="Mechanical Equipment", family="Expansion Tank", type_name="80 L", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "mep-expansion-tank.glb", _spec(
        "mep-expansion-tank", "Mechanical Equipment", "기계설비", "Expansion Tank", "팽창탱크",
        "80 L", "80 L", "loadable", "level", "base-center", "component",
    ))


def build_diffuser():
    col = H.reset_collection("FAM_diffuser")
    root = _root(col, "mep-diffuser")
    H.parent(H.box(col, M["alum"], "Face", 0.60, 0.60, 0.02, 0, 0, 0), root)
    H.parent(H.box(col, M["alum"], "Neck", 0.28, 0.28, 0.10, 0, 0, 0.06), root)
    for i, s in enumerate((0.48, 0.36, 0.24)):
        H.parent(H.box(col, M["alum"], f"Cone{i}", s, s, 0.008, 0, 0, -0.01 - i * 0.012), root)
    H.set_identity(root, category="Air Terminals", family="Supply Diffuser", type_name="600 x 600", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "mep-diffuser.glb", _spec(
        "mep-diffuser", "Air Terminals", "디퓨저", "Supply Diffuser", "급기 디퓨저",
        "600 x 600", "600 × 600", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_heat_detector():
    col = H.reset_collection("FAM_heat_det")
    root = _root(col, "fire-heat-detector")
    H.parent(H.cyl(col, M["plastic_white"], "Base", 0.055, 0.018, 0, 0, 0, verts=16), root)
    H.parent(H.cyl(col, M["metal"], "Thermistor", 0.018, 0.016, 0, 0, -0.016, verts=10), root)
    H.set_identity(root, category="Fire Alarm Devices", family="Heat Detector", type_name="Rate-of-rise", family_kind="loadable", origin="ceiling-plane", host="ceiling")
    return _record(col, "fire-heat-detector.glb", _spec(
        "fire-heat-detector", "Fire Alarm Devices", "화재경보", "Heat Detector", "열감지기",
        "Rate-of-rise", "차동식", "loadable", "ceiling", "ceiling-plane", "hosted",
    ))


def build_mcp():
    col = H.reset_collection("FAM_mcp")
    root = _root(col, "fire-mcp")
    H.parent(H.box(col, M["paint_white"] if False else M["plastic_white"], "Box", 0.10, 0.04, 0.14, 0, 0, 0), root)
    # red face — reuse brick-like red via metal? use a dedicated look with ceramic? Use brick color material
    H.parent(H.box(col, M["brick"], "Face", 0.09, 0.008, 0.12, 0, -0.024, 0), root)
    H.set_identity(root, category="Fire Alarm Devices", family="Manual Call Point", type_name="Type A", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "fire-mcp.glb", _spec(
        "fire-mcp", "Fire Alarm Devices", "화재경보", "Manual Call Point", "발신기",
        "Type A", "A형", "loadable", "wall", "wall-face", "hosted",
    ))


def build_alarm_bell():
    col = H.reset_collection("FAM_alarm_bell")
    root = _root(col, "fire-alarm-bell")
    H.parent(H.cyl(col, M["metal"], "Bell", 0.09, 0.05, 0, 0, 0, axis="Y", verts=16), root)
    H.parent(H.cyl(col, M["metal_dark"], "Base", 0.04, 0.04, 0, 0.03, 0, axis="Y", verts=10), root)
    H.set_identity(root, category="Fire Alarm Devices", family="Alarm Bell", type_name="Ø150", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "fire-alarm-bell.glb", _spec(
        "fire-alarm-bell", "Fire Alarm Devices", "화재경보", "Alarm Bell", "경종",
        "Ø150", "Ø150", "loadable", "wall", "wall-face", "hosted",
    ))


def build_temp_sensor():
    col = H.reset_collection("FAM_temp_sensor")
    root = _root(col, "bems-temp-sensor")
    H.parent(H.box(col, M["plastic_white"], "Body", 0.07, 0.018, 0.10, 0, 0, 0), root)
    H.parent(H.cyl(col, M["plastic"], "Vent", 0.012, 0.006, 0, -0.01, -0.02, axis="Y", verts=8), root)
    H.set_identity(root, category="BEMS", family="Temperature Sensor", type_name="Wall", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "bems-temp-sensor.glb", _spec(
        "bems-temp-sensor", "BEMS", "BEMS", "Temperature Sensor", "온도센서",
        "Wall", "벽면", "loadable", "wall", "wall-face", "hosted",
    ))


def build_co2_sensor():
    col = H.reset_collection("FAM_co2_sensor")
    root = _root(col, "bems-co2-sensor")
    H.parent(H.box(col, M["plastic_white"], "Body", 0.09, 0.022, 0.11, 0, 0, 0), root)
    H.parent(H.box(col, M["glass_dark"], "Window", 0.04, 0.004, 0.02, 0, -0.012, 0.02), root)
    H.set_identity(root, category="BEMS", family="CO2 Sensor", type_name="Wall", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "bems-co2-sensor.glb", _spec(
        "bems-co2-sensor", "BEMS", "BEMS", "CO2 Sensor", "CO₂ 센서",
        "Wall", "벽면", "loadable", "wall", "wall-face", "hosted",
    ))


def build_smart_meter():
    col = H.reset_collection("FAM_smart_meter")
    root = _root(col, "energy-smart-meter")
    H.parent(H.box(col, M["plastic"], "Body", 0.16, 0.08, 0.24, 0, 0, 0), root)
    H.parent(H.box(col, M["glass_dark"], "LCD", 0.10, 0.006, 0.06, 0, -0.042, 0.05), root)
    H.set_identity(root, category="Electrical Equipment", family="Smart Meter", type_name="3-phase", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "energy-smart-meter.glb", _spec(
        "energy-smart-meter", "Electrical Equipment", "전기설비", "Smart Meter", "스마트미터",
        "3-phase", "3상", "loadable", "wall", "wall-face", "hosted",
    ))


def build_pcs():
    col = H.reset_collection("FAM_pcs")
    root = _root(col, "ess-pcs")
    H.parent(H.box(col, M["metal"], "Cabinet", 0.80, 0.60, 2.00, 0, 0, 1.00), root)
    H.parent(H.box(col, M["metal_dark"], "Louver", 0.60, 0.02, 0.50, 0, -0.31, 0.50), root)
    H.parent(H.box(col, M["plastic"], "HMI", 0.22, 0.02, 0.16, 0, -0.31, 1.60), root)
    H.set_identity(root, category="Electrical Equipment", family="PCS", type_name="Cabinet 250 kW", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "ess-pcs.glb", _spec(
        "ess-pcs", "Electrical Equipment", "전기설비", "PCS", "PCS",
        "Cabinet 250 kW", "캐비닛 250 kW", "loadable", "level", "base-center", "component",
    ))


def build_generic_equipment():
    col = H.reset_collection("FAM_generic_eq")
    root = _root(col, "generic-equipment")
    H.parent(H.box(col, M["metal"], "Body", 1.00, 0.80, 1.20, 0, 0, 0.60), root)
    H.set_identity(root, category="Generic Models", family="Generic Equipment", type_name="Placeholder", family_kind="loadable", origin="base-center", host="level")
    return _record(col, "generic-equipment.glb", _spec(
        "generic-equipment", "Generic Models", "일반모델", "Generic Equipment", "일반 장비",
        "Placeholder", "플레이스홀더", "loadable", "level", "base-center", "component",
    ))


def build_generic_sensor():
    col = H.reset_collection("FAM_generic_sensor")
    root = _root(col, "generic-sensor")
    H.parent(H.box(col, M["plastic_white"], "Body", 0.08, 0.03, 0.08, 0, 0, 0), root)
    H.set_identity(root, category="Generic Models", family="Generic Sensor", type_name="Placeholder", family_kind="loadable", origin="wall-face", host="wall")
    return _record(col, "generic-sensor.glb", _spec(
        "generic-sensor", "Generic Models", "일반모델", "Generic Sensor", "일반 센서",
        "Placeholder", "플레이스홀더", "loadable", "wall", "wall-face", "hosted",
    ))


def build_bollard():
    col = H.reset_collection("FAM_bollard")
    root = _root(col, "site-bollard")
    H.parent(H.cyl(col, M["metal_dark"], "Post", 0.08, 0.90, 0, 0, 0.45, verts=12), root)
    H.parent(H.cyl(col, M["paint_white"], "Cap", 0.085, 0.06, 0, 0, 0.93, verts=12), root)
    H.set_identity(root, category="Site", family="Bollard", type_name="Fixed 900mm", family_kind="loadable", origin="base-center", host="toposurface")
    return _record(col, "site-bollard.glb", _spec(
        "site-bollard", "Site", "외부", "Bollard", "볼라드",
        "Fixed 900mm", "고정 900mm", "loadable", "toposurface", "base-center", "component",
    ))


def build_streetlight():
    col = H.reset_collection("FAM_streetlight")
    root = _root(col, "site-streetlight")
    H.parent(H.cyl(col, M["metal_dark"], "Pole", 0.08, 6.00, 0, 0, 3.00, verts=12), root)
    arm = H.box(col, M["metal_dark"], "Arm", 1.20, 0.06, 0.06, 0.50, 0, 5.90)
    H.parent(arm, root)
    H.parent(H.box(col, M["emissive"], "Luminaire", 0.40, 0.22, 0.10, 1.05, 0, 5.82), root)
    H.set_identity(root, category="Site", family="Streetlight", type_name="6 m pole", family_kind="loadable", origin="base-center", host="toposurface")
    return _record(col, "site-streetlight.glb", _spec(
        "site-streetlight", "Site", "외부", "Streetlight", "가로등",
        "6 m pole", "6 m 폴", "loadable", "toposurface", "base-center", "component",
    ))


def build_fence():
    col = H.reset_collection("FAM_fence")
    root = _root(col, "site-fence-module")
    H.parent(H.box(col, M["metal"], "PostL", 0.06, 0.06, 1.20, 0.03, 0, 0.60), root)
    H.parent(H.box(col, M["metal"], "PostR", 0.06, 0.06, 1.20, 0.97, 0, 0.60), root)
    H.parent(H.box(col, M["metal"], "RailTop", 0.94, 0.03, 0.03, 0.50, 0, 1.10), root)
    H.parent(H.box(col, M["metal"], "RailBot", 0.94, 0.03, 0.03, 0.50, 0, 0.20), root)
    for i in range(7):
        H.parent(H.box(col, M["metal_dark"], f"Pick{i}", 0.016, 0.016, 0.88, 0.16 + i * 0.12, 0, 0.64), root)
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
        "source": "Universidad Europea Revit Basic Course + BIM starter library expansion",
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
