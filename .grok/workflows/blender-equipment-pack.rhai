let meta = #{
    name: "blender-equipment-pack",
    description: "Author a Blender equipment pack, verify tri count/origin/GLB path, then wire the registry and layer tests",
    when_to_use: "When adding or remaking a GLB equipment pack (safety, transport, telecom, waste) for the BIM viewer",
    phases: [
        #{ title: "Model", detail: "one sequential Blender agent per asset (single live Blender session)" },
        #{ title: "Verify", detail: "independent check of tri count, origin, and export path" },
        #{ title: "Wire", detail: "registry + layer tests for assets that passed" },
        #{ title: "Report", detail: "scratch report of modeled / verified / wired" },
    ],
};

let model_schema = #{
    "type": "object",
    "required": ["asset_id", "glb_path", "tri_count", "origin", "preview_path"],
    "properties": #{
        "asset_id": #{ "type": "string" },
        "glb_path": #{ "type": "string" },
        "tri_count": #{ "type": "integer" },
        "origin": #{ "type": "string" },
        "preview_path": #{ "type": "string" },
        "kb": #{ "type": "number" },
        "notes": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["asset_id", "ok", "glb_exists", "origin_ok", "tris_ok", "evidence"],
    "properties": #{
        "asset_id": #{ "type": "string" },
        "ok": #{ "type": "boolean" },
        "glb_exists": #{ "type": "boolean" },
        "origin_ok": #{ "type": "boolean" },
        "tris_ok": #{ "type": "boolean" },
        "tri_count": #{ "type": "integer" },
        "evidence": #{ "type": "string" },
        "issues": #{
            "type": "array",
            "maxItems": 8,
            "items": #{ "type": "string" },
        },
    },
};

let wire_schema = #{
    "type": "object",
    "required": ["wired", "summary", "files"],
    "properties": #{
        "wired": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "files": #{ "type": "array", "items": #{ "type": "string" } },
        "tests_ok": #{ "type": "boolean" },
    },
};

fn trimmed(s) {
    if type_of(s) == "string" {
        s.trim();
        s
    } else {
        ""
    }
}

fn spec_of(id, brief, dims, origin, max_tris, single_mesh, layer) {
    #{
        id: id,
        brief: brief,
        dims: dims,
        origin: origin,
        max_tris: max_tris,
        single_mesh: single_mesh,
        layer: layer,
    }
}

fn safety_pack() {
    [
        spec_of("sprinkler-head", "Pendent sprinkler: ceiling stub pipe, frame arms, deflector disc", "0.06x0.06x0.10 m Blender XYZ", "centre", 300, true, "layer-13-safety"),
        spec_of("smoke-detector", "Flat round detector: base ring with vent slots, low dome, tiny LED nub", "0.13 dia x 0.045 m", "centre", 300, true, "layer-13-safety"),
        spec_of("exit-sign", "Slim exit sign box, recessed luminous green face, top mount stubs", "0.36x0.06x0.20 m Blender XYZ", "centre", 250, true, "layer-13-safety"),
        spec_of("fire-extinguisher", "Extinguisher on wall bracket: red cylinder, valve/handle, short hose, bracket plate", "0.22x0.18x0.60 m Blender XYZ", "centre", 800, true, "layer-13-safety"),
        spec_of("hydrant-cabinet", "Indoor hydrant wall cabinet: box, door seam, hose window, small alarm bell", "0.70x0.22x1.30 m Blender XYZ", "centre", 700, true, "layer-13-safety"),
    ]
}

fn transport_pack() {
    [
        spec_of("elevator-cab", "Cab: panelled walls, front door slit, ceiling light recess, handrail, floor plate", "1.4x1.5x2.2 m Blender XYZ", "centre", 1800, true, "layer-12-transport"),
        spec_of("elevator-counterweight", "Guided frame with 6 stacked plates", "0.3x0.45x1.3 m Blender XYZ", "centre", 400, true, "layer-12-transport"),
        spec_of("hoist-machine", "Gearless traction machine: bedplate, motor, sheave groove hint, brake disc", "1.2x0.8x1.0 m Blender XYZ", "base centre", 3000, false, "layer-12-transport"),
        spec_of("landing-door", "Landing door set: frame + two sliding panels + header indicator", "1.1x0.12x2.1 m Blender XYZ", "centre", 500, true, "layer-12-transport"),
    ]
}

