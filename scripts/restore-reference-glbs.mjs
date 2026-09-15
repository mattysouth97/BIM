#!/usr/bin/env node
// scripts/restore-reference-glbs.mjs
//
// Re-materializes the reference-building GLBs under public/reference-buildings/
// from the bim public Vercel Blob store over UNAUTHENTICATED HTTPS — the store
// is public by design and no token ever appears on the read path. Integrity
// comes from the manifests in git, not from auth: every downloaded byte count
// is checked against the manifest `byteLength`, so this works on a clean
// checkout (the GLBs are gitignored; the manifests are not).
//
//   node scripts/restore-reference-glbs.mjs --dry-run
//     Lists the pathnames and total bytes. No env required.
//
//   node scripts/restore-reference-glbs.mjs
//     Real restore. Needs BLOB_PUBLIC_BASE_URL (environment or .env.local) —
//     the https://<store-id>.public.blob.vercel-storage.com origin of the
//     store created at the Task 3 checkpoint.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TREE = path.join(ROOT, "public", "reference-buildings");
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Recursively collect string values ending in `.glb` — the same walk the
 * e2e manifest gate and the publish script use, so all three enumerate the
 * identical set.
 */
const collectGlbRefs = (value, out = new Set()) => {
  if (!value || typeof value !== "object") return out;
  for (const v of Object.values(value)) {
    if (typeof v === "string" && v.endsWith(".glb")) out.add(v);
    else if (typeof v === "object") collectGlbRefs(v, out);
  }
  return out;
};

/** filename -> byteLength for every object carrying a `.glb` file field. */
const collectByteLengths = (value, out = new Map()) => {
  if (!value || typeof value !== "object") return out;
  for (const v of Object.values(value)) {
    if (typeof v === "object") collectByteLengths(v, out);
  }
  if (
    typeof value.file === "string" &&
    value.file.endsWith(".glb") &&
    typeof value.byteLength === "number"
  ) {
    out.set(value.file, value.byteLength);
  }
  return out;
};

// ---- manifest inventory: pathname -> byteLength (the integrity ledger) -------
const wanted = new Map(); // `reference-buildings/<id>/<file>` -> byteLength | null
for (const e of fs.readdirSync(TREE, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const manifestPath = path.join(TREE, e.name, "manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const byteLengths = collectByteLengths(manifest);
  for (const file of collectGlbRefs(manifest)) {
    wanted.set(`reference-buildings/${e.name}/${file}`, byteLengths.get(file) ?? null);
  }
}

const pathnames = [...wanted.keys()].sort();
const totalBytes = pathnames.reduce((s, p) => s + (wanted.get(p) ?? 0), 0);

if (DRY_RUN) {
  for (const pathname of pathnames) console.log(pathname);
  console.log(`${pathnames.length} file(s), ${totalBytes} bytes`);
  process.exit(0);
}

// ---- real run -----------------------------------------------------------------
// Load .env.local only when the variable is not already in the environment, so
// an operator-set value always wins regardless of loadEnvFile override semantics.
if (!process.env.BLOB_PUBLIC_BASE_URL) {
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // fall through to the check below
    }
  }
}
const base = process.env.BLOB_PUBLIC_BASE_URL?.replace(/\/+$/, "");
if (!base) {
  console.error("BLOB_PUBLIC_BASE_URL is not set.");
  console.error(
    "Set it to the https://<store-id>.public.blob.vercel-storage.com origin of the " +
      "store created at the Task 3 checkpoint (Vercel Dashboard → bim → Storage), " +
      "in the environment or in .env.local."
  );
  process.exit(1);
}

let downloaded = 0;
let skipped = 0;
let fetchedBytes = 0;
for (const pathname of pathnames) {
  const byteLength = wanted.get(pathname);
  const target = path.join(ROOT, "public", ...pathname.split("/"));
  if (
    byteLength !== null &&
    fs.existsSync(target) &&
    fs.statSync(target).size === byteLength
  ) {
    skipped++;
    continue;
  }
  const url = `${base}/${pathname}`;
  const res = await fetch(url); // unauthenticated public HTTPS — no token, ever
  if (!res.ok) {
    console.error(`GET ${url} -> ${res.status} — aborting`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (byteLength !== null && buf.length !== byteLength) {
    console.error(
      `byteLength mismatch for ${pathname}: manifest says ${byteLength}, got ${buf.length} — refusing to write`
    );
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  downloaded++;
  fetchedBytes += buf.length;
  console.log(`restored ${pathname} (${buf.length} bytes)`);
}
console.log(
  `restore complete: ${downloaded} downloaded (${fetchedBytes} bytes), ` +
    `${skipped} already on disk with matching byteLength`
);
console.log(
  "Unblocks: lossless-materials.test.ts, pv-bearing-source.test.ts, " +
    "reference-retrofit-visuals.glb.test.ts, reference-architectural-details.test.tsx — " +
    "their assertions stay unweakened; this script is their documented precondition."
);
