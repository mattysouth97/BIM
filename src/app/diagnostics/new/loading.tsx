import { PhaseRing } from "@/components/ui/phase-ring";

/**
 * Route-level fallback while the diagnosis page is being served. A server
 * component cannot read the visitor's locale, so both lines are shown; the
 * English one is the string this route has always carried.
 */
export default function LoadingNewEnergyDiagnostic() {
  return (
    <div
      className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-background px-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        {/* Pattern: Kokonut UI "loader" (kokonutui.com) — one indeterminate ring, via the foundation PhaseRing. */}
        <PhaseRing />
        <p className="text-sm text-foreground">진단을 여는 중…</p>
        <p className="text-xs">Opening Energy Diagnostic…</p>
      </div>
    </div>
  );
}
