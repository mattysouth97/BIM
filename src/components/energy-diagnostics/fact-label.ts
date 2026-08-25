import type { DiagnosisLocale } from "./types";

type LabelRule = Readonly<{
  pattern: RegExp;
  ko: (match: RegExpMatchArray) => string;
  en: (match: RegExpMatchArray) => string;
}>;

/**
 * Human-readable names for canonical fact keys. The raw key stays available in
 * the evidence inspector; these labels are what practitioners read first.
 */
const RULES: readonly LabelRule[] = [
  {
    pattern: /^drawing\.[^.]+\.boundary\.(\d+)\.areaSqm$/,
    ko: () => "바닥 경계 면적",
    en: () => "Floor boundary area",
  },
  {
    pattern: /^drawing\.[^.]+\.boundary\.(\d+)\.polygon$/,
    ko: () => "바닥 경계 외곽선",
    en: () => "Floor boundary outline",
  },
  {
    pattern: /^drawing\.[^.]+\.drawingScale$/,
    ko: () => "도면 축척",
    en: () => "Drawing scale",
  },
  {
    pattern: /^drawing\.[^.]+\.units$/,
    ko: () => "도면 단위",
    en: () => "Drawing units",
  },
  {
    pattern: /^geometry\.repeatedStoreyCount$/,
    ko: () => "반복 층수",
    en: () => "Repeated storey count",
  },
  {
    pattern: /^geometry\.floorToFloorHeightM$/,
    ko: () => "층고",
    en: () => "Floor-to-floor height",
  },
  {
    pattern: /^site\.northOrientationDeg$/,
    ko: () => "북쪽 방위각",
    en: () => "North orientation",
  },
  {
    pattern: /^geometry\.plate\.[^.]*?(\d+)[^.]*\.boundary$/,
    ko: (match) => `${match[1]}층 바닥판 외곽선`,
    en: (match) => `Level ${match[1]} floor-plate outline`,
  },
  {
    pattern: /^surface\.[^.]*?(\d+)-wall-(\d+)\.areaSqm$/,
    ko: (match) => `${match[1]}층 벽 ${match[2]} 면적`,
    en: (match) => `L${match[1]} wall ${match[2]} area`,
  },
  {
    pattern: /^surface\.[^.]*?(\d+)-wall-(\d+)\.azimuthDeg$/,
    ko: (match) => `${match[1]}층 벽 ${match[2]} 방위각`,
    en: (match) => `L${match[1]} wall ${match[2]} azimuth`,
  },
  {
    pattern: /^surface\.[^.]*?(\d+)-wall-(\d+)\.tiltDeg$/,
    ko: (match) => `${match[1]}층 벽 ${match[2]} 기울기`,
    en: (match) => `L${match[1]} wall ${match[2]} tilt`,
  },
  {
    pattern: /^surface\.[^.]+\.(areaSqm|azimuthDeg|tiltDeg)$/,
    ko: (match) =>
      match[1] === "areaSqm" ? "면 면적" : match[1] === "azimuthDeg" ? "면 방위각" : "면 기울기",
    en: (match) =>
      match[1] === "areaSqm" ? "Surface area" : match[1] === "azimuthDeg" ? "Surface azimuth" : "Surface tilt",
  },
  {
    pattern: /^opening\.([^.]+)\.widthM$/,
    ko: (match) => `창호 ${match[1]} 폭`,
    en: (match) => `Window ${match[1]} width`,
  },
  {
    pattern: /^opening\.([^.]+)\.heightM$/,
    ko: (match) => `창호 ${match[1]} 높이`,
    en: (match) => `Window ${match[1]} height`,
  },
  {
    pattern: /^opening\.([^.]+)\.areaSqm$/,
    ko: (match) => `창호 ${match[1]} 면적`,
    en: (match) => `Window ${match[1]} area`,
  },
  {
    pattern: /^opening\.([^.]+)\.sillHeightM$/,
    ko: (match) => `창호 ${match[1]} 창대 높이`,
    en: (match) => `Window ${match[1]} sill height`,
  },
  {
    pattern: /^envelope\.infiltration\.airChangesPerHour$|^envelope\.infiltrationAirChangesPerHour$/,
    ko: () => "침기율",
    en: () => "Air infiltration rate",
  },
  {
    pattern: /^construction\.([^.]+)\.uValueWPerM2K$/,
    ko: (match) => `${constructionKo(match[1])} 열관류율(U값)`,
    en: (match) => `${constructionEn(match[1])} U-value`,
  },
  {
    pattern: /^construction\.([^.]+)\.shgc$/,
    ko: (match) => `${constructionKo(match[1])} 일사취득계수(SHGC)`,
    en: (match) => `${constructionEn(match[1])} SHGC`,
  },
  {
    pattern: /^construction\.([^.]+)\.name$/,
    ko: (match) => `${constructionKo(match[1])} 이름`,
    en: (match) => `${constructionEn(match[1])} name`,
  },
  {
    pattern: /^zone\.([^.]+)\.(name|floorAreaSqm|volumeM3|conditioned)$/,
    ko: (match) =>
      match[2] === "name"
        ? "열구역 이름"
        : match[2] === "floorAreaSqm"
          ? "열구역 바닥면적"
          : match[2] === "volumeM3"
            ? "열구역 체적"
            : "열구역 냉난방 여부",
    en: (match) =>
      match[2] === "name"
        ? "Zone name"
        : match[2] === "floorAreaSqm"
          ? "Zone floor area"
          : match[2] === "volumeM3"
            ? "Zone volume"
            : "Zone conditioning",
  },
  {
    pattern: /^hvac\.([^.]+)\.(heatingEfficiency|coolingCop|capacityKw|heatRecoveryEfficiency)$/,
    ko: (match) =>
      match[2] === "heatingEfficiency"
        ? "난방 효율(COP)"
        : match[2] === "coolingCop"
          ? "냉방 COP"
          : match[2] === "capacityKw"
            ? "설비 용량"
            : "열회수 효율",
    en: (match) =>
      match[2] === "heatingEfficiency"
        ? "Heating efficiency (COP)"
        : match[2] === "coolingCop"
          ? "Cooling COP"
          : match[2] === "capacityKw"
            ? "System capacity"
            : "Heat-recovery efficiency",
  },
  {
    pattern: /^building\.useType$/,
    ko: () => "건물 용도",
    en: () => "Building use type",
  },
  {
    pattern: /^usage\.(heatingSetpointC|coolingSetpointC|occupancyDensity|lightingPowerDensity|equipmentPowerDensity)/,
    ko: (match) =>
      match[1] === "heatingSetpointC"
        ? "난방 설정온도"
        : match[1] === "coolingSetpointC"
          ? "냉방 설정온도"
          : match[1] === "occupancyDensity"
            ? "재실 밀도"
            : match[1] === "lightingPowerDensity"
              ? "조명 밀도"
              : "기기 밀도",
    en: (match) =>
      match[1] === "heatingSetpointC"
        ? "Heating setpoint"
        : match[1] === "coolingSetpointC"
          ? "Cooling setpoint"
          : match[1] === "occupancyDensity"
            ? "Occupancy density"
            : match[1] === "lightingPowerDensity"
              ? "Lighting power density"
              : "Equipment power density",
  },
];

