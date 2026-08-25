export const landingCopy = {
  ko: {
    skip: "본문으로 건너뛰기",
    brand: "BIMFIT",
    display: "건물 에너지 진단",
    heroPhrase: "건물을 보고 · 손실을 찾고 · 개선안을 비교합니다",
    version: "v0.1.0",
    newDiagnostic: "새 에너지 진단",
    sampleDiagnostic: "샘플 진단 체험",
    layerRail: "건물 레이어",
    layers: {
      rendered: { name: "렌더", caption: "벽돌 외피 · 창호 · 처마" },
      structure: { name: "구조", caption: "슬래브 · 기둥 · 코어" },
      mechanical: { name: "기계", caption: "층마다 덕트 · 배관 · 전기" },
      all: { name: "전체", caption: "외피 · 골조 · 설비가 같은 건물" },
    },
  },
  en: {
    skip: "Skip to content",
    brand: "BIMFIT",
    display: "Building Energy Diagnostic",
    heroPhrase: "See the building · Find the loss · Test the improvement",
    version: "v0.1.0",
    newDiagnostic: "New Energy Diagnostic",
    sampleDiagnostic: "Try sample diagnostic",
    layerRail: "Building layers",
    layers: {
      rendered: { name: "Rendered", caption: "Brick, punched windows, cornice" },
      structure: { name: "Structure", caption: "Slabs · columns · core" },
      mechanical: { name: "Mechanical", caption: "Ducts, pipe, power on every floor" },
      all: { name: "All", caption: "Envelope, frame, and plant of one building" },
    },
  },
} as const;

export type LandingLang = keyof typeof landingCopy;
export type LandingCopy = (typeof landingCopy)[LandingLang];