fn telecom_pack() {
    [
        spec_of("comm-rack", "19 inch comms rack: frame, stacked patch panels, side vents", "0.6x0.8x2.0 m Blender XYZ", "centre", 1200, true, "layer-11-telecom"),
        spec_of("wifi-ap", "Ceiling WiFi AP: rounded square puck, status LED nub", "0.18x0.18x0.045 m", "centre", 300, true, "layer-11-telecom"),
        spec_of("cctv-camera", "Dome camera on short ceiling mount: plate, stem, dome, lens hint", "0.14x0.14x0.16 m", "centre", 400, true, "layer-11-telecom"),
        spec_of("antenna-mast", "Rooftop mast ~2.6 m, 2 panel antennas, small dish, guy-anchor base", "1.0x1.0x2.6 m Blender XYZ", "base centre", 1800, false, "layer-11-telecom"),
        spec_of("gas-valve-station", "Med-gas zone valve box: recessed box, 2 valves with gauges, front window", "0.2x0.12x0.15 m", "centre", 500, true, "layer-8-media"),
    ]
}

fn waste_pack() {
    [
        spec_of("wheelie-bin", "240 L wheelie bin: tapered ribbed body, hinged lid, 2 wheels, handle bar", "0.58x0.74x1.07 m Blender XYZ", "base centre", 900, true, "layer-9-waste"),
        spec_of("waste-chute-module", "Chute section: cylinder shell, flange collars, inspection hatch; unit-normalized", "unit cylinder", "centre", 600, true, "layer-9-waste"),
        spec_of("mullion-he", "High-efficiency mullion: deeper body, twin thermal-break fins toward -Y; same axes as existing mullion", "unit profile, length along Blender Z", "centre", 100, true, "facade-generator"),
        spec_of("facade-panel-insulated", "EIFS insulated spandrel: thicker raised face toward -Y; same axes as existing facade-panel", "unit panel", "centre", 250, true, "facade-generator"),
    ]
}

fn new_pack() {
    [
        spec_of("junction-box", "Electrical junction box with lid seam and hub", "0.20x0.14x0.14 m", "centre", 200, true, "electrical-routing"),
        spec_of("ev-charger", "Pedestal EV charger: plinth, post, head, screen, cable hook", "0.36x0.28x1.44 m Blender XYZ", "base centre", 1500, false, "layer-14-microgrid"),
        spec_of("exhaust-fan", "Rooftop mushroom exhaust fan: curb, housing, cowl, rain cap", "0.84x0.84x0.60 m Blender XYZ", "base centre", 1200, false, "layer-5-ventilation"),
        spec_of("fire-pump", "Horizontal fire pump + motor on a skid", "1.55x0.62x0.78 m Blender XYZ", "base centre", 2500, false, "layer-13-safety"),
        spec_of("emergency-generator", "Rooftop diesel genset: skid, hood, grille, muffler, tank", "2.15x0.95x1.14 m Blender XYZ", "base centre", 4000, false, "layer-14-microgrid"),
    ]
}

fn catalog_for(pack_name) {
    if pack_name == "safety" {
        safety_pack()
    } else if pack_name == "transport" {
        transport_pack()
    } else if pack_name == "telecom" {
        telecom_pack()
    } else if pack_name == "waste" {
        waste_pack()
    } else if pack_name == "new" {
        new_pack()
    } else if pack_name == "all" {
        let out = [];
        for a in safety_pack() { out.push(a); }
        for a in transport_pack() { out.push(a); }
        for a in telecom_pack() { out.push(a); }
        for a in waste_pack() { out.push(a); }
        out
    } else {
        []
    }
}

fn known_id(id) {
    let found = false;
    for a in catalog_for("all") {
        if a.id == id { found = true; }
    }
    found
}

// --- args ---
let pack = if args == () { () } else { args.pack };
if pack == () {
    pause("verification", "Pass args.pack: safety | transport | telecom | waste | new | all. Optional args.ids (subset) and args.stage (model | verify | wire | all). Never remake an existing GLB.");
}

let selected = catalog_for(pack);
if selected.len() == 0 {
    pause("verification", "args.pack must be safety, transport, telecom, waste, new, or all.");
}

