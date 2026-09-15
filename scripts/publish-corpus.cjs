// Operator CLI. Run with node --conditions=react-server --env-file=<private env>.
require('./corpus-loader.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { validateSnapshot, snapshotSha256, preparePublication } = require('../src/lib/corpus/publication.ts');
const { createCorpusStore } = require('../src/lib/corpus/store.ts');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
function external(input, existing = true) {
  if (!input) throw Error('An external artifact path is required');
  const resolved = existing ? fs.realpathSync(input) : path.join(fs.realpathSync(path.dirname(path.resolve(input))), path.basename(input));
  const relative = path.relative(root, resolved);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Corpus artifacts must be outside the repository');
  return resolved;
}
function readJson(input) { return JSON.parse(fs.readFileSync(external(input),'utf8').replace(/^\uFEFF/,'')); }
function snapshot(directory) {
  const dir=external(directory);
  const manifest=readJson(path.join(dir,'manifest.json'));
  const records=fs.readFileSync(path.join(dir,'records.ndjson'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  return validateSnapshot({manifest,records});
}
async function main() {
  const [action,input,optionsFile,output] = process.argv.slice(2);
  if (action === 'initialize') { await createCorpusStore().initialize(); console.log('Corpus tables ready. No release was published.'); return; }
  if (action === 'inspect') {
    const clean=snapshot(input);
    console.log(JSON.stringify({snapshotSha256:snapshotSha256(clean),manifest:clean.manifest},null,2)); return;
  }
  if (action === 'prepare') {
    const artifact=preparePublication(snapshot(input),readJson(optionsFile));
    fs.writeFileSync(external(output,false),JSON.stringify(artifact,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({prepared:true,releaseId:artifact.release.releaseId,snapshotSha256:artifact.release.snapshotSha256,recordCount:artifact.records.length})); return;
  }
  if (action === 'publish') {
    const artifact=readJson(input);
    // Explicit hash argument makes the reviewed object concrete at the last step.
    if (optionsFile !== artifact.release?.snapshotSha256) throw Error('Pass the reviewed snapshot SHA-256 as the final publication argument');
    const store=createCorpusStore();
    await store.publish(artifact);
    const stored=await store.download(artifact.release.releaseId);
    if (!stored || stored.release.snapshotSha256 !== optionsFile || stored.records.length !== artifact.records.length) throw Error('Publication readback mismatch');
    console.log(JSON.stringify({published:true,releaseId:stored.release.releaseId,recordCount:stored.records.length,snapshotSha256:stored.release.snapshotSha256})); return;
  }
  throw Error('Usage: publish-corpus.cjs initialize | inspect <external-release-dir> | prepare <dir> <review-options.json> <output.json> | publish <artifact.json> <reviewed-sha256>');
}
main().catch(error=>{ console.error(error?.name==='ZodError' ? 'Publication rejected: record or manifest does not match the reviewed public schema.' : error.message);process.exitCode=1; });
