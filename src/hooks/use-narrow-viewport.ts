"use client";

import { useEffect, useState } from "react";

/** True when the viewport is narrower than `breakpoint` (default: Tailwind `md`). */
export function useNarrowViewport(breakpoint = 768): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);

  return narrow;
}
