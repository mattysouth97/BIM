import { describe, expect, it } from "vitest";

import { cameraPoseForFocusTarget } from "../scene-controls";

describe("diagnostic camera focus pose", () => {
  it("frames the target along its evidence-backed outward direction", () => {
    const pose = cameraPoseForFocusTarget(
      {
        requestId: "finding:east-wall",
        center: [5, 1.5, 0],
        radius: 4,
        viewDirection: [1, 0.25, 0],
      },
      35,
      5,
      100,
    );

    expect(pose.target).toEqual([5, 1.5, 0]);
    expect(pose.position[0]).toBeGreaterThan(pose.target[0]);
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
    expect(pose.position[2]).toBeCloseTo(pose.target[2]);
    expect(pose.distance).toBeGreaterThan(5);
  });

  it("clamps focus distance to the viewer's navigation limits", () => {
    const pose = cameraPoseForFocusTarget(
      {
        requestId: "finding:building",
        center: [0, 10, 0],
        radius: 1_000,
      },
      35,
      5,
      80,
    );

    expect(pose.distance).toBe(80);
    expect(
      Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2],
      ),
    ).toBeCloseTo(80);
  });
});
