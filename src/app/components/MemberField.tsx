import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { Avatar, type Member } from "./ui-kit";

// The popover's max height (matches max-h-56 below) — used to decide
// whether it fits below the trigger or needs to open upward.
const POPOVER_HEIGHT_ESTIMATE = 224;

// Single-select member dropdown (e.g. "Paid by") — same popover styling as
// CurrencyField, sized to sit next to another field in a row instead of a
// full-width wrapping pill grid.
export function MemberField({ label, members, value, onChange }: {
  label: string; members: Member[]; value: string; onChange: (id: string) => void;
}) {
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

  const selected = members.find(m => m.id === value);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={toggleOpen}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all border border-transparent"
        >
          {selected && <Avatar m={selected} size="xs" />}
          <span className="flex-1 min-w-0 text-left text-sm font-medium truncate">{selected?.name ?? ""}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className={`absolute left-0 right-0 z-20 max-h-56 overflow-y-auto bg-card border border-border rounded-2xl shadow-lg py-1 ${
                openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
              }`}
            >
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 text-sm font-medium transition-colors ${
                    m.id === value ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Avatar m={m} size="xs" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
