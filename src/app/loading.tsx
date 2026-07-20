// src/app/loading.tsx
// P2-03 — App Router loading boundary (Suspense fallback for route segments).

import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-[60vh] w-full items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">불러오는 중… / Loading…</span>
    </div>
  );
}
