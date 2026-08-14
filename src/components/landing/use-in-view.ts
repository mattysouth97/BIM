"use client";

import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element>(options?: {
  rootMargin?: string;
  once?: boolean;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const once = options?.once ?? false;
  const rootMargin = options?.rootMargin ?? "200px";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin]);

  return { ref, inView };
}
