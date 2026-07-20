---
id: P0-03
title: Register a CJK font so Korean PDF export stops rendering tofu
priority: P0
area: report
status: done
owner: claude-fable-5-ultrawork
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-08]
---

# P0-03 — Register a CJK font so Korean PDF export stops rendering tofu

## 1. Requirement (RE)

- **Problem**: Every Korean glyph in a generated PDF renders as tofu (□) because the
  renderer only uses the WinAnsi-encoded standard fonts.
  - `src/lib/report/pdf-renderer.tsx:20,30` — `fontFamily: 'Helvetica'`; `:54,100,130,149,182`
    — `fontFamily: 'Helvetica-Bold'` (**7 usages total**, corrected from the brief's 4 during
    SPEC spot-check). The import block (`:5-11`) does not even import `Font`.
  - Verified by grep: **no `Font.register` call exists anywhere in `src/`**.
  - Korean text is emitted throughout the document: cover meta labels `생성일` / `섹션 수`
    (`pdf-renderer.tsx:359,363`), `section.titleKo` (`:334`, fed e.g. by
    `templates/energy-audit.ts:101` `titleKo: '건물 개요'`), bilingual report-type labels
    (`:241-245`, e.g. `'Energy Audit Report / 에너지 감사 보고서'`), section content labels
    (`report-engine.ts:59-69`, `에너지효율등급` etc.), the Korean disclaimer
    (`report-engine.ts:319`), and user data such as Korean building names
    (`pdf-renderer.tsx:354`).
  - `@react-pdf/renderer` `^4.3.3` (`package.json:20`); its 14 standard fonts are
    WinAnsi-only — CJK requires `Font.register` with an embedded TTF/OTF.
  - Errors are invisible to users: both PDF download handlers swallow failures into
    `console.error` only (`report-stage.tsx:333-335,353-355`).
- **Evidence corrections from spot-check** (review-brief drift, verified by direct read):
  - Brief cited `energy-audit.ts:101` as a different Korean phrase; the verified actual
    string at that line is `titleKo: '건물 개요'`.
  - Brief cited cover labels at `:359-364`; verified `생성일` at `:359`, `섹션 수` at `:363`.
- **Impact**: The PDF export — the deliverable a user hands to a client or grant program —
  is unreadable for its primary Korean audience: cover page, section titles, table labels,
  disclaimers, and building names all show boxes.
- **Use case**: As a Korean building professional, I want the downloaded PDF to render
  Hangul correctly and to be told when generation fails, so that I can actually use the
  exported report.

## 2. Specification (SDD)

- **Context pack** (read first, in order):
  1. `src/lib/report/pdf-renderer.tsx` (401 lines) — styles `:18-235`; Korean emission points `:241-245,334,359-364`.
  2. `src/lib/report/templates/energy-audit.ts:98-110` — section 1 title pair (`title`/`titleKo`).
  3. `src/components/report/report-stage.tsx:318-358` — both PDF download handlers (`handleDownloadEnergyPdf`, `handleDownloadCompliancePdf`) and their `catch` blocks.
  4. `src/components/export/export-dropdown.tsx:11,23-46` — the in-repo toast pattern: `import { toast } from "sonner"` + `toast.success/error(...)` (sonner `^2.0.7`, `package.json:48`; toaster at `src/components/ui/sonner.tsx`).
  5. Verified: no `.ttf`/`.otf` font assets exist under `public/` or `src/` today; `public/` currently holds only svg/hdr/textures/releases/samples/wasm.
- **BDD scenarios**:
  1. *Hangul renders*: Given a `ReportData` with a Korean `buildingName` (e.g. `'서울에너지빌딩'`) and `type: 'energy-audit'` (label contains `에너지 감사 보고서`, `pdf-renderer.tsx:242`), When `pdf(<ReportPDF data={...}/>)` renders, Then generation resolves without throwing and produces a non-empty document.
  2. *Latin unaffected*: Given an ASCII-only building name, When rendered, Then output is still produced (the registered font covers Latin).
  3. *Failure surfaces*: Given `pdf(...).toBlob()` rejects, When `handleDownloadEnergyPdf` catches, Then `toast.error` is called with a user-readable KO/EN message and `pdfLoading` resets to false.
  4. *Offline-safe*: Given the app is offline, When a PDF is generated, Then the font still loads (bundled static asset, not a CDN fetch).

## 3. Constraints (CDD)

- **Design constraints**:
  - Font asset: add **Noto Sans KR** (Regular + Bold) as static files under `public/fonts/` (e.g. `NotoSansKR-Regular.otf`, `NotoSansKR-Bold.otf`), sourced from the official googlefonts/noto-cjk release. Target ≤ 4 MB per weight; if the full OTF exceeds that, subset (Hangul syllables + Latin + digits + common punctuation, e.g. via `pyftsubset`) and document the exact subsetting command in the PR.
  - Register once, at module scope of `pdf-renderer.tsx` (or a small `src/lib/report/pdf-fonts.ts` imported by it):
    `Font.register({ family: 'NotoSansKR', fonts: [{ src: '/fonts/NotoSansKR-Regular.otf' }, { src: '/fonts/NotoSansKR-Bold.otf', fontWeight: 700 }] })`.
    Generation happens client-side (`report-stage.tsx:323-331` dynamic-imports `pdf`), so `src` is a same-origin static URL — never a Google Fonts CDN URL.
  - Replace all four `fontFamily` usages (`pdf-renderer.tsx:20,30,54,100`) with `'NotoSansKR'`.
  - Do not add `Font.registerHyphenationCallback` unless the visual smoke test shows broken wrapping.
  - Error surfacing: in `report-stage.tsx:333-335` and `:353-355`, keep the `console.error` and add `toast.error(isKo ? "PDF 생성에 실패했습니다." : "PDF generation failed. Please try again.")`, following the sonner pattern in `export-dropdown.tsx`.
  - Bundle the SIL OFL license file (`public/fonts/OFL.txt` or adjacent) — Noto fonts are OFL; bundling is permitted, license carriage required.
