#!/usr/bin/env node
/**
 * Lossless material-fabric optimization through the official Blender Lab MCP.
 * Requires Blender5.2+ with the official MCP extension enabled, and uvx.
 * Prepare: node scripts/optimize-reference-materials-blender-mcp.mjs
 * Publish validated candidates: node scripts/optimize-reference-materials-blender-mcp.mjs --apply-from <report.json>
 * Optional: --buildings fzk-haus,kit-office --blender-path <exe> --uvx-path <exe>
 * The pinned MCP bridge is installed into uv's tool cache; no app dependency or
 * Codex config is changed. Baselines, candidates and exact checks stay in QA.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { glbHash, readStaticGlb, verifyLosslessGlb } from './lib/verify-lossless-glb.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const sourceRoot = path.join(root, 'public/reference-buildings');
const qaRoot = path.join(root, 'qa-evidence/blender-mcp');
const pinnedServer = 'git+https://projects.blender.org/lab/blender_mcp.git@4309a39646e644261624bfcd2bca669b343b7621#subdirectory=mcp';
const hashFile = (name) => glbHash(fs.readFileSync(name));
const relative = (name) => path.relative(root, name).replaceAll('\\', '/');
const inside = (base, candidate) => { const rel = path.relative(base, candidate); assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'path must remain inside intended directory'); return candidate; };

async function publish(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.kind, 'bimfit_blender_mcp_lossless_materials');
  const updates = [];
  // Validate the complete batch before replacing any production file.
  for (const record of report.buildings) {
    assert.match(record.id, /^[a-z0-9-]+$/);
    const folder = path.join(sourceRoot, record.id), manifestPath = path.join(folder, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.materialFabric.file, 'material-fabric.glb');
    const target = path.join(folder, 'material-fabric.glb');
    const baseline = inside(qaRoot, path.resolve(root, record.baseline));
    const candidate = inside(qaRoot, path.resolve(root, record.candidate));
    assert.equal(hashFile(target), record.verification.sourceSha256, `${record.id}: live source changed after prepare`);
    assert.equal(hashFile(baseline), record.verification.sourceSha256);
    assert.equal(hashFile(candidate), record.verification.sha256);
    assert.equal(hashFile(path.join(folder, manifest.materialFabric.indexFile)), record.indexSha256, 'binding index changed');
    const verification = await verifyLosslessGlb(fs.readFileSync(baseline), fs.readFileSync(candidate));
    assert.ok(verification.bytes < verification.sourceBytes, 'optimization must reduce size');
    assert.equal(verification.drawCalls, manifest.materialFabric.drawCalls);
    assert.equal(verification.storedTriangles, manifest.materialFabric.triangleCount);
    assert.equal(verification.placedTriangles, manifest.materialFabric.placedTriangleCount);
    manifest.materialFabric.byteLength = verification.bytes;
    manifest.materialFabric.sha256 = verification.sha256;
    updates.push({ target, candidate, manifestPath, manifest, id: record.id, verification });
  }
  for (const update of updates) {
    fs.copyFileSync(update.candidate, update.target);
    fs.writeFileSync(update.manifestPath, `${JSON.stringify(update.manifest, null, 2)}\n`);
    console.log(`Published ${update.id}: ${update.verification.sourceBytes} -> ${update.verification.bytes} bytes; exact geometry/materials/instances; ${update.verification.drawCalls} draws`);
  }
}

function commandPath(optionName, envName, windowsCandidate, fallback) {
  return option(optionName) ?? process.env[envName] ?? (windowsCandidate && fs.existsSync(windowsCandidate) ? windowsCandidate : fallback);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitForBlender(port, process) {
  for (let tries = 0; tries < 150; tries++) {
    if (process.exitCode !== null) throw new Error('Background Blender exited; inspect QA logs. Enable the official Blender MCP extension first.');
    const available = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (available) return;
    await delay(200);
  }
  throw new Error('Blender MCP did not listen within30 seconds; inspect QA logs.');
}
function mcpClient(process, transcript) {
  let serial = 0;
  const pending = new Map();
  const lines = createInterface({ input: process.stdout });
  const fail = (error) => { for (const waiter of pending.values()) { clearTimeout(waiter.timeout); waiter.reject(error); } pending.clear(); };
  process.once('error', fail);
  process.once('exit', (code) => fail(new Error(`MCP process exited (${code})`)));
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line), waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id); clearTimeout(waiter.timeout);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    } catch (error) { fail(error); }
  });
  const send = (message) => process.stdin.write(`${JSON.stringify(message)}\n`);
  return {
    notify: (method) => send({ jsonrpc: '2.0', method }),
    request(method, params) {
      const id = ++serial;
      transcript.push({ id, method });
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out`)); }, 300000);
        pending.set(id, { resolve, reject, timeout });
        send({ jsonrpc: '2.0', id, method, params });
      });
    },
  };
}

async function prepare() {
  const ids = option('--buildings')?.split(',') ?? fs.readdirSync(sourceRoot).filter((id) => fs.existsSync(path.join(sourceRoot, id, 'material-fabric.glb')));
  const run = path.join(qaRoot, `run-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
  fs.mkdirSync(run, { recursive: true });
  const port = await freePort();
  const blender = commandPath('--blender-path', 'BLENDER_PATH', process.platform === 'win32' ? path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Blender Foundation/Blender 5.2/blender.exe') : null, 'blender');
  const uvx = commandPath('--uvx-path', 'UVX_PATH', process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'hermes/bin/uvx.exe') : null, 'uvx');
  const blenderLog = fs.openSync(path.join(run, 'blender.log'), 'w'), serverLog = fs.openSync(path.join(run, 'mcp.log'), 'w');
  let blenderProcess, serverProcess;
  const transcript = [];
  const report = { kind: 'bimfit_blender_mcp_lossless_materials', serverSource: pinnedServer, mcpSdkVersion: '1.29.1', createdAt: new Date().toISOString(), buildings: [], skipped: [] };
  try {
    blenderProcess = spawn(blender, ['--background', '--online-mode', '--command', 'blender_mcp', '--host', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', blenderLog, blenderLog] });
    let launchError;
    blenderProcess.once('error', (error) => { launchError = error; });
    await waitForBlender(port, blenderProcess);
    if (launchError) throw launchError;
    serverProcess = spawn(uvx, ['--from', pinnedServer, '--with', 'mcp==1.29.1', 'blender-mcp'], { windowsHide: true, stdio: ['pipe', 'pipe', serverLog], env: { ...process.env, BLENDER_MCP_HOST: '127.0.0.1', BLENDER_MCP_PORT: String(port), PYTHONIOENCODING: 'utf-8' } });
    const client = mcpClient(serverProcess, transcript);
    report.initialize = await client.request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'bimfit-lossless-materials', version: '1.0' } });
    client.notify('notifications/initialized');
    const listed = await client.request('tools/list', {});
    assert.ok(listed.tools.some((tool) => tool.name === 'execute_blender_code'));
    report.toolNames = listed.tools.map((tool) => tool.name);
    const execute = async (code) => {
      const response = await client.request('tools/call', { name: 'execute_blender_code', arguments: { code } });
      assert.ok(!response.isError, JSON.stringify(response));
      const answer = response.structuredContent ?? JSON.parse(response.content.find((block) => block.type === 'text').text);
      assert.equal(answer.status, 'ok', JSON.stringify(answer));
      return answer.result;
    };
    report.blender = await execute('import bpy\nresult = {"version": bpy.app.version_string, "background": bpy.app.background}');
    assert.equal(report.blender.background, true, 'only operate on isolated background instance');
    const python = fs.readFileSync(path.join(root, 'scripts/lib/blender-lossless-materials.py'), 'utf8');
    for (const id of ids) {
      assert.match(id, /^[a-z0-9-]+$/);
      const folder = path.join(sourceRoot, id), source = path.join(folder, 'material-fabric.glb');
      const sourceBytes = fs.readFileSync(source);
      if (readStaticGlb(sourceBytes).json.extensionsUsed?.includes('EXT_meshopt_compression')) { report.skipped.push({ id, reason: 'already compressed; rebuild material fabric to prepare a fresh baseline' }); continue; }
      const baseline = path.join(run, `${id}-baseline.glb`), candidate = path.join(run, `${id}-compressed.glb`);
      fs.writeFileSync(baseline, sourceBytes);
      const encoded = await execute(`${python}\nresult = compress_material_glb(${JSON.stringify(baseline)}, ${JSON.stringify(candidate)})`);
      const verification = await verifyLosslessGlb(sourceBytes, fs.readFileSync(candidate));
      assert.equal(encoded.sha256, verification.sha256);
      assert.ok(verification.bytes < verification.sourceBytes, `${id}: no size benefit`);
      const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
      assert.equal(manifest.materialFabric.sha256, verification.sourceSha256);
      assert.equal(manifest.materialFabric.byteLength, verification.sourceBytes);
      const indexSha256 = hashFile(path.join(folder, manifest.materialFabric.indexFile));
      assert.equal(indexSha256, manifest.materialFabric.indexSha256);
      report.buildings.push({ id, baseline: relative(baseline), candidate: relative(candidate), indexSha256, verification });
      console.log(`Verified ${id}: ${verification.sourceBytes} -> ${verification.bytes} bytes; all accessor/index/TRS bytes identical; ${verification.drawCalls} draws`);
    }
    report.mcpRequests = transcript;
    const reportPath = path.join(run, 'report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Prepared ${report.buildings.length} candidates. Apply with --apply-from ${relative(reportPath)}`);
  } finally {
    if (serverProcess) { serverProcess.stdin.end(); await delay(300); if (serverProcess.exitCode === null) serverProcess.kill(); }
    if (blenderProcess?.exitCode === null) blenderProcess.kill();
    fs.closeSync(blenderLog); fs.closeSync(serverLog);
  }
}

if (option('--apply-from')) await publish(path.resolve(root, option('--apply-from')));
else await prepare();
