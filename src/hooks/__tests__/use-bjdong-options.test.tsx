import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createBjdongDataLoader,
  useBjdongOptions,
  type BjdongMap,
} from "../use-bjdong-options";

describe("createBjdongDataLoader", () => {
  it("defers the import until called and reuses one cached promise", async () => {
    const data: BjdongMap = {
      "11680": [{ code: "10300", name: "Yeoksam-dong" }],
    };
    const importer = vi.fn(async () => ({ default: data }));
    const load = createBjdongDataLoader(importer);

    expect(importer).not.toHaveBeenCalled();

    const first = load();
    const second = load();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(data);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("clears a rejected import so the next call retries", async () => {
    const data: BjdongMap = {
      "11680": [{ code: "10300", name: "Yeoksam-dong" }],
    };
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValueOnce({ default: data });
    const load = createBjdongDataLoader(importer);

    await expect(load()).rejects.toThrow("chunk failed");
    await expect(load()).resolves.toBe(data);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe("useBjdongOptions", () => {
  it("does not expose options before a district is selected", () => {
    const loader = vi.fn<() => Promise<BjdongMap>>();
    const { result } = renderHook(() => useBjdongOptions("", loader));

    expect(result.current.options).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it("loads options after a district is selected", async () => {
    const data: BjdongMap = {
      "11680": [{ code: "10300", name: "Yeoksam-dong" }],
    };
    let resolveLoad: (data: BjdongMap) => void = () => undefined;
    const pendingLoad = new Promise<BjdongMap>((resolve) => {
      resolveLoad = resolve;
    });
    const loader = vi.fn(() => pendingLoad);
    const { result, rerender } = renderHook(
      ({ sigunguCd }) => useBjdongOptions(sigunguCd, loader),
      { initialProps: { sigunguCd: "" } },
    );

    act(() => rerender({ sigunguCd: "11680" }));

    expect(result.current.isLoading).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    act(() => resolveLoad(data));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.options).toEqual(data["11680"]);
  });
});
