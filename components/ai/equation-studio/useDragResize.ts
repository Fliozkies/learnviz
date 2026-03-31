"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface Pos { x: number; y: number }
interface Size { w: number; h: number }

export function useDragResize(initialPos: Pos, initialSize: Size) {
  const [pos, setPos] = useState<Pos>(initialPos);
  const [size, setSize] = useState<Size>(initialSize);

  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizing = useRef<string | null>(null);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0, px: 0, py: 0 });

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  const onResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
    resizing.current = handle;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h, px: pos.x, py: pos.y };
    e.preventDefault();
    e.stopPropagation();
  }, [pos, size]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging.current) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - size.w, dragStart.current.px + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 48, dragStart.current.py + dy)),
        });
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.mx;
        const dy = e.clientY - resizeStart.current.my;
        const { w: ow, h: oh, px: ox, py: oy } = resizeStart.current;
        const minW = 420, minH = 360;
        const h = resizing.current;
        let nw = ow, nh = oh, nx = ox, ny = oy;
        if (h.includes("e")) nw = Math.max(minW, Math.min(window.innerWidth - ox, ow + dx));
        if (h.includes("w")) { nw = Math.max(minW, ow - dx); nx = ox + ow - nw; }
        if (h.includes("s")) nh = Math.max(minH, Math.min(window.innerHeight - oy, oh + dy));
        if (h.includes("n")) { nh = Math.max(minH, oh - dy); ny = oy + oh - nh; }
        setSize({ w: nw, h: nh });
        setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
      }
    }
    function onMouseUp() { dragging.current = false; resizing.current = null; }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [size.w]);

  return { pos, size, onDragMouseDown, onResizeMouseDown };
}
