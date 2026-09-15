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

import { SIDO_TOKENS, ADDRESS_TOKENS } from '@/lib/energy/climate-region';

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
