import { useRef, useEffect } from "react";
import type { TouchEvent as ReactTouchEvent, TouchList as ReactTouchList } from "react";
import { motion, useMotionValue, animate } from "motion/react";

// ─── Zoomable lightbox image ────────────────────────────────────────────────
//
// Pinch-to-zoom (two-finger) and drag-to-pan once zoomed, plus double-tap to
// toggle zoom, for touch devices. Mounted fresh each time a lightbox opens,
// so zoom/pan state always starts back at rest.

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_WINDOW_MS = 300;

function clampNum(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function touchDistance(touches: ReactTouchList) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

export function ZoomableImage({ src, alt, className, onZoomChange }: {
  src: string; alt: string; className?: string; onZoomChange?: (zoomed: boolean) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const gesture = useRef({
    mode: "none" as "none" | "pinch" | "pan",
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    lastTapTime: 0,
  });

  // Lets a sibling swipe-to-navigate gesture (see BonusCardLightbox) know to
  // back off while this image is zoomed in, instead of racing it for the
  // same touch.
  useEffect(() => {
    if (!onZoomChange) return;
    return scale.on("change", v => onZoomChange(v > 1.02));
  }, [onZoomChange, scale]);

  function clampPan(nx: number, ny: number, s: number) {
    const el = imgRef.current;
    if (!el) return { x: nx, y: ny };
    const maxX = (el.offsetWidth * (s - 1)) / 2;
    const maxY = (el.offsetHeight * (s - 1)) / 2;
    return { x: clampNum(nx, -maxX, maxX), y: clampNum(ny, -maxY, maxY) };
  }

  function reset() {
    const spring = { type: "spring" as const, stiffness: 300, damping: 30 };
    animate(scale, 1, spring);
    animate(x, 0, spring);
    animate(y, 0, spring);
  }

  function handleTouchStart(e: ReactTouchEvent<HTMLImageElement>) {
    if (e.touches.length === 2) {
      gesture.current.mode = "pinch";
      gesture.current.startDist = touchDistance(e.touches);
      gesture.current.startScale = scale.get();
    } else if (e.touches.length === 1) {
      const now = Date.now();
      const isDoubleTap = now - gesture.current.lastTapTime < DOUBLE_TAP_WINDOW_MS;
      gesture.current.lastTapTime = now;
      if (isDoubleTap) {
        gesture.current.mode = "none";
        if (scale.get() > 1.05) reset();
        else animate(scale, DOUBLE_TAP_ZOOM, { type: "spring", stiffness: 300, damping: 30 });
        return;
      }
      gesture.current.mode = scale.get() > 1.02 ? "pan" : "none";
      gesture.current.startX = e.touches[0].clientX;
      gesture.current.startY = e.touches[0].clientY;
      gesture.current.startPanX = x.get();
      gesture.current.startPanY = y.get();
    }
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLImageElement>) {
    if (gesture.current.mode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      const nextScale = clampNum(
        gesture.current.startScale * (dist / gesture.current.startDist),
        ZOOM_MIN, ZOOM_MAX,
      );
      scale.set(nextScale);
      const clamped = clampPan(x.get(), y.get(), nextScale);
      x.set(clamped.x);
      y.set(clamped.y);
    } else if (gesture.current.mode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - gesture.current.startX;
      const dy = e.touches[0].clientY - gesture.current.startY;
      const clamped = clampPan(gesture.current.startPanX + dx, gesture.current.startPanY + dy, scale.get());
      x.set(clamped.x);
      y.set(clamped.y);
    }
  }

  function handleTouchEnd(e: ReactTouchEvent<HTMLImageElement>) {
    if (e.touches.length === 1) {
      // Pinch ended with one finger still down — carry on as a pan.
      gesture.current.mode = scale.get() > 1.02 ? "pan" : "none";
      gesture.current.startX = e.touches[0].clientX;
      gesture.current.startY = e.touches[0].clientY;
      gesture.current.startPanX = x.get();
      gesture.current.startPanY = y.get();
    } else if (e.touches.length === 0) {
      gesture.current.mode = "none";
    }
  }

  return (
    <motion.img
      ref={imgRef}
      src={src}
      alt={alt}
      style={{ scale, x, y, touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={e => e.stopPropagation()}
      className={className}
    />
  );
}
