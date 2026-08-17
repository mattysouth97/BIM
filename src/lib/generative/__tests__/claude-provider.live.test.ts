/**
 * @vitest-environment node
 *
 * The suite default is happy-dom. The Anthropic SDK refuses to construct in a
 * browser-like environment — correctly, since that would imply a key in the
 * client — so server-side tests must opt into the node environment.
 */
// Live contract test against the real Anthropic API.
//
// Skipped unless RUN_LIVE_API=1, so CI and ordinary `pnpm test` runs stay
// offline, deterministic and free. Run it deliberately:
//
//   RUN_LIVE_API=1 pnpm vitest run src/lib/generative/__tests__/claude-provider.live.test.ts
//
// What it is actually protecting: the BuildingSpec schema is large, and the
// only way to know a real model can satisfy it is to make a real model satisfy
// it. Unit tests against the heuristic provider cannot tell us that.

import { beforeAll, describe, expect, it } from "vitest";

import { ClaudeReasoningProvider } from "../provider/claude-provider";
import { BuildingSpecSchema } from "../spec/building-spec";
import { BlueprintSpecSchema } from "../blueprint/blueprint-spec";
import { seedFromPrompt } from "../rng";

/**
 * A tiny (8×8) black-square PNG. The point of this fixture is NOT a
 * realistic floor plan — it is deliberately content-free, so the assertions
 * below only check the mechanical contract (image content block wiring,
 * forced tool use, schema satisfiability) and the honesty behaviour the
 * system prompt demands (an illegible image must not produce confidently
 * invented dimensions).
 */
const BLANK_TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const LIVE = process.env.RUN_LIVE_API === "1";

describe.skipIf(!LIVE)("ClaudeReasoningProvider (live)", () => {
  const provider = new ClaudeReasoningProvider();

  beforeAll(() => {
    if (!provider.isAvailable()) {
      throw new Error("RUN_LIVE_API=1 but ANTHROPIC_API_KEY is not set.");
    }
  });

  it(
    "fills the full BuildingSpec from a bare prompt",
    async () => {
      const prompt = "Create an office building.";
      const { data, trace } = await provider.generateBuilding({
        prompt,
        seed: seedFromPrompt(prompt),
      });

      expect(() => BuildingSpecSchema.parse(data)).not.toThrow();
      expect(data.levels.length).toBeGreaterThan(0);
      expect(data.program.length).toBeGreaterThan(0);
      expect(data.assumptions.length).toBeGreaterThan(0);
      expect(data.units).toBe("mm");

      console.log(
        `[live] bare prompt: ${trace.model} ${trace.latencyMs}ms ` +
          `in=${trace.inputTokens} out=${trace.outputTokens} retries=${trace.retries}`,
      );
    },
    180_000,
  );

  it(
    "reflects an explicitly detailed brief in the spec",
    async () => {
      const prompt =
        "Generate a 7-story, approximately 10,000 m² office building with an 8.4 m " +
        "structural grid, 4.0 m floor-to-floor heights, two stairs, three elevators, " +
        "central service core, open office perimeter, meeting rooms near the core, " +
        "and a south curtain-wall facade.";

      const { data, trace } = await provider.generateBuilding({
        prompt,
        seed: seedFromPrompt(prompt),
      });

      expect(() => BuildingSpecSchema.parse(data)).not.toThrow();

      // The stated numbers must actually land in the geometry contract.
      expect(data.levels.filter((l) => l.floorNo > 0)).toHaveLength(7);
      expect(data.structure.gridXMm.value).toBe(8_400);
      expect(data.core.stairs.value).toBe(2);
      expect(data.core.elevators.value).toBe(3);
      expect(data.core.strategy.value).toBe("central");

      const south = data.facade.sides.find((s) => s.side === "south");
      expect(south?.system).toBe("curtain-wall");

      // Stated values must be attributed to the user, not claimed as inference.
      expect(data.structure.gridXMm.source).toBe("USER_PROVIDED");
      expect(data.core.elevators.source).toBe("USER_PROVIDED");

      console.log(
        `[live] detailed prompt: ${trace.latencyMs}ms out=${trace.outputTokens} retries=${trace.retries}`,
      );
    },
    180_000,
  );

  it(
    "produces a scoped patch for a natural-language modification",
    async () => {
      const prompt = "Create a five-story office building with a central core.";
      const { data: spec } = await provider.generateBuilding({
        prompt,
        seed: seedFromPrompt(prompt),
      });

      const { data: patch } = await provider.modifyBuilding({
        spec,
        summary: {
          buildingPk: "test",
          floors: 5,
          grossAreaSqm: 6_000,
          netAreaSqm: 4_900,
          buildingHeightMm: 19_500,
          gridXMm: spec.structure.gridXMm.value,
          gridZMm: spec.structure.gridZMm.value,
          coreStrategy: spec.core.strategy.value,
          circulationRatio: 0.17,
          spaceCounts: { "office-open": 10, meeting: 15 },
          elementCounts: { Walls: 120, Columns: 42 },
          violations: [],
          lockedSystems: ["structure"],
        },
        instruction: "Add one more floor.",
        scope: { kind: "building", label: "Building" },
        locked: ["structure"],
      });

      console.log(
        `[live] patch scope=${patch.scope} summary="${patch.summary}"\n` +
          patch.operations.map((o) => `  ${o.op} ${o.path}`).join("\n"),
      );

      // The behaviour that matters (brief §79) is that a level is genuinely
      // added — not a floating slab, and not a whole-building rewrite. The
      // `scope` label is a routing hint; the operations are the contract.
      expect(patch.operations.some((op) => op.path.startsWith("/levels"))).toBe(true);
      expect(patch.operations.every((op) => !op.path.startsWith("/massing"))).toBe(true);
      expect(patch.summary.toLowerCase()).toMatch(/floor|level|storey|story/);
    },
    240_000,
  );

  it(
    "interprets an image schematic into a schema-valid BlueprintSpec, honestly",
    async () => {
      const { data, trace } = await provider.interpretBlueprint({
        kind: "image",
        mediaType: "image/png",
        dataBase64: BLANK_TEST_PNG_BASE64,
        prompt: "This is a test fixture, not a real drawing.",
      });

      expect(() => BlueprintSpecSchema.parse(data)).not.toThrow();
      expect(data.schemaVersion).toBe(1);
      expect(data.source).toBe("image");

      // Nothing in a blank image is a measured dimension — the system prompt
      // requires the model to say so rather than invent a scale.
      expect(data.coordinateSystem.sourceScaleRatio.source).not.toBe("USER_PROVIDED");

      console.log(
        `[live] interpretBlueprint(image): ${trace.latencyMs}ms out=${trace.outputTokens} ` +
          `retries=${trace.retries} boundaries=${data.boundaries.length} ` +
          `uncertainty=${data.uncertainty.length}`,
      );
    },
    180_000,
  );
});
