"use client";

// src/components/lean/lean-prompt.tsx
//
// "설명으로" — one sentence in, one building out.
//
// Deliberately thinner than the studio's GeneratePanel: no examples, no
// optional hints, no post-generation summary. The generation client and its
// staged SSE progress are the existing ones; what is new here is only that the
// stages are shown as a single line instead of a checklist.

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  GenerationError,
  generateBuilding,
  type GenerationResult,
  type StageEvent,
} from "@/lib/generative/client";

interface Props {
  onGenerated: (result: GenerationResult, prompt: string) => void;
  designRules?: string[];
}

export function LeanPrompt({ onGenerated, designRules }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<StageEvent | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    setStage(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateBuilding({
        prompt: text,
        designRules,
        signal: controller.signal,
        onStage: setStage,
      });
      onGenerated(result, text);
    } catch (caught) {
      if (caught instanceof GenerationError) {
        setError({ code: caught.code, message: caught.message });
      } else if ((caught as Error)?.name === "AbortError") {
        setError({ code: "CANCELLED", message: "생성을 취소했습니다." });
      } else {
        setError({ code: "UNKNOWN", message: "건물을 생성하는 중 문제가 발생했습니다." });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [prompt, busy, designRules, onGenerated]);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 p-6">
      <div>
        <h2 className="text-base font-medium">건물을 설명해 주세요</h2>
        <p className="text-xs text-muted-foreground">Describe the building in one sentence.</p>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={busy}
        rows={3}
        aria-label="건물 설명"
        placeholder="예: 중앙 코어를 둔 5층 사무소 건물, 연면적 약 6,000 m²."
        className="w-full resize-none rounded border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void run()} disabled={busy || !prompt.trim()}>
          {busy ? "생성 중…" : "BIM 생성"}
        </Button>
        {busy && (
          <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
            취소
          </Button>
        )}
        {stage && (
          <p className="truncate font-mono text-[11px] text-muted-foreground" aria-live="polite">
            {stage.index}/{stage.total} · {stage.label}
            {stage.detail ? ` — ${stage.detail}` : ""}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded border border-destructive/40 px-2 py-1.5 text-xs">
          <p className="font-medium">{error.message}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{error.code}</p>
        </div>
      )}
    </div>
  );
}
