import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { Avatar, type Member } from "./ui-kit";

// The popover's max height (matches max-h-56 below) — used to decide
// whether it fits below the trigger or needs to open upward.
const POPOVER_HEIGHT_ESTIMATE = 224;

interface PopoverPlacement {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  openUpward: boolean;
}

// Multi-select member dropdown (e.g. "Split between") — same shape as
// MemberField, but selecting toggles membership instead of closing the
// popover, and the closed button summarizes the selection as an avatar
// stack plus a count instead of a single name.
export function MemberMultiField({ label, members, value, onChange }: {
  label: string; members: Member[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
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

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }

  const selectedMembers = members.filter(m => value.includes(m.id));

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={toggleOpen}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all border border-transparent"
        >
          <div className="flex -space-x-1.5 flex-shrink-0">
            {selectedMembers.slice(0, 3).map(m => (
              <div key={m.id} className="ring-2 ring-muted rounded-full">
                <Avatar m={m} size="xs" />
              </div>
            ))}
          </div>
          <span className="flex-1 min-w-0 text-left text-sm font-medium truncate">
            {selectedMembers.length === members.length && members.length > 0
              ? t("sheets.addExpense.everyone")
              : t("settings.peopleCount", { count: selectedMembers.length })}
          </span>
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
              className="z-[100] max-h-56 overflow-y-auto bg-card border border-border rounded-2xl shadow-lg py-1"
            >
              {members.map(m => {
                const checked = value.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 text-sm font-medium transition-colors ${
                      checked ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <Avatar m={m} size="xs" />
                    <span className="flex-1 truncate">{m.name}</span>
                    {checked && <Check className="w-4 h-4 flex-shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
