/**
 * element-id.ts
 *
 * UUIDv7 generator producing time-sortable, branded ElementId strings.
 * Branded types ensure callers cannot accidentally mix a WallId with a SlabId.
 *
 * UUIDv7 layout (128 bits):
 *   [0-47]  unix_ts_ms  (48 bits, big-endian milliseconds)
 *   [48-51] version     (4 bits, 0b0111)
 *   [52-63] rand_a      (12 bits, random)
 *   [64-65] variant     (2 bits, 0b10)
 *   [66-127] rand_b     (62 bits, random)
 *
 * The time-prefix guarantees lexicographic sort = chronological insertion order,
 * making element lists naturally ordered without extra sorting.
 */

// ---------------------------------------------------------------------------
// Brand machinery
// ---------------------------------------------------------------------------

declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ---------------------------------------------------------------------------
// ElementKind discriminated union
// ---------------------------------------------------------------------------

export type ElementKind =
  | "wall"
  | "slab"
  | "column"
  | "window"
  | "door"
  | "mep-instance"
  | "annotation"
  | "level"
  | "grid";

// ---------------------------------------------------------------------------
// Branded ElementId types
// ---------------------------------------------------------------------------

export type ElementId = Brand<string, "ElementId">;
export type WallId = Brand<string, "WallId">;
export type SlabId = Brand<string, "SlabId">;
export type ColumnId = Brand<string, "ColumnId">;
export type WindowId = Brand<string, "WindowId">;
export type DoorId = Brand<string, "DoorId">;
export type MepInstanceId = Brand<string, "MepInstanceId">;
export type AnnotationId = Brand<string, "AnnotationId">;
export type LevelId = Brand<string, "LevelId">;
export type GridId = Brand<string, "GridId">;

// Map kind → branded type for the factory return type
export type KindToId<K extends ElementKind> = K extends "wall"
  ? WallId
  : K extends "slab"
    ? SlabId
    : K extends "column"
      ? ColumnId
      : K extends "window"
        ? WindowId
        : K extends "door"
          ? DoorId
          : K extends "mep-instance"
            ? MepInstanceId
            : K extends "annotation"
              ? AnnotationId
              : K extends "level"
                ? LevelId
                : K extends "grid"
                  ? GridId
                  : ElementId;

// ---------------------------------------------------------------------------
// Internal UUIDv7 implementation (RFC-compliant, monotonic within same ms)
// ---------------------------------------------------------------------------

/**
 * Monotonic state for same-millisecond ordering.
 * When multiple IDs are generated within the same millisecond, we increment
 * a 12-bit sequence counter (rand_a) rather than using pure random, ensuring
 * lexicographic sort == generation order even at high throughput.
 */
let _lastMs = -1;
let _seq = 0; // 12-bit counter, max 0xfff

/**
 * Generate a RFC-9562 UUIDv7 string.
 *
 * Layout (128 bits, big-endian):
 *   [0-47]   unix_ts_ms  — 48 bits (groups 1+2: 32-bit high, 16-bit low)
 *   [48-51]  version     — 4 bits = 0b0111
 *   [52-63]  rand_a      — 12 bits (monotonic seq within same ms)
 *   [64-65]  variant     — 2 bits = 0b10
 *   [66-127] rand_b      — 62 bits random
 *
 * Standard UUIDv7 format: tttttttt-tttt-7rrr-Vrrr-rrrrrrrrrrrr
 *   where t = timestamp bits, r = random bits, V = variant nibble
 */
function uuidv7(): string {
  let ms = Date.now();

  if (ms === _lastMs) {
    _seq = (_seq + 1) & 0xfff;
    if (_seq === 0) {
      // seq overflow — advance to next ms
      ms = ++_lastMs;
    }
  } else {
    _lastMs = ms;
    // Randomise starting seq to avoid predictability within a ms window
    const seed = new Uint8Array(2);
    crypto.getRandomValues(seed);
    _seq = ((seed[0] & 0x0f) << 8) | seed[1]; // 12 random bits as seed
  }

  // 48-bit timestamp: upper 32 bits and lower 16 bits
  // ms fits in 48 bits for dates up to year 10889
  const msHi32 = Math.floor(ms / 0x10000) >>> 0; // bits [16-47]
  const msLo16 = ms & 0xffff; // bits [0-15]

  // 62 random bits for rand_b (10 bytes, top 2 bits overwritten by variant)
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);

  const hex = (n: number, width: number) =>
    n.toString(16).padStart(width, "0");

  // group 1: 32 upper ms bits
  const p1 = hex(msHi32, 8);
  // group 2: 16 lower ms bits
  const p2 = hex(msLo16, 4);
  // group 3: version nibble (7) + 12-bit monotonic seq
  const p3 = hex(0x7000 | (_seq & 0xfff), 4);
  // group 4: variant bits 0b10 in top 2 bits of rand[0], then 14 more bits
  const variantByte = (0x80 | (rand[0] & 0x3f)) & 0xff;
  const p4 = hex((variantByte << 8) | rand[1], 4);
  // group 5: 48 bits of random
  const p5 =
    hex(rand[2], 2) +
    hex(rand[3], 2) +
    hex(rand[4], 2) +
    hex(rand[5], 2) +
    hex(rand[6], 2) +
    hex(rand[7], 2);

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a stable, time-sortable ElementId branded for the given kind.
 *
 * @example
 * const wallId = createElementId("wall");   // WallId
 * const slabId = createElementId("slab");   // SlabId
 */
export function createElementId<K extends ElementKind>(kind: K): KindToId<K> {
  const id = `${kind}:${uuidv7()}`;
  return id as KindToId<K>;
}

/**
 * Extract the ElementKind prefix from a serialized ElementId.
 * Returns null if the string is not a recognised ElementId.
 */
export function parseElementKind(id: string): ElementKind | null {
  const colon = id.indexOf(":");
  if (colon === -1) return null;
  const kind = id.slice(0, colon) as ElementKind;
  const validKinds: ElementKind[] = [
    "wall",
    "slab",
    "column",
    "window",
    "door",
    "mep-instance",
    "annotation",
    "level",
    "grid",
  ];
  return validKinds.includes(kind) ? kind : null;
}

/**
 * Extract the raw UUID portion of an ElementId (without the kind prefix).
 */
export function getUuid(id: ElementId | string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(colon + 1);
}

/**
 * Compare two ElementIds by their embedded timestamp (lexicographic on the
 * UUID portion, which is time-ordered for UUIDv7).
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareElementIds(a: string, b: string): number {
  const uuidA = getUuid(a);
  const uuidB = getUuid(b);
  return uuidA < uuidB ? -1 : uuidA > uuidB ? 1 : 0;
}
