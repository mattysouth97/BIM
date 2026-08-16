"""Build every 3D family used by the Revit Architecture authoring system.

Source of truth: Universidad Europea Revit Basic Course (García / Martínez, 2014)
plus the BIM project's Category → Family → Type identity.

Run from Blender MCP:
    exec(open(r"C:\\Users\\Nam\\BIM\\scripts\\blender\\build_authoring_assets.py", encoding="utf-8").read())

Or a single pack:
    PACKS = {"walls"}  # set before exec, or pass env AUTHORING_PACKS=walls,doors
"""

from __future__ import annotations

import json
import math
import os
import sys
import traceback

import bpy

HERE = r"C:\Users\Nam\BIM\scripts\blender"
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import importlib
import authoring_helpers as H  # noqa: E402

importlib.reload(H)

M = None  # filled in main()
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
    print(f"  exported {filename}  {kb} KB  tris={spec.get('triangles')}  dims={spec.get('nativeDimsM')}")
    return spec


# ===========================================================================
# WALLS  (system families — 1 m modules, height 3.0 m, thickness on Y)
# Origin: start of wall (x=0), centerline (y=0), base (z=0). Length +X, height +Z.
# Exterior face = +Y.
# ===========================================================================


def _wall_layers(col, root, layers, length=1.0, height=3.0):
    """layers: list of (name, thickness_m, mat, function). Exterior first."""
    total = sum(t for _, t, _, _ in layers)
    y = total / 2.0
    made = []
    for name, t, mat, fn in layers:
        y -= t / 2.0
        o = H.box(col, mat, name, length, t, height, length / 2.0, y, height / 2.0)
        o["revit.layerFunction"] = fn
        o["revit.layerThicknessM"] = t
        H.parent(o, root)
        made.append(o)
        y -= t / 2.0
    return total, made


def build_wall_generic(col_name="FAM_wall_generic_200"):
    col = H.reset_collection(col_name)
    root = _root(col, "wall-basic-generic-200")
    layers = [("Structure", 0.200, M["concrete"], "Structure")]
    thick, _ = _wall_layers(col, root, layers)
    H.set_identity(
        root,
        category="Walls",
        family="Basic Wall",
        type_name="Generic 200mm",
        family_kind="system",
        origin="start-centerline-base",
        extras={"widthM": thick, "heightM": 3.0, "lengthM": 1.0, "uValue": 2.4},
    )
    return _record(
        col,
        "wall-basic-generic-200.glb",
        {
            "id": "wall-basic-generic-200",
            "category": "Walls",
            "categoryKo": "벽",
            "family": "Basic Wall",
            "familyKo": "기본 벽",
            "type": "Generic 200mm",
            "typeKo": "일반 200mm",
            "familyKind": "system",
            "host": "level",
            "origin": "start-centerline-base",
            "placement": "linear",
            "scaleAxes": {"x": "length", "y": "fixed-thickness", "z": "height"},
            "widthM": 0.200,
            "heightM": 3.0,
            "courseRef": "Basic Model Elements / Walls — Generic Wall Type (low LOD)",
        },
    )


def build_wall_brick_cmu():
    col = H.reset_collection("FAM_wall_brick_cmu")
    root = _root(col, "wall-exterior-brick-on-cmu")
    layers = [
        ("Finish1_Brick", 0.090, M["brick"], "Finish 1"),
        ("AirLayer", 0.020, M["air"], "Thermal/Air Layer"),
        ("Thermal_Insul", 0.050, M["insulation"], "Thermal/Air Layer"),
        ("Structure_CMU", 0.190, M["cmu"], "Structure"),
        ("Finish2_Gypsum", 0.013, M["gypsum"], "Finish 2"),
    ]
    thick, _ = _wall_layers(col, root, layers)
    # brick soldier-course coping
    coping = H.box(col, M["brick"], "Coping", 1.0, thick + 0.02, 0.04, 0.5, 0.0, 3.02)
    H.parent(coping, root)
    H.set_identity(
        root,
        category="Walls",
        family="Basic Wall",
        type_name="Exterior – Brick on CMU",
        family_kind="system",
        origin="start-centerline-base",
        extras={"widthM": thick, "heightM": 3.0},
    )
    return _record(
        col,
        "wall-exterior-brick-on-cmu.glb",
        {
            "id": "wall-exterior-brick-on-cmu",
            "category": "Walls",
            "categoryKo": "벽",
            "family": "Basic Wall",
            "familyKo": "기본 벽",
            "type": "Exterior – Brick on CMU",
            "typeKo": "외부 – 벽돌+CMU",
            "familyKind": "system",
            "host": "level",
            "origin": "start-centerline-base",
            "placement": "linear",
            "scaleAxes": {"x": "length", "y": "fixed-thickness", "z": "height"},
            "widthM": thick,
            "heightM": 3.0,
            "layers": [fn for _, _, _, fn in layers],
            "courseRef": "Revit element Hierarchy — Exterior – Brick on CMU",
        },
    )


def build_wall_cmu_insulated():
    col = H.reset_collection("FAM_wall_cmu_insul")
    root = _root(col, "wall-exterior-cmu-insulated")
    layers = [
        ("Finish1_Stucco", 0.015, M["paint_white"], "Finish 1"),
        ("Structure_CMU", 0.190, M["cmu"], "Structure"),
        ("Thermal_Insul", 0.075, M["insulation"], "Thermal/Air Layer"),
        ("Finish2_Gypsum", 0.015, M["gypsum"], "Finish 2"),
    ]
    thick, _ = _wall_layers(col, root, layers)
    H.set_identity(
        root,
        category="Walls",
        family="Basic Wall",
        type_name="Exterior – CMU Insulated",
        family_kind="system",
        origin="start-centerline-base",
        extras={"widthM": thick, "heightM": 3.0},
    )
    return _record(
        col,
        "wall-exterior-cmu-insulated.glb",
        {
            "id": "wall-exterior-cmu-insulated",
            "category": "Walls",
            "categoryKo": "벽",
            "family": "Basic Wall",
            "familyKo": "기본 벽",
            "type": "Exterior – CMU Insulated",
            "typeKo": "외부 – 단열 CMU",
            "familyKind": "system",
            "host": "level",
            "origin": "start-centerline-base",
            "placement": "linear",
            "widthM": thick,
            "heightM": 3.0,
            "courseRef": "Revit element Hierarchy — Exterior – CMU Insulated",
        },
    )


def build_wall_partition():
    col = H.reset_collection("FAM_wall_partition")
    root = _root(col, "wall-interior-partition")
    layers = [
        ("Finish1_Gypsum", 0.0125, M["gypsum"], "Finish 1"),
        ("Structure_Stud", 0.090, M["wood"], "Structure"),
        ("Finish2_Gypsum", 0.0125, M["gypsum"], "Finish 2"),
    ]
    thick, _ = _wall_layers(col, root, layers)
    H.set_identity(
        root,
        category="Walls",
        family="Basic Wall",
        type_name="Interior – Partition",
        family_kind="system",
        origin="start-centerline-base",
        extras={"widthM": thick, "heightM": 3.0},
    )
    return _record(
        col,
        "wall-interior-partition.glb",
        {
            "id": "wall-interior-partition",
            "category": "Walls",
            "categoryKo": "벽",
            "family": "Basic Wall",
            "familyKo": "기본 벽",
            "type": "Interior – Partition",
            "typeKo": "내부 – 칸막이",
            "familyKind": "system",
            "host": "level",
            "origin": "start-centerline-base",
            "placement": "linear",
            "widthM": thick,
            "heightM": 3.0,
            "courseRef": "Revit element Hierarchy — Interior – Partition",
        },
    )


def build_wall_stacked():
    """Stacked Wall: brick base 1.2 m + CMU insulated above (course: Stacked Walls family)."""
    col = H.reset_collection("FAM_wall_stacked")
    root = _root(col, "wall-stacked-brick-cmu")
    base_h = 1.2
    top_h = 1.8
    # lower brick-on-cmu (thicker)
    base_layers = [
        ("Base_Brick", 0.090, M["brick"], "Finish 1"),
        ("Base_Air", 0.020, M["air"], "Thermal/Air Layer"),
        ("Base_Insul", 0.050, M["insulation"], "Thermal/Air Layer"),
        ("Base_CMU", 0.190, M["cmu"], "Structure"),
        ("Base_Gyp", 0.013, M["gypsum"], "Finish 2"),
    ]
    total = sum(t for _, t, _, _ in base_layers)
    y = total / 2.0
    for name, t, mat, fn in base_layers:
        y -= t / 2.0
        o = H.box(col, mat, name, 1.0, t, base_h, 0.5, y, base_h / 2.0)
        o["revit.layerFunction"] = fn
        H.parent(o, root)
        y -= t / 2.0
    # upper thinner insulated CMU, aligned to interior (-Y)
    top_layers = [
        ("Top_Stucco", 0.015, M["paint_white"], "Finish 1"),
        ("Top_CMU", 0.190, M["cmu"], "Structure"),
        ("Top_Insul", 0.075, M["insulation"], "Thermal/Air Layer"),
        ("Top_Gyp", 0.015, M["gypsum"], "Finish 2"),
    ]
    top_t = sum(t for _, t, _, _ in top_layers)
    # align interior faces
    y = -total / 2.0 + top_t
    for name, t, mat, fn in top_layers:
        y -= t / 2.0
        o = H.box(col, mat, name, 1.0, t, top_h, 0.5, y, base_h + top_h / 2.0)
        o["revit.layerFunction"] = fn
        H.parent(o, root)
        y -= t / 2.0
    ledge = H.box(col, M["metal"], "ShelfAngle", 1.0, 0.06, 0.02, 0.5, total / 2.0 - 0.02, base_h + 0.01)
    H.parent(ledge, root)
    H.set_identity(
        root,
        category="Walls",
        family="Stacked Wall",
        type_name="Exterior – Brick Base + CMU",
        family_kind="system",
        origin="start-centerline-base",
        extras={"widthM": total, "heightM": 3.0},
    )
    return _record(
        col,
        "wall-stacked-brick-cmu.glb",
        {
            "id": "wall-stacked-brick-cmu",
            "category": "Walls",
            "categoryKo": "벽",
            "family": "Stacked Wall",
            "familyKo": "적층 벽",
            "type": "Exterior – Brick Base + CMU",
            "typeKo": "외부 – 벽돌 하단 + CMU",
            "familyKind": "system",
            "host": "level",
            "origin": "start-centerline-base",
            "placement": "linear",
            "widthM": total,
            "heightM": 3.0,
            "courseRef": "Wall Category — three System Families: Basic, Curtain, Stacked",
        },
    )


