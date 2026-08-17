"use client";

// src/components/generative/command-bar.tsx
//
// The command surface (brief §51, §61, §117).
//
// One input, always in the same place, that accepts either a design instruction
// in plain language or a slash command. It sits UNDER the model, never over it:
// the building is the interface, and this is the thing you talk to it with.
//
// There is no transcript and no assistant persona. What you said last is not
// interesting; what the building looks like now is. Progress is reported as
// named stages, and anything in flight can be cancelled.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModificationScope, StageEvent } from "@/lib/generative/client";
import { COMMANDS, suggestCommands, type CommandSpec } from "@/lib/generative/session/commands";

interface Props {
  onSubmit: (raw: string) => void;
  onCancel: () => void;
  busy: boolean;
  stage: StageEvent | null;
  scope: ModificationScope | null;
  onClearScope: () => void;
  lockCount: number;
  ruleCount: number;
  /** Transient feedback from the last command — an error, or what it did. */
  notice: { tone: "info" | "error"; text: string } | null;
  onDismissNotice: () => void;
}

const PLACEHOLDER = "Make the top two floors residential…";
const LISTBOX_ID = "command-bar-suggestions";

export function CommandBar({
  onSubmit,
  onCancel,
  busy,
  stage,
  scope,
  onClearScope,
  lockCount,
  ruleCount,
  notice,
  onDismissNotice,
}: Props) {
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const suggestions = useMemo<CommandSpec[]>(() => suggestCommands(value), [value]);
  const showSuggestions = value.trim().startsWith("/") && suggestions.length > 0;

  // Editing the text re-filters the list, so the highlight resets in the change
  // handler rather than in an effect reacting to it.
  const setText = useCallback((next: string) => {
    setValue(next);
    setHighlight(0);
  }, []);

  // ⌘K / Ctrl-K focuses the bar from anywhere, including from the 3D canvas.
  // Compared case-insensitively: with Caps Lock on the browser reports "K", and
  // a shortcut the bar advertises in a <kbd> hint must not silently do nothing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      onSubmit(text);
      setValue("");
    },
    [busy, onSubmit],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setHighlight((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + suggestions.length) % suggestions.length;
      });
      return;
    }

    if (event.key === "Tab" && showSuggestions) {
      event.preventDefault();
      setText(`/${suggestions[highlight]?.name ?? ""} `);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // A bare "/rep" completes to the command rather than being sent as an
      // instruction — the leading slash is an unambiguous statement of intent.
      const onlyCommandWord = /^\/\S*$/.test(value.trim());
      if (showSuggestions && onlyCommandWord && suggestions[highlight]) {
        const chosen = suggestions[highlight];
        const needsArgument = /</.test(chosen.usage);
        // Complete once. A second Enter on the already-completed "/lock " falls
        // through and submits it, so the parser can say what argument is
        // missing — repeating the completion would read as a dead key.
        const alreadyCompleted = value === `/${chosen.name} `;
        if (needsArgument && !alreadyCompleted) {
          setText(`/${chosen.name} `);
          return;
        }
        if (!needsArgument) {
          submit(`/${chosen.name}`);
          return;
        }
      }
      submit(value);
      return;
    }

    if (event.key === "Escape") {
      if (value) setText("");
      else if (busy) onCancel();
    }
  };

  return (
    <div className="border-t bg-background/95 backdrop-blur">
      {showSuggestions && (
        <ul
          id={LISTBOX_ID}
          className="max-h-56 overflow-y-auto border-b px-3 py-2 text-xs"
          role="listbox"
          aria-label="Commands"
        >
          {suggestions.map((command, index) => (
            // The rows carry the option role, not the <li>: a listbox whose
            // children are plain buttons exposes a listbox with zero options,
            // and the keyboard highlight — expressed only as a background —
            // never reaches assistive tech.
            <li
              key={command.name}
              id={`${LISTBOX_ID}-${command.name}`}
              role="option"
              aria-selected={index === highlight}
            >
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setText(`/${command.name} `)}
                className={cn(
                  "flex w-full items-baseline gap-3 rounded px-2 py-1 text-left",
                  index === highlight ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="font-mono">{command.usage}</span>
                <span className="text-muted-foreground">{command.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-3 border-b px-4 py-2 text-xs",
            notice.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={onDismissNotice}
            className="shrink-0 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2">
        {scope && scope.kind !== "building" ? (
          <button
            type="button"
            onClick={onClearScope}
            title="Clear selection — the edit will apply to the whole building"
            className="shrink-0"
          >
            <Badge variant="secondary" className="font-mono text-[11px]">
              {scope.label} ×
            </Badge>
          </button>
        ) : (
          <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
            Whole building
          </Badge>
        )}

        {lockCount > 0 && (
          <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
            {lockCount} locked
          </Badge>
        )}
        {ruleCount > 0 && (
          <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
            {ruleCount} rule{ruleCount === 1 ? "" : "s"}
          </Badge>
        )}

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          aria-label="Describe a change, or type / for commands"
          // Advertise the popup so the highlight Enter will act on is knowable
          // without seeing the background colour.
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? LISTBOX_ID : undefined}
          aria-activedescendant={
            showSuggestions && suggestions[highlight]
              ? `${LISTBOX_ID}-${suggestions[highlight].name}`
              : undefined
          }
          aria-autocomplete="list"
          placeholder={busy ? "Working…" : PLACEHOLDER}
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none disabled:opacity-60"
        />

        {/* Always mounted, empty when idle. A live region created together with
            its first content usually has that first message dropped, which
            would lose the opening stage of every run. */}
        <span
          aria-live="polite"
          className="shrink-0 font-mono text-[11px] text-muted-foreground empty:hidden"
        >
          {busy
            ? `${stage ? `${stage.label}${stage.detail ? ` — ${stage.detail}` : ""} (${stage.index + 1}/${stage.total})` : "Starting…"}`
            : ""}
        </span>

        {busy ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <>
            <kbd className="hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
            <Button size="sm" onClick={() => submit(value)} disabled={!value.trim()}>
              Run
            </Button>
          </>
        )}
      </div>

      {!busy && !value && (
        <p className="px-4 pb-2 font-mono text-[10px] text-muted-foreground">
          {COMMANDS.slice(0, 5)
            .map((command) => `/${command.name}`)
            .join("  ")}
          {"  ·  or describe the change in your own words"}
        </p>
      )}
    </div>
  );
}
