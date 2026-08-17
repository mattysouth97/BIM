import { describe, it, expect } from "vitest";
import {
  readDwgVersion,
  versionRank,
  tierSupports,
  describeVersion,
  formatTierOutcome,
  summariseDwgFailure,
  DWG_RELEASES,
  DWG_VERSIONS,
  TIER_CAPABILITIES,
  type DwgTierName,
  type DwgTierOutcome,
} from "../dwg-version";

/** Hand-build a buffer whose first bytes are an ASCII version tag. */
function headerBuffer(ascii: string, totalSize = 64): ArrayBuffer {
  const buf = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buf);
  for (let i = 0; i < ascii.length && i < totalSize; i++) {
    view[i] = ascii.charCodeAt(i);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// readDwgVersion — the 6-byte sniff
// ---------------------------------------------------------------------------

describe("readDwgVersion", () => {
  it("returns null for an empty buffer", () => {
    expect(readDwgVersion(new ArrayBuffer(0))).toBeNull();
  });

  it("returns null for a buffer shorter than the 6-byte tag", () => {
    expect(readDwgVersion(headerBuffer("AC1032", 5))).toBeNull();
  });

  it("returns null when the leading bytes are not an AC tag", () => {
    for (const notDwg of ["NOTDWG", "%PDF-1", "PKab", "AC10X2"]) {
      expect(readDwgVersion(headerBuffer(notDwg))).toBeNull();
    }
  });

  it.each(Object.entries(DWG_RELEASES))(
    "identifies %s as its release",
    (versionId, release) => {
      const info = readDwgVersion(headerBuffer(versionId, 128));
      expect(info).not.toBeNull();
      expect(info!.versionId).toBe(versionId);
      expect(info!.label).toBe(release.label);
      expect(info!.year).toBe(release.year);
      expect(info!.known).toBe(true);
      expect(info!.fileSize).toBe(128);
    },
  );

  it("reads AC1032 (AutoCAD 2018) — the format modern CAD tools save by default", () => {
    const info = readDwgVersion(headerBuffer("AC1032", 4096));
    expect(info).toMatchObject({
      versionId: "AC1032",
      label: "AutoCAD 2018",
      year: 2018,
      known: true,
    });
  });

  it("accepts a well-formed but unrecognised tag as known:false, not null", () => {
    // A future release must not be refused merely for being unnamed — the
    // tiers should still try, and say so.
    const info = readDwgVersion(headerBuffer("AC1050"));
    expect(info).not.toBeNull();
    expect(info!.known).toBe(false);
    expect(info!.label).toBe("Unknown");
    expect(info!.year).toBeNull();
  });

  it("reads exactly 6 bytes and ignores the rest of the file", () => {
    const buf = headerBuffer("AC1027", 32);
    new Uint8Array(buf).fill(0xff, 6);
    expect(readDwgVersion(buf)!.versionId).toBe("AC1027");
  });

  it("keeps the legacy DWG_VERSIONS id→label map in sync with DWG_RELEASES", () => {
    for (const [id, release] of Object.entries(DWG_RELEASES)) {
      expect(DWG_VERSIONS[id]).toBe(release.label);
    }
  });
});

describe("versionRank", () => {
  it("extracts the numeric rank", () => {
    expect(versionRank("AC1032")).toBe(1032);
    expect(versionRank("AC1015")).toBe(1015);
  });

  it("orders releases monotonically", () => {
    expect(versionRank("AC1027")!).toBeLessThan(versionRank("AC1032")!);
    expect(versionRank("AC1014")!).toBeLessThan(versionRank("AC1021")!);
  });

  it("returns null for a malformed tag", () => {
    expect(versionRank("NOTDWG")).toBeNull();
    expect(versionRank("AC103")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tierSupports — the skip rules that keep a doomed attempt from running
// ---------------------------------------------------------------------------

describe("tierSupports", () => {
  const version = (id: string) => readDwgVersion(headerBuffer(id));

  it("lets libdxfrw handle everything up to AC1027 (AutoCAD 2013)", () => {
    for (const id of ["AC1014", "AC1015", "AC1018", "AC1021", "AC1024", "AC1027"]) {
      expect(tierSupports("libdxfrw", version(id)).supported).toBe(true);
    }
  });

  it("skips libdxfrw for AC1032, naming the ceiling", () => {
    const support = tierSupports("libdxfrw", version("AC1032"));
    expect(support.supported).toBe(false);
    expect(support.reason).toContain("AC1032");
    expect(support.reason).toContain("AutoCAD 2013");
  });

  it("lets LibreDWG and the server handle AC1032", () => {
    for (const tier of ["libredwg", "server"] as DwgTierName[]) {
      expect(tierSupports(tier, version("AC1032")).supported).toBe(true);
    }
  });

  it("attempts every tier for an unrecognised version rather than skipping", () => {
    // Unsupported cannot be proven for a format we have no record of.
    const unknown = version("AC1050");
    expect(unknown!.known).toBe(false);
    for (const tier of Object.keys(TIER_CAPABILITIES) as DwgTierName[]) {
      expect(tierSupports(tier, unknown).supported).toBe(true);
    }
  });

  it("attempts every tier when the version could not be read at all", () => {
    for (const tier of Object.keys(TIER_CAPABILITIES) as DwgTierName[]) {
      expect(tierSupports(tier, null).supported).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Diagnostic assembly
// ---------------------------------------------------------------------------

describe("describeVersion", () => {
  it("names the release and the tag together", () => {
    expect(describeVersion(readDwgVersion(headerBuffer("AC1032")))).toBe(
      "AutoCAD 2018 (AC1032)",
    );
  });

  it("says the tag is unrecognised rather than inventing a name", () => {
    expect(describeVersion(readDwgVersion(headerBuffer("AC1050")))).toContain("AC1050");
    expect(describeVersion(readDwgVersion(headerBuffer("AC1050")))).toContain("미확인");
  });

  it("handles a missing version", () => {
    expect(describeVersion(null)).toBe("알 수 없는 형식");
  });
});

describe("formatTierOutcome", () => {
  it("renders tier → status → reason for a skip", () => {
    const line = formatTierOutcome({
      tier: "libdxfrw",
      status: "skipped",
      detail: "AC1032는 지원 범위를 벗어납니다",
    });
    expect(line).toContain("libdxfrw");
    expect(line).toContain("건너뜀");
    expect(line).toContain("AC1032는 지원 범위를 벗어납니다");
  });

  it("renders tier → status → error for an attempt", () => {
    const line = formatTierOutcome({
      tier: "libredwg",
      status: "failed",
      detail: "Failed to resolve module specifier",
    });
    expect(line).toContain("LibreDWG");
    expect(line).toContain("시도함 → 실패");
    expect(line).toContain("Failed to resolve module specifier");
  });

  it("omits the reason clause when there is none", () => {
    expect(formatTierOutcome({ tier: "server", status: "succeeded" })).toContain("성공");
  });
});

describe("summariseDwgFailure", () => {
  const v = (id: string) => readDwgVersion(headerBuffer(id));

  it("leads with what the file IS", () => {
    const report = summariseDwgFailure(
      { version: v("AC1032"), outcomes: [] },
      "plan.dwg",
    );
    expect(report.message).toContain("AutoCAD 2018 (AC1032)");
    expect(report.message).toContain("plan.dwg");
  });

  it("falls back to a generic subject without a filename", () => {
    const report = summariseDwgFailure({ version: v("AC1032"), outcomes: [] });
    expect(report.message).toContain("이 파일은");
  });

  it("lists one detail line per tier, in order", () => {
    const outcomes: DwgTierOutcome[] = [
      { tier: "libdxfrw", status: "skipped", detail: "너무 최신" },
      { tier: "libredwg", status: "failed", detail: "boom" },
      { tier: "server", status: "failed", detail: "502" },
    ];
    const report = summariseDwgFailure({ version: v("AC1032"), outcomes });
    expect(report.detail).toHaveLength(3);
    expect(report.detail[0]).toContain("libdxfrw");
    expect(report.detail[1]).toContain("LibreDWG");
    expect(report.detail[2]).toContain("서버");
  });

  it("says no tier could run when every tier was skipped", () => {
    const report = summariseDwgFailure({
      version: v("AC1032"),
      outcomes: [
        { tier: "libdxfrw", status: "skipped", detail: "x" },
        { tier: "libredwg", status: "skipped", detail: "x" },
        { tier: "server", status: "skipped", detail: "x" },
      ],
    });
    expect(report.message).toContain("사용 가능한 변환 단계가 없습니다");
  });

  it("distinguishes 'all attempts failed' from 'nothing could run'", () => {
    const report = summariseDwgFailure({
      version: v("AC1027"),
      outcomes: [
        { tier: "libdxfrw", status: "failed", detail: "corrupt" },
        { tier: "libredwg", status: "failed", detail: "corrupt" },
        { tier: "server", status: "failed", detail: "corrupt" },
      ],
    });
    expect(report.message).toContain("변환을 시도한 모든 단계가 실패");
    expect(report.message).not.toContain("사용 가능한 변환 단계가 없습니다");
  });

  it("calls out an unrecognised version in the verdict", () => {
    const report = summariseDwgFailure({
      version: v("AC1050"),
      outcomes: [{ tier: "libredwg", status: "failed", detail: "nope" }],
    });
    expect(report.message).toContain("인식되지 않는 버전");
  });

  it("reports a non-DWG file as such instead of blaming conversion", () => {
    const report = summariseDwgFailure({ version: null, outcomes: [] }, "notes.txt");
    expect(report.message).toContain("DWG 파일로 보이지 않습니다");
    expect(report.message).toContain("notes.txt");
  });
});