def build_curtain_mullion():
    """Unit-normalized rectangular mullion, length along Z (height). Scale Z to span."""
    col = H.reset_collection("FAM_mullion_rect")
    root = _root(col, "curtain-mullion-rect-50x150")
    # 50 mm sightline (X) × 150 mm depth (Y), 1 m tall
    body = H.box(col, M["alum"], "MullionBody", 0.050, 0.150, 1.0, 0, 0, 0.5, bevel=0.002)
    cap = H.box(col, M["alum"], "PressureCap", 0.056, 0.012, 1.0, 0, 0.081, 0.5)
    gasket = H.box(col, M["rubber"], "Gasket", 0.044, 0.006, 1.0, 0, 0.072, 0.5)
    for o in (body, cap, gasket):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Curtain Wall Mullions",
        family="Rectangular Mullion",
        type_name="50 x 150mm",
        family_kind="system",
        origin="center-axis",
        extras={"profileMm": [50, 150]},
    )
    return _record(
        col,
        "curtain-mullion-rect-50x150.glb",
        {
            "id": "curtain-mullion-rect-50x150",
            "category": "Curtain Wall Mullions",
            "categoryKo": "커튼월 멀리언",
            "family": "Rectangular Mullion",
            "familyKo": "각형 멀리언",
            "type": "50 x 150mm",
            "typeKo": "50 × 150mm",
            "familyKind": "system",
            "host": "curtain-grid",
            "origin": "center-axis",
            "placement": "linear",
            "scaleAxes": {"z": "length"},
            "courseRef": "Complex Walls — curtain walls have grids, mullions and panels",
        },
    )


def build_curtain_panel_glazed():
    col = H.reset_collection("FAM_curtain_panel")
    root = _root(col, "curtain-panel-glazed")
    w, h, t = 1.20, 2.40, 0.024
    glass = H.box(col, M["glass"], "Glazing", w - 0.02, t, h - 0.02, 0, 0, h / 2)
    # thin setting block
    block = H.box(col, M["rubber"], "SettingBlock", w - 0.04, 0.02, 0.012, 0, 0, 0.02)
    H.parent(glass, root)
    H.parent(block, root)
    H.set_identity(
        root,
        category="Curtain Panels",
        family="System Panel",
        type_name="Glazed",
        family_kind="system",
        origin="center-sill",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        "curtain-panel-glazed.glb",
        {
            "id": "curtain-panel-glazed",
            "category": "Curtain Panels",
            "categoryKo": "커튼월 패널",
            "family": "System Panel",
            "familyKo": "시스템 패널",
            "type": "Glazed",
            "typeKo": "유리",
            "familyKind": "system",
            "host": "curtain-grid",
            "origin": "bottom-center",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "courseRef": "Complex Walls — mullions and panels",
        },
    )


def build_curtain_wall_assembly():
    """2-bay × 2-high curtain wall sample, 2.5 m wide × 3.0 m tall."""
    col = H.reset_collection("FAM_curtain_assembly")
    root = _root(col, "curtain-wall-storefront")
    width, height = 2.50, 3.00
    mw, md = 0.050, 0.150
    # frame
    for x in (mw / 2, width / 2, width - mw / 2):
        m = H.box(col, M["alum"], f"VMullion_{x:.2f}", mw, md, height, x, 0, height / 2, bevel=0.002)
        H.parent(m, root)
    for z in (mw / 2, height / 2, height - mw / 2):
        m = H.box(col, M["alum"], f"HMullion_{z:.2f}", width, md, mw, width / 2, 0, z, bevel=0.002)
        H.parent(m, root)
    # 4 glass panels
    pw, ph = (width - 3 * mw) / 2, (height - 3 * mw) / 2
    idx = 0
    for ix in range(2):
        for iz in range(2):
            cx = mw + pw / 2 + ix * (pw + mw)
            cz = mw + ph / 2 + iz * (ph + mw)
            g = H.box(col, M["glass"], f"Panel_{idx}", pw - 0.004, 0.022, ph - 0.004, cx, 0, cz)
            H.parent(g, root)
            idx += 1
    H.set_identity(
        root,
        category="Walls",
        family="Curtain Wall",
        type_name="Storefront",
        family_kind="system",
        origin="start-centerline-base",
        extras={"widthM": 0.15, "heightM": height, "lengthM": width},
    )
    return _record(
        col,
        "curtain-wall-storefront.glb",
        {
            "id": "curtain-wall-storefront",
            "category": "Walls",
            "categoryKo": "벽",
            "family": "Curtain Wall",
            "familyKo": "커튼월",
            "type": "Storefront",
            "typeKo": "스토어프론트",
            "familyKind": "system",
            "host": "level",
            "origin": "start-centerline-base",
            "placement": "linear",
            "widthM": 0.15,
            "heightM": height,
            "lengthM": width,
            "courseRef": "Complex Walls — Curtain walls have grids, mullions and panels",
        },
    )


# ===========================================================================
# DOORS  (loadable, wall-hosted)
# Origin: opening center, wall centerline, floor (z=0). Interior = -Y.
# ===========================================================================


def _door_frame(col, root, w, h, jam=0.05, depth=0.12, head=0.05):
    # jambs sit on either side, head on top. Frame thickness along Y = depth
    lj = H.box(col, M["wood"], "JambL", jam, depth, h, -w / 2 + jam / 2, 0, h / 2, bevel=0.003)
    rj = H.box(col, M["wood"], "JambR", jam, depth, h, w / 2 - jam / 2, 0, h / 2, bevel=0.003)
    hd = H.box(col, M["wood"], "Head", w, depth, head, 0, 0, h - head / 2, bevel=0.003)
    th = H.box(col, M["metal_dark"], "Threshold", w - 2 * jam, 0.10, 0.012, 0, 0, 0.006)
    stop_l = H.box(col, M["wood_dark"], "StopL", 0.012, 0.03, h - head, -w / 2 + jam + 0.006, -0.02, (h - head) / 2)
    stop_r = H.box(col, M["wood_dark"], "StopR", 0.012, 0.03, h - head, w / 2 - jam - 0.006, -0.02, (h - head) / 2)
    stop_h = H.box(col, M["wood_dark"], "StopH", w - 2 * jam, 0.03, 0.012, 0, -0.02, h - head - 0.006)
    for o in (lj, rj, hd, th, stop_l, stop_r, stop_h):
        H.parent(o, root)
    return jam, head


def _door_leaf(col, parent_empty, w, h, jam, head, thick=0.040, x_off=0.0):
    lw = w - 2 * jam - 0.004
    lh = h - head - 0.008
    leaf = H.box(col, M["wood"], "Leaf", lw, thick, lh, x_off, -0.01, lh / 2 + 0.004, bevel=0.004)
    # recessed panel
    panel = H.box(
        col,
        M["wood_dark"],
        "LeafPanel",
        lw - 0.12,
        0.008,
        lh - 0.22,
        x_off,
        -0.01 - thick / 2 - 0.002,
        lh / 2 + 0.004,
        bevel=0.003,
    )
    H.parent(leaf, parent_empty)
    H.parent(panel, parent_empty)
    return leaf


def _lever_set(col, parent_empty, x, y, z):
    rose = H.cyl(col, M["chrome"], "Rose", 0.028, 0.008, x, y, z, axis="Y", verts=16)
    lever = H.box(col, M["chrome"], "Lever", 0.11, 0.016, 0.018, x + 0.05, y, z, bevel=0.004)
    rose2 = H.cyl(col, M["chrome"], "RoseBack", 0.028, 0.008, x, y + 0.05, z, axis="Y", verts=16)
    lever2 = H.box(col, M["chrome"], "LeverBack", 0.11, 0.016, 0.018, x + 0.05, y + 0.05, z, bevel=0.004)
    for o in (rose, lever, rose2, lever2):
        H.parent(o, parent_empty)


def _hinges(col, parent_empty, x, y, h, n=3):
    for i in range(n):
        z = 0.25 + i * ((h - 0.5) / (n - 1))
        kn = H.box(col, M["chrome"], f"Hinge_{i}", 0.08, 0.012, 0.10, x, y, z, bevel=0.002)
        pin = H.cyl(col, M["chrome"], f"HingePin_{i}", 0.004, 0.11, x, y, z, verts=8)
        H.parent(kn, parent_empty)
        H.parent(pin, parent_empty)


