/**
 * Render a component (or a hook) with a react-query provider around it.
 *
 * Reach for this instead of `render()` whenever the tree under test might use
 * a query hook — which, in this codebase, is most trees. A bare `render()`
 * throws `No QueryClient set, use QueryClientProvider to set one` the moment
 * anyone adds a `useQuery` anywhere beneath it, and the failure names the
 * provider rather than the change that caused it, so it reads as a broken test
 * rather than a missing wrapper.
 *
 * That has now happened twice. `0ba9c38` added `useOsmBuilding` inside
 * `CadRequestPanel` and turned five passing tests red without touching them.
 * The same day, `useAllBuildingSearch` went into `LedgerLookup` and broke
 * nothing at all — only because that component happens to have no tests. The
 * difference between those two outcomes was luck, so the wrapper belongs in one
 * shared place rather than hand-rolled at each call site (it was already
 * duplicated in five test files before this existed).
 *
 * `retry: false` and `gcTime: 0` keep failures immediate and stop state
 * leaking between tests — a retrying query outlives the test that started it
 * and reports as a timeout somewhere unrelated.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/** A fresh client per call: shared caches make test order matter. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

/** Wrapper component, for `renderHook` and for composing with other providers. */
export function queryWrapper(client: QueryClient = testQueryClient()) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Drop-in replacement for `render()` for any tree that may query. */
export function renderWithQuery(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = testQueryClient();
  const result = render(ui, { wrapper: queryWrapper(queryClient), ...options });
  return { ...result, queryClient };
}
