import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { Avatar, type Member } from "./ui-kit";

// Multi-select member dropdown (e.g. "Split between") — same shape as
// MemberField, but selecting toggles membership instead of closing the
// popover, and the closed button summarizes the selection as an avatar
// stack plus a count instead of a single name.
export function MemberMultiField({ label, members, value, onChange }: {
  label: string; members: Member[]; value: string[]; onChange: (ids: string[]) => void;
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
          onClick={() => setOpen(o => !o)}
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
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-56 overflow-y-auto bg-card border border-border rounded-2xl shadow-lg py-1"
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
        </AnimatePresence>
      </div>
    </div>
  );
}
