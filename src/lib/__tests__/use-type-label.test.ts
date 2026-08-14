import { describe, it, expect } from "vitest";
import { formatUseTypeLabel } from "@/lib/constants";

describe("formatUseTypeLabel", () => {
  it("returns the Korean ledger noun for 14000", () => {
    expect(formatUseTypeLabel("14000", "ko")).toBe("업무시설");
  });
  it("returns the English noun when asked", () => {
    expect(formatUseTypeLabel("14000", "en")).toBe("Office");
  });
  it("does not echo an unknown raw code as a blank", () => {
    expect(formatUseTypeLabel("99999", "ko")).toBe("99999");
  });
  it("labels a missing code as 미상 / Unknown", () => {
    expect(formatUseTypeLabel(undefined, "ko")).toBe("미상");
    expect(formatUseTypeLabel(undefined, "en")).toBe("Unknown");
  });
});