let ids_arg = if args == () { () } else { args.ids };
if ids_arg != () && type_of(ids_arg) == "array" {
    let filtered = [];
    let dropped = [];
    for spec in selected {
        let keep = false;
        for id in ids_arg {
            if id == spec.id { keep = true; }
        }
        if keep {
            filtered.push(spec);
        } else {
            dropped.push(spec.id);
        }
    }
    let unknown = [];
    for id in ids_arg {
        if !known_id(id) { unknown.push(id); }
    }
    if dropped.len() > 0 {
        log("ids filter dropped " + dropped.len().to_string() + " catalog assets: " + json_encode(dropped));
    }
    if unknown.len() > 0 {
        log("ids not in catalog (ignored): " + json_encode(unknown));
    }
    selected = filtered;
}

if selected.len() == 0 {
    pause("verification", "No assets left after applying args.ids to this pack.");
}

let stage = "all";
if args != () && args.stage != () { stage = args.stage; }
if stage != "model" && stage != "verify" && stage != "wire" && stage != "all" {
    pause("verification", "args.stage must be model, verify, wire, or all.");
}

log("pack=" + pack + " stage=" + stage + " assets=" + selected.len().to_string());

// --- Model (sequential: one live Blender on :9876) ---
let modeled = [];
if stage == "model" || stage == "all" {
    phase("Model");
    for spec in selected {
        let prompt = "";
        prompt += "Author ONE equipment GLB in the live Blender 5.2 session for this BIM repo.\n";
        prompt += "Use tools. Do not answer from memory. If Blender MCP tools are missing, search_tool for blender / execute_blender_code, then use them.\n";
        prompt += "If Blender is unreachable, return what you attempted and leave glb_path empty only after a real connection attempt.\n\n";
        prompt += "Asset id: " + spec.id + "\n";
        prompt += "What: " + spec.brief + "\n";
        prompt += "Authored size: " + spec.dims + "\n";
        prompt += "Origin: " + spec.origin + "\n";
        prompt += "Max triangles: " + spec.max_tris.to_string() + "\n";
        if spec.single_mesh {
            prompt += "Export: single mesh, single material (InstancedMesh). Use finalize_merge(col, single_mat=...).\n";
        } else {
            prompt += "Export: multi-material is allowed. Still merge per material via finalize_merge.\n";
        }
        prompt += "Consumer layer: " + spec.layer + "\n\n";
        prompt += "Rules (read these files before modeling):\n";
        prompt += "1. Read scripts/blender/eq_helpers.py and public/models/equipment/README.md.\n";
        prompt += "2. Metres. Blender Z-up. Never bpy.ops.object.transform_apply — bake with o.data.transform.\n";
        prompt += "3. Load helpers inside Blender: exec(bpy.data.texts['eq_helpers.py'].as_string()) if present, else paste/exec the repo file.\n";
        prompt += "4. After loading helpers, OVERRIDE ASSET_DIR to this workspace public/models/equipment (the file hardcodes an old worktree path).\n";
        prompt += "5. reset_collection('EQ_" + spec.id + "'), build with box/cyl/tor/sph helpers, preview() and READ the PNG before export.\n";
        prompt += "6. export_glb to " + spec.id + ".glb under public/models/equipment/. Confirm the file exists on disk via a file tool.\n";
        prompt += "7. If public/models/equipment/" + spec.id + ".glb already exists, do NOT remake or overwrite it. Report the existing path and skip authoring.\n";
        prompt += "8. Only create a GLB when that file is missing. Do not edit app TypeScript in this step.\n";
        let r = agent(prompt, #{
            label: "model:" + spec.id,
            capability_mode: "all",
            output_schema: model_schema,
        });
        if r != () && r.success && r.output.asset_id != () && r.output.glb_path != () {
            let gid = trimmed(r.output.asset_id);
            let gpath = trimmed(r.output.glb_path);
            if gid == spec.id && gpath != "" {
                modeled.push(#{
                    id: spec.id,
                    glb_path: gpath,
                    tri_count: r.output.tri_count,
                    origin: r.output.origin,
                    spec: spec,
                });
            } else {
                log("model output rejected (id/path mismatch): " + spec.id);
            }
        } else {
            log("model failed or empty: " + spec.id);
        }
    }
    log("modeled " + modeled.len().to_string() + "/" + selected.len().to_string());
}

