import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { CURRENCIES, currencySymbol } from "../lib/currencies";

// A labeled, full-width dropdown for choosing a group's default currency —
// same closed-state styling as Field's input, with a custom popover menu
// (matching CurrencyPicker below) instead of a native <select>'s OS chrome.
// The popover's rough height with all 3 currencies (~44px/row + padding) —
// used to decide whether it fits below the trigger or needs to open upward.
const POPOVER_HEIGHT_ESTIMATE = 150;

interface PopoverPlacement {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  openUpward: boolean;
}

export function CurrencyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    // The popover is portaled out to document.body and positioned via
    // getBoundingClientRect() at open time — if the sheet behind it
    // scrolls, that position goes stale (a position:fixed portal doesn't
    // move with a scrolling ancestor the way an absolutely-positioned one
    // nested inside it would), so just close it rather than let it drift.
    function onScrollOrResize() { setOpen(false); }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function toggleOpen() {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < POPOVER_HEIGHT_ESTIMATE && rect.top > spaceBelow;
      setPlacement({
        left: rect.left,
        width: rect.width,
        openUpward,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    }
    setOpen(o => !o);
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={toggleOpen}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-muted/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-base md:text-sm border border-transparent"
        >
          <span className="font-medium">{currencySymbol(value)} {value}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      </div>
      {createPortal(
        <AnimatePresence>
          {open && placement && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: placement.openUpward ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: placement.openUpward ? 4 : -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={{ position: "fixed", left: placement.left, width: placement.width, top: placement.top, bottom: placement.bottom }}
              className="z-[100] bg-card border border-border rounded-2xl shadow-lg py-1 overflow-hidden"
            >
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                    c === value ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="w-6 text-center flex-shrink-0">{currencySymbol(c)}</span>
                  <span>{c}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
