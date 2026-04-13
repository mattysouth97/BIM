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
    setPos({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
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
      className={cn(
        "absolute z-30 flex flex-col rounded-lg border bg-background shadow-xl",
        "overflow-hidden resize",
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
        className="flex items-center justify-between border-b px-3 py-2 cursor-grab active:cursor-grabbing select-none shrink-0 bg-muted/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {headerExtra}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
