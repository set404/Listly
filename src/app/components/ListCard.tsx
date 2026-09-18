import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Trash2, ChevronRight } from "lucide-react";
import type { ListSummary } from "../types";

// ─── List card (used for both the featured active list and the rest) ─────────

export function ListCard({ list, featured, delay = 0, onClick, onDelete }: {
  list: ListSummary; featured?: boolean; delay?: number; onClick: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const activeCount = list.items.filter(i => !i.completed).length;
  const doneCount = list.items.length - activeCount;
  const allDone = list.items.length > 0 && activeCount === 0;
  const pct = list.items.length === 0 ? 0 : (doneCount / list.items.length) * 100;

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22 }}
      className={`w-full text-left rounded-2xl p-4 transition-all active:scale-[0.985] cursor-pointer ${
        featured
          ? "bg-primary/8 border-2 border-primary/30 shadow-sm"
          : "bg-card border border-border hover:bg-muted/20 shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3.5">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${featured ? "bg-primary/15" : "bg-muted"}`}>
          📋
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm leading-snug truncate">{list.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs">
            {list.items.length === 0 ? (
              <span className="text-muted-foreground">{t("listStatus.noItems")}</span>
            ) : allDone ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t("listStatus.allDone")}</span>
            ) : (
              <>
                <span className="text-primary font-semibold">{t("listStatus.left", { count: activeCount })}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">{doneCount}/{list.items.length}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label={t("listCard.deleteAria", { name: list.name })}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
      {list.items.length > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
    </motion.div>
  );
}
