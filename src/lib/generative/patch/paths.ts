// src/lib/generative/patch/paths.ts
//
// Slash-delimited pointer resolution against a BuildingSpec.
//
// `BuildingPatch.operations` addresses the spec tree with RFC-6902-style paths
// ("/core/offsetXMm", "/levels/3/floorToFloorMm", "/facade/sides/1/glazingRatio",
// "/levels/-" to append). This module is the only thing that understands those
// paths, and it is deliberately paranoid: every path in a patch arrived from a
// language model, so a token that does not resolve is an error to report, never
// an object to create on the way past.
//
// Nothing here validates the RESULT — that is `apply.ts`'s job, which re-parses
// the whole spec against its Zod schema afterwards. This module only guarantees
// that a mutation lands exactly where the path said it would, or not at all.

import type { BuildingPatch } from "../spec/building-spec";

export type PatchOp = BuildingPatch["operations"][number];

export type PathFailure =
  | "MALFORMED"
  | "FORBIDDEN_SEGMENT"
  | "MISSING_PARENT"
  | "MISSING_KEY"
  | "BAD_INDEX"
  | "NOT_A_CONTAINER"
  | "APPEND_ON_OBJECT";

export interface PathError {
  failure: PathFailure;
  message: string;
}

type Container = Record<string, unknown> | unknown[];

/**
 * Segments that would walk off the specification and onto the prototype chain.
 *
 * This is not theoretical. Without it, a patch operation with the path
 * "/__proto__/toString" resolves its parent to `Object.prototype` — which every
 * object in the process shares — and the `set` branch happily writes to it,
 * because `"toString" in obj` is true for inherited keys. That is prototype
 * pollution of the whole server, driven by a string a language model chose.
 */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Own properties only. Inherited keys are not part of the specification. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * RFC-6901 array tokens are "0" or [1-9][0-9]*. `Number()` alone would also
 * accept "01", " 1", "1.0", "1e1" and "0x2" — a dozen spellings of one element,
 * which quietly breaks any bookkeeping that treats a path string as an address.
 */
function arrayIndex(token: string): number | null {
  return /^(0|[1-9]\d*)$/.test(token) ? Number(token) : null;
}

/** RFC-6901 escapes. The spec has no `/` or `~` in any key, but patches are untrusted. */
function decodeToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Split "/a/b/0" into ["a","b","0"]. The empty path ("" or "/") is rejected:
 * an operation must name something inside the spec, never replace the spec.
 */
export function parsePath(path: string): string[] | PathError {
  if (!path.startsWith("/")) {
    return { failure: "MALFORMED", message: `Path must start with "/": "${path}"` };
  }
  const tokens = path.slice(1).split("/").map(decodeToken);
  if (tokens.length === 0 || tokens.some((t) => t === "")) {
    return { failure: "MALFORMED", message: `Path has an empty segment: "${path}"` };
  }
  // Checked AFTER unescaping, so "/~0~0proto~0~0" cannot smuggle one through.
  const forbidden = tokens.find((token) => FORBIDDEN_SEGMENTS.has(token));
  if (forbidden !== undefined) {
    return {
      failure: "FORBIDDEN_SEGMENT",
      message: `"${forbidden}" is not addressable: it would leave the specification.`,
    };
  }
  return tokens;
}

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null;
}

function isPathError(value: unknown): value is PathError {
  return typeof value === "object" && value !== null && "failure" in value;
}

/** Resolve every token but the last, returning the container to mutate. */
function resolveParent(
  root: unknown,
  tokens: string[],
): { parent: Container; key: string } | PathError {
  let cursor: unknown = root;

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (!isContainer(cursor)) {
      return {
        failure: "NOT_A_CONTAINER",
        message: `"/${tokens.slice(0, i).join("/")}" is not an object or array.`,
      };
    }
    if (Array.isArray(cursor)) {
      const index = arrayIndex(token);
      if (index === null || index >= cursor.length) {
        return {
          failure: "BAD_INDEX",
          message: `Index ${token} is out of range at "/${tokens.slice(0, i + 1).join("/")}".`,
        };
      }
      cursor = cursor[index];
    } else {
      if (!hasOwn(cursor, token)) {
        return {
          failure: "MISSING_PARENT",
          message: `"/${tokens.slice(0, i + 1).join("/")}" does not exist in the specification.`,
        };
      }
      cursor = (cursor as Record<string, unknown>)[token];
    }
  }

  if (!isContainer(cursor)) {
    return {
      failure: "NOT_A_CONTAINER",
      message: `"/${tokens.slice(0, -1).join("/")}" is not an object or array.`,
    };
  }
  return { parent: cursor, key: tokens[tokens.length - 1] };
}

