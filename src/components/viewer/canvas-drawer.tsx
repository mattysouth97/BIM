"use client";

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A nonmodal canvas-side drawer, or mobile sheet above bottom navigation. */
export function CanvasDrawer({ open, onClose, title, children, id, testId, className, showHeader = true }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
  id?: string; testId?: string; className?: string; showHeader?: boolean;
}) {
  const { t } = useT();
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Wait for the open styles to remove visibility:hidden/inert before focus.
    const focusFrame = requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(focusFrame);
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <div className={cn('canvas-drawer-boundary', className)}>
      <section ref={panel} id={id} role="region" aria-label={title}
        aria-hidden={!open} inert={!open} tabIndex={-1} data-open={open}
        data-testid={testId} className="canvas-drawer"
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
      >
        {showHeader && <header className="canvas-drawer-header">
          <span className="canvas-drawer-grip" aria-hidden="true" />
          <h2 className="min-w-0 flex-1 text-xs font-medium">{title}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
            aria-label={t(`${title} 닫기`, `Close ${title}`)} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>}
        <div className="canvas-drawer-content">{children}</div>
      </section>
    </div>
  );
}
