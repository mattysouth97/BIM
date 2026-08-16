"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { X, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingPanelProps {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Initial position */
  defaultX: number;
  defaultY: number;
  /** Initial dimensions */
  defaultWidth: number;
  defaultHeight?: number;
  /** Min dimensions for CSS resize */
  minWidth?: number;
  minHeight?: number;
  className?: string;
  /** data attributes */
  dataTour?: string;
  /** Extra header content (left of close button) */
  headerExtra?: React.ReactNode;
}

/** P1-07 (c): keep at least this many px of the panel (its drag header)
 *  inside the viewport so a dragged panel can never be lost off-screen. */
const MIN_VISIBLE_PX = 48;

/** Clamp a position so the panel stays reachable within the viewport. */
function clampToViewport(
  x: number,
  y: number,
  container?: HTMLElement | null
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const width =
    container && container.clientWidth > 0
      ? container.clientWidth
      : window.innerWidth;
  const height =
    container && container.clientHeight > 0
      ? container.clientHeight
      : window.innerHeight;
  const maxX = Math.max(0, width - MIN_VISIBLE_PX);
  const maxY = Math.max(0, height - MIN_VISIBLE_PX);
  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  };
}

export function FloatingPanel({
  title,
  visible,
  onClose,
  children,
  defaultX,
  defaultY,
  defaultWidth,
  defaultHeight,
  minWidth = 280,
  minHeight = 200,
  className,
  dataTour,
  headerExtra,
}: FloatingPanelProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: defaultX, y: defaultY });
  const [size, setSize] = React.useState({
    width: defaultWidth,
    height: defaultHeight,
  });
  const dragging = React.useRef(false);
  const dragOffset = React.useRef({ x: 0, y: 0 });

  // P1-07 (c): clamp on mount so a persisted/pre-fix off-screen position is
  // pulled back into view.
  React.useEffect(() => {
    setPos((p) =>
      clampToViewport(p.x, p.y, panelRef.current?.parentElement)
    );
  }, []);

  React.useEffect(() => {
    const onResize = () => {
      setPos((p) =>
        clampToViewport(p.x, p.y, panelRef.current?.parentElement)
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drag handlers
  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [pos]
  );

  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    // P1-07 (c): clamp raw pointer deltas to the viewport.
    setPos(
      clampToViewport(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
        panelRef.current?.parentElement
      )
    );
  }, []);

  const onPointerUp = React.useCallback(() => {
    dragging.current = false;
  }, []);

  // Watch for user CSS-resize via ResizeObserver
  React.useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      data-tour={dataTour}
      role="dialog"
      aria-label={title}
      className={cn(
        "absolute z-30 flex flex-col overflow-hidden resize rounded-xl",
        "border border-border/80 bg-background/94 backdrop-blur-xl",
        "shadow-[0_22px_60px_rgba(15,23,42,0.2)]",
        className
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        minWidth,
        minHeight,
      }}
    >
      {/* Draggable header */}
      <div
        className="relative flex shrink-0 cursor-grab select-none items-center justify-between border-b border-border/70 bg-gradient-to-r from-muted/80 to-background/70 px-3 py-2.5 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
        <div className="min-w-0">
          <span className="block text-[8px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Model workspace
          </span>
          <span className="block truncate text-sm font-semibold leading-tight text-foreground">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {headerExtra}
          <GripHorizontal className="mx-1 size-3.5 text-muted-foreground/70" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto bg-background/88">
        {children}
      </div>
    </div>
  );
}
