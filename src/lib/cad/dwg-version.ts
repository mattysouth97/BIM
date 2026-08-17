// src/lib/cad/dwg-version.ts
//
// DWG format identification + per-tier capability rules + failure diagnostics.
//
// Every DWG file begins with a 6-byte ASCII version tag ("AC1032", …). It is
// the ONLY thing about a DWG that can be read without a full parser, and it
// decides which converter can possibly succeed. Reading it first turns
// "DWG_CONVERSION_FAILED" from a dead end into a statement: which format the
// file is, which tiers could not handle it, and what each tier that DID run
// actually said.
//
// Pure module — no DOM, no Node, no WASM. Shared by the browser tier chain
// (`dwg-parser.ts`) and the server route (`/api/cad/convert`), so both name
// the same versions and the same reasons.

/** A DWG release tag → the AutoCAD release that introduced it. */
interface DwgRelease {
  label: string;
  /** Release year, or `null` for pre-release/R-series tags without one. */
  year: number | null;
}

/**
 * Recognised DWG version tags (bytes 0–5 of the file header).
 *
 * The numeric part is monotonic across releases, which is what
 * `versionRank()` relies on to reason about "newer than tier X supports"
 * without enumerating future tags.
 *
 * Source: Open Design Alliance DWG format specification, §2 "File header";
 * LibreDWG `dwg_version_type` enum.
 */
export const DWG_RELEASES: Record<string, DwgRelease> = {
  AC1006: { label: "AutoCAD R10", year: 1988 },
  AC1009: { label: "AutoCAD R11/R12", year: 1990 },
  AC1012: { label: "AutoCAD R13", year: 1994 },
  AC1014: { label: "AutoCAD R14", year: 1997 },
  AC1015: { label: "AutoCAD 2000", year: 2000 },
  AC1018: { label: "AutoCAD 2004", year: 2004 },
  AC1021: { label: "AutoCAD 2007", year: 2007 },
  AC1024: { label: "AutoCAD 2010", year: 2010 },
  AC1027: { label: "AutoCAD 2013", year: 2013 },
  AC1032: { label: "AutoCAD 2018", year: 2018 },
};

/**
 * Legacy alias kept for callers that render `versionId → human label`
 * directly.
 */
export const DWG_VERSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(DWG_RELEASES).map(([id, r]) => [id, r.label]),
);

export interface DwgVersionInfo {
  /** The raw 6-byte tag, e.g. "AC1032". */
  versionId: string;
  /** Human release name, e.g. "AutoCAD 2018". "Unknown" when unrecognised. */
  label: string;
  /** Release year, or `null` when unrecognised or pre-dating year naming. */
  year: number | null;
  /** False when the tag is well-formed but not in `DWG_RELEASES`. */
  known: boolean;
  fileSize: number;
}

/** Well-formed tag shape: "AC" + 4 digits. */
const DWG_TAG_PATTERN = /^AC\d{4}$/;

/**
 * Numeric rank of a version tag (AC1032 → 1032), used for "newer than"
 * comparisons. Returns `null` for malformed tags.
 */
export function versionRank(versionId: string): number | null {
  if (!DWG_TAG_PATTERN.test(versionId)) return null;
  return Number.parseInt(versionId.slice(2), 10);
}

/**
 * Read the 6-byte DWG version tag.
 *
 * Returns `null` when the buffer is too short or does not start with a
 * well-formed "ACxxxx" tag — i.e. the file is not a DWG at all. A well-formed
 * but unrecognised tag (a future release) is NOT null: it comes back with
 * `known: false` so callers can attempt conversion anyway rather than
 * refusing a file they merely have no name for.
 */
export function readDwgVersion(buffer: ArrayBuffer): DwgVersionInfo | null {
  if (buffer.byteLength < 6) return null;

  const versionId = String.fromCharCode(...new Uint8Array(buffer, 0, 6));
  if (!DWG_TAG_PATTERN.test(versionId)) return null;

  const release = DWG_RELEASES[versionId];
  return {
    versionId,
    label: release?.label ?? "Unknown",
    year: release?.year ?? null,
    known: release !== undefined,
    fileSize: buffer.byteLength,
  };
}

/** How a version reads in a message: "AutoCAD 2018 (AC1032)". */
export function describeVersion(version: DwgVersionInfo | null): string {
  if (!version) return "알 수 없는 형식";
  if (!version.known) return `미확인 DWG 버전 (${version.versionId})`;
  return `${version.label} (${version.versionId})`;
}

// ---------------------------------------------------------------------------
// Tier capabilities
// ---------------------------------------------------------------------------

export type DwgTierName = "libdxfrw" | "libredwg" | "server";

interface TierCapability {
  label: string;
  /**
   * Highest version rank the tier can read, or `null` for "no known ceiling".
   * A file above the ceiling is SKIPPED — attempting it produces a failure
   * that says nothing, which is worse than saying why it cannot work.
   */
  maxRank: number | null;
}

