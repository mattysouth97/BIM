import { describe, expect, it } from "vitest";

import { COMMANDS, parseCommand, suggestCommands } from "../session/commands";
import { LOCKABLE_SYSTEMS, parseLock } from "../session/locks";

/** Narrow a parse result without littering every assertion with non-null checks. */
function parse(raw: string) {
  const command = parseCommand(raw);
  expect(command, `"${raw}" parsed to null`).not.toBeNull();
  return command!;
}

describe("parseCommand — prose mode", () => {
  it("treats nothing-but-whitespace as nothing at all", () => {
    // The bar fires on Enter; a stray Enter must not queue an empty generation.
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
    expect(parseCommand("\n\t  \n")).toBeNull();
  });

  it("sends plain prose to the reasoning layer, trimmed but otherwise intact", () => {
    expect(parseCommand("  make the atrium taller  ")).toEqual({
      kind: "modify",
      instruction: "make the atrium taller",
    });
  });

  it("keeps interior whitespace and slashes inside prose", () => {
    // Only a LEADING slash switches modes, and inner formatting is the user's
    // wording — collapsing it would change what the model is asked.
    const instruction = "widen the corridor\nkeep the 1/2 bay rhythm";
    expect(parseCommand(`  ${instruction}\t`)).toEqual({ kind: "modify", instruction });
    expect(parseCommand("rate it 10/10")).toEqual({
      kind: "modify",
      instruction: "rate it 10/10",
    });
  });
});

describe("parseCommand — /repair", () => {
  it("means 'repair everything' when given no codes", () => {
    // An empty code list is not an error: it is the common case of clearing
    // whatever the validator currently reports.
    expect(parseCommand("/repair")).toEqual({ kind: "repair", codes: [] });
    expect(parseCommand("  /repair   ")).toEqual({ kind: "repair", codes: [] });
  });

  it("upper-cases every code so typed input matches SCREAMING_SNAKE violations", () => {
    expect(parseCommand("/repair FOO_BAR baz")).toEqual({
      kind: "repair",
      codes: ["FOO_BAR", "BAZ"],
    });
    // Runs of whitespace must not survive as empty codes.
    expect(parseCommand("/repair   a   b  ")).toEqual({ kind: "repair", codes: ["A", "B"] });
  });
});

describe("parseCommand — /explain, /undo, /redo, /unlock-all", () => {
  it("accepts /why as the same action as /explain", () => {
    expect(parseCommand("/explain")).toEqual({ kind: "explain" });
    expect(parseCommand("/why")).toEqual({ kind: "explain" });
    // Arguments are tolerated rather than rejected — "/why so tall" is still a
    // request to explain, not a typo the user should be scolded for.
    expect(parseCommand("/explain the core")).toEqual({ kind: "explain" });
  });

  it("maps the history and lock-clearing verbs to their own kinds", () => {
    expect(parseCommand("/undo")).toEqual({ kind: "undo" });
    expect(parseCommand("/redo")).toEqual({ kind: "redo" });
    expect(parseCommand("/unlock-all")).toEqual({ kind: "clear-locks" });
  });

  it("matches command names case-insensitively", () => {
    // Users type into a bar, not a shell; "/UNDO" is the same intent.
    expect(parseCommand("/UNDO")).toEqual({ kind: "undo" });
    expect(parseCommand("/Unlock-All")).toEqual({ kind: "clear-locks" });
  });
});

describe("parseCommand — /options", () => {
  it("defaults to three alternatives", () => {
    expect(parseCommand("/options")).toEqual({ kind: "options", count: 3 });
  });

  it("accepts the whole supported range", () => {
    for (const count of [2, 3, 4]) {
      expect(parseCommand(`/options ${count}`)).toEqual({ kind: "options", count });
    }
  });

  it("rejects counts outside 2–4 instead of silently clamping", () => {
    // Clamping would run a different job from the one that was asked for; the
    // error tells the user the bound rather than hiding it.
    for (const argument of ["0", "1", "5"]) {
      const command = parse(`/options ${argument}`);
      expect(command.kind).toBe("error");
      expect(command.kind === "error" && command.message).toContain("2 to 4");
    }
  });

  it("rejects anything that is not a whole number", () => {
    // Number("") is 0 and Number(" 2 ") is 2, so a lazy Number() check would let
    // junk through; these are the shapes that would actually reach it.
    for (const argument of ["abc", "2.5", "-2", "2 4", "Infinity", ""]) {
      const command = parse(`/options ${argument}`.trim());
      if (argument === "") {
        // Bare "/options" is the default, not an error — guarded above.
        expect(command).toEqual({ kind: "options", count: 3 });
        continue;
      }
      expect(command.kind, `"/options ${argument}" was accepted`).toBe("error");
    }
  });
});