if stage == "model" {
    let md = "# Blender equipment pack — model only\n\n";
    md += "- Pack: " + pack + "\n";
    md += "- Modeled: " + modeled.len().to_string() + "/" + selected.len().to_string() + "\n\n";
    for m in modeled {
        md += "- `" + m.id + "` → `" + m.glb_path + "`\n";
    }
    let pth = write_scratch_file("report.md", md);
    complete(#{ path: pth, report: md, modeled: modeled.len(), verified_ok: 0, wired: false });
}

// --- Verify ---
phase("Verify");
let verify_targets = [];
if modeled.len() > 0 {
    for m in modeled { verify_targets.push(m); }
} else {
    for spec in selected {
        verify_targets.push(#{
            id: spec.id,
            glb_path: "public/models/equipment/" + spec.id + ".glb",
            tri_count: (),
            origin: spec.origin,
            spec: spec,
        });
    }
}

const MAX_VERIFY = 18;
if verify_targets.len() > MAX_VERIFY {
    log("verify cap dropped " + (verify_targets.len() - MAX_VERIFY).to_string() + " assets");
    let clipped = [];
    let i = 0;
    for t in verify_targets {
        if i < MAX_VERIFY { clipped.push(t); }
        i += 1;
    }
    verify_targets = clipped;
}

