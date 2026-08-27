# BIMFIT — Building Energy Retrofit Simulator

> 구상에서 트윈까지: 설명하거나, 그리거나, 도면을 가져오면 시맨틱 BIM과 3D 트윈이
> 생성되고, 실제 물리 엔진으로 에너지 수요·등급·CO₂와 개보수 경제성을 진단합니다.
>
> Concept to twin: describe a building, draw a plan, or import a drawing — the app
> generates a semantic BIM + 3D twin and diagnoses energy demand / grade / CO₂ and
> retrofit economics with a real physics stack.

건물은 **생성형 엔진**으로만 진입합니다 — 자연어 설명, 브라우저에서 그린 도면,
또는 가져온 DWG/DXF/SVG. 에너지가 이 제품의 핵심입니다: 모든 설계는 도일(degree-day)
엔진으로 수요·EUI를 보고하고, 설계 변경은 에너지 변화량으로 답합니다.

Buildings enter only through the generative engine — a described prompt, a drawn
schematic, or an imported DWG/DXF/SVG. Energy is the point: every design reports
demand/EUI from the degree-day engine, and modifications answer with their deltas.

## 주요 기능 · Features

- **생성형 스튜디오 (`/studio`)** — 글로 설명하기 · 도면 그리기 · 에너지 진단의
  세 가지 시작 모드. 폴리곤 기반 BIM 생성, 자연어 수정/수리, 2D 평면 기호,
  102-패밀리 절차적 인테리어.
- **설계단계 에너지 진단 (`/studio?start=diagnose`)** — 도면 세트 등록 → 추출
  검토 → Tier-1 스크리닝 모델 → 모델 검사 → 실제 엔진 시뮬레이션 → 진단 소견 →
  개선 대안 비교 → 개보수 경제성. 모든 입력값은 출처(도면 근거·사용자 확인·가정·
  기본값)를 추적합니다.
- **디지털 트윈 (`/building/[id]`)** — 생성된 설계(GEN-xxxx)와 데모 건물의
  절차적 3D 트윈, 외피/구조/에너지존/MEP 레이어, 일람표·시트, 리포트.
- **개보수 경제성** — 예산 기반 measure 선정(knapsack), NPV/IRR/할인 회수기간,
  그린리모델링 보조금 트랙, PDF/CSV/JSON 내보내기.

사용자 여정: **입력(설명/도면) → 건물 모델 → 진단 → 개선 → 리포트**.

## 시작하기 · Getting started

### 1. 요구 사항 · Prerequisites

- Node.js 22+ · pnpm 10+ (`corepack enable`).

### 2. 설치 및 실행 · Install & run

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

### 3. 환경 변수 · Environment (optional)

- `ANTHROPIC_API_KEY` (`.env.local`) — 자연어 건물 생성/수정(`/api/generative/*`)에
  필요합니다. Required for natural-language generation and modification.
- `DATA_GO_KR_API_KEY` — 건축물대장 조회의 **공용 서버 키**입니다. 설정하면 방문자가
  자기 키 없이도 건물을 검색할 수 있습니다(같은 출처 요청만, IP당 요청 제한).
  설정하지 않으면 사용자가 설정에서 자기 키를 넣거나 샘플 건물만 쓸 수 있습니다.
  The shared server key for register lookup. With it, visitors search without
  holding their own key (same-origin only, rate-limited per IP). Without it they
  must supply their own key in Settings, or use the bundled sample building.
- `VWORLD_API_KEY` / `VWORLD_DOMAIN` — 실측 건물 외곽선(GIS). 없으면 건축면적에서
  만든 직사각형이 쓰이며, 그 사실이 가정으로 표시됩니다.
  Real GIS building outlines. Without them a rectangle derived from 건축면적 is
  used, and that fact is shown as a named assumption.

## 명령어 · Commands

| Command | Description |
|---|---|
| `pnpm dev` | Dev server (port 3000) |
| `pnpm build` | Production build (also type-checks) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest suite |
| `pnpm test:e2e` | Playwright e2e (reuses a running dev server) |
| `pnpm test:coverage` | Vitest with coverage thresholds |

## 기술 스택 · Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Zustand · TanStack Query/Table ·
React Three Fiber + drei/postprocessing · @react-pdf/renderer · Tailwind CSS ·
shadcn/ui · Vitest · Playwright.

## 배포 · Deploy

Vercel에 배포할 수 있습니다 — 이 저장소를 Vercel 프로젝트에 연결한 뒤
`vercel` (preview) 또는 `vercel --prod` (production)로 배포하세요.
Deploy your own on Vercel: link the repo to a Vercel project and run `vercel`
(preview) or `vercel --prod`.

## 라이선스 · License

Private / internal project. Bundled Noto Sans KR fonts are under the SIL Open
Font License 1.1 (see `public/fonts/OFL.txt`).
