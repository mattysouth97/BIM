const fs = require('node:fs');
const path = require('node:path');
require('./corpus-loader.cjs');
const { normalizeServiceKey, quoteUnsafeIntegerLiterals, extractItems, extractTotalCount } = require('../src/lib/api-proxy.ts');
const { sanitizeTitle } = require('../src/lib/corpus/generator.ts');
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
const envFile = value('--env-file');
const outDir = path.resolve(value('--out'));
const workspace = path.resolve(__dirname, '..');
if (outDir === workspace || outDir.startsWith(workspace + path.sep)) throw new Error('Corpus artifacts must be outside the repository');
if (envFile) process.loadEnvFile(envFile);
const key = process.env.DATA_GO_KR_API_KEY;
if (!key) throw new Error('DATA_GO_KR_API_KEY is required');
fs.mkdirSync(outDir, { recursive: true });
const queries = [
  { sigunguCd: '11680', bjdongCd: '10300', pageNo: 1, numOfRows: 25 },
  { sigunguCd: '26110', bjdongCd: '10100', pageNo: 1, numOfRows: 25 },
  { sigunguCd: '27110', bjdongCd: '10100', pageNo: 1, numOfRows: 25 },
];
const requiredFields = ['mgmBldrgstPk', 'mainPurpsCd', 'sigunguCd', 'archArea', 'totArea', 'grndFlrCnt', 'heit', 'useAprDay'];
(async () => {
  const report = { pilotId: `register-pilot-${new Date().toISOString().replace(/[:.]/g,'-')}`, startedAt: new Date().toISOString(), completedAt: null, advertisedDevelopmentTraffic: 10000, advertisedSource: 'https://www.data.go.kr/data/15134735/openapi.do', actualDailyQuota: null, quotaBasis: 'Only an observed bounded request window; no rate-limit saturation probe and no inferred daily ceiling.', requests: [], completeness: {}, rowsObserved: 0 };
  const rows = [];
  for (const query of queries) {
    const url = new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo');
    url.searchParams.set('serviceKey', normalizeServiceKey(key)); url.searchParams.set('_type','json');
    for (const [k,v] of Object.entries(query)) url.searchParams.set(k,String(v));
    const started = Date.now();
    let entry = { query, requestedAt: new Date().toISOString(), elapsedMs: 0, status: null, resultCode: null, rows: 0, totalCount: null, rateLimitHeaders: {}, transportError: null };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
      entry.status = response.status;
      for (const header of ['retry-after','x-ratelimit-limit','x-ratelimit-remaining','ratelimit-limit','ratelimit-remaining']) {
        const headerValue = response.headers.get(header); if (headerValue) entry.rateLimitHeaders[header] = headerValue;
      }
      const body = await response.text();
      if (body.trim().startsWith('{')) {
        const parsed = JSON.parse(quoteUnsafeIntegerLiterals(body));
        entry.resultCode = String(parsed?.response?.header?.resultCode ?? 'missing');
        const items = extractItems(parsed);
        entry.totalCount = extractTotalCount(parsed);
        if (entry.resultCode === '00' || entry.resultCode === '0') {
          const sanitized = items.map(sanitizeTitle); rows.push(...sanitized); entry.rows = sanitized.length;
        }
      } else entry.resultCode = body.match(/<(?:resultCode|returnReasonCode)>([^<]+)</)?.[1] ?? 'non-json-response';
    } catch (error) { entry.transportError = error?.name ?? 'TransportError'; }
    entry.elapsedMs = Date.now() - started;
    report.requests.push(entry);
    console.log(JSON.stringify({ query, status: entry.status, resultCode: entry.resultCode, rows: entry.rows, elapsedMs: entry.elapsedMs }));
    if (entry.status === 429 || ['22','23'].includes(entry.resultCode)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  report.rowsObserved = rows.length;
  for (const field of requiredFields) {
    const present = rows.filter(row => typeof row[field] === 'number' ? row[field] > 0 : Boolean(row[field])).length;
    report.completeness[field] = { present, observed: rows.length, fraction: rows.length ? present/rows.length : null };
  }
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir,'pilot.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(outDir,'pilot-titles.json'),JSON.stringify(rows,null,2));
  console.log(JSON.stringify({ rowsObserved: rows.length, successfulRequests: report.requests.filter(r=>r.status===200 && ['00','0'].includes(r.resultCode)).length, actualDailyQuota: null, output: outDir }));
})().catch(error => { console.error(error.name); process.exitCode = 1; });
