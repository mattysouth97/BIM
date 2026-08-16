import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadIfc } from "../engine-download";

describe("downloadIfc", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn(() => "blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    // happy-dom's URL doesn't implement createObjectURL/revokeObjectURL.
    (URL as unknown as { createObjectURL: typeof createObjectURLSpy }).createObjectURL = createObjectURLSpy;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURLSpy }).revokeObjectURL = revokeObjectURLSpy;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a temporary anchor with the filename, and revokes the URL", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    downloadIfc(bytes, "test-building.ifc");

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
  });

  it("does not append the anchor permanently to the document", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const before = document.body.querySelectorAll("a").length;
    downloadIfc(bytes, "test-building.ifc");
    const after = document.body.querySelectorAll("a").length;
    expect(after).toBe(before);
  });

  it("is a no-op when document is undefined (non-DOM environment guard)", () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error -- simulate a non-DOM environment
    delete globalThis.document;
    try {
      expect(() => downloadIfc(new Uint8Array([1]), "x.ifc")).not.toThrow();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
