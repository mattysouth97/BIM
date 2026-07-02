"use client";

import { useState, useEffect } from "react";

/**
 * Returns true once the client has hydrated.
 * Use this to prevent SSR/client mismatches with persisted stores.
 */
export function useHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  return hydrated;
}
