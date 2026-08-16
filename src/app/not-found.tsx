// src/app/not-found.tsx
// P2-03 — App Router 404 boundary. Rendered when a route segment calls
// notFound() (e.g. a malformed /building/<id>) and for unmatched URLs.
// Server component; returns a 404 status for non-streamed responses.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold tracking-tight text-muted-foreground">404</p>
      <div>
        <h2 className="text-lg font-semibold">페이지를 찾을 수 없습니다</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Page not found — the requested building or page does not exist.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        홈으로 돌아가기 / Return home
      </Link>
    </div>
  );
}
