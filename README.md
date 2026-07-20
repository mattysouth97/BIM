# GreenRetrofit Simulator

> 한국 건축물대장(建築物臺帳) 데이터를 3D 디지털 트윈으로 변환하고, 에너지 성능과
> 그린리모델링 투자 회수(ROI)를 시뮬레이션하는 웹 애플리케이션.
>
> A web app that turns Korean building-ledger (건축물대장) records into 3D digital
> twins and simulates energy performance and green-retrofit investment returns.

한국의 공공 건축물대장 데이터를 조회하여 건물의 3D 모델을 자동 생성하고, 외피·설비
정보로부터 에너지 수요·등급·CO₂ 배출을 추정한 뒤, 단열·창호·HVAC·태양광 등
개보수(retrofit) 조치의 NPV·IRR·회수기간을 계산합니다.

Search public building-ledger records, auto-generate a 3D model, estimate energy
demand / grade / CO₂ from envelope and system data, then compute NPV, IRR, and
payback for envelope, HVAC, lighting, and solar retrofit measures.

## 주요 기능 · Features

- **건물 검색 (Search)** — 시도/시군구/법정동 계층으로 전국 건축물대장 조회
  (data.go.kr 건축HUB API 프록시).
- **디지털 트윈 (Twin)** — 대장 정보 + VWorld 지적 footprint로부터 절차적
  (procedural) 3D 건물 생성 (React Three Fiber).
- **에너지 분석 (Energy)** — degree-day 방식 난방/냉방 수요, 침기·환기 손실,
  1차 에너지 기준 MOTIE/KEMCO 효율등급, 연료별 CO₂.
- **개보수 리포트 (Retrofit report)** — 예산 기반 measure 선정(knapsack),
  NPV/IRR/할인 회수기간, 그린리모델링 보조금 트랙, PDF/CSV/JSON 내보내기.

사용자 여정: **검색 → 트윈 → 리포트** (Search → Twin → Report).

## 시작하기 · Getting started

### 1. 요구 사항 · Prerequisites

- Node.js 22+ · pnpm 10+ (`corepack enable`).

### 2. 설치 및 실행 · Install & run

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

### 3. API 키 설정 · API key (required)

건축물대장 조회에는 **공공데이터포털(data.go.kr)** 서비스 키가 필요합니다.
Building search requires a **data.go.kr** service key.

1. [공공데이터포털](https://www.data.go.kr)에 가입하고 **건축HUB 건축물대장정보
   서비스**(BldRgstHubService) 활용을 신청합니다.
   Sign up at data.go.kr and request access to the 건축HUB Building Ledger service.
2. 발급받은 **일반 인증키(Decoding)** 를 복사합니다.
   Copy your issued service key (Decoding).
3. 앱 우상단 **API Key** 버튼(🔑)을 눌러 키를 붙여넣습니다. 키는 브라우저의
   로컬 저장소에만 보관되며 서버로 커밋되지 않습니다.
   Paste it via the **API Key** (🔑) button in the app header — it is stored only
   in your browser's local storage, never committed.

> 선택: VWorld 지적도 footprint를 쓰려면 `VWORLD_API_KEY` 환경변수를 설정하세요.
> Optional: set `VWORLD_API_KEY` to enable VWorld cadastral footprints.

## 명령어 · Commands

| Command | Description |
|---|---|
| `pnpm dev` | Dev server (port 3000) |
| `pnpm build` | Production build (also type-checks) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest suite |
| `pnpm test:coverage` | Vitest with coverage thresholds |

## 기술 스택 · Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Zustand · TanStack Query/Table ·
React Three Fiber + drei/postprocessing · @react-pdf/renderer · Tailwind CSS ·
shadcn/ui · Vitest.

## 배포 · Deploy

Vercel에 배포할 수 있습니다 — 이 저장소를 Vercel 프로젝트에 연결한 뒤
`vercel` (preview) 또는 `vercel --prod` (production)로 배포하세요.
Deploy your own on Vercel: link the repo to a Vercel project and run `vercel`
(preview) or `vercel --prod`.

## 라이선스 · License

Private / internal project. Bundled Noto Sans KR fonts are under the SIL Open
Font License 1.1 (see `public/fonts/OFL.txt`).
