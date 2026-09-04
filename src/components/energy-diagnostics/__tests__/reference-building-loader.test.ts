import { describe, expect, it, vi } from "vitest";

import { fetchReferenceBuildingRecord } from "@/components/energy-diagnostics/model-operations";
import { REFERENCE_BUILDING_CATALOG } from "@/data/reference-buildings";

import { stubReferenceBuildingRecord } from "./fixtures/reference-building-stub";

const CATALOGUED_ID = REFERENCE_BUILDING_CATALOG[0]!.id;

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () =>
    ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => {
        if (typeof body === "string") throw new SyntaxError("not JSON");
        return body;
      },
    }) as unknown as Response,
  );
}

describe("fetchReferenceBuildingRecord", () => {
  it("returns the record for a catalogued building", async () => {
    const record = stubReferenceBuildingRecord({ id: CATALOGUED_ID });
    const fetchImpl = respondWith(record);

    await expect(
      fetchReferenceBuildingRecord(CATALOGUED_ID, fetchImpl),
    ).resolves.toEqual(record);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/reference-buildings/${CATALOGUED_ID}/model.json`,
    );
  });

  it("refuses an uncatalogued id without making a request", async () => {
    // The id arrives from a query parameter. Resolving it against the bundled
    // catalog before building a URL is what keeps a crafted value from
    // becoming a request path at all.
    const fetchImpl = respondWith(stubReferenceBuildingRecord());

    await expect(
      fetchReferenceBuildingRecord("../../etc/passwd", fetchImpl),
    ).rejects.toThrow(/No registered building is catalogued/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports the status when the record is not deployed", async () => {
    const fetchImpl = respondWith(null, { ok: false, status: 404 });

    await expect(
      fetchReferenceBuildingRecord(CATALOGUED_ID, fetchImpl),
    ).rejects.toThrow(/\(404\)/);
  });

  it("refuses a response that is not readable JSON", async () => {
    const fetchImpl = respondWith("<!doctype html><title>404</title>");

    await expect(
      fetchReferenceBuildingRecord(CATALOGUED_ID, fetchImpl),
    ).rejects.toThrow(/did not return a readable record/);
  });

  it("refuses a payload that is not a reference-building record", async () => {
    const fetchImpl = respondWith({ kind: "something_else", schemaVersion: 1 });

    await expect(
      fetchReferenceBuildingRecord(CATALOGUED_ID, fetchImpl),
    ).rejects.toThrow(/this build does not understand/);
  });

  it("refuses a record whose id disagrees with the catalog", async () => {
    // Hand-authored catalog, generated record. If they disagree the user is
    // being shown a different building from the one they chose.
    const fetchImpl = respondWith(
      stubReferenceBuildingRecord({ id: "a-different-building" }),
    );

    await expect(
      fetchReferenceBuildingRecord(CATALOGUED_ID, fetchImpl),
    ).rejects.toThrow(/identifying itself as "a-different-building"/);
  });
});