function constructionKo(id: string): string {
  if (id.includes("wall")) return "외벽";
  if (id.includes("roof")) return "지붕";
  if (id.includes("ground") || id.includes("floor")) return "최하층 바닥";
  if (id.includes("window") || id.includes("glaz")) return "창호";
  return id;
}

function constructionEn(id: string): string {
  if (id.includes("wall")) return "Exterior wall";
  if (id.includes("roof")) return "Roof";
  if (id.includes("ground") || id.includes("floor")) return "Ground floor";
  if (id.includes("window") || id.includes("glaz")) return "Window";
  return id;
}

/** Last-resort prettifier: `foo.barBaz.quxM` → `bar baz qux`. */
function fallbackLabel(key: string): string {
  const segment = key.split(".").slice(1).join(" ");
  return segment
    .replaceAll(/[-_]/g, " ")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

export function factKeyLabel(key: string, locale: DiagnosisLocale): string {
  for (const rule of RULES) {
    const match = key.match(rule.pattern);
    if (match) return locale === "en" ? rule.en(match) : rule.ko(match);
  }
  return fallbackLabel(key);
}

const STATUS_LABEL: Record<DiagnosisLocale, Record<string, string>> = {
  ko: {
    verified: "검증됨",
    user_confirmed: "사용자 확인",
    extracted: "도면 추출",
    inferred: "규칙 추론",
    defaulted: "기본값",
    conflicted: "충돌",
    missing: "누락",
  },
  en: {
    verified: "Verified",
    user_confirmed: "User-confirmed",
    extracted: "Extracted",
    inferred: "Inferred",
    defaulted: "Default",
    conflicted: "Conflicted",
    missing: "Missing",
  },
};

export function factStatusLabel(status: string, locale: DiagnosisLocale): string {
  return STATUS_LABEL[locale][status] ?? status;
}
