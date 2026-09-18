import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { TOP_INSET } from "../constants";

// ─── Pull to refresh ────────────────────────────────────────────────────────
//
// Wraps the whole screen stage so swipe-down-to-refresh works the same on
// every screen. React attaches its synthetic touchstart/touchmove listeners
// as passive by default, which silently no-ops preventDefault() — so this
// binds native listeners itself (touchmove non-passive) to actually be able
// to suppress the browser's own scroll/bounce while a pull is in progress.

const PULL_THRESHOLD = 64;
const PULL_MAX = 100;

function findScrollParent(el: HTMLElement | null, boundary: HTMLElement): HTMLElement | null {
  let node = el;
  while (node && node !== boundary) {
    const style = getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  const gestureRef = useRef({ startY: 0, pulling: false, active: false });

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onTouchStart(e: TouchEvent) {
      if (gestureRef.current.active) return;
      // A touch starting on an item's drag handle is reordering, not
      // pulling — both watch vertical movement on the same touch, so let
      // Motion's drag gesture have it instead of racing it here.
      if ((e.target as HTMLElement).closest?.("[data-drag-item]")) {
        gestureRef.current = { startY: 0, pulling: false, active: false };
        return;
      }
      const scrollParent = findScrollParent(e.target as HTMLElement, container!);
      const atTop = !scrollParent || scrollParent.scrollTop <= 0;
      gestureRef.current = { startY: e.touches[0].clientY, pulling: atTop, active: false };
    }

    function onTouchMove(e: TouchEvent) {
      if (!gestureRef.current.pulling) return;
      const delta = e.touches[0].clientY - gestureRef.current.startY;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      const scrollParent = findScrollParent(e.target as HTMLElement, container!);
      if (scrollParent && scrollParent.scrollTop > 0) {
        gestureRef.current.pulling = false;
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      setPullDistance(Math.min(delta * 0.45, PULL_MAX));
    }

    function onTouchEnd() {
      if (!gestureRef.current.pulling) return;
      gestureRef.current.pulling = false;
      setPullDistance(current => {
        if (current >= PULL_THRESHOLD) {
          gestureRef.current.active = true;
          setRefreshing(true);
          onRefreshRef.current().finally(() => {
            gestureRef.current.active = false;
            setRefreshing(false);
            setPullDistance(0);
          });
          return PULL_THRESHOLD;
        }
        return 0;
      });
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <div
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-40"
        style={{
          top: TOP_INSET,
          height: 56,
          transform: `translateY(${pullDistance - 56}px)`,
          transition: pullDistance === 0 || refreshing ? "transform 0.2s" : "none",
        }}
      >
        <Loader2
          className={`w-5 h-5 text-primary transition-opacity ${pullDistance > 10 || refreshing ? "opacity-100" : "opacity-0"} ${refreshing ? "animate-spin" : ""}`}
          style={!refreshing ? { transform: `rotate(${pullDistance * 2.4}deg)` } : undefined}
        />
      </div>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 || refreshing ? "transform 0.2s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
