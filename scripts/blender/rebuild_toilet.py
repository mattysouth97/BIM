import importlib
import json
import sys

import bpy

sys.path.insert(0, r"C:\Users\Nam\BIM\scripts\blender")
import authoring_helpers as H

importlib.reload(H)

for mat in list(bpy.data.materials):
    if mat.name.startswith("A_"):
        try:
            bpy.data.materials.remove(mat)
        except Exception:
            pass

src = open(r"C:\Users\Nam\BIM\scripts\blender\build_authoring_assets.py", encoding="utf-8").read()
src = src.replace('if __name__ == "__main__" or True:', "if False:")
ns = {}
exec(compile(src, "build_authoring_assets.py", "exec"), ns)
ns["M"] = H.MATS()
ns["CATALOG"] = []
ns["build_toilet"]()
spec = ns["CATALOG"][0]
path = r"C:\Users\Nam\BIM\public\models\authoring\catalog.json"
with open(path, encoding="utf-8") as f:
    cat = json.load(f)
cat["families"] = [f for f in cat["families"] if f.get("id") != spec["id"]]
cat["families"].append(spec)
cat["count"] = len(cat["families"])
with open(path, "w", encoding="utf-8") as f:
    json.dump(cat, f, ensure_ascii=False, indent=2)
print("toilet", spec["id"], spec["bytesKb"], "KB")
print("count", cat["count"])