/**
 * What each conversion tier can actually read.
 *
 * - `libdxfrw` — the libdxfrw C++ port. Its DWG reader implements R14 through
 *   AC1027 (2013); AC1032 support was never added upstream, so a 2018+ file
 *   is refused rather than attempted.
 * - `libredwg` — GNU LibreDWG, whose decoder covers R13 through AC1032.
 * - `server` — `/api/cad/convert`, which runs LibreDWG under Node (plus an
 *   optional external converter binary). Same read coverage as `libredwg`.
 */
export const TIER_CAPABILITIES: Record<DwgTierName, TierCapability> = {
  libdxfrw: { label: "libdxfrw WASM (브라우저)", maxRank: 1027 },
  libredwg: { label: "LibreDWG WASM (브라우저)", maxRank: 1032 },
  server: { label: "서버 변환 /api/cad/convert", maxRank: 1032 },
};

export interface TierSupport {
  supported: boolean;
  /** Present only when `supported` is false — why the tier is being skipped. */
  reason?: string;
}

/**
 * Whether `tier` can be expected to read `version`.
 *
 * An unrecognised (`known: false`) version is always reported as supported:
 * we cannot prove a future format is unreadable, and a real attempt yields a
 * better diagnostic than a guess.
 */
export function tierSupports(
  tier: DwgTierName,
  version: DwgVersionInfo | null,
): TierSupport {
  const cap = TIER_CAPABILITIES[tier];
  if (!version || !version.known || cap.maxRank === null) return { supported: true };

  const rank = versionRank(version.versionId);
  if (rank === null || rank <= cap.maxRank) return { supported: true };

  const ceiling = Object.entries(DWG_RELEASES).find(
    ([id]) => versionRank(id) === cap.maxRank,
  );
  const ceilingLabel = ceiling ? `${ceiling[1].label} (${ceiling[0]})` : `AC${cap.maxRank}`;

  return {
    supported: false,
    reason: `${version.versionId}는 지원 범위를 벗어납니다 — 이 단계는 ${ceilingLabel}까지만 읽습니다.`,
  };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type TierStatus = "succeeded" | "failed" | "skipped";

export interface DwgTierOutcome {
  tier: DwgTierName;
  status: TierStatus;
  /** Why it was skipped, or what it reported when it failed. */
  detail?: string;
}

export interface DwgDiagnostics {
  version: DwgVersionInfo | null;
  outcomes: DwgTierOutcome[];
}

const STATUS_LABEL: Record<TierStatus, string> = {
  succeeded: "성공",
  failed: "시도함 → 실패",
  skipped: "건너뜀",
};

/** One human-readable line per tier: name → attempted/skipped → reason. */
export function formatTierOutcome(outcome: DwgTierOutcome): string {
  const label = TIER_CAPABILITIES[outcome.tier].label;
  const status = STATUS_LABEL[outcome.status];
  return outcome.detail
    ? `${label} — ${status}: ${outcome.detail}`
    : `${label} — ${status}`;
}

export interface DwgFailureReport {
  /** Headline shown as the typed error's message. */
  message: string;
  /** One line per tier, in the order they were considered. */
  detail: string[];
}

/**
 * Assemble the failure a user actually sees: what the file IS, then what each
 * tier did about it, then advice that fits the specific situation rather than
 * the same "save as AutoCAD 2013" for every case.
 */
export function summariseDwgFailure(
  diagnostics: DwgDiagnostics,
  fileName?: string,
): DwgFailureReport {
  const { version, outcomes } = diagnostics;
  const subject = fileName ? `"${fileName}"은(는)` : "이 파일은";

  if (!version) {
    return {
      message: `${subject} DWG 파일로 보이지 않습니다 — 파일 시작 부분에 AC 버전 헤더가 없습니다. 다른 형식의 파일에 .dwg 확장자만 붙였는지 확인하세요.`,
      detail: outcomes.map(formatTierOutcome),
    };
  }

  const attempted = outcomes.filter((o) => o.status === "failed");
  const skipped = outcomes.filter((o) => o.status === "skipped");

  const head = `${subject} ${describeVersion(version)} 형식입니다.`;

  let verdict: string;
  if (attempted.length === 0 && skipped.length > 0) {
    // Nothing even ran — the format is beyond every converter we ship.
    verdict =
      "사용 가능한 변환 단계가 없습니다. CAD 프로그램에서 'AutoCAD 2013 DWG'로 저장하거나 DXF로 내보낸 뒤 다시 업로드하세요.";
  } else if (!version.known) {
    verdict =
      "인식되지 않는 버전이라 변환을 시도했으나 모두 실패했습니다. DXF로 내보낸 뒤 다시 업로드하세요.";
  } else {
    verdict =
      "변환을 시도한 모든 단계가 실패했습니다. 도면이 손상되었거나 변환기가 다루지 못하는 요소를 포함할 수 있습니다. DXF로 내보낸 뒤 다시 업로드하세요.";
  }

  return { message: `${head} ${verdict}`, detail: outcomes.map(formatTierOutcome) };
}
