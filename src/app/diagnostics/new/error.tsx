"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NewEnergyDiagnosticError({
  error,
  unstable_retry,
}: Readonly<{
  error: Error & { digest?: string };
  unstable_retry: () => void;
}>) {
  return (
    <div className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-muted/20 px-5">
      <section className="w-full max-w-lg rounded-xl border bg-card p-7 shadow-sm" role="alert">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
          Energy diagnostic could not open
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Your saved building has not been changed.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          BIMFIT encountered an unexpected interface error before the diagnostic
          workspace was ready. Retry this screen or return to the diagnostic start.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" onClick={unstable_retry}>
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href="/diagnostics/new">Return to diagnostic start</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="mt-5 font-mono text-[10px] text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </section>
    </div>
  );
}
