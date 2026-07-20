"use client"; // Error boundaries must be Client Components

// src/app/global-error.tsx
// P2-03 — top-level boundary that replaces the root layout when the layout
// itself throws. Must define its own <html>/<body>. No error internals shown.

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            textAlign: "center",
            padding: "1.5rem",
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            문제가 발생했습니다
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", margin: 0 }}>
            A critical error occurred. Please reload the page.
          </p>
          {retry && (
            <button
              type="button"
              onClick={() => retry()}
              style={{
                borderRadius: "0.375rem",
                background: "#111827",
                color: "#fff",
                border: "none",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              다시 시도 / Try again
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
