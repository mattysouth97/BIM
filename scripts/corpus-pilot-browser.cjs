// Bounded pilot through the same-origin production proxy; no credential export.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
require('./corpus-loader.cjs');
const { sanitizeTitle } = require('../src/lib/corpus/generator.ts');
const args = process.argv.slice(2);
const outDir = path.resolve(args[args.indexOf('--out') + 1]);
const repo = path.resolve(__dirname, '..');
if (outDir === repo || outDir.startsWith(repo + path.sep)) throw new Error('Artifacts must be outside git');
const queries = [{sigunguCd:'11680',bjdongCd:'10300',pageNo:1,numOfRows:25},{sigunguCd:'26110',bjdongCd:'10100',pageNo:1,numOfRows:25},{sigunguCd:'27110',bjdongCd:'10100',pageNo:1,numOfRows:25}];
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.goto('https://bim-self.vercel.app/diagnostics/new?method=ledger',{waitUntil:'domcontentloaded'});
    const report={pilotId:'register-proxy-pilot-2026-09-15',startedAt:new Date().toISOString(),completedAt:null,transport:'Normal browser same-origin production proxy',advertisedDevelopmentTraffic:10000,actualDailyQuota:null,quotaBasis:'3-request bounded window through published proxy; no upstream quota ceiling observed or inferred.',requests:[],completeness:{},rowsObserved:0};
    const rows=[];
    for(const query of queries){
      const result=await page.evaluate(async(query)=>{
        const start=performance.now();
        const response=await fetch('/api/bldrgst/title?'+new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)])),{signal:AbortSignal.timeout(30000)});
        const json=await response.json();
        return {status:response.status,elapsedMs:Math.round(performance.now()-start),computeRegion:response.headers.get('x-vercel-id')?.split('::').slice(0,2).join('::')??null,items:Array.isArray(json.items)?json.items:[],totalCount:json.totalCount??null,retryAfter:response.headers.get('retry-after')};
      },query);
      rows.push(...result.items.map(sanitizeTitle));
      const entry={query,status:result.status,elapsedMs:result.elapsedMs,computeRegion:result.computeRegion,rows:result.items.length,totalCount:result.totalCount,retryAfter:result.retryAfter};
      report.requests.push(entry);console.log(JSON.stringify(entry));
      if(result.status===429)break;
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    report.rowsObserved=rows.length;report.completedAt=new Date().toISOString();
    for(const field of ['mgmBldrgstPk','mainPurpsCd','sigunguCd','archArea','totArea','grndFlrCnt','heit','useAprDay']){
      const present=rows.filter(row=>typeof row[field]==='number'?row[field]>0:Boolean(row[field])).length;
      report.completeness[field]={present,observed:rows.length,fraction:rows.length?present/rows.length:null};
    }
    fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'pilot.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(outDir,'pilot-titles.json'),JSON.stringify(rows,null,2));
    console.log(JSON.stringify({rowsObserved:rows.length,successfulRequests:report.requests.filter(r=>r.status===200).length,actualDailyQuota:null}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.name);process.exitCode=1;});