def build_door_single(width=0.910, height=2.100, slug="door-single-flush-910", type_en="Generic 910mm", type_ko="일반 910mm"):
    col = H.reset_collection(f"FAM_{slug.replace('-', '_')}")
    root = _root(col, slug)
    jam, head = _door_frame(col, root, width, height)
    pivot = H.empty(col, "LeafPivot", (-width / 2 + jam, -0.01, 0))
    H.parent(pivot, root)
    _door_leaf(col, pivot, width, height, jam, head)
    _lever_set(col, root, width / 2 - jam - 0.08, -0.035, 1.00)
    _hinges(col, root, -width / 2 + jam, -0.01, height - head)
    H.set_identity(
        root,
        category="Doors",
        family="Single-Flush",
        type_name=type_en,
        family_kind="loadable",
        origin="opening-center-floor",
        host="wall",
        extras={"widthM": width, "heightM": height},
    )
    return _record(
        col,
        f"{slug}.glb",
        {
            "id": slug,
            "category": "Doors",
            "categoryKo": "문",
            "family": "Single-Flush",
            "familyKo": "단여닫이",
            "type": type_en,
            "typeKo": type_ko,
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center-floor",
            "placement": "hosted",
            "widthM": width,
            "heightM": height,
            "swing": "LeafPivot rotates about +Z, interior -Y",
            "courseRef": "Doors and Windows — wall-hosted loadable families; Generic 910mm",
        },
    )


def build_door_double():
    w, h = 1.80, 2.10
    col = H.reset_collection("FAM_door_double")
    root = _root(col, "door-double-flush-1800")
    jam, head = _door_frame(col, root, w, h, depth=0.14)
    half = (w - 2 * jam) / 2
    for sign, name in ((-1, "LeafL"), (1, "LeafR")):
        pivot = H.empty(col, f"{name}Pivot", (sign * (w / 2 - jam), -0.01, 0))
        H.parent(pivot, root)
        lw = half - 0.004
        lh = h - head - 0.008
        leaf = H.box(col, M["wood"], name, lw, 0.040, lh, sign * (lw / 2 + 0.002), 0, lh / 2 + 0.004, bevel=0.004)
        panel = H.box(col, M["wood_dark"], f"{name}Panel", lw - 0.10, 0.008, lh - 0.22, sign * (lw / 2 + 0.002), -0.022, lh / 2 + 0.004)
        H.parent(leaf, pivot)
        H.parent(panel, pivot)
        _lever_set(col, root, sign * (0.10), -0.035, 1.00)
    H.set_identity(
        root,
        category="Doors",
        family="Double-Flush",
        type_name="Generic 1800mm",
        family_kind="loadable",
        origin="opening-center-floor",
        host="wall",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        "door-double-flush-1800.glb",
        {
            "id": "door-double-flush-1800",
            "category": "Doors",
            "categoryKo": "문",
            "family": "Double-Flush",
            "familyKo": "양여닫이",
            "type": "Generic 1800mm",
            "typeKo": "일반 1800mm",
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center-floor",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "courseRef": "Doors — loadable families placed on walls",
        },
    )


def build_door_glass():
    w, h = 1.00, 2.20
    col = H.reset_collection("FAM_door_glass")
    root = _root(col, "door-glass-storefront")
    jam = 0.06
    # aluminum frame
    for x, name in ((-w / 2 + jam / 2, "JambL"), (w / 2 - jam / 2, "JambR")):
        H.parent(H.box(col, M["alum"], name, jam, 0.10, h, x, 0, h / 2, bevel=0.002), root)
    H.parent(H.box(col, M["alum"], "Head", w, 0.10, jam, 0, 0, h - jam / 2, bevel=0.002), root)
    H.parent(H.box(col, M["alum"], "Sill", w, 0.12, 0.04, 0, 0, 0.02, bevel=0.002), root)
    H.parent(H.box(col, M["alum"], "MidRail", w - 2 * jam, 0.06, 0.08, 0, 0, 0.95, bevel=0.002), root)
    H.parent(H.box(col, M["glass"], "GlassUpper", w - 2 * jam - 0.01, 0.016, h - 1.08, 0, 0, 1.58), root)
    H.parent(H.box(col, M["glass"], "GlassLower", w - 2 * jam - 0.01, 0.016, 0.82, 0, 0, 0.50), root)
    _lever_set(col, root, w / 2 - jam - 0.06, -0.06, 1.00)
    H.set_identity(
        root,
        category="Doors",
        family="Glass",
        type_name="Storefront 1000mm",
        family_kind="loadable",
        origin="opening-center-floor",
        host="wall",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        "door-glass-storefront.glb",
        {
            "id": "door-glass-storefront",
            "category": "Doors",
            "categoryKo": "문",
            "family": "Glass",
            "familyKo": "유리문",
            "type": "Storefront 1000mm",
            "typeKo": "스토어프론트 1000mm",
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center-floor",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "courseRef": "Doors and Windows — manufacturer / OOTB loadable families",
        },
    )


# ===========================================================================
# WINDOWS  (loadable, wall-hosted)
# Origin: center of opening (x,y=0), vertical center. Width X, height Z, thickness Y.
# ===========================================================================


def _window_frame(col, root, w, h, jam=0.05, depth=0.08):
    parts = [
        H.box(col, M["alum"], "JambL", jam, depth, h, -w / 2 + jam / 2, 0, 0, bevel=0.002),
        H.box(col, M["alum"], "JambR", jam, depth, h, w / 2 - jam / 2, 0, 0, bevel=0.002),
        H.box(col, M["alum"], "Head", w, depth, jam, 0, 0, h / 2 - jam / 2, bevel=0.002),
        H.box(col, M["alum"], "Sill", w + 0.04, depth + 0.04, 0.04, 0, 0.02, -h / 2 + 0.01, bevel=0.002),
    ]
    for o in parts:
        H.parent(o, root)
    return jam


def build_window_fixed(w=1.20, h=1.50, slug="window-fixed-1200x1500", type_en="Fixed 1200 x 1500mm"):
    col = H.reset_collection(f"FAM_{slug.replace('-', '_')}")
    root = _root(col, slug)
    jam = _window_frame(col, root, w, h)
    glass = H.box(col, M["glass"], "Glazing", w - 2 * jam - 0.01, 0.018, h - 2 * jam - 0.01, 0, 0, 0)
    H.parent(glass, root)
    H.set_identity(
        root,
        category="Windows",
        family="Fixed",
        type_name=type_en,
        family_kind="loadable",
        origin="opening-center",
        host="wall",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        f"{slug}.glb",
        {
            "id": slug,
            "category": "Windows",
            "categoryKo": "창",
            "family": "Fixed",
            "familyKo": "고정창",
            "type": type_en,
            "typeKo": type_en.replace("Fixed ", "고정 ").replace(" x ", " × "),
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "courseRef": "Doors and Windows — wall-hosted loadable families",
        },
    )


def build_window_casement():
    w, h = 0.90, 1.20
    col = H.reset_collection("FAM_window_casement")
    root = _root(col, "window-casement-900x1200")
    jam = _window_frame(col, root, w, h)
    sash_w, sash_h = w - 2 * jam - 0.008, h - 2 * jam - 0.008
    sash = H.empty(col, "SashPivot", (-sash_w / 2, -0.02, 0))
    H.parent(sash, root)
    frame_t = 0.04
    H.parent(H.box(col, M["alum"], "SashL", frame_t, 0.05, sash_h, frame_t / 2, 0, 0), sash)
    H.parent(H.box(col, M["alum"], "SashR", frame_t, 0.05, sash_h, sash_w - frame_t / 2, 0, 0), sash)
    H.parent(H.box(col, M["alum"], "SashT", sash_w, 0.05, frame_t, sash_w / 2, 0, sash_h / 2 - frame_t / 2), sash)
    H.parent(H.box(col, M["alum"], "SashB", sash_w, 0.05, frame_t, sash_w / 2, 0, -sash_h / 2 + frame_t / 2), sash)
    H.parent(H.box(col, M["glass"], "SashGlass", sash_w - 2 * frame_t, 0.016, sash_h - 2 * frame_t, sash_w / 2, 0, 0), sash)
    handle = H.box(col, M["chrome"], "Handle", 0.014, 0.04, 0.08, w / 2 - jam - 0.04, -0.05, 0, bevel=0.003)
    H.parent(handle, root)
    H.set_identity(
        root,
        category="Windows",
        family="Casement",
        type_name="Casement 900 x 1200mm",
        family_kind="loadable",
        origin="opening-center",
        host="wall",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        "window-casement-900x1200.glb",
        {
            "id": "window-casement-900x1200",
            "category": "Windows",
            "categoryKo": "창",
            "family": "Casement",
            "familyKo": "여닫이창",
            "type": "Casement 900 x 1200mm",
            "typeKo": "여닫이 900 × 1200mm",
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "swing": "SashPivot rotates about +Z",
            "courseRef": "Doors and Windows — loadable families",
        },
    )


def build_window_sliding():
    w, h = 1.80, 1.50
    col = H.reset_collection("FAM_window_sliding")
    root = _root(col, "window-sliding-1800x1500")
    jam = _window_frame(col, root, w, h, jam=0.05, depth=0.10)
    pane_w = (w - 2 * jam) / 2 + 0.02
    pane_h = h - 2 * jam - 0.01
    for i, (x, y) in enumerate(((-pane_w / 2 + 0.03, -0.02), (pane_w / 2 - 0.03, 0.02))):
        sash = H.empty(col, f"Slider_{i}", (x, y, 0))
        H.parent(sash, root)
        H.parent(H.box(col, M["alum"], f"Sash_{i}", pane_w, 0.04, pane_h, 0, 0, 0, bevel=0.002), sash)
        H.parent(H.box(col, M["glass"], f"Glass_{i}", pane_w - 0.07, 0.014, pane_h - 0.07, 0, 0, 0), sash)
    H.parent(H.box(col, M["alum"], "MeetingRail", 0.03, 0.08, pane_h, 0, 0, 0), root)
    H.set_identity(
        root,
        category="Windows",
        family="Sliding",
        type_name="Sliding 1800 x 1500mm",
        family_kind="loadable",
        origin="opening-center",
        host="wall",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        "window-sliding-1800x1500.glb",
        {
            "id": "window-sliding-1800x1500",
            "category": "Windows",
            "categoryKo": "창",
            "family": "Sliding",
            "familyKo": "미서기창",
            "type": "Sliding 1800 x 1500mm",
            "typeKo": "미서기 1800 × 1500mm",
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "courseRef": "Doors and Windows — loadable families",
        },
    )


