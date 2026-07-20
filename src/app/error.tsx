"use client"; // Error boundaries must be Client Components

// src/app/error.tsx
// P2-03 — App Router error boundary. Renders a recoverable fallback instead
// of a white screen. The error object is NOT displayed (no stack / env /
// secrets leak to the client); only its digest is logged for correlation.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16.2 forwards `unstable_retry`; older callers may pass `reset`.
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    // Log for observability — the digest correlates with server logs.
    console.error("[route error]", error.digest ?? error.name);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">문제가 발생했습니다</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Something went wrong. Please try again.
        </p>
      </div>
      {retry && (
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          다시 시도 / Try again
        </button>
      )}
    </div>
  );
}
