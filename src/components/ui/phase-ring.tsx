import { cn } from "@/lib/utils";

// An alpha mask, not a colour: everything but the outer 2 px ring is cut away.
const MASK =
  "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))";

/**
 * Indeterminate activity ring. No progress prop by design — nothing in the
 * pipeline reports a denominator, so nothing here may imply one. Colour is
 * `currentColor`; callers set `text-muted-foreground`. Under reduced motion the
 * spin stops and a static 110° arc remains.
 */
// Pattern: Kokonut UI "loader" (kokonutui.com) — one conic ring under a radial mask, rebuilt on Tailwind animate-spin + currentColor.
export function PhaseRing({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-6 shrink-0 rounded-full animate-spin motion-reduce:animate-none",
        className,
      )}
      style={{
        background:
          "conic-gradient(from 0deg, transparent 0deg, currentColor 110deg, transparent 200deg)",
        WebkitMaskImage: MASK,
        maskImage: MASK,
      }}
    />
  );
}