let vjobs = [];
for t in verify_targets {
    let spec = t.spec;
    let prompt = "";
    prompt += "Adversarially verify this equipment GLB. Read the shipped files. Do not trust the modeler.\n";
    prompt += "Use read_file / list_dir / grep / run_terminal_command. Empty ok=false is required unless you inspected the file.\n\n";
    prompt += "asset_id: " + spec.id + "\n";
    prompt += "claimed glb_path: " + t.glb_path + "\n";
    prompt += "required origin: " + spec.origin + "\n";
    prompt += "max tris: " + spec.max_tris.to_string() + "\n";
    prompt += "required export path: public/models/equipment/" + spec.id + ".glb\n";
    prompt += "single_mesh required: " + spec.single_mesh.to_string() + "\n\n";
    prompt += "Checks:\n";
    prompt += "1. File exists at public/models/equipment/" + spec.id + ".glb (not some other folder).\n";
    prompt += "2. File is non-empty GLB (starts with glTF magic or size > 1KB).\n";
    prompt += "3. Triangle budget: inspect via a small node/python snippet or documented preview notes; tris_ok only if count <= max or you measured and it is under. If you cannot measure tris, tris_ok=false and say why.\n";
    prompt += "4. Origin: read public/models/equipment/README.md and src/lib/equipment-assets.ts ASSET_NATIVE_DIMS for this id. origin_ok only with evidence the authored origin matches '" + spec.origin + "'.\n";
    prompt += "5. Set ok=true only if glb_exists AND origin_ok AND tris_ok. Missing evidence => ok=false.\n";
    vjobs.push(#{
        prompt: prompt,
        label: "verify:" + spec.id,
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
}

let verdicts = [];
if vjobs.len() > 0 {
    verdicts = parallel(vjobs);
}

let verified_ok = [];
let verified_fail = [];
let vi = 0;
for v in verdicts {
    let target = verify_targets[vi];
    let accepted = false;
    if v != () && v.success && v.output.ok == true
        && v.output.evidence != () && trimmed(v.output.evidence) != ""
        && v.output.glb_exists == true
        && v.output.origin_ok == true
        && v.output.tris_ok == true
        && v.output.asset_id != () && trimmed(v.output.asset_id) == target.id {
        accepted = true;
        verified_ok.push(target);
    } else {
        verified_fail.push(target.id);
    }
    vi += 1;
}
log(verified_ok.len().to_string() + "/" + verify_targets.len().to_string() + " assets passed verification");

if stage == "verify" {
    let md = "# Blender equipment pack — verify only\n\n";
    md += "- Pack: " + pack + "\n";
    md += "- Passed: " + verified_ok.len().to_string() + "\n";
    md += "- Failed: " + json_encode(verified_fail) + "\n";
    let pth = write_scratch_file("report.md", md);
    complete(#{ path: pth, report: md, modeled: modeled.len(), verified_ok: verified_ok.len(), wired: false });
}

// --- Wire ---
let wired = false;
let wire_summary = "skipped";
let wire_files = [];
if stage == "wire" || stage == "all" {
    phase("Wire");
    if verified_ok.len() == 0 {
        log("wire skipped — no verified assets");
        wire_summary = "skipped: no verified assets";
    } else {
        let ids_line = "";
        for t in verified_ok {
            if ids_line != "" { ids_line += ", "; }
            ids_line += t.id;
        }
        let prompt = "";
        prompt += "Integrate verified replacement GLBs into the digital-twin model. Use tools. Read the code before editing.\n";
        prompt += "Only these verified ids: " + ids_line + "\n";
        prompt += "Do not invent new EquipmentAssetId values. The GLBs were just replaced on disk; the twin must actually instance them.\n\n";
        prompt += "For EACH verified id, grep getEquipmentGeometryClone / getEquipmentObjectClone and confirm the live generator uses that id:\n";
        prompt += "- safety → src/lib/layers/layer-13-safety.ts\n";
        prompt += "- transport → src/lib/layers/layer-12-transport.ts\n";
        prompt += "- telecom → src/lib/layers/layer-11-telecom.ts and antenna via getEquipmentObjectClone\n";
        prompt += "- gas-valve-station → layer-8-media.ts (and gas-system.ts if present)\n";
        prompt += "- waste → layer-9-waste.ts\n";
        prompt += "- mullion-he / facade-panel-insulated → src/lib/procedural/facade-generator.ts + equipment-scenario.ts flags windowUpgrade / wallInsulation\n";
        prompt += "Also confirm: src/lib/equipment-assets.ts registry + ASSET_NATIVE_DIMS; src/components/viewer/building-layers.tsx instantiates the layer; GENERATOR_TO_MEP_SUB maps it; /dev/assets lists it; preloadEquipmentAssets runs in the twin viewer so new GLBs load.\n";
        prompt += "If a generator still uses only BoxGeometry/CylinderGeometry when the asset exists, switch it to the clone helper (keep coarse fallback when cache is empty).\n";
        prompt += "If equipment-scenario does not flip facade assets for envelope measures, wire that.\n";
        prompt += "Update public/models/equipment/README.md rows if dims/origin changed.\n";
        prompt += "generate() stays sync. InstancedMesh assets stay single-mesh. Tag userData.type. Do not break existing tests.\n";
        prompt += "Run pnpm exec vitest run on the touched test files. Do not skip integration because 'already wired' — prove each id is consumed.\n";
        let wr = agent(prompt, #{
            label: "wire-pack",
            capability_mode: "read-write",
            output_schema: wire_schema,
        });
        if wr != () && wr.success && wr.output.wired != () {
            wired = wr.output.wired;
            if wr.output.summary != () { wire_summary = wr.output.summary; }
            if wr.output.files != () { wire_files = wr.output.files; }
        } else {
            wire_summary = "wire agent failed";
        }
    }
}

// --- Report ---
phase("Report");
let md = "# Blender equipment pack\n\n";
md += "- Pack: " + pack + "\n";
md += "- Stage: " + stage + "\n";
md += "- Catalog assets: " + selected.len().to_string() + "\n";
md += "- Modeled this run: " + modeled.len().to_string() + "\n";
md += "- Verified OK: " + verified_ok.len().to_string() + "\n";
md += "- Verify failed: " + json_encode(verified_fail) + "\n";
md += "- Wired: " + wired.to_string() + " — " + wire_summary + "\n\n";
md += "## Assets\n\n";
for spec in selected {
    let state = "not-verified";
    for t in verified_ok {
        if t.id == spec.id { state = "ok"; }
    }
    for id in verified_fail {
        if id == spec.id { state = "fail"; }
    }
    md += "- `" + spec.id + "` (" + spec.layer + "): " + state + "\n";
}
if wire_files.len() > 0 {
    md += "\n## Files touched\n\n";
    for f in wire_files {
        md += "- `" + f + "`\n";
    }
}
let pth = write_scratch_file("report.md", md);
complete(#{
    path: pth,
    report: md,
    pack: pack,
    modeled: modeled.len(),
    verified_ok: verified_ok.len(),
    wired: wired,
});
