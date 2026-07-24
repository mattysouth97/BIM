import { spawnSync } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openNextDir = path.join(rootDir, ".open-next");
const bundleDir = path.join(rootDir, ".sites-worker-bundle");
const distDir = path.join(rootDir, "dist");
const serverDir = path.join(distDir, "server");
const assetsDir = path.join(distDir, "assets");
const hostingSource = path.join(rootDir, ".openai", "hosting.json");
const hostingTarget = path.join(distDir, ".openai", "hosting.json");

const openNextCli = path.join(
  rootDir,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js",
);
const wranglerCli = path.join(
  rootDir,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

function printHelp() {
  console.log(`Build a Sites-ready artifact in dist/.

Usage:
  npm run build:sites

The build creates the OpenNext output, bundles its Worker with Wrangler in
dry-run mode, and stages the server bundle, WASM modules, static assets, and
Sites hosting metadata.`);
}

async function assertExists(target, label) {
  try {
    await stat(target);
  } catch {
    throw new Error(`${label} was not found at ${path.relative(rootDir, target)}`);
  }
}

function runNodeCli(label, entry, args) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function stageBundle() {
  const bundleEntries = await readdir(bundleDir, { withFileTypes: true });
  const preferredEntry = ["worker.js", "index.js"].find((name) =>
    bundleEntries.some((entry) => entry.isFile() && entry.name === name),
  );
  const rootJavaScriptFiles = bundleEntries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".js"),
  );
  const entryName =
    preferredEntry ??
    (rootJavaScriptFiles.length === 1
      ? rootJavaScriptFiles[0].name
      : null);

  if (!entryName) {
    throw new Error(
      "Wrangler bundle did not contain an unambiguous JavaScript entry",
    );
  }

  await cp(bundleDir, serverDir, { recursive: true });
  if (entryName !== "index.js") {
    await copyFile(
      path.join(bundleDir, entryName),
      path.join(serverDir, "index.js"),
    );
  }
}

async function build() {
  await Promise.all([
    assertExists(openNextCli, "OpenNext CLI"),
    assertExists(wranglerCli, "Wrangler CLI"),
    assertExists(hostingSource, "Sites hosting metadata"),
  ]);

  await rm(distDir, { recursive: true, force: true });
  await rm(bundleDir, { recursive: true, force: true });

  try {
    runNodeCli("OpenNext build", openNextCli, ["build"]);
    await assertExists(
      path.join(openNextDir, "worker.js"),
      "OpenNext Worker entry",
    );
    await assertExists(
      path.join(openNextDir, "assets"),
      "OpenNext static assets",
    );

    await mkdir(bundleDir, { recursive: true });
    runNodeCli("Wrangler dry-run bundle", wranglerCli, [
      "deploy",
      "--dry-run",
      "--config",
      path.join(rootDir, "wrangler.jsonc"),
      "--outdir",
      bundleDir,
    ]);

    await mkdir(distDir, { recursive: true });
    await Promise.all([
      stageBundle(),
      cp(path.join(openNextDir, "assets"), assetsDir, {
        recursive: true,
      }),
      mkdir(path.dirname(hostingTarget), { recursive: true }).then(() =>
        copyFile(hostingSource, hostingTarget),
      ),
    ]);

    console.log("Sites artifact staged in dist/.");
  } finally {
    await rm(bundleDir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
} else {
  await build();
}
