// src/lib/generative/rng.ts
//
// Seeded PRNG. Every stochastic choice in the generative pipeline draws from
// here so that prompt + parameters + seed reproduces the same building
// (brief §24). `Math.random()` must never appear in the generation path.

/** mulberry32 — small, fast, good enough distribution for layout jitter. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (minInclusive, maxInclusive) =>
      minInclusive +
      Math.floor(next() * (maxInclusive - minInclusive + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
    /** Derive an independent stream so adding a stage cannot shift earlier ones. */
    fork: (label: string) => createRng((seed ^ hashString(label)) >>> 0),
  };
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  fork(label: string): Rng;
}

/** FNV-1a. Used for stream forking and for deriving seeds from prompts. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A stable seed for a prompt, so "Regenerate Same" is genuinely the same. */
export function seedFromPrompt(prompt: string, salt = ""): number {
  return hashString(`${prompt}::${salt}`) % 2_147_483_647;
}
