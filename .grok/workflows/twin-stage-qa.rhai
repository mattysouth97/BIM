let meta = #{
    name: "twin-stage-qa",
    description: "Exercise the BIM twin workflow (search, building, CAD, 3D viewer, retrofit/ROI) and write QA-Checklist.md",
    when_to_use: "When you want a live QA pass of the Korean building-ledger twin app and a checklist at the repo root",
    phases: [
        #{ title: "Exercise", detail: "one tester per journey, each from a cold load" },
        #{ title: "Verify", detail: "adversarial re-check of FAIL/BLOCKED items" },
        #{ title: "Write", detail: "merge confirmed results into QA-Checklist.md" },
    ],
};

let journey_schema = #{
    "type": "object",
    "required": ["journey_id", "status", "checks"],
    "properties": #{
        "journey_id": #{ "type": "string" },
        "status": #{ "type": "string" },
        "checks": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["id", "title", "status"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "title": #{ "type": "string" },
                    "status": #{ "type": "string" },
                    "where": #{ "type": "string" },
                    "expected": #{ "type": "string" },
                    "actual": #{ "type": "string" },
                    "repro": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
        "notes": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["check_id", "real", "status", "evidence"],
    "properties": #{
        "check_id": #{ "type": "string" },
        "real": #{ "type": "boolean" },
        "status": #{ "type": "string" },
        "evidence": #{ "type": "string" },
        "reason": #{ "type": "string" },
    },
};

let write_schema = #{
    "type": "object",
    "required": ["path", "passed", "failed", "blocked", "report"],
    "properties": #{
        "path": #{ "type": "string" },
        "passed": #{ "type": "integer" },
        "failed": #{ "type": "integer" },
        "blocked": #{ "type": "integer" },
        "report": #{ "type": "string" },
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

fn journey(id, title, detail) {
    #{ id: id, title: title, detail: detail }
}

let journeys = [
    journey(
        "search",
        "Search",
        "Home `/`. Region search and address search. Results table, pagination, empty/error. Demo door. Confirm results are real buildings, not a blank table. Desktop; also a narrow viewport if the search chrome wraps."
    ),
    journey(
        "building",
        "Building detail",
        "Open a building (demo building or a search result → `/building/[id]` or the in-page building panel). Header, overview, floors, areas, BIM summary. Shared state: data shown here must match the search row. Hunt missing zero-value fields displayed as numbers instead of '-'."
    ),
    journey(
        "cad",
        "CAD upload / viewer",
        "Upload stage (CAD door or workflow stepper Upload). DXF sample at docs/samples/sample-footprint.dxf if present. Layer picker, footprint preview, 2D CAD viewer: pan/zoom, layer toggles, measure if exposed. PDF tracer only if a sample PDF is handy. Do not invent a pass if the converter/WASM fails."
    ),
    journey(
        "viewer",
        "3D twin viewer",
        "Twin stage 3D canvas. Orbit, zoom, layer visibility, hover/select if present. `/dev/assets` equipment kit page. Confirm the building mesh appears (not an empty grey canvas). Desktop and a mobile-width viewport for the overlay chrome."
    ),
    journey(
        "retrofit",
        "Retrofit / ROI + report",
        "Twin scenario rail: program track, CAPEX, selected measures, NPV/IRR readout. Advance to Report stage. Compliance / energy-audit preview. Change a budget or measure and confirm the readout and report stay consistent. If energy APIs fail, mark those checks BLOCKED with the network error."
    ),
];

let base_url = "http://localhost:3000";
if args != () && args.base_url != () { base_url = args.base_url; }
let build_label = "local dev";
if args != () && args.build != () { build_label = args.build; }
let run_date = "unspecified";
if args != () && args.date != () { run_date = args.date; }

