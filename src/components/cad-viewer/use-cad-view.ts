// src/components/cad-viewer/use-cad-view.ts
// Single ViewState (center + meters-per-pixel) drives BOTH the ortho camera
// and the SVG markup overlay — deliberately no MapControls, so the two can
// never drift apart.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CadDocument, Vec2 } from "@/lib/cad/doc/types";
import { computeFitView, screenToWorld, type ViewState } from "@/lib/cad/doc/viewport";

export function useCadView(extents: CadDocument["extents"], panEnabled: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<ViewState>(() => computeFitView(extents, 800, 600));
  const dragging = useRef<{ startPx: Vec2; startCenter: Vec2 } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(
    () => setView(computeFitView(extents, size.w, size.h)),
    [extents, size.w, size.h],
  );
  useEffect(() => { fit(); }, [fit]);

  const toLocal = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Middle button always pans; left button only when the pan tool is active
    // (other tools take clicks through the SVG overlay above the canvas).
    if (e.button !== 1 && !(e.button === 0 && panEnabled)) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragging.current = { startPx: toLocal(e), startCenter: { ...view.center } };
  }, [view.center, panEnabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = toLocal(e);
    const { startPx, startCenter } = dragging.current;
    setView((v) => ({
      ...v,
      center: {
        x: startCenter.x - (p.x - startPx.x) * v.scale,
        y: startCenter.y + (p.y - startPx.y) * v.scale,
      },
    }));
  }, []);

  const onPointerUp = useCallback(() => { dragging.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const px = toLocal(e);
    setView((v) => {
      const factor = Math.exp(e.deltaY * 0.001);
      const anchor = screenToWorld(px, v, size.w, size.h);
      const scale = Math.min(100, Math.max(1e-4, v.scale * factor));
      // Keep the world point under the cursor fixed while zooming.
      return {
        scale,
        center: {
          x: anchor.x - (px.x - size.w / 2) * scale,
          y: anchor.y + (px.y - size.h / 2) * scale,
        },
      };
    });
  }, [size.w, size.h]);

  return {
    containerRef, view, size, fit, setView,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onWheel },
  } as const;
}