def build_window_awning():
    w, h = 0.90, 0.60
    col = H.reset_collection("FAM_window_awning")
    root = _root(col, "window-awning-900x600")
    jam = _window_frame(col, root, w, h, jam=0.045, depth=0.07)
    sash_w, sash_h = w - 2 * jam - 0.008, h - 2 * jam - 0.008
    pivot = H.empty(col, "SashPivot", (0, -0.02, sash_h / 2))
    H.parent(pivot, root)
    H.parent(H.box(col, M["alum"], "Sash", sash_w, 0.045, sash_h, 0, 0, -sash_h / 2, bevel=0.002), pivot)
    H.parent(H.box(col, M["glass"], "Glass", sash_w - 0.07, 0.014, sash_h - 0.07, 0, 0, -sash_h / 2), pivot)
    H.set_identity(
        root,
        category="Windows",
        family="Awning",
        type_name="Awning 900 x 600mm",
        family_kind="loadable",
        origin="opening-center",
        host="wall",
        extras={"widthM": w, "heightM": h},
    )
    return _record(
        col,
        "window-awning-900x600.glb",
        {
            "id": "window-awning-900x600",
            "category": "Windows",
            "categoryKo": "창",
            "family": "Awning",
            "familyKo": "프로젝트창",
            "type": "Awning 900 x 600mm",
            "typeKo": "프로젝트 900 × 600mm",
            "familyKind": "loadable",
            "host": "wall",
            "origin": "opening-center",
            "placement": "hosted",
            "widthM": w,
            "heightM": h,
            "swing": "SashPivot rotates about +X (top-hung)",
            "courseRef": "Doors and Windows — loadable families",
        },
    )


# ===========================================================================
# COLUMNS  (course types: round 450/600, rect 450x600 / 600x750)
# Origin: base centre. Height 1.0 m along Z — scale Z to story height.
# ===========================================================================


def build_column_round(d=0.450, slug="column-struct-round-450"):
    col = H.reset_collection(f"FAM_{slug.replace('-', '_')}")
    root = _root(col, slug)
    r = d / 2
    shaft = H.cyl(col, M["concrete"], "Shaft", r, 1.0, 0, 0, 0.5, verts=32, bevel=0.004)
    base = H.cyl(col, M["concrete"], "Base", r + 0.02, 0.04, 0, 0, 0.02, verts=32)
    cap = H.cyl(col, M["concrete"], "Cap", r + 0.02, 0.04, 0, 0, 0.98, verts=32)
    for o in (shaft, base, cap):
        H.parent(o, root)
    mm = int(d * 1000)
    H.set_identity(
        root,
        category="Structural Columns",
        family="Round Column",
        type_name=f"{mm} mm",
        family_kind="system",
        origin="base-center",
        extras={"diameterM": d, "heightM": 1.0},
    )
    return _record(
        col,
        f"{slug}.glb",
        {
            "id": slug,
            "category": "Structural Columns",
            "categoryKo": "구조 기둥",
            "family": "Round Column",
            "familyKo": "원형 기둥",
            "type": f"{mm} mm",
            "typeKo": f"{mm} mm",
            "familyKind": "system",
            "host": "level",
            "origin": "base-center",
            "placement": "point",
            "scaleAxes": {"z": "height"},
            "diameterM": d,
            "courseRef": "Revit element Hierarchy — Round columns 450 mm / 600 mm",
        },
    )


def build_column_rect(dx=0.450, dy=0.600, slug="column-struct-rect-450x600"):
    col = H.reset_collection(f"FAM_{slug.replace('-', '_')}")
    root = _root(col, slug)
    shaft = H.box(col, M["concrete"], "Shaft", dx, dy, 1.0, 0, 0, 0.5, bevel=0.012)
    base = H.box(col, M["concrete"], "Base", dx + 0.04, dy + 0.04, 0.04, 0, 0, 0.02)
    cap = H.box(col, M["concrete"], "Cap", dx + 0.04, dy + 0.04, 0.04, 0, 0, 0.98)
    for o in (shaft, base, cap):
        H.parent(o, root)
    t = f"{int(dx*1000)}x{int(dy*1000)}mm"
    H.set_identity(
        root,
        category="Structural Columns",
        family="Rectangular Column",
        type_name=t,
        family_kind="system",
        origin="base-center",
        extras={"widthM": dx, "depthM": dy, "heightM": 1.0},
    )
    return _record(
        col,
        f"{slug}.glb",
        {
            "id": slug,
            "category": "Structural Columns",
            "categoryKo": "구조 기둥",
            "family": "Rectangular Column",
            "familyKo": "각형 기둥",
            "type": t,
            "typeKo": t,
            "familyKind": "system",
            "host": "level",
            "origin": "base-center",
            "placement": "point",
            "scaleAxes": {"z": "height"},
            "widthM": dx,
            "depthM": dy,
            "courseRef": "Revit element Hierarchy — Rectangular columns 450x600 / 600x750",
        },
    )


def build_column_arch():
    """Architectural wrap — finishes around a structural core."""
    col = H.reset_collection("FAM_column_arch_400")
    root = _root(col, "column-arch-rect-400")
    core = H.box(col, M["concrete"], "Core", 0.30, 0.30, 1.0, 0, 0, 0.5)
    wrap = H.box(col, M["paint_white"], "Wrap", 0.40, 0.40, 1.0, 0, 0, 0.5, bevel=0.008)
    base = H.box(col, M["paint_white"], "Base", 0.46, 0.46, 0.08, 0, 0, 0.04, bevel=0.006)
    cap = H.box(col, M["paint_white"], "Cap", 0.46, 0.46, 0.08, 0, 0, 0.96, bevel=0.006)
    for o in (core, wrap, base, cap):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Columns",
        family="Rectangular Column",
        type_name="Architectural Wrap 400mm",
        family_kind="system",
        origin="base-center",
        extras={"widthM": 0.40, "depthM": 0.40},
    )
    return _record(
        col,
        "column-arch-rect-400.glb",
        {
            "id": "column-arch-rect-400",
            "category": "Columns",
            "categoryKo": "건축 기둥",
            "family": "Rectangular Column",
            "familyKo": "각형 기둥",
            "type": "Architectural Wrap 400mm",
            "typeKo": "건축 마감 400mm",
            "familyKind": "system",
            "host": "level",
            "origin": "base-center",
            "placement": "point",
            "scaleAxes": {"z": "height"},
            "widthM": 0.40,
            "depthM": 0.40,
            "courseRef": "Columns — architectural column used as wrap around structural",
        },
    )


# ===========================================================================
# FLOORS / ROOFS / CEILINGS  — 1×1 m modules
# ===========================================================================


def _slab_layers(col, root, layers, size=1.0, top_at=0.0):
    """layers exterior/top first. Top face of first layer at z=top_at. Body goes down."""
    z = top_at
    total = 0
    for name, t, mat, fn in layers:
        z -= t / 2.0
        o = H.box(col, mat, name, size, size, t, 0, 0, z)
        o["revit.layerFunction"] = fn
        o["revit.layerThicknessM"] = t
        H.parent(o, root)
        z -= t / 2.0
        total += t
    return total


def build_floor_generic():
    col = H.reset_collection("FAM_floor_generic")
    root = _root(col, "floor-generic-150")
    layers = [
        ("Finish", 0.020, M["ceramic_grey"], "Finish 1"),
        ("Structure", 0.130, M["concrete"], "Structure"),
    ]
    t = _slab_layers(col, root, layers)
    H.set_identity(
        root,
        category="Floors",
        family="Floor",
        type_name="Generic 150mm",
        family_kind="system",
        origin="center-top",
        extras={"thicknessM": t},
    )
    return _record(
        col,
        "floor-generic-150.glb",
        {
            "id": "floor-generic-150",
            "category": "Floors",
            "categoryKo": "바닥",
            "family": "Floor",
            "familyKo": "바닥",
            "type": "Generic 150mm",
            "typeKo": "일반 150mm",
            "familyKind": "system",
            "host": "level",
            "origin": "center-top",
            "placement": "sketch-boundary",
            "scaleAxes": {"x": "width", "y": "depth", "z": "fixed-thickness"},
            "thicknessM": t,
            "courseRef": "Sketch-Based Modeling — Floors; construction layers + functions",
        },
    )


