"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { WorkflowStageRecovery } from "@/components/workspace/workflow-stage-recovery";
import { publishAuthoringAssets } from "@/lib/bim/authoring-asset-manifest";

publishAuthoringAssets();

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <WorkflowStageRecovery />
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
