import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ringCentroidLngLat, useOsmBuilding } from "../use-osm-building";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const OUTLINE = {
  polygon: [
    [
      [126.9778, 37.5664],
      [126.979, 37.5664],
      [126.979, 37.5669],
      [126.9778, 37.5669],
      [126.9778, 37.5664],
    ],
  ],
  osmType: "way",
  osmId: 198561926,
  tags: { building: "yes" },
  error: null,
};

describe("ringCentroidLngLat", () => {
  it("lands inside a simple ring", () => {
    const c = ringCentroidLngLat(OUTLINE.polygon)!;
    expect(c.lng).toBeCloseTo(126.9784, 5);
    expect(c.lat).toBeCloseTo(37.56665, 5);
  });

  it("does not let the repeated closing vertex drag the point off-centre", () => {
    const open = [OUTLINE.polygon[0].slice(0, 4)];
    expect(ringCentroidLngLat(OUTLINE.polygon)).toEqual(ringCentroidLngLat(open));
  });

  it("is null for absent or empty geometry", () => {
    expect(ringCentroidLngLat(null)).toBeNull();
    expect(ringCentroidLngLat([])).toBeNull();
    expect(ringCentroidLngLat([[]])).toBeNull();
  });

  it("ignores non-finite vertices rather than producing NaN", () => {
    const c = ringCentroidLngLat([
      [
        [126.9778, 37.5664],
        [Number.NaN, 37.5664],
        [126.979, 37.5669],
      ],
    ])!;
    expect(Number.isFinite(c.lng)).toBe(true);
    expect(Number.isFinite(c.lat)).toBe(true);
  });
});

describe("useOsmBuilding", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries by coordinates when a point is known", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => OUTLINE });

    const { result } = renderHook(
      () => useOsmBuilding({ lat: 37.5663, lng: 126.9779 }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.hasOutline).toBe(true));
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/osm/building?");
    expect(url).toContain("lat=37.5663");
    expect(url).toContain("lng=126.9779");
    expect(url).not.toContain("address=");
  });

  it("falls back to the address when no point is known", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => OUTLINE });

    const { result } = renderHook(
      () => useOsmBuilding({ address: "서울특별시 중구 세종대로 110" }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.hasOutline).toBe(true));
    expect(String(fetchMock.mock.calls[0][0])).toContain("address=");
  });

  it("does not fire at all without a point or an address", () => {
    renderHook(() => useOsmBuilding({}), { wrapper: wrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an outage as an error, never as 'no building here'", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

    const { result } = renderHook(
      () => useOsmBuilding({ lat: 37.5663, lng: 126.9779 }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.osm).not.toBeNull());
    expect(result.current.osm!.error).toBe("HTTP 502");
    // The distinction that matters: an outage must not read as an answer.
    expect(result.current.hasOutline).toBe(false);
  });
});
