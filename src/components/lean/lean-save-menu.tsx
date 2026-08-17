"use client";

// src/components/lean/lean-save-menu.tsx
//
// Save, and the way back in.
//
// Storage is `design-storage` unchanged: only the SPEC is written, and a
// reopened design is rebuilt from it, so what comes back is the same building
// rather than a copy that can drift. A save that failed says so — a user who
// walks away believing their work is durable when it is not is the one outcome
// worth interrupting for.

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DesignStorageError,
  getOrBuildDesign,
  listDesigns,
  saveDesign,
  type DesignIndexEntry,
  type LoadedDesign,
} from "@/lib/generative/design-storage";
import type { DesignState } from "@/store/generative-session-store";

interface Props {
  design: DesignState | null;
  /** Reason saving is refused right now, or null when it is available. */
  blockedReason: string | null;
  onLoad: (design: LoadedDesign) => void;
}

export function LeanSaveMenu({ design, blockedReason, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DesignIndexEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const describe = (caught: unknown): string =>
    caught instanceof DesignStorageError
      ? `${caught.message} (${caught.code})`
      : "이 브라우저의 저장소를 사용할 수 없습니다.";

  const refresh = useCallback(async () => {
    try {
      setEntries(await listDesigns());
    } catch (caught) {
      setError(describe(caught));
    }
  }, []);

  const save = useCallback(async () => {
    if (!design || busy || blockedReason) return;
    setBusy(true);
    setError(null);
    try {
      await saveDesign({
        generationId: design.generationId,
        spec: design.spec,
        seed: design.seed,
        revision: design.revision,
        savedAtIso: new Date().toISOString(),
        name: design.spec.project.name,
      });
      await refresh();
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  }, [design, busy, blockedReason, refresh]);

  const load = useCallback(
    async (generationId: string) => {
      setBusy(true);
      setError(null);
      try {
        const loaded = await getOrBuildDesign(generationId);
        if (!loaded) {
          setError("저장된 설계를 찾을 수 없습니다.");
          return;
        }
        onLoad(loaded);
        setOpen(false);
      } catch (caught) {
        setError(describe(caught));
      } finally {
        setBusy(false);
      }
    },
    [onLoad],
  );

  return (
    <div className="relative flex items-center gap-1">
      <Button
        size="xs"
        variant="secondary"
        onClick={() => void save()}
        disabled={!design || busy || Boolean(blockedReason)}
        title={blockedReason ?? "이 설계를 브라우저에 저장합니다"}
      >
        {busy ? "저장 중…" : "저장"}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        aria-expanded={open}
        aria-label="저장된 설계"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
      >
        불러오기
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[280px] rounded-md border bg-background p-1 shadow-lg">
          {entries.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              저장된 설계가 없습니다. <span className="block">No saved designs yet.</span>
            </p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.generationId}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void load(entry.generationId)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left",
                      "hover:bg-muted disabled:opacity-50",
                    )}
                  >
                    <span className="truncate text-xs">
                      {entry.name ?? entry.generationId}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {entry.generationId} · {entry.savedAtIso.slice(0, 16).replace("T", " ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="max-w-[280px] truncate text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
