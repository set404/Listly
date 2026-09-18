import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Plus, Gift, ChevronRight, Loader2 } from "lucide-react";
import { Btn } from "./ui-kit";
import type { Wishlist } from "../types";

export function WishlistsScreen({ wishlists, loading, onOpen, onCreate }: {
  wishlists: Wishlist[]; loading?: boolean; onOpen: (id: string) => void; onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">{t("wishlists.title")}</h1>
        <button
          onClick={onCreate}
          className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 shadow-sm shadow-primary/30"
        >
          <Plus className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : wishlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
              <Gift className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="font-semibold text-foreground">{t("wishlists.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("wishlists.emptyBody")}</p>
            </div>
            <Btn variant="primary" onClick={onCreate} size="md">
              <Plus className="w-4 h-4" />
              {t("wishlists.createWishlist")}
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {wishlists.map((w, i) => {
              const activeCount = w.itemCount - w.doneCount;
              const allDone = w.itemCount > 0 && activeCount === 0;
              return (
                <motion.div
                  key={w.id}
                  layout
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(w.id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(w.id); } }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}
                  className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5 hover:bg-muted/20 active:scale-[0.985] transition-all text-left shadow-sm cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl flex-shrink-0">
                    {w.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-snug">{w.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                      {w.itemCount === 0 ? (
                        <span className="text-muted-foreground">{t("listStatus.noItems")}</span>
                      ) : allDone ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t("listStatus.allDone")}</span>
                      ) : (
                        <>
                          <span className="text-primary font-semibold">{t("listStatus.left", { count: activeCount })}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-muted-foreground">{w.doneCount}/{w.itemCount}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