// --- Exercise ---
phase("Exercise");
let jobs = [];
for j in journeys {
    let prompt = "";
    prompt += "You are a QA tester for the Korean Building Ledger / digital-twin app in this workspace.\n";
    prompt += "A screenshot is not a test. Click, type, submit, navigate. Confirm behavior.\n";
    prompt += "Do not fix bugs. Record them.\n\n";
    prompt += "Base URL: " + base_url + "\n";
    prompt += "Build label: " + build_label + "\n";
    prompt += "Journey id: " + j.id + "\n";
    prompt += "Journey title: " + j.title + "\n";
    prompt += "Scope (only this journey): " + j.detail + "\n\n";
    prompt += "Before the UI:\n";
    prompt += "1. Read package.json, README, src/lib/workflow/stages.ts, src/app/page.tsx, and the route files you will hit.\n";
    prompt += "2. Reuse a server already on port 3000. If none, start `pnpm dev` and wait until it is up.\n";
    prompt += "3. Prefer browser tools. If none, Playwright (`pnpm test:e2e` is support only — still drive the live URL yourself).\n";
    prompt += "4. If you cannot open the UI, return status=BLOCKED with one check explaining why. Do not invent PASS from source reading.\n\n";
    prompt += "How to test:\n";
    prompt += "- Drive real controls. Record page errors and failed network calls on the path you are on.\n";
    prompt += "- status for the journey is FAIL if any check is FAIL, BLOCKED if you could not run it, else PASS.\n";
    prompt += "- Each FAIL/BLOCKED check MUST include where, expected, actual, repro (numbered from a cold load), evidence.\n";
    prompt += "- PASS checks: id, title, status=PASS, and put the one thing you proved in evidence.\n";
    prompt += "- At most 12 checks. Empty checks[] is valid only after you tried to open the app and it was impossible (then one BLOCKED check).\n";
    prompt += "- Stay inside this journey. Do not test the other stages except as a setup hop (e.g. search once so you can open a building).\n";
    jobs.push(#{
        prompt: prompt,
        label: "qa:" + j.id,
        capability_mode: "execute",
        output_schema: journey_schema,
    });
}
let results = parallel(jobs);

let known_ids = #{};
for j in journeys { known_ids[j.id] = true; }

let collected = [];
let fail_items = [];
for r in results {
    if r == () || !r.success || r.output.checks == () { continue; }
    let jid = "";
    if r.output.journey_id != () { jid = trimmed(r.output.journey_id); }
    if known_ids[jid] == () {
        log("dropped out-of-scope journey_id: " + jid);
        continue;
    }
    collected.push(r.output);
    for c in r.output.checks {
        if c.status == "FAIL" || c.status == "BLOCKED" {
            fail_items.push(#{
                journey_id: jid,
                id: c.id,
                title: c.title,
                status: c.status,
                where: c.where,
                expected: c.expected,
                actual: c.actual,
                repro: c.repro,
                evidence: c.evidence,
            });
        }
    }
}
log("journeys with usable output: " + collected.len().to_string() + "; FAIL/BLOCKED checks: " + fail_items.len().to_string());

// --- Verify FAIL/BLOCKED ---
phase("Verify");
const MAX_VERIFY = 8;
if fail_items.len() > MAX_VERIFY {
    log("verify cap dropped " + (fail_items.len() - MAX_VERIFY).to_string() + " FAIL/BLOCKED checks");
    let clipped = [];
    let i = 0;
    for f in fail_items {
        if i < MAX_VERIFY { clipped.push(f); }
        i += 1;
    }
    fail_items = clipped;
}

