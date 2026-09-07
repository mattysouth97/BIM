import { useEffect, useState } from "react";

// Pattern: Kokonut UI "use-debounce" (kokonutui.com) — timer-settled value, rebuilt as a named export.
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
