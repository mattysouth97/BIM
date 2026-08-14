# QA Checklist

- Product: 건축물대장 (korea-building-info)
- Date: 2026-08-14
- App: http://localhost:3000 (Next.js 16 App Router)
- Build: local dev (`pnpm dev`, already running)
- Scope: journeys first (landing doors → demo twin → investment → report → CAD → search/campus), then edges
- Method: Playwright Chromium against the live UI (click, type, upload, download). No browser MCP was available.

## Summary

- Passed: 23
- Failed: 0
- Blocked: 1
- Could not run: real 대장 row (no `DATA_GO_KR_API_KEY` / no user key); DWG upload; PDF tracing; production deploy

## Journeys

### J1 First visit landing

- Status: PASS
- Steps:
  1. Cold-load `/` with empty localStorage.
  2. Read the hero, both first verbs, the no-key banner, search tabs, and campus toggle.
  3. Confirm the marketing header (KO / theme / key icon) is present.
- Result: J1 PASS — Hero “건축물대장”, primary CTA “데모 건물 둘러보기”, outline CTA “CAD 도면으로 시작하기”, amber “API 키가 설정되지 않았습니다.” banner, 지역/주소 tabs, and 캠퍼스 모드 OFF all render with no `pageerror`.

### J2 Demo door → see the twin

- Status: PASS
- Steps:
  1. From `/`, click **데모 건물 둘러보기**.
  2. Wait for `/building/demo`, dismiss the first-visit tour, orbit the canvas, read energy + NPV.
- Result: J2 PASS — Cards show `76.0 kWh/m²·yr` and `17.4 kgCO₂/m²·yr`. Rail NPV `₩1.7억` sits in the gap between docks (no overlap).
- Fix: Energy units are real characters beside the animated number (not concatenated escapes). Scene/Properties start below the rail; overlay insets around open docks.

Passed pieces of this journey (not separate bugs): J2a demo title + 데모 데이터 badge; J2b four stages, 디지털 트윈 current; J2c landing header hidden; J2d tour steps 작업 흐름 → 이 건물의 트윈 → 씬 → 속성; J2e canvas 1440×732; J2f orbit drag did not crash; J2g rail / NPV / CAPEX / 그린리모델링 visible; J2h Scene + Properties open; J2i status hint; J2j no ledger/VWorld; J2k no `pageerror`.

### J3 Know what retrofit is worth

- Status: PASS
- Steps:
  1. On the demo twin (tour already seen), read NPV at ₩2.5억.
  2. Click the CAPEX tick **5억**.
  3. Click 그린리모델링 **공공 서울·중앙**.
  4. Open **보고서**, then return to **디지털 트윈**.
- Result: J3 PASS — Budget 5억 changed the rail from 1/6 measures @ ₩2.5억 to 2/6 @ ₩5.0억 and NPV ₩1.7억 → ₩3.2억. Public-Seoul track set `aria-checked=true` and NPV moved to ₩3.6억 / IRR 18.1%. Scene listed 외피/HVAC measures; Properties showed L1 44% + 1등급. Report stayed on `/building/demo`. Returning to Twin still showed ₩5억.

### J4 Take an answer away (report + export)

- Status: PASS
- Steps:
  1. From the demo workspace, click **보고서**.
  2. Read Energy Audit, switch to 준법 인증.
  3. Click CSV, JSON, PDF. Open toolbar **내보내기**.
- Result: J4 PASS — Building Overview Use Type is 업무시설 (not 14000). Same label is what CSV/JSON export now receive.
- Fix: Reports resolve 주용도코드 through `formatUseTypeLabel` so every takeaway surface uses the ledger noun.

### J5 Start from a drawing (upload DXF)

- Status: PASS
- Steps:
  1. From `/`, click **CAD 도면으로 시작하기**.
  2. Choose a `.txt` file.
  3. Upload `docs/samples/sample-footprint.dxf`.
  4. Open **뷰어에서 열기**, close it, click **트윈으로 계속**.
- Result: J5 PASS — Door lands on 도면 업로드 for 데모 오피스 타워. `.txt` shows “지원하지 않는 파일 형식”. Sample DXF becomes 외곽선 준비 완료, layer `BIM_OUTLINE`, 240 m². Viewer opens. Continue moves `aria-current` to 디지털 트윈 with a canvas.

### J6 Draw a plan in the browser

- Status: PASS
- Steps:
  1. CAD door → **새 도면 그리기**.
  2. Rectangle tool, two clicks on the overlay.
  3. Select tool, click the rectangle, look for **바닥 외곽선으로 사용**.
- Result: J6 PASS — Closing the rectangle immediately shows **바닥 외곽선으로 사용**. Clicking inside a closed outline also picks it.
- Fix: A finished closed polyline offers the footprint bar; hit-testing treats the interior of a closed outline as a hit.

### J7 Look up a real 대장 (region search)

