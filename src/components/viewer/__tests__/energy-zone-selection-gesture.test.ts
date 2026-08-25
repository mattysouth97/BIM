import { describe, expect, it } from "vitest";

import { isIntentionalZoneSelection } from "../energy-zone-layer";

describe("energy-zone selection gesture", () => {
  it("accepts clicks and rejects orbit drags", () => {
    expect(isIntentionalZoneSelection(0)).toBe(true);
    expect(isIntentionalZoneSelection(4)).toBe(true);
    expect(isIntentionalZoneSelection(4.01)).toBe(false);
    expect(isIntentionalZoneSelection(120)).toBe(false);
  });
});