/** Read the value a path points at. Used by the differ and by lock checks. */
export function getAtPath(root: unknown, path: string): { value: unknown } | PathError {
  const tokens = parsePath(path);
  if (isPathError(tokens)) return tokens;

  let cursor: unknown = root;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!isContainer(cursor)) {
      return {
        failure: "NOT_A_CONTAINER",
        message: `"/${tokens.slice(0, i).join("/")}" is not an object or array.`,
      };
    }
    if (Array.isArray(cursor)) {
      const index = arrayIndex(token);
      if (index === null || index >= cursor.length) {
        return { failure: "BAD_INDEX", message: `Index ${token} is out of range.` };
      }
      cursor = cursor[index];
    } else {
      if (!hasOwn(cursor, token)) {
        return { failure: "MISSING_KEY", message: `"${path}" does not exist.` };
      }
      cursor = (cursor as Record<string, unknown>)[token];
    }
  }
  return { value: cursor };
}

/**
 * Apply one operation IN PLACE to `root`. Callers pass a clone — see
 * `applySpecPatch`, which never mutates the caller's spec.
 *
 * `set` replaces an existing location and refuses to invent a key, because a
 * model that misspells "glazingRatio" must surface as a rejected operation
 * rather than a silently ignored one alongside a stray "glazingRation" field.
 */
export function applyOp(root: unknown, op: PatchOp): true | PathError {
  const tokens = parsePath(op.path);
  if (isPathError(tokens)) return tokens;

  const resolved = resolveParent(root, tokens);
  if (isPathError(resolved)) return resolved;

  const { parent, key } = resolved;

  if (Array.isArray(parent)) {
    const appending = key === "-";
    const parsedIndex = appending ? parent.length : arrayIndex(key);

    if (parsedIndex === null) {
      return { failure: "BAD_INDEX", message: `"${key}" is not an array index.` };
    }
    const index = parsedIndex;

    switch (op.op) {
      case "set":
        if (index >= parent.length) {
          return { failure: "BAD_INDEX", message: `Index ${index} is out of range.` };
        }
        parent[index] = op.value;
        return true;
      case "insert":
        if (index > parent.length) {
          return { failure: "BAD_INDEX", message: `Index ${index} is out of range.` };
        }
        parent.splice(index, 0, op.value);
        return true;
      case "remove":
        if (appending || index >= parent.length) {
          return { failure: "BAD_INDEX", message: `Index ${key} is out of range.` };
        }
        parent.splice(index, 1);
        return true;
      default:
        // Unreachable through BuildingPatchSchema, which constrains `op` to the
        // three verbs. Present so an unvalidated caller gets a PathError rather
        // than `undefined` — which the caller would dereference for `.message`.
        return unknownVerb(op);
    }
  }

  const record = parent as Record<string, unknown>;

  if (key === "-") {
    return {
      failure: "APPEND_ON_OBJECT",
      message: `"${op.path}" appends to an object, which has no order.`,
    };
  }

  switch (op.op) {
    case "set":
      if (!hasOwn(record, key)) {
        return {
          failure: "MISSING_KEY",
          message: `"${op.path}" is not a field of the specification.`,
        };
      }
      record[key] = op.value;
      return true;
    case "insert":
      // Inserting a NEW key is how a model would smuggle an unknown field past
      // the schema's additionalProperties:false. Refuse it here, explicitly.
      return {
        failure: "APPEND_ON_OBJECT",
        message: `"${op.path}" would add a new field; the specification schema is closed.`,
      };
    case "remove":
      if (!hasOwn(record, key)) {
        return { failure: "MISSING_KEY", message: `"${op.path}" does not exist.` };
      }
      delete record[key];
      return true;
    default:
      return unknownVerb(op);
  }
}

function unknownVerb(op: PatchOp): PathError {
  return {
    failure: "MALFORMED",
    message: `"${String((op as { op: unknown }).op)}" is not a patch operation.`,
  };
}