def build_floor_concrete():
    col = H.reset_collection("FAM_floor_concrete")
    root = _root(col, "floor-concrete-200")
    layers = [
        ("Screed", 0.040, M["concrete"], "Finish 1"),
        ("Membrane", 0.005, M["membrane"], "Membrane Layer"),
        ("Insulation", 0.030, M["insulation"], "Thermal/Air Layer"),
        ("Structure", 0.125, M["concrete_rough"], "Structure"),
    ]
    t = _slab_layers(col, root, layers)
    H.set_identity(
        root,
        category="Floors",
        family="Floor",
        type_name="Concrete 200mm",
        family_kind="system",
        origin="center-top",
        extras={"thicknessM": t},
    )
    return _record(
        col,
        "floor-concrete-200.glb",
        {
            "id": "floor-concrete-200",
            "category": "Floors",
            "categoryKo": "바닥",
            "family": "Floor",
            "familyKo": "바닥",
            "type": "Concrete 200mm",
            "typeKo": "콘크리트 200mm",
            "familyKind": "system",
            "host": "level",
            "origin": "center-top",
            "placement": "sketch-boundary",
            "thicknessM": t,
            "courseRef": "Floors — Structure / Substrate / Thermal / Finish functions",
        },
    )


def build_floor_wood():
    col = H.reset_collection("FAM_floor_wood")
    root = _root(col, "floor-wood-finish")
    layers = [
        ("Finish_Wood", 0.018, M["wood"], "Finish 1"),
        ("Substrate", 0.018, M["wood_dark"], "Substrate"),
        ("Structure", 0.150, M["concrete"], "Structure"),
    ]
    t = _slab_layers(col, root, layers)
    # plank grooves
    for i in range(4):
        g = H.box(col, M["wood_dark"], f"Groove_{i}", 0.002, 1.0, 0.002, -0.375 + i * 0.25, 0, 0.001)
        H.parent(g, root)
    H.set_identity(
        root,
        category="Floors",
        family="Floor",
        type_name="Wood Finish 186mm",
        family_kind="system",
        origin="center-top",
        extras={"thicknessM": t},
    )
    return _record(
        col,
        "floor-wood-finish.glb",
        {
            "id": "floor-wood-finish",
            "category": "Floors",
            "categoryKo": "바닥",
            "family": "Floor",
            "familyKo": "바닥",
            "type": "Wood Finish 186mm",
            "typeKo": "목재 마감 186mm",
            "familyKind": "system",
            "host": "level",
            "origin": "center-top",
            "placement": "sketch-boundary",
            "thicknessM": t,
            "courseRef": "Floors — construction layers with materials and functions",
        },
    )


def build_roof_flat():
    col = H.reset_collection("FAM_roof_flat")
    root = _root(col, "roof-basic-flat")
    # sits on walls: bottom of structure at z=0, body +Z
    struct = H.box(col, M["concrete"], "Structure", 1.0, 1.0, 0.150, 0, 0, 0.075)
    insul = H.box(col, M["insulation"], "Thermal", 1.0, 1.0, 0.080, 0, 0, 0.190)
    mem = H.box(col, M["roof_flat"], "Membrane", 1.0, 1.0, 0.010, 0, 0, 0.235)
    for o in (struct, insul, mem):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Roofs",
        family="Basic Roof",
        type_name="Warm Roof – Flat",
        family_kind="system",
        origin="center-bottom",
        extras={"thicknessM": 0.240},
    )
    return _record(
        col,
        "roof-basic-flat.glb",
        {
            "id": "roof-basic-flat",
            "category": "Roofs",
            "categoryKo": "지붕",
            "family": "Basic Roof",
            "familyKo": "기본 지붕",
            "type": "Warm Roof – Flat",
            "typeKo": "평지붕",
            "familyKind": "system",
            "host": "level",
            "origin": "center-bottom",
            "placement": "sketch-footprint",
            "thicknessM": 0.240,
            "courseRef": "Roofs — Roof by Footprint (typically sloped; flat type included)",
        },
    )


def build_roof_pitched():
    """1 m × 1 m single-slope module, 30° — Roof by Footprint with slope arrow."""
    col = H.reset_collection("FAM_roof_pitched")
    root = _root(col, "roof-pitched-module")
    angle = math.radians(30)
    # slab then rotate about X so it rises in +Y
    deck = H.box(col, M["wood"], "Deck", 1.0, 1.15, 0.018, 0, 0.0, 0.0)
    deck.rotation_euler = (angle, 0, 0)
    tiles = H.box(col, M["roof_tile"], "Tiles", 1.0, 1.15, 0.022, 0, 0.0, 0.022)
    tiles.rotation_euler = (angle, 0, 0)
    battens = H.box(col, M["wood_dark"], "Battens", 1.0, 1.15, 0.012, 0, 0.0, -0.016)
    battens.rotation_euler = (angle, 0, 0)
    for o in (deck, tiles, battens):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Roofs",
        family="Basic Roof",
        type_name="Pitched 30° Tile",
        family_kind="system",
        origin="eave-center",
        extras={"slopeDeg": 30},
    )
    return _record(
        col,
        "roof-pitched-module.glb",
        {
            "id": "roof-pitched-module",
            "category": "Roofs",
            "categoryKo": "지붕",
            "family": "Basic Roof",
            "familyKo": "기본 지붕",
            "type": "Pitched 30° Tile",
            "typeKo": "경사 30° 기와",
            "familyKind": "system",
            "host": "level",
            "origin": "eave-center",
            "placement": "sketch-footprint",
            "slopeDeg": 30,
            "courseRef": "Roofs — Footprint roof with slope; Roof by Extrusion for vertical profiles",
        },
    )


def build_ceiling_gypsum():
    col = H.reset_collection("FAM_ceiling_gyp")
    root = _root(col, "ceiling-generic-gypsum")
    # work plane at z=0, body hangs -Z (down)
    board = H.box(col, M["gypsum"], "Board", 1.0, 1.0, 0.015, 0, 0, -0.0075)
    grid = H.box(col, M["metal"], "Furring", 1.0, 1.0, 0.025, 0, 0, -0.028)
    for o in (board, grid):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Ceilings",
        family="Compound Ceiling",
        type_name="Gypsum 15mm",
        family_kind="system",
        origin="center-top",
        extras={"thicknessM": 0.040},
    )
    return _record(
        col,
        "ceiling-generic-gypsum.glb",
        {
            "id": "ceiling-generic-gypsum",
            "category": "Ceilings",
            "categoryKo": "천장",
            "family": "Compound Ceiling",
            "familyKo": "복합 천장",
            "type": "Gypsum 15mm",
            "typeKo": "석고 15mm",
            "familyKind": "system",
            "host": "level",
            "origin": "center-top",
            "placement": "sketch-or-auto",
            "thicknessM": 0.040,
            "courseRef": "Ceilings and Lights — Auto-Ceiling / sketched ceiling",
        },
    )


def build_ceiling_acoustic():
    col = H.reset_collection("FAM_ceiling_acoustic")
    root = _root(col, "ceiling-acoustic-tile")
    # 600 mm tile grid represented on a 1.2 × 1.2 module (2×2 tiles)
    size = 1.2
    tee = 0.024
    tile = 0.015
    # T-bar grid
    for i in range(3):
        x = -size / 2 + i * 0.6
        H.parent(H.box(col, M["alum"], f"TeeX_{i}", tee, size, 0.03, x, 0, -0.015), root)
        H.parent(H.box(col, M["alum"], f"TeeY_{i}", size, tee, 0.03, 0, x, -0.015), root)
    for ix in range(2):
        for iy in range(2):
            cx = -0.3 + ix * 0.6
            cy = -0.3 + iy * 0.6
            H.parent(H.box(col, M["acoustic"], f"Tile_{ix}{iy}", 0.56, 0.56, tile, cx, cy, -0.038), root)
    H.set_identity(
        root,
        category="Ceilings",
        family="Compound Ceiling",
        type_name="600 x 600mm Acoustic",
        family_kind="system",
        origin="center-top",
        extras={"moduleM": 0.6},
    )
    return _record(
        col,
        "ceiling-acoustic-tile.glb",
        {
            "id": "ceiling-acoustic-tile",
            "category": "Ceilings",
            "categoryKo": "천장",
            "family": "Compound Ceiling",
            "familyKo": "복합 천장",
            "type": "600 x 600mm Acoustic",
            "typeKo": "600 × 600mm 흡음",
            "familyKind": "system",
            "host": "level",
            "origin": "center-top",
            "placement": "sketch-or-auto",
            "moduleM": 0.6,
            "courseRef": "Ceilings and Lights — ceiling as host for lighting fixtures",
        },
    )


# ===========================================================================
# STAIRS / RAILINGS / RAMP
# ===========================================================================


def build_stair_run():
    """Straight run: 8 risers @ 175 mm, treads 280 mm, width 1.2 m. Origin first riser nosing."""
    col = H.reset_collection("FAM_stair_run")
    root = _root(col, "stair-run-8riser")
    riser, tread, n, width = 0.175, 0.280, 8, 1.20
    # stringers
    run_len = n * tread
    rise = n * riser
    for side in (-width / 2 + 0.02, width / 2 - 0.02):
        st = H.box(col, M["wood"], f"Stringer_{side}", 0.04, run_len + 0.04, rise + 0.04, side, run_len / 2, rise / 2)
        st.rotation_euler = (math.atan(rise / run_len), 0, 0)
        H.parent(st, root)
    for i in range(n):
        y = (i + 0.5) * tread
        z_r = i * riser + riser / 2
        z_t = (i + 1) * riser + 0.015
        rv = H.box(col, M["wood_dark"], f"Riser_{i}", width - 0.06, 0.022, riser, 0, i * tread + 0.011, z_r)
        tv = H.box(col, M["wood"], f"Tread_{i}", width - 0.04, tread + 0.02, 0.030, 0, y + 0.01, z_t, bevel=0.003)
        H.parent(rv, root)
        H.parent(tv, root)
    H.set_identity(
        root,
        category="Stairs",
        family="Assembled Stair",
        type_name="8 Riser 175/280",
        family_kind="system",
        origin="first-riser-nosing",
        extras={"riserM": riser, "treadM": tread, "risers": n, "widthM": width},
    )
    return _record(
        col,
        "stair-run-8riser.glb",
        {
            "id": "stair-run-8riser",
            "category": "Stairs",
            "categoryKo": "계단",
            "family": "Assembled Stair",
            "familyKo": "조립식 계단",
            "type": "8 Riser 175/280",
            "typeKo": "8단 175/280",
            "familyKind": "system",
            "host": "level-to-level",
            "origin": "first-riser-nosing",
            "placement": "component-run",
            "riserM": riser,
            "treadM": tread,
            "risers": n,
            "widthM": width,
            "courseRef": "Stairs by Component — max riser / min tread; Revit computes riser count",
        },
    )


