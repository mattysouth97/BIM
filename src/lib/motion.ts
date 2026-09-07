import type { Transition } from "motion/react";

/**
 * The one spring for the one thing that moves to a new place (the tab pill).
 * stiffness 500 / damping 45 sits at critical damping (2·√500 ≈ 44.7), so the
 * pill never overshoots into an overflow-hidden ancestor; it settles in ≈180 ms.
 */
export const SELECTION_SPRING: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 45,
};
