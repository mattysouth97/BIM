import { describe, it, expect } from "vitest";
import { planSortRank, viewLabel } from "../view-label";
import type { PlanView } from "../view-definition";

function plan(levelId: string, name: string): PlanView {
  return {
    id: `plan-${levelId}`,
    name,
    kind: "plan",
    levelId,
    levelElevation: 0,
    levelHeight: 3,
    cameraState: {
      kind: "ortho",
      position: [0, 10, 0],
      target: [0, 0, 0],
      zoom: 10,
      near: 0.1,
      far: 100,
    },
  };
}

describe("viewLabel", () => {
  it("labels plan and elevation in Korean", () => {
    expect(viewLabel(plan("1", "1F"), true)).toContain("평면도");
    expect(
      viewLabel(
        {
          id: "elev-front",
          name: "South Elevation",
          kind: "elevation",
          side: "front",
          cameraState: plan("1", "1F").cameraState,
        },
        true,
      ),
    ).toBe("남측 입면");
  });

  it("sorts 1F before basements", () => {
    const ids = [plan("-1", "B1"), plan("2", "2F"), plan("1", "1F")].sort(
      (a, b) => planSortRank(a) - planSortRank(b),
    );
    expect(ids.map((v) => v.levelId)).toEqual(["1", "2", "-1"]);
  });
});