- Status: BLOCKED
- Steps:
  1. `/` → 지역 검색 → 서울특별시 / 강남구 / 역삼동 → **검색**.
  2. Wait until the spinner ends (25s).
- Result: Search settles on a 401. No row to open.

#### Bug (BLOCKED)

- Where: `/` region search (and the `/api/bldrgst/title` proxy)
- Expected: A results table (shared server key or user key), or a single clear “set an API key” message
- Actual: `401 Missing x-api-key header` four times. Error panel “오류가 발생했습니다 / Missing x-api-key header” plus empty-state “검색 결과가 없습니다 / 검색 조건을 변경하여 다시 시도해 주세요.” No `DATA_GO_KR_API_KEY` on this local server.
- Repro:
  1. Cold `/` with no user API key.
  2. 서울특별시 → 강남구 → 역삼동 → 검색.
  3. Wait for 검색 중… to finish.
- Evidence: `401 http://localhost:3000/api/bldrgst/title?sigunguCd=11680&bjdongCd=10100&numOfRows=20&pageNo=1` (×4). Row click not exercised.

### J8 Campus compare

- Status: PASS
- Steps:
  1. On `/`, click **캠퍼스 모드 OFF** (turns ON).
  2. Same 서울/강남/역삼 search as J7.
- Result: J8 PASS — Same 역삼동 search now shows “오류가 발생했습니다 / Missing x-api-key header”, not “건물 0동”.
- Fix: Campus uses the same key path as individual search and no longer treats a skipped query as an empty district.

## Edge cases

### E1 Empty region search validation

- Status: PASS
- Result: E1 PASS — Submit with empty fields shows “법정동을 선택하세요”.

### E2 Unknown building id

- Status: PASS
- Result: E2 PASS — `/building/test-id` after ~8s shows the red overlay “데이터를 불러오는 중 오류가 발생했습니다” (four× `Missing x-api-key header`) and “건물 데이터를 불러올 수 없습니다.” Spinner is gone. (At 3s the viewport was still spinning while the status bar already said 건물 데이터 없음.)

### E3 Deep link with persisted upload stage

- Status: PASS
- Result: E3 PASS — `/building/demo` with `bim-workflow-state.stage=upload` still names 데모 오피스 타워 and keeps the upload dropzone.

### E4 Language toggle

- Status: PASS
- Result: E4 PASS — Header control with title “Switch to English” changes the hero to “Building Ledger” and the CTA to “Explore the demo building.” Korean headings return after “한국어로 전환.”

### E5 Theme toggle

- Status: PASS
- Result: E5 PASS — Theme button flips `<html>` from `light` to `dark`.

### E6 API key dialog

- Status: PASS
- Result: E6 PASS — Key icon opens the dialog. Validate on `not-a-real-key` shows “API responded with status 403” (rejected, not saved as valid).

### E7 Small viewport (390×844)

- Status: PASS
- Steps:
  1. Load `/` at 390×844.
  2. Tap **데모 건물 둘러보기**.
- Result: E7 PASS — Title is “데모 오피스 타워”, docks stay closed, rail NPV `₩1.7억` and CAPEX sit on screen (left 16 / right 374).
- Fix: Phone twin hides docks, lets the title use remaining width, and pins CAPEX/track to the viewport instead of a centered transform that the slide-up animation was shifting off-screen.

### E8 Back to search

- Status: PASS
- Result: E8 PASS — Workspace **검색** link returns to `/` with the demo door visible.

### E9 Releases identity

- Status: PASS
- Result: E9 PASS — `/releases` shows “Portfolio Prediction Data Product”, latest `v0.1.0`, coverage 1,284 buildings, and a pending `predictions.parquet` notice.

### E10 Address search tab

- Status: PASS
- Result: E10 PASS — **주소 검색** reveals two inputs (번/지) on the active tab.

### E11 Cold report stage on demo

- Status: PASS
- Result: E11 PASS — Persisting `stage=report` then opening `/building/demo` hydrates into Energy Audit (not a permanent “건물을 먼저 선택하세요”).

### E12 Refresh keeps upload

- Status: PASS
- Result: E12 PASS — CAD door then reload stays on 도면 업로드 with the dropzone.

### E13 Internal asset bench

- Status: PASS
- Result: E13 PASS — `/dev/assets` renders without a `pageerror` (not a product door).

## Notes

- Surfaces not reached: opening a real 대장 row; campus compare of 2–4 real buildings; DWG server conversion; PDF tracer; IFC samples; `/dev/assets` interaction beyond “it mounts.”
- Shared-key fallback is not configured on this local process (`401 Missing x-api-key` for ledger). Demo twin never called data.go.kr or VWorld.
- Console during the session also logged `502` on at least one Next chunk request; no window `pageerror`.
- Scene dock measure titles stay English (“Wall Insulation Upgrade”) on the Korean-first twin. Not failed separately; the blocking twin bugs are the escaped units and the covered NPV.
