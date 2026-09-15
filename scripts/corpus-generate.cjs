// Resumable bounded generation. Artifacts and source rows must live outside git.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
require('./corpus-loader.cjs');
const { runCorpusBatch, corpusManifest } = require('../src/lib/corpus/batch.ts');
const args=process.argv.slice(2);const arg=name=>args[args.indexOf(name)+1];
const sourceDir=path.resolve(arg('--source'));const output=path.resolve(arg('--out'));const repo=path.resolve(__dirname,'..');
for(const target of [sourceDir,output])if(target===repo||target.startsWith(repo+path.sep))throw new Error('Corpus artifacts must stay outside repository');
cp.execFileSync('git',['diff','--quiet','--','src/lib/corpus','src/lib/energy','src/lib/energy-diagnostics','src/lib/retrofit'],{cwd:repo});
const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'pilot-titles.json'),'utf8'));
const pilot=JSON.parse(fs.readFileSync(path.join(sourceDir,'pilot.json'),'utf8'));
if(!pilot.requests.some(r=>r.status===200&&r.rows>0)||pilot.rowsObserved<source.length)throw new Error('Successful bounded pilot and observed source rows are required');
if(source.length>100&&!args.includes('--pilot-reviewed'))throw new Error('More than 100 records requires explicit pilot review flag');
fs.mkdirSync(path.join(output,'outcomes'),{recursive:true});
const metadataPath=path.join(output,'job.json');
const pinnedCommit=args.includes('--source-commit')?arg('--source-commit'):cp.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
cp.execFileSync('git',['diff','--quiet',pinnedCommit,'HEAD','--','src/lib/corpus','src/lib/energy','src/lib/energy-diagnostics','src/lib/retrofit'],{cwd:repo});
const context=fs.existsSync(metadataPath)?JSON.parse(fs.readFileSync(metadataPath,'utf8')):{releaseId:arg('--release'),sourceCommit:pinnedCommit,generatedAt:new Date().toISOString(),retrievedAt:pilot.completedAt,licenceDecisionId:arg('--licence-decision')};
if(!context.releaseId||!context.licenceDecisionId)throw new Error('Release id and licence decision are required');
const atomic=(file,data)=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,file);};
if(!fs.existsSync(metadataPath))atomic(metadataPath,context);
const outPath=i=>path.join(output,'outcomes',String(i).padStart(8,'0')+'.json');
const checkpointPath=path.join(output,'checkpoint.json');
const store={
  readCheckpoint:async()=>fs.existsSync(checkpointPath)?JSON.parse(fs.readFileSync(checkpointPath,'utf8')):null,
  writeCheckpoint:async value=>atomic(checkpointPath,value),
  readOutcome:async i=>fs.existsSync(outPath(i))?JSON.parse(fs.readFileSync(outPath(i),'utf8')):null,
  writeOutcome:async(i,value)=>atomic(outPath(i),value),
};
(async()=>{
  const checkpoint=await runCorpusBatch(source,context,store,Number(args.includes('--max-records')?arg('--max-records'):source.length));
  const outcomes=[];for(let i=0;i<checkpoint.nextIndex;i++)outcomes.push(await store.readOutcome(i));
  const manifest=corpusManifest(outcomes,context,checkpoint.complete);
  atomic(path.join(output,'manifest.json'),manifest);
  fs.writeFileSync(path.join(output,'records.ndjson'),outcomes.filter(o=>o.status==='generated').map(o=>JSON.stringify(o.record)).join('\n')+'\n');
  fs.writeFileSync(path.join(output,'exclusions.ndjson'),outcomes.filter(o=>o.status==='excluded').map(o=>JSON.stringify(o.exclusion)).join('\n')+'\n');
  console.log(JSON.stringify({complete:checkpoint.complete,processed:checkpoint.nextIndex,total:source.length,generated:manifest.recordCount,excluded:manifest.exclusionCount,sourceCommit:context.sourceCommit}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
