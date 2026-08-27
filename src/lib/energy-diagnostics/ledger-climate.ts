/**
 * 건축물대장 → weather-source resolution.
 *
 * The energy adapter picks a climate file by scanning `site.weatherSource`
 * and `site.location` for a region token (`adapter.ts` → `regionCode`). A
 * register always carries a 시군구코드 whose first two digits are the 시도, so
 * the region is knowable exactly rather than by guessing at an address string.
 *
 * When neither the code nor the address yields a region this returns null and
 * the caller must refuse to build a model. Silently defaulting to Seoul would
 * price a Jeju building against Seoul degree-days.
 */

/**
 * 시도 code → the token the adapter matches on, plus a display label.
 * 전라북도 uses the NEW 52 prefix; the retired 45 prefix is mapped too so an
 * older cached record still resolves.
 */
const SIDO_TOKENS: Readonly<Record<string, Readonly<{ token: string; ko: string }>>> =
  Object.freeze({
    "11": { token: "Seoul", ko: "서울특별시" },
    "26": { token: "Busan", ko: "부산광역시" },
    "27": { token: "Daegu", ko: "대구광역시" },
    "28": { token: "Incheon", ko: "인천광역시" },
    "29": { token: "Gwangju", ko: "광주광역시" },
    "30": { token: "Daejeon", ko: "대전광역시" },
    "31": { token: "Ulsan", ko: "울산광역시" },
    "36": { token: "Sejong", ko: "세종특별자치시" },
    "41": { token: "Gyeonggi", ko: "경기도" },
    "43": { token: "Chungbuk", ko: "충청북도" },
    "44": { token: "Chungnam", ko: "충청남도" },
    "45": { token: "Jeonbuk", ko: "전라북도" },
    "52": { token: "Jeonbuk", ko: "전라북도" },
    "46": { token: "Jeonnam", ko: "전라남도" },
    "47": { token: "Gyeongbuk", ko: "경상북도" },
    "48": { token: "Gyeongnam", ko: "경상남도" },
    "50": { token: "Jeju", ko: "제주특별자치도" },
    "51": { token: "Gangwon", ko: "강원특별자치도" },
  });

/** Address fallback, in the same order the adapter itself scans. */
const ADDRESS_TOKENS: readonly (readonly [string, string])[] = Object.freeze([
  ["서울", "11"], ["부산", "26"], ["대구", "27"], ["인천", "28"],
  ["광주", "29"], ["대전", "30"], ["울산", "31"], ["세종", "36"],
  ["경기", "41"], ["충북", "43"], ["충청북", "43"], ["충남", "44"],
  ["충청남", "44"], ["전북", "52"], ["전라북", "52"], ["전남", "46"],
  ["전라남", "46"], ["경북", "47"], ["경상북", "47"], ["경남", "48"],
  ["경상남", "48"], ["제주", "50"], ["강원", "51"],
]);

export type LedgerWeatherResolution = Readonly<{
  /** Value for `site.weatherSource` — carries the adapter's region token. */
  weatherSource: string;
  sidoCode: string;
  ko: string;
  /** Whether the 시군구코드 gave the answer, or the address had to be read. */
  via: "sigunguCd" | "address";
}>;

export function resolveLedgerWeatherSource(
  input: Readonly<{ sigunguCd?: string; platPlcNm?: string; newPlatPlc?: string }>,
): LedgerWeatherResolution | null {
  const prefix = String(input.sigunguCd ?? "").trim().slice(0, 2);
  const byCode = SIDO_TOKENS[prefix];
  if (byCode) {
    return Object.freeze({
      weatherSource: `KR-${byCode.token}-TMY`,
      sidoCode: prefix,
      ko: byCode.ko,
      via: "sigunguCd" as const,
    });
  }

  const address = `${input.platPlcNm ?? ""} ${input.newPlatPlc ?? ""}`;
  const matched = ADDRESS_TOKENS.find(([token]) => address.includes(token));
  if (matched) {
    const entry = SIDO_TOKENS[matched[1]];
    return Object.freeze({
      weatherSource: `KR-${entry.token}-TMY`,
      sidoCode: matched[1],
      ko: entry.ko,
      via: "address" as const,
    });
  }

  return null;
}
