import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { CURRENCIES, currencySymbol } from "../lib/currencies";

// A labeled, full-width dropdown for choosing a group's default currency —
// same closed-state styling as Field's input, with a custom popover menu
// (matching CurrencyPicker below) instead of a native <select>'s OS chrome.
// The popover's rough height with all 3 currencies (~44px/row + padding) —
// used to decide whether it fits below the trigger or needs to open upward.
const POPOVER_HEIGHT_ESTIMATE = 150;

export function CurrencyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggleOpen() {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < POPOVER_HEIGHT_ESTIMATE && rect.top > spaceBelow);
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
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className={`absolute left-0 right-0 z-20 bg-card border border-border rounded-2xl shadow-lg py-1 overflow-hidden ${
                openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
              }`}
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
        </AnimatePresence>
      </div>
    </div>
  );
}
