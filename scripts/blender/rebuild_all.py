import os

os.environ["AUTHORING_PACKS"] = "walls,openings,structure,sketch,components"
exec(open(r"C:\Users\Nam\BIM\scripts\blender\build_authoring_assets.py", encoding="utf-8").read())
print("RESULT", RESULT)