def build_stair_landing():
    col = H.reset_collection("FAM_stair_landing")
    root = _root(col, "stair-landing-1200")
    slab = H.box(col, M["concrete"], "LandingSlab", 1.20, 1.20, 0.15, 0, 0, -0.075)
    finish = H.box(col, M["wood"], "Finish", 1.20, 1.20, 0.02, 0, 0, 0.01)
    nosing = H.box(col, M["wood_dark"], "Nosing", 1.20, 0.03, 0.03, 0, -0.60, 0.005, bevel=0.004)
    for o in (slab, finish, nosing):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Stairs",
        family="Stair Landing",
        type_name="1200 x 1200mm",
        family_kind="system",
        origin="center-top",
        extras={"widthM": 1.2},
    )
    return _record(
        col,
        "stair-landing-1200.glb",
        {
            "id": "stair-landing-1200",
            "category": "Stairs",
            "categoryKo": "계단",
            "family": "Stair Landing",
            "familyKo": "계단참",
            "type": "1200 x 1200mm",
            "typeKo": "1200 × 1200mm",
            "familyKind": "system",
            "host": "stair",
            "origin": "center-top",
            "placement": "component-landing",
            "courseRef": "Stairs by Component — Revit models landings from run clicks",
        },
    )


def build_railing():
    col = H.reset_collection("FAM_railing_1m")
    root = _root(col, "railing-guard-1m")
    # 1 m module along +X, posts at 0 and 1
    for x, name in ((0.0, "Post0"), (1.0, "Post1")):
        post = H.box(col, M["steel"], name, 0.04, 0.04, 1.10, x, 0, 0.55, bevel=0.003)
        H.parent(post, root)
    top = H.cyl(col, M["steel"], "TopRail", 0.018, 1.04, 0.5, 0, 1.08, axis="X", verts=12)
    mid = H.cyl(col, M["steel"], "MidRail", 0.012, 1.04, 0.5, 0, 0.55, axis="X", verts=10)
    bot = H.box(col, M["steel"], "BotRail", 1.0, 0.02, 0.02, 0.5, 0, 0.08)
    H.parent(top, root)
    H.parent(mid, root)
    H.parent(bot, root)
    for i in range(1, 5):
        x = i * 0.2
        b = H.box(col, M["steel"], f"Baluster_{i}", 0.012, 0.012, 0.96, x, 0, 0.56)
        H.parent(b, root)
    H.set_identity(
        root,
        category="Railings",
        family="Guardrail",
        type_name="1100mm Pipe",
        family_kind="system",
        origin="start-base",
        extras={"heightM": 1.10, "lengthM": 1.0},
    )
    return _record(
        col,
        "railing-guard-1m.glb",
        {
            "id": "railing-guard-1m",
            "category": "Railings",
            "categoryKo": "난간",
            "family": "Guardrail",
            "familyKo": "난간",
            "type": "1100mm Pipe",
            "typeKo": "1100mm 파이프",
            "familyKind": "system",
            "host": "stair-or-floor",
            "origin": "start-base",
            "placement": "sketch",
            "scaleAxes": {"x": "length"},
            "heightM": 1.10,
            "courseRef": "Stairs and Railings — railings placed automatically on stairs; also on floors",
        },
    )


def build_handrail():
    col = H.reset_collection("FAM_handrail_1m")
    root = _root(col, "railing-handrail-1m")
    rail = H.cyl(col, M["wood"], "Handrail", 0.022, 1.0, 0.5, 0, 0.90, axis="X", verts=14)
    for x in (0.15, 0.85):
        br = H.cyl(col, M["steel"], f"Bracket_{x}", 0.010, 0.08, x, 0.04, 0.90, axis="Y", verts=10)
        plate = H.box(col, M["steel"], f"Plate_{x}", 0.06, 0.006, 0.06, x, 0.08, 0.90)
        H.parent(br, root)
        H.parent(plate, root)
    H.parent(rail, root)
    H.set_identity(
        root,
        category="Railings",
        family="Handrail",
        type_name="Circular 42mm",
        family_kind="system",
        origin="start-mount",
        extras={"heightM": 0.90},
    )
    return _record(
        col,
        "railing-handrail-1m.glb",
        {
            "id": "railing-handrail-1m",
            "category": "Railings",
            "categoryKo": "난간",
            "family": "Handrail",
            "familyKo": "손스침",
            "type": "Circular 42mm",
            "typeKo": "원형 42mm",
            "familyKind": "system",
            "host": "wall-or-stair",
            "origin": "start-mount",
            "placement": "sketch",
            "scaleAxes": {"x": "length"},
            "courseRef": "Railings — handrails on floors and stairs",
        },
    )


def build_ramp():
    col = H.reset_collection("FAM_ramp")
    root = _root(col, "ramp-module")
    # 1:12 slope, 1.2 m wide, 1.8 m run → 0.15 m rise
    run, width, rise = 1.80, 1.20, 0.15
    slab = H.box(col, M["concrete"], "RampSlab", width, run + 0.05, 0.15, 0, run / 2, 0)
    slab.rotation_euler = (math.atan(rise / run), 0, 0)
    H.parent(slab, root)
    for side in (-width / 2 + 0.03, width / 2 - 0.03):
        curb = H.box(col, M["concrete"], f"Curb_{side}", 0.06, run, 0.10, side, run / 2, 0.08)
        curb.rotation_euler = (math.atan(rise / run), 0, 0)
        H.parent(curb, root)
    H.set_identity(
        root,
        category="Ramps",
        family="Ramp",
        type_name="1:12 Concrete",
        family_kind="system",
        origin="bottom-center",
        extras={"slope": "1:12", "widthM": width},
    )
    return _record(
        col,
        "ramp-module.glb",
        {
            "id": "ramp-module",
            "category": "Ramps",
            "categoryKo": "램프",
            "family": "Ramp",
            "familyKo": "램프",
            "type": "1:12 Concrete",
            "typeKo": "1:12 콘크리트",
            "familyKind": "system",
            "host": "level",
            "origin": "bottom-center",
            "placement": "sketch",
            "slope": "1:12",
            "widthM": width,
            "courseRef": "Architecture tab companion to stairs (sketch-based)",
        },
    )


# ===========================================================================
# LIGHTING  (ceiling-hosted loadable)
# Origin: ceiling plane, fixture hangs -Z
# ===========================================================================


def build_light_troffer():
    col = H.reset_collection("FAM_light_troffer")
    root = _root(col, "light-troffer-600")
    housing = H.box(col, M["metal"], "Housing", 0.595, 0.595, 0.08, 0, 0, -0.04, bevel=0.004)
    lens = H.box(col, M["plastic_white"], "Lens", 0.54, 0.54, 0.008, 0, 0, -0.082)
    glow = H.box(col, M["emissive"], "Lamp", 0.50, 0.50, 0.006, 0, 0, -0.078)
    for o in (housing, lens, glow):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Lighting Fixtures",
        family="Troffer",
        type_name="LED 600 x 600mm",
        family_kind="loadable",
        origin="ceiling-plane",
        host="ceiling",
    )
    return _record(
        col,
        "light-troffer-600.glb",
        {
            "id": "light-troffer-600",
            "category": "Lighting Fixtures",
            "categoryKo": "조명 기구",
            "family": "Troffer",
            "familyKo": "매립등",
            "type": "LED 600 x 600mm",
            "typeKo": "LED 600 × 600mm",
            "familyKind": "loadable",
            "host": "ceiling",
            "origin": "ceiling-plane",
            "placement": "hosted",
            "courseRef": "Ceilings and Lights — ceiling-hosted lighting fixtures",
        },
    )


def build_light_pendant():
    col = H.reset_collection("FAM_light_pendant")
    root = _root(col, "light-pendant")
    canopy = H.cyl(col, M["metal_dark"], "Canopy", 0.06, 0.018, 0, 0, -0.01, verts=16)
    cord = H.cyl(col, M["plastic"], "Cord", 0.004, 0.55, 0, 0, -0.29, verts=8)
    shade = H.cyl(col, M["metal"], "Shade", 0.16, 0.12, 0, 0, -0.62, r2=0.22, verts=24, bevel=0.004)
    lamp = H.sph(col, M["emissive"], "Lamp", 0.045, 0, 0, -0.62, seg=12)
    for o in (canopy, cord, shade, lamp):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Lighting Fixtures",
        family="Pendant Light",
        type_name="Dome 400mm",
        family_kind="loadable",
        origin="ceiling-plane",
        host="ceiling",
    )
    return _record(
        col,
        "light-pendant.glb",
        {
            "id": "light-pendant",
            "category": "Lighting Fixtures",
            "categoryKo": "조명 기구",
            "family": "Pendant Light",
            "familyKo": "펜던트",
            "type": "Dome 400mm",
            "typeKo": "돔 400mm",
            "familyKind": "loadable",
            "host": "ceiling",
            "origin": "ceiling-plane",
            "placement": "hosted",
            "courseRef": "Ceilings and Lights — load lighting families onto a ceiling",
        },
    )


