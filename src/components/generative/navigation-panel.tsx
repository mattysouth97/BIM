"use client";

// src/components/generative/navigation-panel.tsx
//
// Semantic navigation and locking (brief §16, §17, §41, §54).
//
// The model is browsed by what things ARE. Selecting a node does two things at
// once: it scopes the next instruction ("restudy THIS"), and it can isolate
// that part in the 3D view. Locking happens here too, on the same nodes, because
// "protect the core" and "edit the core" are the same idea seen from two sides.
//
// Lock semantics are stated in the UI rather than implied. A system lock blocks
// changes to the specification that generates it; a level lock also prevents
// levels being inserted or removed, since that renumbers the level it protects.

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavNode } from "@/lib/generative/session/navigation";
import {
  LOCKABLE_SYSTEMS,
  SYSTEM_LABEL,
  parseLock,
  systemLock,
} from "@/lib/generative/session/locks";

interface Props {
  tree: NavNode;
  selectedId: string | null;
  onSelect: (node: NavNode) => void;
  locks: string[];
  onToggleLock: (token: string) => void;
  onClearLocks: () => void;
  isolate: boolean;
  onIsolateChange: (value: boolean) => void;
  canIsolate: boolean;
}

const DEFAULT_OPEN = new Set(["building", "group:systems", "group:levels"]);

function LockButton({
  token,
  locked,
  onToggle,
}: {
  token: string;
  locked: boolean;
  onToggle: (token: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle(token);
      }}
      aria-pressed={locked}
      title={locked ? "Locked — click to release" : "Lock: protect from edits"}
      className={cn(
        "shrink-0 rounded px-1 font-mono text-[10px] leading-4",
        locked
          ? "bg-amber-500/20 text-amber-700"
          : // focus-visible, not only group-hover: the control stays focusable,
            // so without it a keyboard user tabs onto an invisible button and
            // locking is effectively mouse-only.
            "text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100",
      )}
    >
      {locked ? "LOCKED" : "lock"}
    </button>
  );
}

function TreeRow({
  node,
  depth,
  open,
  onToggleOpen,
  selectedId,
  onSelect,
  locks,
  onToggleLock,
}: {
  node: NavNode;
  depth: number;
  open: Set<string>;
  onToggleOpen: (id: string) => void;
  selectedId: string | null;
  onSelect: (node: NavNode) => void;
  locks: string[];
  onToggleLock: (token: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = open.has(node.id);
  const isSelected = selectedId === node.id;
  const locked = node.lockToken ? locks.includes(node.lockToken) : false;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded px-1 py-0.5 text-xs",
          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
        )}
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleOpen(node.id)}
            aria-label={isOpen ? "Collapse" : "Expand"}
            aria-expanded={isOpen}
            className="w-3 shrink-0 font-mono text-[10px] text-muted-foreground"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          // A leaf gets spacing, not a control. Rendering the toggle "invisible"
          // still left an unnamed, non-functional button in the tab order on
          // every space and category row — dozens of them once a level is open.
          <span className="w-3 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          onClick={() => onSelect(node)}
          // Selecting a node is what scopes the next instruction, so which node
          // is selected has to be perceivable without seeing the highlight.
          aria-current={isSelected ? "true" : undefined}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span className={cn("truncate", locked && "text-amber-700")}>{node.label}</span>
          {node.detail && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {node.detail}
            </span>
          )}
        </button>

        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {node.count.toLocaleString()}
        </span>

        {node.lockToken && (
          <LockButton token={node.lockToken} locked={locked} onToggle={onToggleLock} />
        )}
      </div>

      {hasChildren && isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              open={open}
              onToggleOpen={onToggleOpen}
              selectedId={selectedId}
              onSelect={onSelect}
              locks={locks}
              onToggleLock={onToggleLock}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function NavigationPanel({
  tree,
  selectedId,
  onSelect,
  locks,
  onToggleLock,
  onClearLocks,
  isolate,
  onIsolateChange,
  canIsolate,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set(DEFAULT_OPEN));

  /**
   * Systems the tree cannot show, because nothing in the model carries their
   * tag — massing has no elements at all, and the emitter does not yet tag roof
   * or MEP elements. They are still enforceable at the specification level, so
   * hiding them would make a real protection unreachable by mouse.
   */
  const unrepresented = useMemo(() => {
    const present = new Set<string>();
    const visit = (node: NavNode) => {
      if (node.system) present.add(node.system);
      node.children.forEach(visit);
    };
    visit(tree);
    return LOCKABLE_SYSTEMS.filter((system) => !present.has(system));
  }, [tree]);

  const toggleOpen = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Model
        </h2>
        <label
          className={cn(
            "ml-auto flex items-center gap-1 text-[11px]",
            !canIsolate && "opacity-40",
          )}
          title={
            canIsolate
              ? "Show only the selected levels in the 3D view"
              : "Select a level to isolate it"
          }
        >
          <input
            type="checkbox"
            checked={isolate}
            disabled={!canIsolate}
            onChange={(e) => onIsolateChange(e.target.checked)}
          />
          Isolate
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        <TreeRow
          node={tree}
          depth={0}
          open={open}
          onToggleOpen={toggleOpen}
          selectedId={selectedId}
          onSelect={onSelect}
          locks={locks}
          onToggleLock={onToggleLock}
        />
      </ul>

      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Locks ({locks.length})
          </h3>
          {locks.length > 0 && (
            <Button size="xs" variant="ghost" onClick={onClearLocks} className="ml-auto">
              Release all
            </Button>
          )}
        </div>

        {unrepresented.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Also lockable
            </p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {unrepresented.map((system) => {
                const token = systemLock(system);
                const locked = locks.includes(token);
                return (
                  <li key={system}>
                    <button type="button" onClick={() => onToggleLock(token)}>
                      <Badge
                        variant={locked ? "secondary" : "outline"}
                        className={cn(
                          "font-mono text-[10px]",
                          locked && "text-amber-700",
                        )}
                      >
                        {SYSTEM_LABEL[system]}
                        {locked ? " ✓" : ""}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              These have no elements in the model to browse, but edits to the
              specification that drives them are still refused while locked.
            </p>
          </div>
        )}

        {locks.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Nothing is locked. Lock a system or level to protect it from the next edit.
          </p>
        ) : (
          <>
            <ul className="mt-2 flex flex-wrap gap-1">
              {locks.map((token) => {
                const lock = parseLock(token);
                const label =
                  lock?.kind === "system"
                    ? SYSTEM_LABEL[lock.system]
                    : lock?.kind === "level"
                      ? `Level ${lock.floorNo}`
                      : lock?.kind === "element"
                        ? lock.elementId
                        : token;
                return (
                  <li key={token}>
                    <button type="button" onClick={() => onToggleLock(token)}>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {label} ×
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              A locked system rejects any edit to the part of the specification that
              generates it. Locked elements are preserved when the building is rebuilt.
            </p>
            {/* Stated before the user hits it. A level lock has a consequence the
                system wording does not cover, and a refusal that arrives
                unexplained is the "lock that quietly lies". */}
            {locks.some((token) => parseLock(token)?.kind === "level") && (
              <p className="mt-1 text-[10px] leading-snug text-amber-700">
                While a level is locked, levels cannot be added or removed at all —
                inserting one would renumber the level you protected.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
