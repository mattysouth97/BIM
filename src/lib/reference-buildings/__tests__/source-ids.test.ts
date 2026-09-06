import { describe, expect, it } from "vitest";
import { uniqueSourceIds } from "../../../../scripts/lib/ifc-source-ids.mjs";

describe("source IDs after human-readable slug collisions", () => {
  it("preserves unique IDs and distinguishes punctuation variants independently of input order", () => {
    const rows = [{ id: "assembly-vs-03", ref: "ifc://A.ifc#1" }, { id: "assembly-vs-03", ref: "ifc://A.ifc#2" }, { id: "other", ref: "ifc://A.ifc#3" }];
    const unique = uniqueSourceIds(rows) as typeof rows;
    expect(new Set(unique.map((row) => row.id)).size).toBe(3);
    expect(unique[2].id).toBe("other");
    expect(uniqueSourceIds([...rows].reverse())).toEqual([...unique].reverse());
    expect(unique[0].ref).toBe(rows[0].ref);
  });
  it("does not equate express IDs from different source files, and rejects duplicate source identities", () => {
    expect(new Set(uniqueSourceIds([{id:"x",ref:"ifc://A.ifc#1"},{id:"x",ref:"ifc://B.ifc#1"}]).map((r: {id: string})=>r.id)).size).toBe(2);
    expect(()=>uniqueSourceIds([{id:"x",ref:"same"},{id:"x",ref:"same"}])).toThrow("Duplicate source identity");
  });
});