def build_light_downlight():
    col = H.reset_collection("FAM_light_down")
    root = _root(col, "light-downlight")
    ring = H.cyl(col, M["alum"], "Trim", 0.055, 0.008, 0, 0, -0.004, verts=20)
    can = H.cyl(col, M["metal_dark"], "Can", 0.045, 0.09, 0, 0, 0.04, verts=16)
    lamp = H.cyl(col, M["emissive"], "Lamp", 0.032, 0.01, 0, 0, -0.006, verts=16)
    for o in (ring, can, lamp):
        H.parent(o, root)
    H.set_identity(
        root,
        category="Lighting Fixtures",
        family="Downlight",
        type_name="Recessed 90mm",
        family_kind="loadable",
        origin="ceiling-plane",
        host="ceiling",
    )
    return _record(
        col,
        "light-downlight.glb",
        {
            "id": "light-downlight",
            "category": "Lighting Fixtures",
            "categoryKo": "조명 기구",
            "family": "Downlight",
            "familyKo": "다운라이트",
            "type": "Recessed 90mm",
            "typeKo": "매립 90mm",
            "familyKind": "loadable",
            "host": "ceiling",
            "origin": "ceiling-plane",
            "placement": "hosted",
            "courseRef": "Ceilings and Lights — ceiling-hosted fixture",
        },
    )


# ===========================================================================
# FURNITURE / PLUMBING / PLANTING  (loadable components)
# Origin: base centre, facing -Y
# ===========================================================================


def build_desk():
    col = H.reset_collection("FAM_desk")
    root = _root(col, "furniture-desk")
    top = H.box(col, M["wood"], "Top", 1.40, 0.70, 0.028, 0, 0, 0.736, bevel=0.004)
    for x, y in ((-0.64, -0.30), (0.64, -0.30), (-0.64, 0.30), (0.64, 0.30)):
        H.parent(H.box(col, M["metal_dark"], f"Leg_{x}_{y}", 0.04, 0.04, 0.72, x, y, 0.36, bevel=0.003), root)
    ped = H.box(col, M["wood_dark"], "Pedestal", 0.38, 0.58, 0.58, 0.46, 0, 0.31, bevel=0.004)
    for i, z in enumerate((0.18, 0.36, 0.54)):
        H.parent(H.box(col, M["metal"], f"Drawer_{i}", 0.36, 0.54, 0.02, 0.46, 0.01, z), root)
    H.parent(top, root)
    H.parent(ped, root)
    H.set_identity(root, category="Furniture", family="Desk", type_name="1400 x 700mm", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "furniture-desk.glb",
        {
            "id": "furniture-desk",
            "category": "Furniture",
            "categoryKo": "가구",
            "family": "Desk",
            "familyKo": "책상",
            "type": "1400 x 700mm",
            "typeKo": "1400 × 700mm",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Furniture via Component / Load Family",
        },
    )


def build_chair():
    col = H.reset_collection("FAM_chair")
    root = _root(col, "furniture-task-chair")
    seat = H.box(col, M["fabric"], "Seat", 0.46, 0.46, 0.05, 0, 0, 0.46, bevel=0.01)
    back = H.box(col, M["fabric"], "Back", 0.44, 0.06, 0.48, 0, 0.20, 0.78, bevel=0.01)
    hub = H.cyl(col, M["chrome"], "Hub", 0.04, 0.12, 0, 0, 0.38, verts=12)
    for i in range(5):
        a = i * 2 * math.pi / 5
        x, y = math.cos(a) * 0.28, math.sin(a) * 0.28
        H.parent(H.box(col, M["chrome"], f"Spoke_{i}", 0.28, 0.03, 0.02, x / 2, y / 2, 0.08, rz=math.degrees(a)), root)
        H.parent(H.sph(col, M["rubber"], f"Caster_{i}", 0.028, x, y, 0.028, seg=10), root)
    H.parent(H.cyl(col, M["chrome"], "Column", 0.025, 0.28, 0, 0, 0.24, verts=10), root)
    for o in (seat, back, hub):
        H.parent(o, root)
    H.set_identity(root, category="Furniture", family="Chair", type_name="Task Chair", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "furniture-task-chair.glb",
        {
            "id": "furniture-task-chair",
            "category": "Furniture",
            "categoryKo": "가구",
            "family": "Chair",
            "familyKo": "의자",
            "type": "Task Chair",
            "typeKo": "사무용 의자",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Furniture",
        },
    )


def build_sofa():
    col = H.reset_collection("FAM_sofa")
    root = _root(col, "furniture-sofa-2seat")
    base = H.box(col, M["wood_dark"], "Base", 1.60, 0.78, 0.12, 0, 0, 0.06, bevel=0.006)
    seat = H.box(col, M["fabric_warm"], "Seat", 1.52, 0.68, 0.16, 0, 0.02, 0.20, bevel=0.02)
    back = H.box(col, M["fabric_warm"], "Back", 1.52, 0.16, 0.42, 0, 0.28, 0.45, bevel=0.02)
    for x, name in ((-0.74, "ArmL"), (0.74, "ArmR")):
        H.parent(H.box(col, M["fabric_warm"], name, 0.12, 0.78, 0.38, x, 0, 0.31, bevel=0.016), root)
    for x in (-0.36, 0.36):
        H.parent(H.box(col, M["fabric"], f"Cush_{x}", 0.68, 0.18, 0.32, x, 0.22, 0.52, bevel=0.02), root)
    for o in (base, seat, back):
        H.parent(o, root)
    H.set_identity(root, category="Furniture", family="Sofa", type_name="2-Seat", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "furniture-sofa-2seat.glb",
        {
            "id": "furniture-sofa-2seat",
            "category": "Furniture",
            "categoryKo": "가구",
            "family": "Sofa",
            "familyKo": "소파",
            "type": "2-Seat",
            "typeKo": "2인용",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Furniture",
        },
    )


def build_table():
    col = H.reset_collection("FAM_table")
    root = _root(col, "furniture-dining-table")
    top = H.cyl(col, M["wood"], "Top", 0.60, 0.032, 0, 0, 0.736, verts=32, bevel=0.004)
    apron = H.cyl(col, M["wood_dark"], "Apron", 0.52, 0.05, 0, 0, 0.705, verts=24)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        H.parent(H.box(col, M["wood"], f"Leg_{i}", 0.045, 0.045, 0.70, math.cos(a) * 0.38, math.sin(a) * 0.38, 0.35, bevel=0.004), root)
    H.parent(top, root)
    H.parent(apron, root)
    H.set_identity(root, category="Furniture", family="Table", type_name="Round 1200mm", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "furniture-dining-table.glb",
        {
            "id": "furniture-dining-table",
            "category": "Furniture",
            "categoryKo": "가구",
            "family": "Table",
            "familyKo": "테이블",
            "type": "Round 1200mm",
            "typeKo": "원형 1200mm",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Furniture",
        },
    )


def build_bed():
    col = H.reset_collection("FAM_bed")
    root = _root(col, "furniture-bed-queen")
    frame = H.box(col, M["wood_dark"], "Frame", 1.60, 2.10, 0.18, 0, 0, 0.15, bevel=0.006)
    mattress = H.box(col, M["fabric"], "Mattress", 1.52, 2.00, 0.22, 0, 0, 0.36, bevel=0.02)
    head = H.box(col, M["wood"], "Headboard", 1.64, 0.06, 0.70, 0, 1.02, 0.50, bevel=0.008)
    for x in (-0.38, 0.38):
        H.parent(H.box(col, M["fabric"], f"Pillow_{x}", 0.52, 0.28, 0.12, x, 0.78, 0.52, bevel=0.03), root)
    for o in (frame, mattress, head):
        H.parent(o, root)
    H.set_identity(root, category="Furniture", family="Bed", type_name="Queen 1600mm", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "furniture-bed-queen.glb",
        {
            "id": "furniture-bed-queen",
            "category": "Furniture",
            "categoryKo": "가구",
            "family": "Bed",
            "familyKo": "침대",
            "type": "Queen 1600mm",
            "typeKo": "퀸 1600mm",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Furniture",
        },
    )


def build_toilet():
    col = H.reset_collection("FAM_toilet")
    root = _root(col, "plumbing-toilet")
    bowl = H.cyl(col, M["ceramic"], "Bowl", 0.18, 0.22, 0, -0.04, 0.32, r2=0.22, verts=24, bevel=0.008)
    trap = H.box(col, M["ceramic"], "Trap", 0.22, 0.28, 0.18, 0, 0.06, 0.12, bevel=0.02)
    seat = H.cyl(col, M["plastic_white"], "Seat", 0.19, 0.022, 0, -0.05, 0.44, verts=20)
    lid = H.cyl(col, M["plastic_white"], "Lid", 0.19, 0.018, 0, 0.02, 0.46, verts=20)
    tank = H.box(col, M["ceramic"], "Tank", 0.38, 0.16, 0.38, 0, 0.22, 0.62, bevel=0.012)
    button = H.cyl(col, M["chrome"], "Flush", 0.03, 0.01, 0, 0.22, 0.815, verts=12)
    for o in (bowl, trap, seat, lid, tank, button):
        H.parent(o, root)
    H.set_identity(root, category="Plumbing Fixtures", family="Toilet", type_name="Floor Mounted", family_kind="loadable", origin="base-center", host="level")
    return _record(
        col,
        "plumbing-toilet.glb",
        {
            "id": "plumbing-toilet",
            "category": "Plumbing Fixtures",
            "categoryKo": "위생기구",
            "family": "Toilet",
            "familyKo": "변기",
            "type": "Floor Mounted",
            "typeKo": "바닥 설치",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Plumbing Fixtures from OOTB library",
        },
    )


