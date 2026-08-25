export default function LoadingNewEnergyDiagnostic() {
  return (
    <div
      className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-muted/20 px-5"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="h-2 w-28 animate-pulse rounded bg-cyan-500/60" />
        <div className="mt-5 h-7 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
        <p className="mt-5 text-sm text-muted-foreground">
          Opening Energy Diagnostic…
        </p>
      </div>
    </div>
  );
}