let confirmed_fails = [];
if fail_items.len() > 0 {
    let vjobs = [];
    for f in fail_items {
        let prompt = "";
        prompt += "Adversarially re-check this QA finding on the live app. Default real=false.\n";
        prompt += "Use browser or Playwright against " + base_url + ". Read the owning code only to understand expected behavior, not to declare a pass from source.\n\n";
        prompt += "Finding JSON:\n" + json_encode(f) + "\n\n";
        prompt += "Set real=true only if you independently reproduced the same expected-vs-actual on the stated route.\n";
        prompt += "If you cannot reach the UI, real=false and status=BLOCKED with evidence of the blockage.\n";
        prompt += "If the original claim is wrong, real=false and status=PASS (the bug is not real).\n";
        prompt += "check_id must equal " + json_encode(f.id) + ".\n";
        vjobs.push(#{
            prompt: prompt,
            label: "verify:" + f.journey_id + ":" + f.id,
            capability_mode: "execute",
            output_schema: verdict_schema,
        });
    }
    let verdicts = parallel(vjobs);
    let i = 0;
    for v in verdicts {
        let orig = fail_items[i];
        if v != () && v.success && v.output.real == true
            && v.output.evidence != () && trimmed(v.output.evidence) != ""
            && v.output.check_id != () && trimmed(v.output.check_id) == orig.id {
            confirmed_fails.push(orig);
        }
        i += 1;
    }
}
log(confirmed_fails.len().to_string() + "/" + fail_items.len().to_string() + " FAIL/BLOCKED checks survived verification");

// --- Write checklist ---
phase("Write");
let prompt = "";
prompt += "Write QA-Checklist.md at the workspace root (overwrite). Use the exact shape below. Do not fix bugs.\n\n";
prompt += "Product: Korean Building Ledger digital twin (korea-building-info).\n";
prompt += "Date: " + run_date + "\n";
prompt += "App: " + base_url + "\n";
prompt += "Build: " + build_label + "\n";
prompt += "Scope: journeys first (search, building, CAD, 3D viewer, retrofit/ROI), then any edges the testers noted.\n\n";
prompt += "Checklist shape:\n";
prompt += "# QA Checklist\n\n";
prompt += "- Product:\n- Date:\n- App:\n- Build:\n- Scope:\n\n";
prompt += "## Summary\n- Passed:\n- Failed:\n- Blocked:\n- Could not run:\n\n";
prompt += "## Journeys\n### J1 ...\n- Status:\n- Steps:\n- Result:\n#### Bug (FAIL/BLOCKED only)\n- Where:\n- Expected:\n- Actual:\n- Repro:\n- Evidence:\n\n";
prompt += "## Edge cases\n## Notes\n\n";
prompt += "Confirmed FAIL/BLOCKED (only these may be listed as FAIL; drop unverified claims):\n";
prompt += json_encode(confirmed_fails) + "\n\n";
prompt += "Raw journey outputs (PASS checks may be copied; treat FAIL as unconfirmed unless it appears in the confirmed list):\n";
prompt += json_encode(collected) + "\n\n";
prompt += "Count passed/failed/blocked from the checks you write. path must be QA-Checklist.md. report is the full markdown file contents.\n";
prompt += "If collected is empty, write the file with every journey BLOCKED and explain that testers returned no usable output.\n";

let wr = agent(prompt, #{
    label: "write-checklist",
    capability_mode: "read-write",
    output_schema: write_schema,
});

let report = "";
let passed = 0;
let failed = 0;
let blocked = 0;
let out_path = "QA-Checklist.md";
if wr != () && wr.success && wr.output.report != () {
    report = wr.output.report;
    if wr.output.path != () { out_path = wr.output.path; }
    if wr.output.passed != () { passed = wr.output.passed; }
    if wr.output.failed != () { failed = wr.output.failed; }
    if wr.output.blocked != () { blocked = wr.output.blocked; }
} else {
    report = "# QA Checklist\n\nWrite agent failed. Confirmed fails: " + json_encode(confirmed_fails) + "\n";
}

let scratch = write_scratch_file("QA-Checklist.md", report);
complete(#{
    path: scratch,
    checklist: out_path,
    report: report,
    passed: passed,
    failed: failed,
    blocked: blocked,
    confirmed_fails: confirmed_fails.len(),
});