def build_lavatory():
    col = H.reset_collection("FAM_lavatory")
    root = _root(col, "plumbing-lavatory")
    basin = H.box(col, M["ceramic"], "Basin", 0.56, 0.42, 0.06, 0, 0, 0.82, bevel=0.016)
    bowl = H.cyl(col, M["ceramic"], "Bowl", 0.18, 0.10, 0, 0, 0.76, r2=0.14, verts=20)
    pedestal = H.cyl(col, M["ceramic"], "Pedestal", 0.12, 0.72, 0, 0, 0.36, r2=0.10, verts=16)
    spout = H.cyl(col, M["chrome"], "Spout", 0.014, 0.14, 0, 0.10, 0.90, axis="Y", verts=10)
    H.parent(H.cyl(col, M["chrome"], "SpoutUp", 0.014, 0.10, 0, 0.16, 0.88, verts=10), root)
    for x in (-0.06, 0.06):
        H.parent(H.cyl(col, M["chrome"], f"Handle_{x}", 0.016, 0.04, x, 0.14, 0.88, verts=10), root)
    for o in (basin, bowl, pedestal, spout):
        H.parent(o, root)
    H.set_identity(root, category="Plumbing Fixtures", family="Lavatory", type_name="Pedestal", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "plumbing-lavatory.glb",
        {
            "id": "plumbing-lavatory",
            "category": "Plumbing Fixtures",
            "categoryKo": "위생기구",
            "family": "Lavatory",
            "familyKo": "세면기",
            "type": "Pedestal",
            "typeKo": "페데스탈",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Plumbing Fixtures",
        },
    )


def build_sink():
    col = H.reset_collection("FAM_sink")
    root = _root(col, "plumbing-kitchen-sink")
    top = H.box(col, M["metal"], "CounterCut", 0.80, 0.50, 0.04, 0, 0, 0.90, bevel=0.004)
    bowl = H.box(col, M["metal"], "Bowl", 0.62, 0.38, 0.18, 0, 0, 0.80, bevel=0.01)
    spout = H.cyl(col, M["chrome"], "Spout", 0.016, 0.22, 0, 0.14, 1.02, axis="Y", verts=10)
    H.parent(H.cyl(col, M["chrome"], "SpoutNeck", 0.016, 0.16, 0, 0.20, 1.08, verts=10), root)
    H.parent(H.cyl(col, M["chrome"], "Aerator", 0.012, 0.02, 0, 0.08, 0.98, verts=8), root)
    for o in (top, bowl, spout):
        H.parent(o, root)
    H.set_identity(root, category="Plumbing Fixtures", family="Sink", type_name="Single Bowl 800mm", family_kind="loadable", origin="base-center")
    return _record(
        col,
        "plumbing-kitchen-sink.glb",
        {
            "id": "plumbing-kitchen-sink",
            "category": "Plumbing Fixtures",
            "categoryKo": "위생기구",
            "family": "Sink",
            "familyKo": "싱크",
            "type": "Single Bowl 800mm",
            "typeKo": "싱글볼 800mm",
            "familyKind": "loadable",
            "host": "level",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "Other Components — Plumbing Fixtures",
        },
    )


def build_tree():
    col = H.reset_collection("FAM_tree")
    root = _root(col, "planting-tree-deciduous")
    trunk = H.cyl(col, M["bark"], "Trunk", 0.12, 1.6, 0, 0, 0.80, r2=0.07, verts=12)
    for i, (x, y, z, r) in enumerate(
        ((0, 0, 2.1, 0.85), (0.45, 0.15, 1.85, 0.55), (-0.4, -0.2, 1.9, 0.50), (0.1, -0.45, 2.25, 0.48), (-0.15, 0.4, 2.3, 0.46))
    ):
        H.parent(H.sph(col, M["leaf"] if i % 2 == 0 else M["leaf_dark"], f"Canopy_{i}", r, x, y, z, seg=12), root)
    H.parent(trunk, root)
    H.set_identity(root, category="Planting", family="RPC Tree", type_name="Deciduous", family_kind="loadable", origin="base-center", host="toposurface")
    return _record(
        col,
        "planting-tree-deciduous.glb",
        {
            "id": "planting-tree-deciduous",
            "category": "Planting",
            "categoryKo": "식재",
            "family": "RPC Tree",
            "familyKo": "수목",
            "type": "Deciduous",
            "typeKo": "낙엽수",
            "familyKind": "loadable",
            "host": "toposurface",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "The Site — Planting families sit on toposurface; RPC prefix in OOTB library",
        },
    )


def build_shrub():
    col = H.reset_collection("FAM_shrub")
    root = _root(col, "planting-shrub")
    H.parent(H.cyl(col, M["bark"], "Stem", 0.03, 0.25, 0, 0, 0.12, verts=8), root)
    for i, (x, y, z, r) in enumerate(((0, 0, 0.45, 0.32), (0.18, 0.1, 0.38, 0.22), (-0.16, -0.08, 0.40, 0.20), (0.05, -0.18, 0.50, 0.18))):
        H.parent(H.sph(col, M["leaf_dark"] if i else M["leaf"], f"Foliage_{i}", r, x, y, z, seg=10), root)
    H.set_identity(root, category="Planting", family="RPC Shrub", type_name="Generic", family_kind="loadable", origin="base-center", host="toposurface")
    return _record(
        col,
        "planting-shrub.glb",
        {
            "id": "planting-shrub",
            "category": "Planting",
            "categoryKo": "식재",
            "family": "RPC Shrub",
            "familyKo": "관목",
            "type": "Generic",
            "typeKo": "일반",
            "familyKind": "loadable",
            "host": "toposurface",
            "origin": "base-center",
            "placement": "component",
            "courseRef": "The Site — Planting on toposurface",
        },
    )


# ===========================================================================
# Packs + runner
# ===========================================================================

PACKS = {
    "walls": [
        build_wall_generic,
        build_wall_brick_cmu,
        build_wall_cmu_insulated,
        build_wall_partition,
        build_wall_stacked,
        build_curtain_mullion,
        build_curtain_panel_glazed,
        build_curtain_wall_assembly,
    ],
    "openings": [
        lambda: build_door_single(0.910, 2.100, "door-single-flush-910", "Generic 910mm", "일반 910mm"),
        lambda: build_door_single(0.810, 2.100, "door-single-flush-810", "Generic 810mm", "일반 810mm"),
        build_door_double,
        build_door_glass,
        build_window_fixed,
        build_window_casement,
        build_window_sliding,
        build_window_awning,
    ],
    "structure": [
        lambda: build_column_round(0.450, "column-struct-round-450"),
        lambda: build_column_round(0.600, "column-struct-round-600"),
        lambda: build_column_rect(0.450, 0.600, "column-struct-rect-450x600"),
        lambda: build_column_rect(0.600, 0.750, "column-struct-rect-600x750"),
        build_column_arch,
    ],
    "sketch": [
        build_floor_generic,
        build_floor_concrete,
        build_floor_wood,
        build_roof_flat,
        build_roof_pitched,
        build_ceiling_gypsum,
        build_ceiling_acoustic,
        build_stair_run,
        build_stair_landing,
        build_railing,
        build_handrail,
        build_ramp,
    ],
    "components": [
        build_light_troffer,
        build_light_pendant,
        build_light_downlight,
        build_desk,
        build_chair,
        build_sofa,
        build_table,
        build_bed,
        build_toilet,
        build_lavatory,
        build_sink,
        build_tree,
        build_shrub,
    ],
}


def write_catalog():
    os.makedirs(H.ASSET_DIR, exist_ok=True)
    payload = {
        "version": 1,
        "source": "Universidad Europea Revit Basic Course (García / Martínez, 2014) + BIM authoring identity",
        "units": "metres",
        "blender": "5.2 Z-up",
        "gltf": "Y-up, export_yup=True",
        "count": len(CATALOG),
        "families": CATALOG,
    }
    with open(H.CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"catalog written: {H.CATALOG_PATH} ({len(CATALOG)} families)")
    return H.CATALOG_PATH


def run(pack_names=None):
    global M, CATALOG
    H.ensure_object_mode()
    # Drop previous session materials so rebuilt families don't keep packed JPEGs.
    for mat in list(bpy.data.materials):
        if mat.name.startswith("A_"):
            bpy.data.materials.remove(mat)
    M = H.MATS()
    if pack_names is None:
        env = os.environ.get("AUTHORING_PACKS", "").strip()
        pack_names = [p.strip() for p in env.split(",") if p.strip()] if env else list(PACKS.keys())
    print("packs:", pack_names)
    errors = []
    for name in pack_names:
        fns = PACKS.get(name)
        if not fns:
            errors.append(f"unknown pack {name}")
            continue
        print(f"=== pack {name} ({len(fns)}) ===")
        for fn in fns:
            try:
                fn()
            except Exception as e:
                errors.append(f"{fn.__name__ if hasattr(fn, '__name__') else fn}: {e}")
                traceback.print_exc()
    write_catalog()
    print("DONE", len(CATALOG), "assets;", "errors:", errors)
    return {"count": len(CATALOG), "errors": errors, "ids": [c["id"] for c in CATALOG]}


if __name__ == "__main__" or True:
    # Always run when exec()'d from MCP.
    _wanted = globals().get("PACKS_TO_RUN")
    RESULT = run(_wanted)