describe("parseCommand — /lock and /unlock", () => {
  it("resolves a real system name to a token the lock layer understands", () => {
    const command = parse("/lock structure");
    expect(command).toEqual({ kind: "lock", token: "system:structure", label: "Structure" });
    // The token is not decoration: it must round-trip through the lock parser.
    expect(parseLock("system:structure")).toEqual({ kind: "system", system: "structure" });
  });

  it("emits a token every lockable system round-trips through, with a label", () => {
    // A lock the studio stores but `parseLock` cannot read back is a lock that
    // silently protects nothing, so the two vocabularies must stay in step.
    for (const system of LOCKABLE_SYSTEMS) {
      const command = parse(`/lock ${system}`);
      expect(command.kind).toBe("lock");
      if (command.kind !== "lock") continue;
      expect(parseLock(command.token)).toEqual({ kind: "system", system });
      expect(command.label).toBeTruthy();
    }
  });

  it("resolves architect vocabulary through the alias table", () => {
    // "facade" is what the user says; "envelope" is what the spec calls it.
    expect(parseCommand("/lock facade")).toEqual({
      kind: "lock",
      token: "system:envelope",
      label: "Envelope",
    });
    expect(parseCommand("/lock WINDOWS")).toEqual({
      kind: "lock",
      token: "system:openings",
      label: "Openings",
    });
    expect(parseCommand("/lock lifts")).toEqual({
      kind: "lock",
      token: "system:core",
      label: "Core",
    });
  });

  it("mirrors /lock exactly for /unlock", () => {
    expect(parseCommand("/unlock structure")).toEqual({
      kind: "unlock",
      token: "system:structure",
      label: "Structure",
    });
    expect(parseCommand("/unlock facade")).toEqual({
      kind: "unlock",
      token: "system:envelope",
      label: "Envelope",
    });
  });

  it("names the lockable systems when the argument is not one", () => {
    for (const raw of ["/lock nonsense", "/unlock nonsense"]) {
      const command = parse(raw);
      expect(command.kind).toBe("error");
      const message = command.kind === "error" ? command.message : "";
      expect(message).toContain('"nonsense"');
      // The recovery path has to be in the message itself — there is no menu.
      for (const system of LOCKABLE_SYSTEMS) expect(message).toContain(system);
    }
  });

  it("errors with the same guidance when the system is missing entirely", () => {
    for (const raw of ["/lock", "/unlock", "/lock   "]) {
      const command = parse(raw);
      expect(command.kind).toBe("error");
      const message = command.kind === "error" ? command.message : "";
      for (const system of LOCKABLE_SYSTEMS) expect(message).toContain(system);
    }
  });

  it("does not glue extra words onto a valid system name", () => {
    // "/lock structure and core" is ambiguous; resolving it to `structure`
    // would lock less than the user asked for and say nothing about it.
    const command = parse("/lock structure and core");
    expect(command.kind).toBe("error");
  });
});

describe("parseCommand — /rule", () => {
  it("carries the rule text through verbatim", () => {
    expect(parseCommand("/rule keep corridors at least 1.8 m")).toEqual({
      kind: "rule",
      text: "keep corridors at least 1.8 m",
    });
  });

  it("normalises the whitespace between words but keeps every word", () => {
    // The argument is rebuilt from tokens, so runs of spaces collapse; nothing
    // may be dropped.
    expect(parseCommand("/rule  no   north-facing   bedrooms  ")).toEqual({
      kind: "rule",
      text: "no north-facing bedrooms",
    });
  });

  it("refuses to store an empty rule", () => {
    // A blank persistent rule would sit in the prompt forever doing nothing.
    const command = parse("/rule");
    expect(command.kind).toBe("error");
    expect(command.kind === "error" && command.message).toContain("/rule");
  });
});

describe("parseCommand — unknown commands", () => {
  it("lists every available command rather than failing silently", () => {
    const command = parse("/frobnicate the tower");
    expect(command.kind).toBe("error");
    const message = command.kind === "error" ? command.message : "";
    expect(message).toContain('"/frobnicate"');
    for (const spec of COMMANDS) expect(message).toContain(`/${spec.name}`);
  });

  it("never throws on hostile or malformed input", () => {
    // The bar is a free-text field and the same parser is reachable from model
    // output; every one of these must land on a command object or null.
    const hostile = [
      "/",
      "//",
      "/ lock structure",
      "/repair; rm -rf /",
      "/options 2",
      "/".repeat(200),
      "/лок structure",
      "/lock\nstructure",
    ];
    for (const raw of hostile) {
      const command = parseCommand(raw);
      expect(command === null || typeof command.kind === "string").toBe(true);
    }
  });

  it("advertises only commands it can actually parse", () => {
    // COMMANDS drives the suggestion list and the error text, so a name in it
    // that the switch does not handle would be a lie in the UI.
    for (const spec of COMMANDS) {
      const command = parse(`/${spec.name}`);
      if (command.kind === "error") {
        // Only the commands that genuinely require an argument may error bare.
        expect(spec.usage).toMatch(/</);
      }
    }
  });
});

describe("suggestCommands", () => {
  it("stays out of the way while the user is writing prose", () => {
    expect(suggestCommands("")).toEqual([]);
    expect(suggestCommands("make it taller")).toEqual([]);
    expect(suggestCommands("a 10/10 facade")).toEqual([]);
  });

  it("offers the full menu the moment a slash is typed", () => {
    expect(suggestCommands("/")).toEqual(COMMANDS);
    expect(suggestCommands("  /  ")).toEqual(COMMANDS);
  });

  it("filters by prefix, not by substring", () => {
    // "rule" does not start with "re" — a substring match would surface it and
    // push the command the user is actually typing down the list.
    expect(suggestCommands("/re").map((c) => c.name)).toEqual(["repair", "redo"]);
    expect(suggestCommands("/unlock").map((c) => c.name)).toEqual(["unlock", "unlock-all"]);
    expect(suggestCommands("/REP").map((c) => c.name)).toEqual(["repair"]);
    expect(suggestCommands("/zzz")).toEqual([]);
  });

  it("stops suggesting once the argument is being typed", () => {
    // Only the first word is the command name, so the menu narrows to the one
    // command in play instead of reopening on every space.
    expect(suggestCommands("/lock struct").map((c) => c.name)).toEqual(["lock"]);
  });

  it("suggests exactly the commands that carry usage and hint text", () => {
    // Every suggestion is rendered as "usage — hint"; a blank one is a hole.
    for (const spec of COMMANDS) {
      expect(spec.usage.startsWith(`/${spec.name}`)).toBe(true);
      expect(spec.hint.length).toBeGreaterThan(0);
    }
  });
});