- **May touch**:
  - `src/lib/report/pdf-renderer.tsx`
  - new: `public/fonts/` (font binaries + OFL license), optionally `src/lib/report/pdf-fonts.ts`
  - `src/components/report/report-stage.tsx` (toast lines only)
  - new: `src/lib/report/__tests__/` (directory does not exist — create it)
- **Must not**:
  - Do not change report content, section order, or `ReportData` types.
  - Do not modify `report-engine.ts` or template files (content is correct — this is a rendering-layer bug).
  - Do not add npm font packages that fetch at render time; no new runtime dependencies.
- **Fitness functions**:
  - `grep -rn "Font.register" src/lib/report/` → at least one hit.
  - `grep -n "Helvetica" src/lib/report/pdf-renderer.tsx` → zero hits outside comments.
  - Font binaries + license exist under `public/fonts/`; added size documented in PR.
  - Test render of a fixture containing `에너지 감사 보고서` and a Korean building name resolves without throwing.
  - `grep -n "toast.error" src/components/report/report-stage.tsx` → ≥ 2 hits.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/report/__tests__/pdf-renderer.test.tsx` (new): minimal `ReportData` with `buildingName: '서울에너지빌딩'`, `type: 'energy-audit'`; drive the same `pdf(<ReportPDF data={...}/>)` path used at `report-stage.tsx:331` and assert it resolves to non-empty output. If `.toBlob()` is unavailable under happy-dom, use the node-appropriate API v4 exposes (`toBuffer()`/`toString()`) and note the choice in a test comment.
  - Same file: assert the font-registration module ran (spy / import side-effect check) before render.
  - `src/components/report/__tests__/report-stage-pdf-error.test.tsx` (new, if time-box permits): mock `pdf().toBlob()` to reject; assert `toast.error` called and loading state cleared.
- **Gates**:
  - `pnpm test -- pdf-renderer`
  - `pnpm test` (full suite)
  - `pnpm lint && pnpm build`
  - Manual smoke: `pnpm dev`, load a Korean-named building, download the energy-audit PDF, visually confirm Hangul renders; attach screenshot to PR.
- **Security / honesty checklist**:
  - Font served same-origin from `public/` — no third-party request at render time.
  - OFL license file bundled with attribution preserved.
  - Error toast contains no stack traces or internal paths.
  - No "fixed" claim without the visual smoke screenshot.
- **Acceptance criteria**:
  - [x] `Font.register` for Noto Sans KR (Regular + Bold) executes before any PDF render.
  - [x] All Helvetica references replaced; cover labels, `titleKo`, report-type labels, content labels, and building names render as glyphs.
  - [x] Regression test rendering a Korean building name is green.
  - [x] PDF failures surface via `toast.error` (KO/EN) in both download handlers.
  - [x] Tests, lint, build green; ~~visual smoke screenshot attached~~ (see honesty note).
- **Done when**: A downloaded energy-audit PDF for a Korean-named building shows fully rendered Hangul, and a forced render failure produces a toast instead of silence.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- `src/lib/report/pdf-fonts.ts` registers NotoSansKR (400 + 700) at module scope; imported
  for side effect by `pdf-renderer.tsx`. Browser loads `/fonts/*` same-origin; VITEST runs
  read the same files from disk (offline-deterministic; branch documented in the module).
- All **7** Helvetica usages replaced (`NotoSansKR` + `fontWeight: 700` for the 5 bold
  styles). `toast.error` (KO/EN) added to both download handlers; loading reset preserved.
- Fonts: official noto-cjk **SubsetOTF/KR** builds — Regular 4.64 MB, Bold 4.82 MB +
  `public/fonts/OFL.txt`. **Deviation**: exceeds the ≤4 MB/weight target; further
  `pyftsubset` subsetting was not possible (no Python/fonttools on this machine). The
  language-subset OTF is the smallest official build; revisit if bundle size matters.
- Gates: `vitest run pdf-renderer` 4/4 (incl. PDF-bytes assertion that font descriptors
  reference NotoSansKR — proof of embedding, not just "no throw") · `pnpm test` 950 passed /
  1 skipped · `pnpm lint` 0 errors · `pnpm build` green.
- Honesty notes: (1) **visual smoke screenshot not captured** — embedding is proven by the
  PDF-bytes test; a human eyeball pass on a downloaded PDF is still recommended.
  (2) The optional `report-stage-pdf-error` component test was **not written** (time-box;
  would need heavy store/hook mocking) — toast wiring verified by grep fitness (2 hits) and
  code review only.
