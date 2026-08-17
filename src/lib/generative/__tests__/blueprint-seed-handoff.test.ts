// src/lib/generative/__tests__/blueprint-seed-handoff.test.ts
//
// The seed survives a reload of /studio exactly once, and storage — which the
// user can edit — never reaches the editor unvalidated.

import { beforeEach, describe, expect, it } from "vitest";

import { footprintToBlueprint } from "@/lib/generative/blueprint/from-footprint";
import {
  clearSeedBlueprint,
  stashSeedBlueprint,
  takeSeedBlueprint,
} from "@/lib/generative/blueprint/seed-handoff";

const SEED_KEY = "generative:seed-blueprint";

const seed = () =>
  footprintToBlueprint({
    name: "Handoff",
    footprintPolygonM: [
      [
        [-10, -6],
        [10, -6],
        [10, 6],
        [-10, 6],
      ],
    ],
    floors: 3,
  });

describe("seed blueprint handoff", () => {
  beforeEach(() => clearSeedBlueprint());

  it("round-trips the blueprint and clears the stash", () => {
    const spec = seed();
    stashSeedBlueprint(spec);

    expect(takeSeedBlueprint()).toEqual(spec);
    // Taking is one-shot: the studio must not reopen it on every mount.
    expect(takeSeedBlueprint()).toBeNull();
  });

  it("returns null when nothing was stashed", () => {
    expect(takeSeedBlueprint()).toBeNull();
  });

  it("rejects stored content that is not a blueprint", () => {
    window.sessionStorage.setItem(SEED_KEY, "{not json");
    expect(takeSeedBlueprint()).toBeNull();

    window.sessionStorage.setItem(SEED_KEY, JSON.stringify({ schemaVersion: 1 }));
    expect(takeSeedBlueprint()).toBeNull();
    expect(window.sessionStorage.getItem(SEED_KEY)).toBeNull();
  });
});
