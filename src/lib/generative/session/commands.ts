// src/lib/generative/session/commands.ts
//
// The command bar's grammar.
//
// The bar is one input with two modes. Plain text is a design instruction and
// goes to the reasoning layer. A leading slash is a direct action — lock,
// repair, explain, undo — that runs locally and deterministically, with no
// model call at all.
//
// Both live in one field on purpose (brief §51): the alternative is a toolbar
// of buttons for the deterministic half and a text box for the rest, which
// makes the user decide up front which kind of thing they are about to ask for.
//
// Pure and synchronous. The studio executes what this returns; nothing here
// touches state, so every branch is testable as data in, data out.

import type { BimSystem } from "@/lib/bim/model/types";
import { LOCKABLE_SYSTEMS, SYSTEM_LABEL, systemLock } from "./locks";

export type StudioCommand =
  | { kind: "modify"; instruction: string }
  | { kind: "repair"; codes: string[] }
  | { kind: "explain" }
  | { kind: "options"; count: number }
  | { kind: "lock"; token: string; label: string }
  | { kind: "unlock"; token: string; label: string }
  | { kind: "clear-locks" }
  | { kind: "rule"; text: string }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "error"; message: string };

export interface CommandSpec {
  name: string;
  usage: string;
  hint: string;
}

export const COMMANDS: CommandSpec[] = [
  { name: "repair", usage: "/repair [CODE …]", hint: "Fix outstanding validation issues" },
  { name: "explain", usage: "/explain", hint: "Why does the building look like this?" },
  { name: "options", usage: "/options [2-4]", hint: "Generate alternative designs" },
  { name: "lock", usage: "/lock <system>", hint: "Protect a system from edits" },
  { name: "unlock", usage: "/unlock <system>", hint: "Release a locked system" },
  { name: "unlock-all", usage: "/unlock-all", hint: "Release every lock" },
  { name: "rule", usage: "/rule <text>", hint: "Add a persistent design rule" },
  { name: "undo", usage: "/undo", hint: "Step back in history" },
  { name: "redo", usage: "/redo", hint: "Step forward in history" },
];

const MAX_OPTIONS = 4;

/**
 * "facade" is what an architect says; "envelope" is what the model calls it.
 *
 * A Map, not an object literal, because the lookup key is user-typed text. A
 * bracket read on a plain object resolves inherited keys, so `/lock constructor`
 * would come back with the Object constructor as if it were a building system —
 * producing a lock token nothing can parse and a UI chip labelled "undefined".
 */
const SYSTEM_ALIASES = new Map<string, BimSystem>([
  ["facade", "envelope"],
  ["skin", "envelope"],
  ["cladding", "envelope"],
  ["walls", "partitions"],
  ["partition", "partitions"],
  ["columns", "structure"],
  ["frame", "structure"],
  ["grid", "structure"],
  ["windows", "openings"],
  ["doors", "openings"],
  ["services", "mep"],
  ["plant", "mep"],
  ["stairs", "core"],
  ["lifts", "core"],
  ["elevators", "core"],
]);

function resolveSystem(word: string): BimSystem | null {
  const needle = word.trim().toLowerCase();
  if (!needle) return null;

  const exact = LOCKABLE_SYSTEMS.find((system) => system === needle);
  if (exact) return exact;

  return SYSTEM_ALIASES.get(needle) ?? null;
}

export function parseCommand(raw: string): StudioCommand | null {
  const input = raw.trim();
  if (!input) return null;

  if (!input.startsWith("/")) {
    return { kind: "modify", instruction: input };
  }

  const [word, ...rest] = input.slice(1).split(/\s+/);
  const name = word.toLowerCase();
  const argument = rest.join(" ").trim();

  switch (name) {
    case "repair":
      // Violation codes are SCREAMING_SNAKE; anything else is a typo worth
      // reporting rather than a filter that silently matches nothing.
      return {
        kind: "repair",
        codes: rest.map((code) => code.toUpperCase()).filter(Boolean),
      };

    case "explain":
    case "why":
      return { kind: "explain" };

    case "options": {
      if (!argument) return { kind: "options", count: 3 };
      // Plain digits only: "/options 0x2" and "/options 2e0" are not forms the
      // documented "[2-4]" grammar advertises, so accepting them is laxity, not
      // leniency.
      const count = /^\d+$/.test(argument) ? Number(argument) : Number.NaN;
      if (!Number.isInteger(count) || count < 2 || count > MAX_OPTIONS) {
        return {
          kind: "error",
          message: `/options takes a number from 2 to ${MAX_OPTIONS}.`,
        };
      }
      return { kind: "options", count };
    }

    case "lock":
    case "unlock": {
      if (!argument) {
        return {
          kind: "error",
          message: `/${name} needs a system: ${LOCKABLE_SYSTEMS.join(", ")}.`,
        };
      }
      const system = resolveSystem(argument);
      if (!system) {
        return {
          kind: "error",
          message: `"${argument}" is not a lockable system. Try: ${LOCKABLE_SYSTEMS.join(", ")}.`,
        };
      }
      return {
        kind: name === "lock" ? "lock" : "unlock",
        token: systemLock(system),
        label: SYSTEM_LABEL[system],
      };
    }

    case "unlock-all":
      return { kind: "clear-locks" };

    case "rule":
      if (!argument) {
        return {
          kind: "error",
          message: "/rule needs the rule text, e.g. /rule keep corridors at least 1.8 m.",
        };
      }
      return { kind: "rule", text: argument };

    case "undo":
      return { kind: "undo" };
    case "redo":
      return { kind: "redo" };

    default:
      return {
        kind: "error",
        message: `Unknown command "/${name}". Available: ${COMMANDS.map((c) => `/${c.name}`).join(", ")}.`,
      };
  }
}

/** Slash-command suggestions for what has been typed so far. */
export function suggestCommands(raw: string): CommandSpec[] {
  const input = raw.trim();
  if (!input.startsWith("/")) return [];
  const needle = input.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!needle) return COMMANDS;
  return COMMANDS.filter((command) => command.name.startsWith(needle));
}
