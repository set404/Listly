import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { CURRENCIES, currencySymbol } from "../lib/currencies";

// Compact currency dropdown for inline use (next to a price field, where
// there's no room for a pill grid) — a small custom popover instead of a
// native <select>, so it matches the app's own card/border/shadow styling
// instead of the OS's default dropdown chrome.
export function CurrencyPicker({ value, onChange, className = "" }: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t("itemRow.currency")}
        title={value}
        className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        {currencySymbol(value)}
        <ChevronDown className="w-3 h-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 z-20 w-20 max-h-52 overflow-y-auto bg-card border border-border rounded-xl shadow-lg py-1"
          >
            {CURRENCIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-xs font-semibold transition-colors ${
                  c === value ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                }`}
              >
                <span className="w-4 text-center flex-shrink-0">{currencySymbol(c)}</span>
                <span>{c}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
